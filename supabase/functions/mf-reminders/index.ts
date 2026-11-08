import {
  financeTransactionCopy,
  financeInvoiceCopy,
} from "../_shared/finance-push-copy.ts";
// Lembretes com push do Minhas Finanças (Fase 2) — cron diário.
// Adaptada da `send-push` do Babylog (web-push/VAPID, Bearer CRON_SECRET,
// verify_jwt=false no deploy, limpeza de inscrições 404/410).
//
// Janelas (decididas com o usuário — espelho do `planMFReminders` client):
// D-3 (vence em 3 dias), D-0 (vence hoje) e D+3 (venceu há 3 dias e segue
// pendente). Contas "Ignorar nos totais" TAMBÉM geram. Transferências,
// CANCELADO e PAGO ficam de fora.
//
// Env necessária: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (base64url, sem padding — normalizadas aqui como no Babylog) e
// MF_VAPID_MAILTO (ex.: mailto:voce@exemplo.com).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  configurePush,
  globalPushPages,
  sendGlobalPush,
  type PushSubscriptionRow,
} from "../_shared/push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const pad = (n: number): string => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

// Feriados nacionais (fixos + Sexta-feira Santa + Consciência Negra desde
// 2024). O app cliente usa a mesma régua em src/lib/mfBusinessDays.js.
const FIXED_HOLIDAYS = [
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "12-25",
];

function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

const holidaysByYear = new Map<number, Set<string>>();

function holidaysFor(year: number): Set<string> {
  if (holidaysByYear.has(year)) return holidaysByYear.get(year)!;
  const set = new Set(FIXED_HOLIDAYS.map((md) => `${year}-${md}`));
  set.add(addDaysISO(easterSunday(year), -2));
  if (year >= 2024) set.add(`${year}-11-20`);
  holidaysByYear.set(year, set);
  return set;
}

function isBusinessDay(iso: string): boolean {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidaysFor(year).has(String(iso).slice(0, 10));
}

function nextBusinessDay(iso: string): string {
  let current = String(iso).slice(0, 10);
  for (let attempts = 0; attempts < 14; attempts += 1) {
    if (isBusinessDay(current)) return current;
    current = addDaysISO(current, 1);
  }
  return current;
}

/** Vencimento da fatura (mesma régua do app: D >= dia efetivo do fechamento). */
function invoiceDueISO(
  account: {
    closing_day?: number | null;
    due_day?: number | null;
    due_business_days?: boolean | null;
  },
  closeISO: string,
): string | null {
  const parts = String(closeISO).slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, closeDay] = parts;
  const closing = closeDay || Number(account?.closing_day) || 1;
  const due = Number(account?.due_day) || 10;
  let dueYear = year;
  let dueMonth = month;
  if (due < closing) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  const rawDue = `${dueYear}-${pad(dueMonth)}-${pad(
    Math.min(due, daysInMonth(dueYear, dueMonth)),
  )}`;
  return account?.due_business_days ? nextBusinessDay(rawDue) : rawDue;
}

type CardAccount = {
  id: string;
  name?: string | null;
  currency?: string | null;
  linked_account_id?: string | null;
  closing_day?: number | null;
  due_day?: number | null;
  closing_dynamic?: boolean | null;
  due_business_days?: boolean | null;
  account_type?: string | null;
  archived_at?: string | null;
};

/** Fechamento do ciclo de um mês (clamp no fim do mês + dia útil). */
function closeForMonth(
  account: {
    closing_day?: number | null;
    closing_dynamic?: boolean | null;
  },
  year: number,
  month: number,
): string {
  const closingDay = Number(account?.closing_day) || 1;
  const lastDay = daysInMonth(year, month);
  const raw = `${year}-${pad(month)}-${pad(Math.min(closingDay, lastDay))}`;
  return account?.closing_dynamic ? nextBusinessDay(raw) : raw;
}

/**
 * Fechamentos candidatos a "hoje" para um cartão: o do mês corrente e o do
 * mês anterior (o fechamento dinâmico pode ter atravessado a virada —
 * 31/01 domingo → 01/02). Retorna ISO único.
 */
function closeCandidates(
  account: {
    closing_day?: number | null;
    closing_dynamic?: boolean | null;
  },
  todayISO: string,
): string[] {
  const [year, month] = todayISO.split("-").map(Number);
  const out = new Set<string>();
  for (const delta of [-1, 0]) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    out.add(
      closeForMonth(account, date.getUTCFullYear(), date.getUTCMonth() + 1),
    );
  }
  return [...out];
}

