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
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const pad = (n: number): string => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/** Vencimento da fatura (mesma régua do app: D >= C cai no mês). */
function invoiceDueISO(
  account: { closing_day?: number | null; due_day?: number | null },
  closeISO: string,
): string | null {
  const parts = String(closeISO).slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month] = parts;
  const closing = Number(account?.closing_day) || 1;
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
  return `${dueYear}-${pad(dueMonth)}-${pad(Math.min(due, daysInMonth(dueYear, dueMonth)))}`;
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
  if (isDateISO(tx.payment_date)) return (tx.payment_date as string).slice(0, 10);
  return null;
}

function diffDays(dueISO: string, todayISO: string): number {
  const [y1, m1, d1] = dueISO.split("-").map(Number);
  const [y2, m2, d2] = todayISO.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  } catch {
    return `${(currency || "BRL")}$ ${value.toFixed(2)}`;
  }
}

serve(async (req) => {
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
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    );

    const toBase64Url = (value: string): string =>
      value.replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const mailto = Deno.env.get("MF_VAPID_MAILTO") ?? "";
    const vapidPublicKey = toBase64Url(Deno.env.get("VAPID_PUBLIC_KEY") ?? "");
    const vapidPrivateKey = toBase64Url(Deno.env.get("VAPID_PRIVATE_KEY") ?? "");
    if (!mailto || !vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID not configured (MF_VAPID_MAILTO/VAPID_*)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    webpush.setVapidDetails(mailto, vapidPublicKey, vapidPrivateKey);

    const todayISO = new Date().toISOString().slice(0, 10);

    const { data: subs, error: subsError } = await supabase
      .from("mf_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth");
    if (subsError) throw subsError;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const byUser = new Map<string, typeof subs>();
    for (const sub of subs) {
      const list = byUser.get(sub.user_id) ?? [];
      list.push(sub);
      byUser.set(sub.user_id, list);
    }

    let sent = 0;
    for (const [userId, userSubs] of byUser) {
      const [{ data: accounts }, { data: txs }] = await Promise.all([
        supabase.from("mf_accounts").select("*").eq("user_id", userId),
        supabase
          .from("mf_transactions")
          .select("id,account_id,type,description,amount,status,payment_date,due_date,invoice_close,installments_current,installments_total")
          .eq("user_id", userId)
          .eq("status", "PENDENTE"),
      ]);
      const accountById: Record<string, Record<string, unknown>> = {};
      for (const acc of accounts ?? []) accountById[acc.id] = acc;

      const reminders: Array<{
        txId: string;
        kind: string;
        dueISO: string;
        title: string;
        body: string;
      }> = [];
      for (const tx of txs ?? []) {
        if (!tx?.id || tx.status === "CANCELADO" || tx.type === "TRANSFERENCIA") continue;
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
          total > 1 ? ` ${Number(tx.installments_current) || "?"}/${total}` : "";
        const when =
          kind === "upcoming"
            ? "vence em 3 dias"
            : kind === "today"
              ? "vence hoje"
              : "venceu há 3 dias";
        reminders.push({
          txId: tx.id,
          kind,
          dueISO,
          title: `${tx.description ?? "Lançamento"}${suffix} ${when}`,
          body: `${money(Number(tx.amount) || 0, account?.currency ?? "BRL")}${
            account?.name ? ` · ${account.name}` : ""
          }`,
        });
      }
      reminders.sort((a, b) => a.dueISO.localeCompare(b.dueISO));
      const picked = reminders.slice(0, 5).map((row, index, list) =>
        list.length === 5 && reminders.length > 5 && index === 4
          ? { ...row, body: `${row.body} (+${reminders.length - 5} lembretes)` }
          : row,
      );

      for (const sub of userSubs) {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        for (const row of picked) {
          try {
            await webpush.sendNotification(
              pushSubscription,
              JSON.stringify({
                type: "mf-reminder",
                tag: `mf-${row.txId}-${row.kind}`,
                title: row.title,
                body: row.body,
                url: "/?tab=minhasfinancas-transactions",
                txId: row.txId,
                kind: row.kind,
              }),
            );
            sent += 1;
          } catch (err) {
            console.error(`Failed push ${sub.id}:`, err);
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from("mf_push_subscriptions").delete().eq("id", sub.id);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
