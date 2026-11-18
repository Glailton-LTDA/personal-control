import { supabase } from "../supabase";
import {
  planMFReminders,
  planMFInvoiceReminders,
  invoiceDueISO,
} from "../../components/MinhasFinancas/mfReminders";
import {
  buildCardInvoices,
  applyCardInvoiceRecords,
  buildInvoiceRecordMap,
  cardCloseForMonth,
  shiftMonth,
} from "../../hooks/useMinhasFinancas";

const BATCH = 200;
const MAX_ROWS = 2000;
const ACCOUNT_FIELDS =
  "id,name,account_type,currency,closing_day,due_day,closing_dynamic,due_business_days,linked_account_id,archived_at";
const TX_FIELDS =
  "id,type,amount,description,payment_date,due_date,status,account_id,invoice_close,installments_current,installments_total";

// Every request is bounded and owner-scoped. No history of transactions is
// downloaded for card arithmetic: use the existing authoritative aggregates.
async function pages(build) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
    const { data, error } = await build().range(offset, offset + BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < BATCH) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
const day = (iso, delta) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
export function financeCandidateBounds(accounts, today) {
  const targets = [day(today, -3), today, day(today, 3)];
  const closes = new Set();
  const start = shiftMonth(today.slice(0, 7), -2) + "-01";
  for (let date = start; date <= day(today, 3); date = day(date, 1)) {
    if (
      accounts.some(
        (a) =>
          a.account_type === "CARTAO" &&
          targets.includes(invoiceDueISO(a, date)),
      )
    )
      closes.add(date);
  }
  const dates = targets.join(",");
  const clauses = [
    `due_date.in.(${dates})`,
    `and(due_date.is.null,payment_date.in.(${dates}))`,
  ];
  if (closes.size)
    clauses.push(
      `and(due_date.is.null,invoice_close.in.(${[...closes].join(",")}))`,
    );
  return clauses.join(",");
}
export async function loadFinanceNotifications(userId, today) {
  if (!userId) throw new Error("auth_required");
  const accounts = await pages(() =>
    supabase
      .from("mf_accounts")
      .select(ACCOUNT_FIELDS)
      .eq("user_id", userId)
      .order("id"),
  );
  const byId = Object.fromEntries(accounts.rows.map((a) => [a.id, a]));
  const bounds = financeCandidateBounds(accounts.rows, today);
  const candidates = await pages(() =>
    supabase
      .from("mf_transactions")
      .select(TX_FIELDS)
      .eq("user_id", userId)
      .eq("status", "PENDENTE")
      .in("type", ["RECEITA", "DESPESA"])
      .or(bounds)
      .order("payment_date")
      .order("id"),
  );
  const tx = planMFReminders(
    candidates.rows.filter((row) => byId[row.account_id]),
    { accountsById: byId, todayISO: today, limit: 51 },
  );
  const cards = accounts.rows.filter(
    (a) =>
      a.account_type === "CARTAO" &&
      !a.archived_at &&
      [today.slice(0, 7), shiftMonth(today.slice(0, 7), -1)].some(
        (month) => cardCloseForMonth(a, month) === today,
      ),
  );
  let invoice = [];
  let more = false;
  if (cards.length) {
    const ids = cards.map((a) => a.id);
    const [aggregated, settings, records] = await Promise.all([
      supabase
        .rpc("mf_card_cycle_totals", { p_ref_date: today, p_live: true })
        .range(0, MAX_ROWS - 1),
      pages(() =>
        supabase
          .from("mf_card_settings")
          .select(
            "id,card_id,effective_from,closing_day,due_day,closing_dynamic,due_business_days,credit_limit,linked_account_id",
          )
          .eq("user_id", userId)
          .in("card_id", ids)
          .order("effective_from")
          .order("id"),
      ),
      pages(() =>
        supabase
          .from("mf_invoices")
          .select(
            "id,card_id,close_date,due_date,total,total_source,paid_total,status,paid_at",
          )
          .eq("user_id", userId)
          .in("card_id", ids)
          .eq("close_date", today)
          .order("id"),
      ),
    ]);
    if (aggregated.error) throw aggregated.error;
    const aggregateMap = Object.fromEntries(
      (aggregated.data || []).map((a) => [a.card_id, a]),
    );
    if (cards.some((card) => !aggregateMap[card.id]))
      throw new Error("notification_aggregates_missing");
    more =
      settings.truncated ||
      records.truncated ||
      (aggregated.data || []).length === MAX_ROWS;
    const recordMap = buildInvoiceRecordMap(records.rows);
    const invoices = [];
    cards.forEach((card) => {
      const built = applyCardInvoiceRecords(
        buildCardInvoices({
          card,
          transactions: [],
          aggregates: aggregateMap,
          settings: settings.rows,
          refISO: today,
          monthKey: today.slice(0, 7),
          count: 2,
        }),
        recordMap,
        card.id,
        today,
      );
      [built.current, ...(built.invoices || [])]
        .filter(Boolean)
        .forEach((value) =>
          invoices.push({
            ...value,
            cardId: card.id,
            cardName: card.name,
            currency: card.currency,
          }),
        );
    });
    invoice = planMFInvoiceReminders(invoices, today, { limit: 11 });
  }
  return {
    reminders: [...invoice.slice(0, 10), ...tx.slice(0, 50)],
    hasMore:
      accounts.truncated ||
      candidates.truncated ||
      more ||
      tx.length > 50 ||
      invoice.length > 10,
  };
}