const isDateISO = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);

function reminderDueISO(
  tx: Record<string, unknown>,
  accountById: Record<string, Record<string, unknown>>,
): string | null {
  if (!tx) return null;
  if (isDateISO(tx.due_date)) return (tx.due_date as string).slice(0, 10);
  const account = accountById[tx.account_id as string] ?? null;
  if (
    tx.type === "DESPESA" &&
    tx.invoice_close &&
    account?.account_type === "CARTAO"
  ) {
    const due = invoiceDueISO(account, tx.invoice_close as string);
    if (due) return due;
  }
  if (isDateISO(tx.payment_date))
    return (tx.payment_date as string).slice(0, 10);
  return null;
}

function diffDays(dueISO: string, todayISO: string): number {
  const [y1, m1, d1] = dueISO.split("-").map(Number);
  const [y2, m2, d2] = todayISO.split("-").map(Number);
  return Math.round(
    (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "CRON_SECRET not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (authHeader.split(" ")[1] !== secret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    if (!configurePush())
      return new Response("Push configuration missing", { status: 503 });

    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const byUser = new Map<string, PushSubscriptionRow[]>();
    for await (const page of globalPushPages(supabase)) {
      for (const sub of page) {
        const list = byUser.get(sub.user_id) || [];
        list.push(sub);
        byUser.set(sub.user_id, list);
      }
    }

    let sent = 0;
    for (const [userId, userSubs] of byUser) {
      const [{ data: accounts }, { data: txs }] = await Promise.all([
        supabase
          .from("mf_accounts")
          .select(
            "id,name,currency,linked_account_id,closing_day,due_day,closing_dynamic,due_business_days,account_type,archived_at",
          )
          .eq("user_id", userId),
        supabase
          .from("mf_transactions")
          .select(
            "id,account_id,type,description,amount,status,payment_date,due_date,invoice_close,installments_current,installments_total",
          )
          .eq("user_id", userId)
          .eq("status", "PENDENTE"),
      ]);
      const accountById: Record<string, Record<string, unknown>> = {};
      for (const acc of accounts ?? []) accountById[acc.id] = acc;

      const reminders: Array<{
        txId: string;
        kind: string;
        dueISO: string;
        description: string;
        suffix: string;
        amount: number;
        currency: string;
        accountName: string;
      }> = [];
      for (const tx of txs ?? []) {
        if (!tx?.id || tx.status === "CANCELADO" || tx.type === "TRANSFERENCIA")
          continue;
        const dueISO = reminderDueISO(tx, accountById);
        if (!dueISO) continue;
        const diff = diffDays(dueISO, todayISO);
        let kind: string | null = null;
        if (diff === 3) kind = "upcoming";
        else if (diff === 0) kind = "today";
        else if (diff === -3) kind = "overdue";
        if (!kind) continue;
        const account = accountById[tx.account_id] ?? null;
        const total = Number(tx.installments_total) || 0;
        const suffix =
          total > 1
            ? ` ${Number(tx.installments_current) || "?"}/${total}`
            : "";
        reminders.push({
          txId: tx.id,
          kind,
          dueISO,
          description: String(tx.description || ""),
          suffix,
          amount: Number(tx.amount) || 0,
          currency: String(account?.currency || "BRL"),
          accountName: String(account?.name || ""),
        });
      }
      reminders.sort((a, b) => a.dueISO.localeCompare(b.dueISO));
      const picked = reminders
        .slice(0, 5)
        .map((row, index) => ({
          ...row,
          extra: index === 4 && reminders.length > 5 ? reminders.length - 5 : 0,
        }));

      // ── Faturas que fecharam hoje ────────────────────────────────
      // Um aviso por cartão/fechamento, com total, em aberto e vencimento.
      // A linha em `mf_invoice_notifications` é a trava de idempotência:
      // se o cron rodar de novo no mesmo dia, o upsert não devolve linha
      // e o push não repete.
      const cards = ((accounts ?? []) as CardAccount[]).filter(
        (acc) => acc.account_type === "CARTAO" && !acc.archived_at,
      );
      const closing = cards
        .map((card) => ({
          card,
          closeISO:
            closeCandidates(card, todayISO).find((iso) => iso === todayISO) ??
            null,
        }))
        .filter((row): row is { card: CardAccount; closeISO: string } =>
          Boolean(row.closeISO),
        );

      const invoiceAlerts: Array<{
        cardId: string;
        closeISO: string;
        cardName: string;
        total: number;
        currency: string;
        open: number;
        pending: number;
        dueISO: string;
        tag: string;
      }> = [];

      if (closing.length > 0) {
        const cardIds = closing.map((row) => String(row.card.id));
        const linkedIds = [
          ...new Set(
            closing
              .map((row) => row.card.linked_account_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const closes = [...new Set(closing.map((row) => row.closeISO))];
        const [
          { data: cardExpenses },
          { data: depPayments },
          { data: transfPayments },
        ] = await Promise.all([
          supabase
            .from("mf_transactions")
            .select(
              "id,account_id,type,amount,status,payment_date,invoice_close",
            )
            .eq("user_id", userId)
            .in("account_id", cardIds)
            .eq("type", "DESPESA")
            .neq("status", "CANCELADO"),
          linkedIds.length
            ? supabase
                .from("mf_transactions")
                .select("id,account_id,type,amount,status,invoice_close")
                .eq("user_id", userId)
                .in("account_id", linkedIds)
                .in("invoice_close", closes)
                .neq("status", "CANCELADO")
            : Promise.resolve({ data: [] }),
          supabase
            .from("mf_transactions")
            .select(
              "id,account_id,transfer_account_id,type,amount,status,invoice_close",
            )
            .eq("user_id", userId)
            .in("transfer_account_id", cardIds)
            .in("invoice_close", closes)
            .neq("status", "CANCELADO"),
        ]);

        const seenPay = new Set<string>();
        const paymentRows = [
          ...(depPayments ?? []),
          ...(transfPayments ?? []),
        ].filter((row) => {
          if (!row?.id || seenPay.has(row.id)) return false;
          seenPay.add(row.id);
          return true;
        });

        for (const { card, closeISO } of closing) {
          const dueISO = invoiceDueISO(card, closeISO);
          if (!dueISO) continue;
          const dueMonth = dueISO.slice(0, 7);
          const total = (cardExpenses ?? [])
            .filter(
              (tx) =>
                tx.account_id === card.id &&
                (tx.invoice_close === closeISO ||
                  (!tx.invoice_close &&
                    String(tx.payment_date ?? "").slice(0, 7) === dueMonth)),
            )
            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
          if (!(total > 0.005)) continue;

          const bound = paymentRows.filter(
            (tx) =>
              tx.invoice_close === closeISO &&
              ((tx.type === "DESPESA" &&
                tx.account_id === card.linked_account_id) ||
                (tx.type === "TRANSFERENCIA" &&
                  "transfer_account_id" in tx &&
                  tx.transfer_account_id === card.id)),
          );
          const paid = bound
            .filter((tx) => tx.status === "PAGO")
            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
          const pending = bound
            .filter((tx) => tx.status === "PENDENTE")
            .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
          const open = Math.max(
            0,
            Math.round((total - paid - pending) * 100) / 100,
          );
          const currency = String(card.currency ?? "BRL");
          // Claim atômico: só o primeiro run do dia envia esta fatura.
          const { data: claimed, error: claimError } = await supabase
            .from("mf_invoice_notifications")
            .upsert(
              { user_id: userId, card_id: card.id, close_iso: closeISO },
              {
                onConflict: "user_id,card_id,close_iso",
                ignoreDuplicates: true,
              },
            )
            .select("id");
          if (claimError) {
            console.error(
              `Failed invoice notification claim ${card.id}/${closeISO}:`,
              claimError,
            );
            continue;
          }
          if (!claimed || claimed.length === 0) continue;

          invoiceAlerts.push({
            cardId: String(card.id),
            closeISO,
            cardName: String(card.name || ""),
            total,
            currency,
            open,
            pending,
            dueISO,
            tag: `mf-invoice-${card.id}-${closeISO}`,
          });
        }
      }

      for (const sub of userSubs) {
        for (const row of invoiceAlerts) {
          if (
            await sendGlobalPush(supabase, sub, {
              type: "mf-reminder",
              tag: row.tag,
              ...financeInvoiceCopy(row, sub.language),
              url: "/minhasfinancas/cards",
              kind: "invoice_closed",
              cardId: row.cardId,
              invoiceClose: row.closeISO,
            })
          )
            sent++;
        }
        for (const row of picked) {
          if (
            await sendGlobalPush(supabase, sub, {
              type: "mf-reminder",
              tag: `mf-${row.txId}-${row.kind}`,
              ...financeTransactionCopy(row, sub.language),
              url: "/minhasfinancas/transactions",
              txId: row.txId,
              kind: row.kind,
            })
          )
            sent++;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Reminder processing failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
