import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { readPrefsLocal, writePrefsLocal } from '../lib/mfPrefs';
import { useMFProfileScope } from './mfProfileContext';
import { useNotificationSettings } from './useFinance';
import { mfSelect, mfSelectAll, mfMutate, isOffline } from '../lib/offline/mfOffline';

/* ────────────────────────────────────────────────────────────
 * Helpers de data e dinheiro
 * ──────────────────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const toISODate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Chave de mês no formato 'YYYY-MM'. */
export const currentMonthKey = () => keyOf(new Date());

export const shiftMonth = (monthKey, delta) => {
  const [year, month] = monthKey.split('-').map(Number);
  return keyOf(new Date(year, month - 1 + delta, 1));
};

export const prevMonthKey = (monthKey) => shiftMonth(monthKey, -1);

/** Soma meses a uma data ISO 'YYYY-MM-DD' (clamp no fim do mês: 31/01 +1 → 28/02). */
export const addMonthsISO = (iso, months) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d || 1, lastDay));
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
};

/**
 * Avança `step` períodos de uma recorrência a partir de uma data ISO:
 * WEEKLY soma 7 dias; YEARLY avança 12 meses; MONTHLY avança meses.
 */
export const shiftRecurrenceDate = (iso, recurrence, step) => {
  if (recurrence === 'WEEKLY') {
    const date = parseISODate(iso);
    date.setDate(date.getDate() + 7 * step);
    return toISODate(date);
  }
  return addMonthsISO(iso, recurrence === 'YEARLY' ? 12 * step : step);
};

/** Limites 'YYYY-MM-DD' do mês (inclusive). */
export const monthBounds = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    year,
    month,
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
};

/**
 * Data de referência de um mês para cálculos de cartão (faturas, em aberto):
 * "hoje" no mês atual (fatura viva) e o último dia do mês nos demais (estado
 * da fatura à época — navegar o mês troca os valores de verdade).
 */
export const monthRefISO = (monthKey) =>
  monthKey === currentMonthKey() ? toISODate(new Date()) : monthBounds(monthKey).end;

/* ────────────────────────────────────────────────────────────
 * Séries fixas mensais (recorrência "eterna" até excluir)
 * ──────────────────────────────────────────────────────────── */

/** Ocorrências criadas de uma vez (mesma janela da recorrência comum). */
export const FIXED_SERIES_COUNT = 12;
/** A estensão dispara quando faltam menos que isto até o horizonte. */
export const FIXED_EXTEND_MIN_MONTHS = 6;
/** Throttle (24h) da estensão automática em localStorage. */
export const FIXED_EXTEND_STORAGE = 'mf_fixed_extend_at';

/**
 * Planeja ocorrências para manter cada série fixa ~12 meses à frente.
 * `rows` = linhas com `is_fixed` (cabeças + filhas). A cabeça com
 * `is_fixed = false` encerrou a série ("excluir a partir deste mês")
 * e é ignorada. Cada nova ocorrência clona a ÚLTIMA da série (edições
 * recentes de valor/descrição são replicadas); retorna payloads sem id.
 * Despesa de cartão com fatura (`invoice_close`) ancora as novas
 * ocorrências na fatura da última + N (não no mês da data).
 */
export const planFixedExtensions = (rows, todayISO) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const inserts = [];
  const heads = rows.filter((row) => row && !row.parent_transaction_id);
  for (const head of heads) {
    if (!head.is_fixed) continue;
    const members = rows.filter(
      (row) => row && (row.id === head.id || row.parent_transaction_id === head.id)
    );
    if (members.length === 0) continue;
    let last = members[0];
    for (const member of members) {
      if (String(member.payment_date) > String(last.payment_date)) last = member;
    }
    if (String(last.payment_date) >= addMonthsISO(todayISO, FIXED_EXTEND_MIN_MONTHS)) continue;
    const target = addMonthsISO(todayISO, FIXED_SERIES_COUNT);
    let step = 1;
    let paymentDate = addMonthsISO(last.payment_date, step);
    while (paymentDate <= target) {
      inserts.push({
        user_id: head.user_id,
        account_id: last.account_id,
        type: last.type,
        description: last.description,
        amount: last.amount,
        payment_date: paymentDate,
        due_date: last.due_date ? addMonthsISO(last.due_date, step) : null,
        effective_date: null,
        status: 'PENDENTE',
        category_id: last.category_id ?? null,
        responsible_id: last.responsible_id ?? null,
        notes: last.notes ?? null,
        recurrence: 'MONTHLY',
        is_fixed: true,
        parent_transaction_id: head.id,
        invoice_close: last.invoice_close ? addMonthsISO(last.invoice_close, step) : null,
      });
      step += 1;
      paymentDate = addMonthsISO(last.payment_date, step);
    }
  }
  return inserts;
};

/** Moedas disponíveis no cadastro de contas (ISO 4217). */
export const MF_CURRENCIES = [
  'BRL', 'USD', 'EUR', 'GBP', 'JPY', 'ARS', 'CLP', 'UYU',
  'MXN', 'CAD', 'AUD', 'CHF', 'CNY', 'INR',
];

const formatterCache = new Map();

/**
 * Formata um valor na moeda informada (padrão BRL).
 * Sem cotação/conversão: cada valor é exibido na moeda nativa.
 * O escopo de moeda da tela ('all' = "Todas as moedas") NÃO é moeda:
 * 'ALL' existe na ISO 4217 (Lek albanês) e vazava como "ALL 15.031,10"
 * nos widgets de objetivos/orçamentos — fora do catálogo MF_CURRENCIES,
 * 'all' cai no padrão BRL.
 */
export const formatMoney = (value, currency = 'BRL') => {
  const code =
    typeof currency === 'string' &&
    /^[A-Za-z]{3}$/.test(currency) &&
    currency.toLowerCase() !== 'all'
      ? currency.toUpperCase()
      : 'BRL';
  let formatter = formatterCache.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code });
    } catch {
      formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    formatterCache.set(code, formatter);
  }
  return formatter.format(Number(value) || 0);
};

/** Rótulo da moeda no idioma do app: 'USD — dólar americano' (Intl.DisplayNames). */
export const currencyLabel = (code, language = 'pt-BR') => {
  try {
    const name = new Intl.DisplayNames([language], { type: 'currency' }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
};

/** Bandeiras (emoji) por moeda — mesmo padrão visual já usado em Viagens. */
export const MF_CURRENCY_FLAGS = {
  BRL: '🇧🇷', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  ARS: '🇦🇷', CLP: '🇨🇱', UYU: '🇺🇾', MXN: '🇲🇽', CAD: '🇨🇦',
  AUD: '🇦🇺', CHF: '🇨🇭', CNY: '🇨🇳', INR: '🇮🇳',
};

/** Bandeira da moeda ('🇺🇸'); moeda desconhecida → '💰'. */
export const currencyFlag = (code) =>
  (typeof code === 'string' ? MF_CURRENCY_FLAGS[code.toUpperCase()] : null) || '💰';

const symbolCache = new Map();

/** Símbolo curto da moeda ('R$', 'US$') via Intl — sem cotação/conversão. */
export const currencySymbol = (code) => {
  const key = typeof code === 'string' && /^[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : 'BRL';
  if (symbolCache.has(key)) return symbolCache.get(key);
  let symbol = '';
  try {
    const parts = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: key })
      .formatToParts(1);
    symbol = parts.find((part) => part.type === 'currency')?.value ?? '';
  } catch {
    symbol = '';
  }
  symbolCache.set(key, symbol);
  return symbol;
};

/** Nome da moeda no idioma informado ('dólar americano'). */
export const currencyName = (code, language = 'pt-BR') => {
  try {
    const name = new Intl.DisplayNames([language], { type: 'currency' }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
};

/** Soma um campo das linhas de contas. */
export const sumField = (rows, field) =>
  rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

/**
 * Contas que entram nas somas dos cards de KPI: as marcadas com "Ignorar
 * nos totais" (ignore_in_totals) ficam de fora dos KPIs — mas continuam
 * listadas na tela e somando nos totais de grupo/drill e no rodapé.
 */
export const countableRows = (rows) => rows.filter((row) => !row.ignore_in_totals);

/** Agrupa um somatório por moeda (BRL primeiro) — nunca soma moedas diferentes. */
export const groupTotalsByCurrency = (rows, field) => {
  const out = {};
  rows.forEach((row) => {
    const code = row.currency || 'BRL';
    out[code] = (out[code] || 0) + (Number(row[field]) || 0);
  });
  return out;
};

/** 'R$ 100,00' ou 'R$ 100,00 · US$ 50,00' quando há moedas mistas. */
export const formatTotals = (totalsMap, showValues = true) => {
  if (!showValues) return '•••';
  const codes = Object.keys(totalsMap).sort((a, b) =>
    a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)
  );
  if (codes.length === 0) return formatMoney(0);
  return codes.map((code) => formatMoney(totalsMap[code], code)).join(' · ');
};

/** '2026-10' → 'Outubro de 2026' (no idioma informado). Fallback: mês atual. */
export const formatMonthLabel = (monthKey, language = 'pt-BR') => {
  const [year, month] = (monthKey || currentMonthKey()).split('-').map(Number);
  const label = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Rótulo curto da faixa ‹ mês › (navegação): sem ano quando o mês é do ano
 * corrente ('Outubro'); fora dele, mês curto + ano ('Nov./2025'). `formatMonthLabel`
 * continua para subtítulos e faturas ('Outubro de 2026').
 */
export const formatMonthNavLabel = (monthKey, language = 'pt-BR') => {
  const [year, month] = (monthKey || currentMonthKey()).split('-').map(Number);
  const isCurrentYear = year === new Date().getFullYear();
  const label = new Intl.DateTimeFormat(language, {
    month: isCurrentYear ? 'long' : 'short',
  }).format(new Date(year, month - 1, 1));
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return isCurrentYear ? capitalized : `${capitalized}/${year}`;
};

/** '2026-10-05' → Date local (sem deslocamento de fuso). */
export const parseISODate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Converte '1.234,56', '1234.56' ou número em número. */
export const parseMoney = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  let str = String(value).trim().replace(/[R$\s]/g, '');
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Máscara de valor monetário (centavos inteiros → '0,00'). */
export const maskAmount = (raw) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (parseInt(digits, 10) / 100).toFixed(2).replace('.', ',');
};

/**
 * Sufixo "N/M" da parcela para exibição (ex.: "Plano 1/12") — vazio fora
 * de série parcelada.
 */
export function mfInstallmentSuffix(tx) {
  const total = Number(tx?.installments_total) || 0;
  if (!(total > 1)) return '';
  const current = Number(tx?.installments_current) || 0;
  return ` ${current > 0 ? current : '?'}/${total}`;
}

/**
 * Id da cabeça da série parcelada (pai) — null fora de série. Filhas têm
 * parent_transaction_id; a cabeça tem installments_total > 1 sem pai.
 */
export function installmentHeadId(tx) {
  if (!tx) return null;
  if (tx.parent_transaction_id) return tx.parent_transaction_id;
  return (Number(tx.installments_total) || 0) > 1 ? tx.id : null;
}

/** Lançamento já recorrente: série fixa, com recorrência ou parte de parcelado. */
export function isRecurrentTx(tx) {
  if (!tx) return false;
  if (tx.is_fixed) return true;
  if (installmentHeadId(tx)) return true;
  if ((Number(tx.installments_total) || 0) > 1) return true;
  return !!tx.recurrence && tx.recurrence !== 'NONE';
}

/** Ordena a série por nº da parcela (desempate: vencimento, id). */
export function orderSeries(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const ca = Number(a?.installments_current) || 0;
    const cb = Number(b?.installments_current) || 0;
    if (ca !== cb) return ca - cb;
    const dateCmp = String(a?.payment_date || '').localeCompare(String(b?.payment_date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/**
 * Busca a série parcelada inteira (cabeça + filhas) para exclusão com
 * escopo. Fora de série, devolve só o próprio lançamento.
 */
export async function fetchInstallmentSeries(tx) {
  const headId = installmentHeadId(tx);
  if (!headId) return [tx];
  const { data, error } = await supabase
    .from('mf_transactions')
    .select('*')
    .or(`id.eq.${headId},parent_transaction_id.eq.${headId}`);
  if (error) throw error;
  const rows = (data ?? []).filter(
    (row) => row.id === headId || row.parent_transaction_id === headId
  );
  return orderSeries(rows.length > 0 ? rows : [tx]);
}

/* ────────────────────────────────────────────────────────────
 * Tipos de conta: 6 padrões (código) + personalizados (mf_account_types)
 * ──────────────────────────────────────────────────────────── */

/** Tipos padrão (código fixo salvo em mf_accounts.account_type). */
export const MF_BUILTIN_ACCOUNT_TYPES = [
  'CORRENTE', 'POUPANCA', 'DINHEIRO', 'CARTAO', 'INVESTIMENTO', 'OUTRO',
];

/** Ícones dos tipos padrão. */
export const MF_ACCOUNT_TYPE_ICONS = {
  CORRENTE: '🏦',
  POUPANCA: '🐷',
  DINHEIRO: '💵',
  CARTAO: '💳',
  INVESTIMENTO: '📈',
  OUTRO: '📦',
};

/**
 * Resolve o tipo da conta:
 *  - personalizado (cadastro mf_account_types) → { label: nome, icon }
 *  - padrão (código) → { builtin: true, key: chave i18n }
 *  - removido do cadastro → mantém o rótulo já gravado na conta.
 */
export const accountTypeInfo = (type, customTypes = []) => {
  const custom = customTypes.find((item) => item.name === type);
  if (custom) return { builtin: false, label: custom.name, icon: custom.icon || '💳' };
  if (MF_BUILTIN_ACCOUNT_TYPES.includes(type)) {
    return {
      builtin: true,
      key: `minhasfinancas.type_${type.toLowerCase()}`,
      icon: MF_ACCOUNT_TYPE_ICONS[type] || '🏷️',
    };
  }
  return { builtin: false, label: type || '', icon: '🏷️' };
};

/* ────────────────────────────────────────────────────────────
 * Cálculos (saldo, movimentações do mês, extrato)
 * ──────────────────────────────────────────────────────────── */

const isCancelled = (tx) => tx.status === 'CANCELADO';

/**
 * Mês de competência de uma despesa de cartão (manda a fatura escolhida):
 * com fatura escolhida (`invoice_close`) vale o mês do VENCIMENTO (a
 * fatura é rotulada pelo vencimento em todos os cartões); sem vínculo,
 * o mês da data. Receitas, transferências e contas não-cartão seguem a data.
 */
export function cardExpenseMonth(tx, byId) {
  const acc = byId?.get?.(tx?.account_id);
  if (tx?.type === 'DESPESA' && tx.invoice_close && acc?.account_type === 'CARTAO') {
    const C = Number(acc.closing_day) || 1;
    const D = Number(acc.due_day) || 10;
    return shiftMonth(String(tx.invoice_close).slice(0, 7), D >= C ? 0 : 1);
  }
  return String(tx?.payment_date || '').slice(0, 7);
}

/**
 * Fechamento (`invoice_close`) da fatura que vence no mês informado
 * (`dueMonthKey` = 'YYYY-MM'): a escolha do picker de fatura é o
 * vencimento, e o fechamento deriva dele (D >= C → mesmo mês, senão
 * mês anterior). Usado como default do picker (fatura do mês).
 */
export function invoiceCloseForDueMonth(card, dueMonthKey) {
  const C = Number(card?.closing_day) || 1;
  const D = Number(card?.due_day) || 10;
  const closeKey = shiftMonth(dueMonthKey, D >= C ? 0 : -1);
  const [y, m] = closeKey.split('-').map(Number);
  return isoDay(y, m, C);
}

/**
 * Saldo de uma conta ao fim do mês:
 *  - saldo     = saldo inicial + lançamentos PAGO até o fim do mês
 *  - saldoPrev = saldo inicial + lançamentos PAGO até o fim do mês
 *                anterior (fechamento do mês — o "Inicial" do Resumo;
 *                espelha a RPC mf_month_summary, campo saldoPrev)
 *  - previsto  = saldo + lançamentos PENDENTE com data até o fim do mês
 * Movimentações do mês (colunas da tabela): receitas, despesas e
 * transferências não canceladas com payment_date dentro do mês.
 * Também calcula receitas/despesas do mês anterior (para variação % dos KPIs).
 */
export const computeAccountRows = (accounts, transactions, start, end, prevStart, prevEnd) =>
  accounts.map((acc) => {
    let receitas = 0;
    let despesas = 0;
    let despesasFatura = 0;
    let receitasPrev = 0;
    let despesasPrev = 0;
    let transfCredito = 0;
    let transfDebito = 0;
    let saldoMov = 0;
    let saldoMovPrev = 0;
    let pendenteMov = 0;

    transactions.forEach((tx) => {
      if (isCancelled(tx)) return;
      const amount = Number(tx.amount) || 0;
      const inMonth = tx.payment_date >= start && tx.payment_date <= end;
      const inPrev = prevStart && tx.payment_date >= prevStart && tx.payment_date <= prevEnd;
      const untilEnd = tx.payment_date <= end;
      const untilPrevEnd = prevEnd && tx.payment_date <= prevEnd;

      if (tx.type === 'TRANSFERENCIA') {
        if (tx.account_id === acc.id) {
          if (inMonth) transfDebito += amount;
          if (untilEnd) (tx.status === 'PAGO' ? (saldoMov -= amount) : (pendenteMov -= amount));
          if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev -= amount;
        }
        if (tx.transfer_account_id === acc.id) {
          if (inMonth) transfCredito += amount;
          if (untilEnd) (tx.status === 'PAGO' ? (saldoMov += amount) : (pendenteMov += amount));
          if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev += amount;
        }
        return;
      }

      if (tx.account_id !== acc.id) return;
      const delta = tx.type === 'RECEITA' ? amount : -amount;
      if (inMonth) {
        if (tx.type === 'RECEITA') receitas += amount;
        else {
          despesas += amount;
          // Pagamento de fatura: DESPESA com invoice_close em conta que
          // não é cartão (no cartão, invoice_close marca a compra
          // vinculada — isso é gasto, não pagamento). Espelha o campo
          // despesasFatura da RPC mf_month_summary e a emulação E2E.
          if (tx.invoice_close && acc.account_type !== 'CARTAO') despesasFatura += amount;
        }
      }
      if (inPrev) {
        if (tx.type === 'RECEITA') receitasPrev += amount;
        else despesasPrev += amount;
      }
      if (untilEnd) (tx.status === 'PAGO' ? (saldoMov += delta) : (pendenteMov += delta));
      if (untilPrevEnd && tx.status === 'PAGO') saldoMovPrev += delta;
    });

    const saldo = (Number(acc.initial_balance) || 0) + saldoMov;
    const saldoPrev = (Number(acc.initial_balance) || 0) + saldoMovPrev;
    return {
      ...acc,
      currency: acc.currency || 'BRL',
      receitas,
      despesas,
      despesasFatura,
      receitasPrev,
      despesasPrev,
      transfCredito,
      transfDebito,
      saldo,
      saldoPrev,
      previsto: saldo + pendenteMov,
    };
  });

/**
 * Movimentação do mês por tipo, separada em Efetivadas (PAGO) × Pendentes —
 * bloco MOVIMENTAÇÃO do detalhe (padrão do app original). Ignora
 * canceladas; janela [start, end]; transferências entram por direção
 * (débito = origem, crédito = destino). Valores brutos (despesa positiva).
 */
export function computeMovementSplit(transactions, accountId, start, end, accounts = []) {
  const split = {
    receitas: { pago: 0, pendente: 0 },
    despesas: { pago: 0, pendente: 0 },
    transfIn: { pago: 0, pendente: 0 },
    transfOut: { pago: 0, pendente: 0 },
  };
  const byId = new Map((accounts ?? []).map((acc) => [acc.id, acc]));
  const viewMonth = String(start).slice(0, 7);
  // Cartão não tem crédito de pagamento: transferências não aparecem na
  // movimentação do cartão (o pagamento é despesa na conta vinculada).
  const targetIsCard = byId.get(accountId)?.account_type === 'CARTAO';
  (transactions ?? []).forEach((tx) => {
    if (isCancelled(tx)) return;
    if (targetIsCard && tx.type === 'TRANSFERENCIA') return;
    // Despesa de cartão: mês da fatura (vencimento); o resto, a data.
    const inMonth =
      tx.account_id === accountId && tx.type === 'DESPESA' && tx.invoice_close
        ? cardExpenseMonth(tx, byId) === viewMonth
        : tx.payment_date >= start && tx.payment_date <= end;
    if (!inMonth) return;
    const amount = Number(tx.amount) || 0;
    const bucket = tx.status === 'PAGO' ? 'pago' : 'pendente';
    if (tx.type === 'TRANSFERENCIA') {
      if (tx.account_id === accountId) split.transfOut[bucket] += amount;
      if (tx.transfer_account_id === accountId) split.transfIn[bucket] += amount;
      return;
    }
    if (tx.account_id !== accountId) return;
    if (tx.type === 'RECEITA') split.receitas[bucket] += amount;
    else if (tx.type === 'DESPESA') split.despesas[bucket] += amount;
  });
  return split;
}

/**
 * Delta assinado de um lançamento no escopo (Set de contas ou null = todas).
 * Transferência: subtrai de quem sai, soma em quem entra — anula sozinha
 * quando origem e destino estão no mesmo escopo (ex.: total consolidado).
 */
const scopeDelta = (tx, scope) => {
  const amount = Number(tx.amount) || 0;
  if (tx.type === 'TRANSFERENCIA') {
    if (scope === null) return 0;
    let delta = 0;
    if (scope.has(tx.account_id)) delta -= amount;
    if (scope.has(tx.transfer_account_id)) delta += amount;
    return delta;
  }
  if (scope !== null && !scope.has(tx.account_id)) return null;
  return tx.type === 'RECEITA' ? amount : -amount;
};

/* ────────────────────────────────────────────────────────────
 * Queries
 * ──────────────────────────────────────────────────────────── */

export function useMFAccounts(user) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-accounts', user?.id, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_accounts',
        () => {
          let query = supabase.from('mf_accounts').select('*').order('sort_order');
          if (profileId) query = query.eq('profile_id', profileId);
          return query;
        },
        { filter: byProfile(profileId), sort: bySortOrder }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tipos de conta personalizados do usuário (mf_account_types). */
export function useMFAccountTypes(user) {
  return useQuery({
    queryKey: ['mf-account-types', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_account_types',
        () => supabase.from('mf_account_types').select('*').order('name'),
        { sort: byNameAsc }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Resumo do mês: linhas de contas com movimentações (usado no Resumo e em Contas). */
export function useMFMonthSummary(user, monthKey) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-month-summary', user?.id, monthKey, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { start, end } = monthBounds(monthKey);
      const prev = monthBounds(prevMonthKey(monthKey));
      // Janela de 6 meses (inclusive o atual) para os gráficos do Resumo.
      const flowStart = monthBounds(shiftMonth(monthKey, -5)).start;

      // Perfil: filtra contas (as movimentações são derivadas por conta).
      const accounts = await mfSelect(
        'mf_accounts',
        () => {
          let query = supabase.from('mf_accounts').select('*').order('sort_order');
          if (profileId) query = query.eq('profile_id', profileId);
          return query;
        },
        { filter: byProfile(profileId), sort: bySortOrder }
      );
      if (accounts.error) throw accounts.error;
      const accRows = accounts.data ?? [];
      const inScopeIds = new Set(accRows.map((acc) => acc.id));

      // Agregados no servidor (RPC mf_month_summary): evita baixar as
      // ~13 mil linhas a cada troca de mês/ação. Offline ou qualquer
      // falha: cai no cálculo local via cache Dexie (mesmo resultado).
      if (!isOffline()) {
        try {
          const { data, error } = await supabase.rpc('mf_month_summary', {
            p_month: monthKey,
          });
          if (error) throw error;
          return {
            rows: (data?.rows ?? []).filter((row) => inScopeIds.has(row.id)),
            chartTxs: data?.chartTxs ?? [],
          };
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[MF] RPC mf_month_summary falhou; cálculo local', err);
        }
      }

      const transactions = await mfSelectAll(
        'mf_transactions',
        () =>
          supabase
            .from('mf_transactions')
            .select('*')
            .lte('payment_date', end)
            .order('payment_date')
            .order('id'),
        { filter: (rows) => rows.filter((row) => row.payment_date <= end) }
      );
      if (transactions.error) throw transactions.error;

      const rows = computeAccountRows(
        accRows,
        transactions.data ?? [],
        start,
        end,
        prev.start,
        prev.end
      );

      // Gráficos do Resumo: movimentos realizados (PAGO) dos últimos
      // 6 meses, em forma enxuta (sem carregar os lançamentos na UI).
      const currencyByAccount = Object.fromEntries(
        accRows.map((acc) => [acc.id, acc.currency || 'BRL'])
      );
      const chartTxs = [];
      for (const tx of transactions.data ?? []) {
        if (isCancelled(tx) || tx.status !== 'PAGO') continue;
        if (tx.type !== 'RECEITA' && tx.type !== 'DESPESA') continue;
        const paymentDate = String(tx.payment_date || '');
        if (paymentDate < flowStart || paymentDate > end) continue;
        chartTxs.push({
          m: paymentDate.slice(0, 7),
          a: tx.account_id,
          c: currencyByAccount[tx.account_id] || 'BRL',
          t: tx.type,
          v: Number(tx.amount) || 0,
          cat: tx.category_id ?? null,
        });
      }

      return { rows, chartTxs };
    },
  });
}

/**
 * Núcleo puro do extrato (usado pelo hook e pela timeline do detalhe, que
 * reaproveita o `allTx` já carregado em vez de baixar o histórico de novo
 * a cada troca de mês). Mesma semântica do queryFn abaixo.
 */
export function computeStatement({ accounts = [], transactions = [], start, end, accountId = null, currency = 'all' }) {
  const scoped = (accounts ?? []).filter(
    (acc) =>
      (!accountId || acc.id === accountId) &&
      (currency === 'all' || (acc.currency || 'BRL') === currency)
  );
  const scopeIds = new Set(scoped.map((acc) => acc.id));
  const inScope = (tx) => scopeIds.has(tx.account_id) || scopeIds.has(tx.transfer_account_id);
  const accountById = new Map((accounts ?? []).map((acc) => [acc.id, acc]));
  const viewMonth = String(start).slice(0, 7);
  // Cartão não tem crédito de pagamento: o extrato do cartão lista só as
  // compras da fatura (o pagamento é despesa na conta vinculada).
  const scopeIsCard =
    accountId != null && accountById.get(accountId)?.account_type === 'CARTAO';

  // Saldo de abertura: saldo inicial das contas do escopo + PAGO antes do mês
  // (despesa de cartão: antes da fatura vista).
  let opening = scoped.reduce((sum, acc) => sum + (Number(acc.initial_balance) || 0), 0);
  (transactions ?? []).forEach((tx) => {
    if (isCancelled(tx) || tx.status !== 'PAGO') return;
    if (scopeIsCard && tx.type === 'TRANSFERENCIA') return;
    if (cardExpenseMonth(tx, accountById) >= viewMonth) return;
    const delta = scopeDelta(tx, scopeIds);
    if (delta !== null) opening += delta;
  });

  // Movimentações do mês, ordenadas por data (despesa de cartão: mês da
  // fatura — vencimento — agrupada pela data de lançamento).
  const monthTxs = (transactions ?? [])
    .filter((tx) => {
      if (isCancelled(tx) || !inScope(tx)) return false;
      if (scopeIsCard && tx.type === 'TRANSFERENCIA') return false;
      if (tx.type === 'DESPESA' && tx.invoice_close) {
        return cardExpenseMonth(tx, accountById) === viewMonth;
      }
      return tx.payment_date >= start && tx.payment_date <= end;
    })
    .sort((a, b) =>
      a.payment_date === b.payment_date
        ? String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
        : a.payment_date.localeCompare(b.payment_date)
    );

  const byId = new Map((accounts ?? []).map((acc) => [acc.id, acc]));

  let running = opening;
  const groups = [];
  monthTxs.forEach((tx) => {
    const delta = tx.status === 'PAGO' ? scopeDelta(tx, scopeIds) : 0;
    if (delta !== null && delta !== 0) running += delta;

    const last = groups[groups.length - 1];
    const item = {
      tx,
      delta: delta ?? 0,
      balance: running,
      currency: byId.get(tx.account_id)?.currency || 'BRL',
      accountName: byId.get(tx.account_id)?.name ?? '—',
      transferAccountName:
        tx.type === 'TRANSFERENCIA' ? byId.get(tx.transfer_account_id)?.name ?? '—' : null,
    };
    if (last && last.date === tx.payment_date) last.items.push(item);
    else groups.push({ date: tx.payment_date, items: [item] });
  });

  return { groups, opening };
}

/**
 * Extrato do mês com saldo corrente.
 * Escopo: conta específica (`accountId`) e/ou moeda (`currency`, 'all' = sem filtro).
 * `mixed: true` quando o escopo tem moedas diferentes — nesse caso o saldo
 * corrente consolidado não é válido (não somamos moedas distintas) e a UI o oculta.
 */
export function useMFStatement(user, monthKey, accountId = null, currency = 'all', opts = {}) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-statement', user?.id, monthKey, accountId ?? 'all', currency, profileId ?? 'all'],
    enabled: !!user?.id && opts.enabled !== false,
    queryFn: async () => {
      const { start, end } = monthBounds(monthKey);

      // Perfil: contas filtradas; o escopo client-side (inScope) já
      // esconde movimentações de contas fora do perfil.
      const accounts = await mfSelect(
        'mf_accounts',
        () => {
          let query = supabase.from('mf_accounts').select('*').order('sort_order');
          if (profileId) query = query.eq('profile_id', profileId);
          return query;
        },
        { filter: byProfile(profileId), sort: bySortOrder }
      );
      if (accounts.error) throw accounts.error;

      const accRows = accounts.data ?? [];
      const scoped = accRows.filter(
        (acc) =>
          (!accountId || acc.id === accountId) &&
          (currency === 'all' || (acc.currency || 'BRL') === currency)
      );
      const scopeIds = scoped.map((acc) => acc.id);
      const currencies = [...new Set(scoped.map((acc) => acc.currency || 'BRL'))];
      const mixed = currencies.length > 1;

      // Extrato agregado no servidor (RPC mf_statement): evita baixar as
      // ~13 mil linhas. Offline ou qualquer falha: cálculo local (para
      // conta única, já filtrado no servidor — ver abaixo).
      if (!isOffline()) {
        try {
          const { data, error } = await supabase.rpc('mf_statement', {
            p_month: monthKey,
            p_account_ids: scopeIds,
            p_profile_id: profileId ?? null,
          });
          if (error) throw error;
          return {
            groups: data?.groups ?? [],
            accounts: accRows,
            scopedAccounts: scoped,
            currencies,
            mixed,
            opening: data?.opening ?? 0,
          };
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[MF] RPC mf_statement falhou; cálculo local', err);
        }
      }

      const transactions = await mfSelectAll(
        'mf_transactions',
        () => {
          let query = supabase.from('mf_transactions').select('*');
          if (accountId) {
            // Extrato de UMA conta: filtra no servidor pelos dois lados
            // do lançamento (origem ou destino da transferência). Cai de
            // ~13 mil linhas para centenas — e o cálculo client-side
            // abaixo segue idêntico. Sem recorte de data: saldos e
            // despesas vinculadas futuras precisam do histórico.
            query = query.or(
              `account_id.eq.${accountId},transfer_account_id.eq.${accountId}`
            );
          } else {
            query = query.lte('payment_date', end);
          }
          return query.order('payment_date').order('id');
        },
        {
          filter: (rows) =>
            rows.filter((row) =>
              accountId
                ? row.account_id === accountId || row.transfer_account_id === accountId
                : row.payment_date <= end
            ),
        }
      );
      if (transactions.error) throw transactions.error;

      const allTxs = transactions.data ?? [];

      const { groups, opening } = computeStatement({
        accounts: accRows,
        transactions: allTxs,
        start,
        end,
        accountId,
        currency,
      });

      return { groups, accounts: accRows, scopedAccounts: scoped, currencies, mixed, opening };
    },
  });
}

/* ────────────────────────────────────────────────────────────
 * Lançamentos (Fase 3)
 * ──────────────────────────────────────────────────────────── */

/** Lançamentos do mês + vínculos de tag (tela Lançamentos). */
export function useMFLancamentos(user, monthKey) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-lancamentos', user?.id, monthKey, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { start, end } = monthBounds(monthKey);
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return { transactions: [], tagIdsByTx: {} };

      let txQuery = supabase
        .from('mf_transactions')
        .select('*')
        .gte('payment_date', start)
        .lte('payment_date', end);
      if (scopeIds) txQuery = txQuery.in('account_id', scopeIds);

      const [txs, links] = await Promise.all([
        mfSelect(
          'mf_transactions',
          () => txQuery,
          {
            filter: (rows) =>
              rows.filter(
                (row) =>
                  row.payment_date >= start &&
                  row.payment_date <= end &&
                  (!scopeIds || scopeIds.includes(row.account_id))
              ),
          }
        ),
        mfSelect('mf_transaction_tags', () =>
          supabase.from('mf_transaction_tags').select('*')
        ),
      ]);
      if (txs.error) throw txs.error;
      if (links.error) throw links.error;

      const transactions = txs.data ?? [];
      // Vínculos de tag SEM recorte por mês: a query já baixa todos. Assim
      // uma compra de outra fatura editada a partir do drill-down mantém
      // as tags (o salvar apaga e recria os links a partir de tagIdsByTx).
      const tagIdsByTx = {};
      (links.data ?? []).forEach((row) => {
        if (!tagIdsByTx[row.transaction_id]) tagIdsByTx[row.transaction_id] = [];
        tagIdsByTx[row.transaction_id].push(row.tag_id);
      });
      return { transactions, tagIdsByTx };
    },
  });
}

/**
 * Preferências de interface (painel do Resumo + critério de ordenação das
 * contas) sincronizadas entre aparelhos.
 *
 * O localStorage é o cache instantâneo (e funciona offline); a conta do
 * usuário (tabela `mf_user_prefs`) é a fonte da verdade — sem isso cada
 * aparelho tinha o seu próprio painel (o mesmo usuário via um layout
 * diferente no celular, no tablet e no desktop).
 *
 * O perfil ativo e o mês navegado NÃO sincronizam: cada aparelho pode
 * estar num perfil/mês diferente ao mesmo tempo, sem se atropelar.
 */
export function useMFPrefs(user) {
  const [prefs, setPrefs] = useState(() => readPrefsLocal());
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  // Servidor → local: se houver preferência salva na conta, ela vale.
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('mf_user_prefs')
          .select('data')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled || error || !data?.data) return;
        // Mexeu localmente enquanto carregava: a conta não sobrescreve.
        if (dirtyRef.current) return;
        const remote = data.data;
        if (JSON.stringify(remote) === JSON.stringify(readPrefsLocal())) return;
        writePrefsLocal(remote);
        setPrefs(remote);
      } catch {
        // Sem servidor (offline, mock ou tabela ainda não criada): o
        // cache local manda — a preferência é a mesma de sempre.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Local → servidor: grava na hora no cache e envia (com folga) para a
  // conta, para os outros aparelhos pegarem.
  const save = useCallback(
    (patch) => {
      dirtyRef.current = true;
      setPrefs((current) => {
        const next = { ...current, ...patch };
        writePrefsLocal(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (!user?.id) return;
          try {
            supabase
              .from('mf_user_prefs')
              .upsert(
                { user_id: user.id, data: next, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
              )
              .then(
                () => {},
                () => {}
              );
          } catch {
            // Sem servidor: a preferência fica só no cache local.
          }
        }, 700);
        return next;
      });
    },
    [user?.id]
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { prefs, save };
}

/**
 * Pendentes do MÊS (card "Pendentes" do Resumo).
 *
 * Janela estrita: só o mês navegado — cada mês mostra os seus próprios
 * pendentes (sem grupo de atrasados). A consulta é filtrada no servidor
 * por `payment_date` dentro do mês, então o custo não cresce com o
 * histórico (o escopo antigo de "tudo" custava a tabela inteira).
 *
 * Entra tudo que está PENDENTE no mês: a pagar, a receber, transferências
 * e o pagamento-espelho da fatura do cartão (que entra marcado com 🎴
 * porque tem `invoice_close`).
 */
export function useMFPendingMonth(user, monthKey) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-pending-month', user?.id, monthKey, profileId ?? 'all'],
    enabled: !!user?.id && !!monthKey,
    queryFn: async () => {
      const { start, end } = monthBounds(monthKey);
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return [];
      let query = supabase
        .from('mf_transactions')
        .select(
          'id,type,amount,description,payment_date,due_date,effective_date,status,account_id,transfer_account_id,category_id,invoice_close,notes'
        )
        .eq('status', 'PENDENTE')
        .gte('payment_date', start)
        .lte('payment_date', end)
        .order('payment_date');
      if (scopeIds) query = query.in('account_id', scopeIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Categorias (com subníveis via parent_id). */
export function useMFCategories(user) {
  return useQuery({
    queryKey: ['mf-categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_categories',
        () => supabase.from('mf_categories').select('*').order('name'),
        { sort: byNameAsc }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tags. */
export function useMFTags(user) {
  return useQuery({
    queryKey: ['mf-tags', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_tags',
        () => supabase.from('mf_tags').select('*').order('name'),
        { sort: byNameAsc }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ────────────────────────────────────────────────────────────
 * Mutations
 * ──────────────────────────────────────────────────────────── */

/**
 * Trailing de coalescência das invalidações globais. Cada mutação invalida
 * TUDO (inclusive os pulls paginados de 13k linhas em ondas paralelas) —
 * rajadas de saves (tags, efetivar, edições em sequência) viravam N
 * tempestades e o PostgREST matava threads ("Thread killed by timeout
 * manager"), o que no navegador aparece como erro CORS fantasma. O
 * trailing junta a rajada numa única invalidação; para 1 save isolado o
 * refresh só atrasa 750ms (imperceptível perto da tempestade).
 */
let invalidateTimer = null;

// Sem debounce nos testes (vitest): evita flake contra o timeout padrão
// do waitFor — padrão já usado no projeto (sync só fora de MODE=test).
const INVALIDATE_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 750;

/**
 * Sinal "atualização pendente": cobre a janela entre o salvamento e o
 * refetch (o debounce acima) em que nenhum isFetching está ativo ainda.
 * Componentes combinam com o próprio isFetching para o spinner.
 */
let mfRefreshPending = false;
const mfRefreshListeners = new Set();
function setMFRefreshPending(value) {
  if (mfRefreshPending === value) return;
  mfRefreshPending = value;
  mfRefreshListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* listener não pode quebrar o fluxo */
    }
  });
}
export function useMFRefreshPending() {
  return useSyncExternalStore(
    (notify) => {
      mfRefreshListeners.add(notify);
      return () => {
        mfRefreshListeners.delete(notify);
      };
    },
    () => mfRefreshPending
  );
}

/** Só queries do Minhas Finanças (todas começam com 'mf-'). */
const isMFQuery = (query) => {
  const key = query?.queryKey;
  return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('mf-');
};

/** Exportado para o harness de teste do sinal de pendência. */
export const useInvalidateAll = () => {
  const queryClient = useQueryClient();
  // Fire-and-forget (bloco sem return!): no React Query v5 o mutateAsync
  // AGUARDA promises retornadas em onSuccess, e invalidateQueries() só
  // resolve quando todos os refetchs ativos terminam — mf-all-transactions
  // paginado tem 14 páginas de 13.318 linhas. Retornar a promise deixava o
  // modal de pagamento "salvando" vários segundos depois do insert já feito.
  // O sinal de pendente acende na hora (cobre o debounce) e apaga quando
  // os refetchs assentam — sem retornar a promise, o modal não espera.
  return () => {
    setMFRefreshPending(true);
    const settle = () => setMFRefreshPending(false);
    if (INVALIDATE_DELAY_MS === 0) {
      queryClient.invalidateQueries({ predicate: isMFQuery }).then(settle, settle);
      return;
    }
    if (invalidateTimer) clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => {
      invalidateTimer = null;
      queryClient.invalidateQueries({ predicate: isMFQuery }).then(settle, settle);
    }, INVALIDATE_DELAY_MS);
  };
};

export function useCreateAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (account) =>
      mfMutate({
        table: 'mf_accounts',
        action: 'insert',
        payload: account,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_accounts')
            .insert(account)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...patch }) =>
      mfMutate({
        table: 'mf_accounts',
        action: 'update',
        id,
        payload: patch,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_accounts')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id) =>
      mfMutate({
        table: 'mf_accounts',
        action: 'delete',
        id,
        run: async () => {
          const { error } = await supabase.from('mf_accounts').delete().eq('id', id);
          if (error) throw error;
          return id;
        },
      }),
    onSuccess: invalidate,
  });
}

/** Aplica o `sort_order` novo nos itens com `byId` de um cache MF e
 * REORDENA o array pela régua do banco (sort_order, id — a mesma da RPC
 * mf_month_summary). Arrays sem nenhum item tocado ficam intactos
 * (ordenados ou não) — transações e afins nunca reordenam por acaso. */
const applySortOrderToCache = (old, byId) => {
  const patchArray = (items) => {
    if (!Array.isArray(items)) return items;
    let changed = false;
    const patched = items.map((item) => {
      if (item && byId.has(item.id)) {
        changed = true;
        return { ...item, sort_order: byId.get(item.id) };
      }
      return item;
    });
    if (!changed) return items;
    return patched.sort(
      (a, b) =>
        (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0) ||
        String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
    );
  };
  if (Array.isArray(old)) return patchArray(old);
  if (old && typeof old === 'object' && Array.isArray(old.rows)) {
    const rows = patchArray(old.rows);
    return rows === old.rows ? old : { ...old, rows };
  }
  return old;
};

/**
 * Reordenação OTIMISTA de contas/grupos (`updates` = [{ id, sort_order }]):
 * o novo `sort_order` vai para os caches MF no instante do clique e a
 * gravação corre em paralelo — a UI move na hora. Antes, cada clique
 * disparava `useInvalidateAll` e a tela só se movia quando TODAS as
 * queries refetchavam, incluindo a RPC do resumo (varre todos os
 * lançamentos do mês + 5 meses de gráfico) — dava a sensação de
 * travar. Reordenação não muda valores, então em SUCESSO não invalida
 * nada; em ERRO restaura os snapshots e invalida tudo (rollback).
 */
export function useMFReorder(table) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (updates) => {
      await Promise.all(
        updates.map(({ id, sort_order }) =>
          mfMutate({
            table,
            action: 'update',
            id,
            payload: { sort_order },
            run: async () => {
              const { error } = await supabase
                .from(table)
                .update({ sort_order })
                .eq('id', id);
              if (error) throw error;
              return { id, sort_order };
            },
          })
        )
      );
      return updates;
    },
    onMutate: async (updates) => {
      const byId = new Map(updates.map((update) => [update.id, update.sort_order]));
      await queryClient.cancelQueries({ predicate: isMFQuery });
      const snapshots = queryClient.getQueriesData({ predicate: isMFQuery });
      queryClient.setQueriesData({ predicate: isMFQuery }, (old) =>
        applySortOrderToCache(old, byId)
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      invalidate();
    },
  });
}

export function useCreateTransfer() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (transfer) =>
      mfMutate({
        table: 'mf_transactions',
        action: 'insert',
        payload: transfer,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_transactions')
            .insert(transfer)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

export function useCreateAccountType() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_account_types')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAccountType() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_account_types').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Grupos de contas (hierarquia por parent_id, padrão mf_categories)
 * ──────────────────────────────────────────────────────────── */

/** Lista os grupos do usuário (sort_order, depois nome). */
export function useMFGroups(user) {
  return useQuery({
    queryKey: ['mf-account-groups', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_account_groups',
        () => supabase.from('mf_account_groups').select('*').order('sort_order')
      );
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      return [...rows].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR')
      );
    },
  });
}

/** Cria um grupo de contas. */
export function useCreateMFGroup() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload) =>
      mfMutate({
        table: 'mf_account_groups',
        action: 'insert',
        payload,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_account_groups')
            .insert(payload)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

/** Atualiza um grupo (nome, ícone, flags, grupo pai). */
export function useUpdateMFGroup() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...patch }) =>
      mfMutate({
        table: 'mf_account_groups',
        action: 'update',
        id,
        payload: patch,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_account_groups')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

/**
 * Busca a série fixa inteira (cabeça + filhas) para exclusão/edição com
 * escopo. Fora de série fixa, devolve só o próprio lançamento.
 */
export async function fetchFixedSeries(tx) {
  const headId = tx?.parent_transaction_id ?? tx?.id;
  if (!headId) return tx ? [tx] : [];
  const [headRes, childrenRes] = await Promise.all([
    supabase.from('mf_transactions').select('*').eq('id', headId).maybeSingle(),
    supabase
      .from('mf_transactions')
      .select('*')
      .eq('parent_transaction_id', headId)
      .order('payment_date'),
  ]);
  if (headRes.error) throw headRes.error;
  if (childrenRes.error) throw childrenRes.error;
  // Defesa client-side (mocks de teste sem filtro por eq devolvem tudo):
  // só entra cabeça com o id pedido e filhas com o pai pedido.
  const rawHead = Array.isArray(headRes.data)
    ? headRes.data.find((row) => row?.id === headId) ?? null
    : headRes.data ?? null;
  const head = rawHead && rawHead.id === headId ? rawHead : null;
  const rawChildren = Array.isArray(childrenRes.data) ? childrenRes.data : [];
  const children = rawChildren.filter((row) => row?.parent_transaction_id === headId);
  const series = [...(head ? [head] : []), ...children];
  return series.length > 0 ? series : [tx];
}

/** Apaga um grupo (contas ficam órfãs via ON DELETE SET NULL; filhos bloqueiam). */
export function useDeleteMFGroup() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id) =>
      mfMutate({
        table: 'mf_account_groups',
        action: 'delete',
        id,
        run: async () => {
          const { error } = await supabase.from('mf_account_groups').delete().eq('id', id);
          if (error) throw error;
          return id;
        },
      }),
    onSuccess: invalidate,
  });
}

/** Cria um ou vários lançamentos (parcelas/recorrência entram como array). */
export function useCreateMFTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (rows) => {
      const payload = Array.isArray(rows) ? rows : [rows];
      return mfMutate({
        table: 'mf_transactions',
        action: 'insert',
        payload,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_transactions')
            .insert(payload)
            .select();
          if (error) throw error;
          return data ?? [];
        },
      });
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMFTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...patch }) =>
      mfMutate({
        table: 'mf_transactions',
        action: 'update',
        id,
        payload: patch,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_transactions')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteMFTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id) =>
      mfMutate({
        table: 'mf_transactions',
        action: 'delete',
        id,
        run: async () => {
          const { error } = await supabase.from('mf_transactions').delete().eq('id', id);
          if (error) throw error;
          return id;
        },
      }),
    onSuccess: invalidate,
  });
}

/**
 * Paga/despaga (PAGO ↔ PENDENTE) com data de efetivação.
 * `payment_date` opcional move a contabilização para outro mês
 * ("Contabilizar em <mês>" da série fixa).
 */
export function useMFSetTransactionStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, status, effective_date, payment_date }) => {
      const patch = { status, effective_date };
      if (payment_date) patch.payment_date = payment_date;
      return mfMutate({
        table: 'mf_transactions',
        action: 'update',
        id,
        payload: patch,
        run: async () => {
          const { data, error } = await supabase
            .from('mf_transactions')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      });
    },
    onSuccess: invalidate,
  });
}

/** Edição em lote: mesmo patch para vários ids. */
export function useBulkMFTransactions() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ ids, patch }) =>
      mfMutate({
        table: 'mf_transactions',
        action: 'updateMany',
        ids,
        payload: patch,
        run: async () => {
          const { error } = await supabase.from('mf_transactions').update(patch).in('id', ids);
          if (error) throw error;
          return ids;
        },
      }),
    onSuccess: invalidate,
  });
}

/**
 * Envia o comprovante do lançamento por e-mail (botão ✉️ manual, mesmo
 * formato do Finance): usa o destinatário informado (`to`) ou o da
 * `notification_settings`, invoca `send-finance-email` e marca
 * `email_sent`. Retorna a função `sendReceipt({ tx, categoryName, to })`.
 */
export function useMFSendReceiptEmail() {
  const { t } = useTranslation();
  const { data: settings } = useNotificationSettings();
  const updateTx = useUpdateMFTransaction();
  return async ({ tx, categoryName = '', to = null }) => {
    const dest = to || settings?.recipient_email;
    if (!dest) {
      toast.error(t('minhasfinancas.email_no_recipient'));
      return false;
    }
    const subjectKey =
      tx.type === 'RECEITA'
        ? 'minhasfinancas.email_subject_income'
        : tx.type === 'TRANSFERENCIA'
          ? 'minhasfinancas.email_subject_transfer'
          : 'minhasfinancas.email_subject_expense';
    try {
      const { error } = await supabase.functions.invoke('send-finance-email', {
        body: {
          to: dest,
          subject: t(subjectKey, { desc: tx.description }),
          data: {
            description: tx.description,
            category: categoryName || '',
            type: tx.type,
            status: tx.status,
            amount: Number(tx.amount) || 0,
            payment_date: tx.payment_date,
          },
          bcc: settings?.bcc_email,
        },
      });
      if (error) throw error;
      await updateTx.mutateAsync({ id: tx.id, email_sent: true });
      toast.success(t('minhasfinancas.email_sent_to', { email: dest }));
      return true;
    } catch {
      toast.error(t('minhasfinancas.save_error'));
      return false;
    }
  };
}

/** Exclusão em lote. */
export function useBulkDeleteMFTransactions() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (ids) =>
      mfMutate({
        table: 'mf_transactions',
        action: 'deleteMany',
        ids,
        run: async () => {
          const { error } = await supabase.from('mf_transactions').delete().in('id', ids);
          if (error) throw error;
          return ids;
        },
      }),
    onSuccess: invalidate,
  });
}

/**
 * Exclusão de série parcelada com escopo ("O que você deseja?" do app
 * original): `one` (só esta), `from` (esta e as próximas, pela ordem da
 * série) ou `all` (cabeça + filhas). Com `renumber`, as restantes são
 * renumeradas 1..N (atualiza o total). Retorna os ids excluídos.
 */
export function useInstallmentDelete() {
  const bulkDelete = useBulkDeleteMFTransactions();
  const updateTx = useUpdateMFTransaction();
  return async ({ tx, scope, renumber }) => {
    const series = orderSeries(await fetchInstallmentSeries(tx));
    const idx = series.findIndex((row) => row.id === tx.id);
    const doomed =
      scope === 'all'
        ? series
        : scope === 'from'
          ? series.slice(Math.max(0, idx))
          : series.filter((row) => row.id === tx.id);
    const doomedIds = doomed.map((row) => row.id);
    if (doomedIds.length > 0) await bulkDelete.mutateAsync(doomedIds);
    const remaining = series.filter((row) => !doomedIds.includes(row.id));
    if (renumber && remaining.length > 0) {
      await Promise.all(
        remaining.map((row, index) =>
          updateTx.mutateAsync({
            id: row.id,
            installments_current: index + 1,
            installments_total: remaining.length,
          })
        )
      );
    }
    return { deletedIds: doomedIds, remaining: remaining.length };
  };
}

/* Guarda contra dupla execução da estensão (StrictMode/render rápido). */
let fixedExtendRunning = false;

/**
 * Estende as séries fixas no mount do módulo (throttle de 24h em
 * localStorage): mantém ~12 meses de ocorrências futuras. Best-effort —
 * falhas de rede não quebram a tela.
 */
/**
 * Efetivação automática (coluna `auto_settle`, DEFAULT FALSE — escolha na
 * criação de despesa/receita/transferência): promove PENDENTE → PAGO
 * APENAS o que foi criado com a opção marcada. Desmarcado (default), o
 * lançamento nunca vira PAGO sozinho — só efetivação manual (Efetivar).
 *
 * - régua: `payment_date <= hoje` (a data agendada chegou) — nada de
 *   datas futuras;
 * - `effective_date` já gravada é preservada; sem ela, contabiliza na
 *   própria data agendada (mesma régua do nascimento PAGO);
 * - linhas aqui são SEM invoice_close: a despesa de cartão nasce PAGO e
 *   o agendador de fatura tem regra própria — o espelho "Agendado
 *   automaticamente (fatura)" continua promovendo pelo marcador
 *   (invariante "não existe fatura vencida não paga", decisão P3).
 */
export const planAutoSettle = (rows, todayISO) =>
  rows
    .filter(
      (tx) =>
        tx &&
        tx.auto_settle === true &&
        tx.status === 'PENDENTE' &&
        typeof tx.payment_date === 'string' &&
        tx.payment_date <= todayISO
    )
    .map((tx) => ({
      id: tx.id,
      patch: {
        status: 'PAGO',
        effective_date: tx.effective_date || tx.payment_date,
      },
    }));

/**
 * Aplica planAutoSettle ao abrir o MF (idempotente: o que promove sai do
 * filtro da próxima consulta; falha é best-effort e não derruba o
 * módulo). Usa mfMutate — mesmo caminho offline dos demais patches de
 * status.
 */
export function useMFEffectivateDue(user) {
  const invalidate = useInvalidateAll();
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const today = toISODate(new Date());
        const { data, error } = await supabase
          .from('mf_transactions')
          .select('id,status,auto_settle,payment_date,effective_date')
          .eq('status', 'PENDENTE')
          .eq('auto_settle', true)
          .lte('payment_date', today);
        if (error || cancelled) return;
        const planned = planAutoSettle(Array.isArray(data) ? data : [], today);
        if (planned.length === 0 || cancelled) return;
        for (const item of planned) {
          await mfMutate({
            table: 'mf_transactions',
            action: 'update',
            id: item.id,
            payload: item.patch,
            run: async () => {
              const { error: patchError } = await supabase
                .from('mf_transactions')
                .update(item.patch)
                .eq('id', item.id)
                .select()
                .single();
              if (patchError) throw patchError;
              return item.patch;
            },
          });
        }
        invalidate();
      } catch {
        // best-effort: rede fora não derruba o módulo.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}

export function useMFExtendFixedSeries(user) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user?.id || fixedExtendRunning) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const last = Number(
          (typeof window !== 'undefined' &&
            window.localStorage.getItem(FIXED_EXTEND_STORAGE)) ||
            0
        );
        if (Date.now() - last < 24 * 60 * 60 * 1000) return;
        fixedExtendRunning = true;
        const { data, error } = await supabase
          .from('mf_transactions')
          .select('*')
          .eq('is_fixed', true);
        if (error || cancelled) return;
        const planned = planFixedExtensions(
          Array.isArray(data) ? data : [],
          toISODate(new Date())
        );
        if (planned.length > 0 && !cancelled) {
          await mfMutate({
            table: 'mf_transactions',
            action: 'insert',
            payload: planned,
            run: async () => {
              const { data: inserted, error: insertError } = await supabase
                .from('mf_transactions')
                .insert(planned)
                .select();
              if (insertError) throw insertError;
              return inserted ?? [];
            },
          });
          if (!cancelled) queryClient.invalidateQueries();
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(FIXED_EXTEND_STORAGE, String(Date.now()));
        }
      } catch {
        /* estensão é best-effort */
      } finally {
        fixedExtendRunning = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);
}

/**
 * Exclusão de série fixa com escopo escolhido pelo usuário:
 * - `'one'`: só esta ocorrência (se for a cabeça, promove a 1ª filha
 *   para nova cabeça antes de apagar — a FK em cascata apagaria tudo);
 * - `'from'`: desta ocorrência em diante (a cabeça sobrevive com
 *   `is_fixed = false`, o que encerra a estensão automática);
 * - `'all'`: a série inteira.
 */
export function useDeleteMFFixedSeries() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ tx, mode }) => {
      const headId = tx.parent_transaction_id ?? tx.id;
      const [headRes, childrenRes] = await Promise.all([
        supabase.from('mf_transactions').select('*').eq('id', headId).maybeSingle(),
        supabase
          .from('mf_transactions')
          .select('*')
          .eq('parent_transaction_id', headId)
          .order('payment_date'),
      ]);
      if (headRes.error) throw headRes.error;
      if (childrenRes.error) throw childrenRes.error;
      const head = headRes.data ?? null;
      const children = Array.isArray(childrenRes.data) ? childrenRes.data : [];
      const series = [...(head ? [head] : []), ...children];
      const target = series.find((row) => row.id === tx.id) ?? tx;

      const deleteIds = (ids) =>
        ids.length === 0
          ? Promise.resolve()
          : mfMutate({
              table: 'mf_transactions',
              action: 'deleteMany',
              ids,
              run: async () => {
                const { error } = await supabase
                  .from('mf_transactions')
                  .delete()
                  .in('id', ids);
                if (error) throw error;
                return ids;
              },
            });

      const patchIds = (ids, patch) =>
        ids.length === 0
          ? Promise.resolve()
          : mfMutate({
              table: 'mf_transactions',
              action: 'updateMany',
              ids,
              payload: patch,
              run: async () => {
                const { error } = await supabase
                  .from('mf_transactions')
                  .update(patch)
                  .in('id', ids);
                if (error) throw error;
                return ids;
              },
            });

      if (mode === 'all') {
        await deleteIds(series.map((row) => row.id));
        return;
      }

      if (mode === 'from') {
        const futureIds = series
          .filter((row) => String(row.payment_date) >= String(target.payment_date))
          .map((row) => row.id);
        if (futureIds.includes(headId)) {
          // Do início da série em diante = série inteira.
          await deleteIds(series.map((row) => row.id));
          return;
        }
        // Cabeça sobrevive fora da "moda fixa" → estensão para aqui.
        await patchIds([headId], { is_fixed: false });
        await deleteIds(futureIds);
        return;
      }

      // mode === 'one'
      if (tx.id === headId && children.length > 0) {
        const [promoted, ...rest] = children;
        await patchIds(
          rest.map((row) => row.id),
          { parent_transaction_id: promoted.id }
        );
        await patchIds([promoted.id], { parent_transaction_id: null });
        await deleteIds([headId]);
        return;
      }
      await deleteIds([tx.id]);
    },
    onSuccess: invalidate,
  });
}

/** Cria categoria (usada no modal e em Ajustes). */
export function useCreateMFCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_categories')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

/** Cria tag. */
export function useCreateMFTag() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('mf_tags').insert(payload).select().single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Ajustes (Fase 3): categorias, tags e responsáveis
 * ──────────────────────────────────────────────────────────── */

/** Responsáveis/perfis do usuário. */
export function useMFResponsibles(user) {
  return useQuery({
    queryKey: ['mf-responsibles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_responsibles',
        () => supabase.from('mf_responsibles').select('*').order('name'),
        { sort: byNameAsc }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateMFCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('mf_categories')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_categories').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMFTag() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('mf_tags')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFTag() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_tags').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/**
 * Utilização das tags: quantos lançamentos usam cada tag (gestão em
 * Ajustes). Uma leitura dos vínculos; a contagem é client-side.
 */
export function useMFTagUsage(user) {
  return useQuery({
    queryKey: ['mf-tag-usage', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_transaction_tags',
        () => supabase.from('mf_transaction_tags').select('tag_id,transaction_id'),
        {}
      );
      if (error) throw error;
      const counts = {};
      (data ?? []).forEach((row) => {
        if (row?.tag_id) counts[row.tag_id] = (counts[row.tag_id] || 0) + 1;
      });
      return { counts };
    },
  });
}

/** Lançamentos recentes de uma tag (drill "ver lançamentos", 50 últimos). */
export function useMFTagTransactions(user, tagId) {
  return useQuery({
    queryKey: ['mf-tag-transactions', user?.id, tagId ?? 'none'],
    enabled: !!user?.id && !!tagId,
    queryFn: async () => {
      const links = await mfSelect(
        'mf_transaction_tags',
        () => supabase.from('mf_transaction_tags').select('tag_id,transaction_id'),
        { filter: (rows) => rows.filter((row) => row.tag_id === tagId) }
      );
      if (links.error) throw links.error;
      const ids = [...new Set((links.data ?? []).map((row) => row.transaction_id).filter(Boolean))].slice(0, 50);
      if (ids.length === 0) return [];
      const txs = await mfSelect(
        'mf_transactions',
        () => supabase.from('mf_transactions').select('*').in('id', ids),
        {
          filter: (rows) => rows.filter((row) => ids.includes(row.id)),
          sort: (rows) =>
            [...rows].sort((a, b) =>
              String(b.payment_date || '').localeCompare(String(a.payment_date || ''))
            ),
        }
      );
      if (txs.error) throw txs.error;
      return txs.data ?? [];
    },
  });
}

export function useCreateMFResponsible() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_responsibles')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

/** Atualiza responsável; ao marcar como principal, limpa os demais. */
export function useUpdateMFResponsible() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      if (patch.is_main) {
        const { error: clearError } = await supabase
          .from('mf_responsibles')
          .update({ is_main: false });
        if (clearError) throw clearError;
      }
      const { data, error } = await supabase
        .from('mf_responsibles')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFResponsible() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_responsibles').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Fase 4: cartões de crédito e faturas
 * ──────────────────────────────────────────────────────────── */

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

/** 'YYYY-MM-DD' com dia limitado ao fim do mês (clamp de 29/30/31). */
const isoDay = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;

/** Soma dias a uma data ISO (YYYY-MM-DD). */
export const plusDaysISO = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Ciclos de fatura de um cartão ancorados no fechamento (dia C) e
 * vencimento (dia D): a compra fecha no dia C do mês e vence no dia D
 * do mesmo mês quando D >= C, senão no mês seguinte (regra dos emissores).
 * Retorna do ciclo mais futuro ao mais antigo, com período
 * (startISO..closeISO), vencimento (dueISO) e se já fechou (closed).
 */
export const cardCycles = (card, refISO, count = 6, futureCount = 1) => {
  const C = Number(card.closing_day) || 1;
  const D = Number(card.due_day) || 10;
  const [ry, rm] = refISO.split('-').map(Number);
  const cycles = [];
  // i = -1 → próximo fechamento ainda futuro (picker de fatura do app
  // original alcança ~1 ano à frente: futureCount amplia a janela); depois
  // mês a mês para trás
  for (let i = -futureCount; i <= count; i += 1) {
    const key = shiftMonth(`${ry}-${pad(rm)}`, -i);
    const [y, m] = key.split('-').map(Number);
    const closeISO = isoDay(y, m, C);
    const dueKey = shiftMonth(key, D >= C ? 0 : 1);
    const [dy, dm] = dueKey.split('-').map(Number);
    const dueISO = isoDay(dy, dm, D);
    const prevKey = shiftMonth(key, -1);
    const [py, pm] = prevKey.split('-').map(Number);
    cycles.push({
      closeISO,
      dueISO,
      startISO: plusDaysISO(isoDay(py, pm, C), 1),
      closed: closeISO <= refISO,
    });
  }
  return cycles;
};

/**
 * Faturas de um cartão: fechadas (mais recente primeiro) + fatura corrente
 * (a do MÊS — rotulada pelo vencimento, não pelo ciclo aberto) + futuras
 * com despesa vinculada (`upcomingInvoices` — entram no em aberto, sem
 * virar "ativa"). A despesa de cartão pertence à fatura ESCOLHIDA
 * (`invoice_close`); sem vínculo (legado), vale o mês da data = mês do
 * vencimento (fatura do mês calendário). Pagamentos VINCULADOS
 * (`invoice_close`) caem direto na fatura que pagam — modelo novo:
 * DESPESA na conta vinculada; modelo antigo (TRANSFERENCIA → cartão)
 * segue contado por compatibilidade. Sem vínculo (histórico migrado),
 * FIFO da fechada mais antiga para a corrente. `monthKey` define a régua
 * de época: no mês vivo o vínculo conta na hora; em mês passado só o que
 * já tinha acontecido até lá.
 */
export const buildCardInvoices = ({
  card,
  transactions,
  refISO,
  count = 6,
  monthKey,
  includeFutureBound = false,
  aggregates = null,
}) => {
  const refMonthKey = refISO.slice(0, 7);
  // Despesas até a data de referência — com fatura escolhida
  // (invoice_close) vale o MÊS: a compra entra quando o mês chega (ex.:
  // parcela de 28/10 vinculada a outubro aparece na fatura de outubro
  // já no mês vivo), sem vazar para meses anteriores. Sem vínculo, vale
  // a data (regra do emissor) — sem o corte, a fatura corrente de um
  // mês passado englobaria compras dos meses seguintes (futuro relativo a refISO).
  const inWindow = (tx) =>
    tx.payment_date <= refISO ||
    (tx.invoice_close && (tx.payment_date || '').slice(0, 7) <= refMonthKey);
  const expenses = transactions.filter(
    (tx) =>
      tx.account_id === card.id &&
      tx.type === 'DESPESA' &&
      tx.status !== 'CANCELADO' &&
      inWindow(tx)
  );
  // Mês vivo (atual): pagamento vinculado conta na hora — ele foi agendado
  // no vencimento da fatura que paga. Em mês passado (época), o vinculado
  // conta se o ciclo que ele paga já tinha fechado OU se o dinheiro já
  // tinha saído até lá (PAGO com payment_date <= refISO) — sem isso, uma
  // fatura paga no mês (ex.: paga em 20/08 a corrente que fecha em 14/09)
  // aparecia em aberto ao navegar aquele mês. Sem vínculo (histórico)
  // só vale até a data de referência.
  const live = !monthKey || monthKey === currentMonthKey();
  // Pagamento = DESPESA na conta vinculada (modelo novo) ou TRANSFERENCIA
  // → cartão (histórico — segue contado). Só o vinculado quita fatura
  // certa; DESPESA sem vínculo é gasto normal da conta (nunca vai ao FIFO).
  const isPaymentTx = (tx) =>
    (tx.type === 'TRANSFERENCIA' && tx.transfer_account_id === card.id) ||
    (tx.type === 'DESPESA' && tx.account_id === card.linked_account_id && tx.invoice_close);
  const payments = transactions
    .filter(
      (tx) =>
        isPaymentTx(tx) &&
        tx.status !== 'CANCELADO' &&
        (tx.invoice_close
          ? live || tx.invoice_close <= refISO || (tx.status === 'PAGO' && tx.payment_date <= refISO)
          : tx.payment_date <= refISO)
    )
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

  const boundByClose = {};
  // Só o que está coberto por pagamento VINCULADO ainda PENDENTE — separa
  // "fatura agendada" (espelho/travado no vencimento) de "fatura paga de
  // verdade" (PAGO) na hora de rotular o status (item 30).
  const pendingByClose = {};
  let fifoPool = 0;
  payments.forEach((tx) => {
    const value = Number(tx.amount) || 0;
    if (tx.invoice_close) {
      boundByClose[tx.invoice_close] = (boundByClose[tx.invoice_close] || 0) + value;
      if (tx.status === 'PENDENTE') {
        pendingByClose[tx.invoice_close] = (pendingByClose[tx.invoice_close] || 0) + value;
      }
    } else if (tx.type === 'TRANSFERENCIA') {
      fifoPool += value;
    }
  });

  // Agregados do servidor (RPC mf_card_cycle_totals): quando chegam, são a
  // fonte da verdade do caminho do FIFO — o cliente deixa de baixar o
  // histórico inteiro do cartão e de refazer aqui um saldo corrente que
  // o banco já sabe calcular. A matemática do FIFO NÃO muda: os agregados
  // são exatamente o que o cliente somava (total e estornos por ciclo,
  // pagamento vinculado/pendente por fechamento e o pool de pagamentos).
  const agg = aggregates?.[card.id] ?? null;
  const aggMonths = agg?.months ?? {};
  const aggCloses = agg?.closes ?? {};
  const aggPayments = agg?.payments ?? {};
  if (agg) {
    fifoPool = Number(agg.pool) || 0;
    Object.entries(aggPayments).forEach(([closeISO, value]) => {
      boundByClose[closeISO] = Number(value?.rawBound) || 0;
      pendingByClose[closeISO] = Number(value?.pendingBound) || 0;
    });
  }
  // Totais do ciclo: despesa com vínculo (pelo fechamento) + despesa sem
  // vínculo (pelo mês do vencimento) — a mesma regra de `inCycle`.
  const cycleTotals = (cycle) => {
    if (!agg) return null;
    const dueMonth = String(cycle.dueISO || '').slice(0, 7);
    const bound = aggCloses[cycle.closeISO];
    const month = aggMonths[dueMonth];
    if (!bound && !month) return { total: 0, refunds: 0 };
    return {
      total: (Number(bound?.total) || 0) + (Number(month?.total) || 0),
      refunds: (Number(bound?.refunds) || 0) + (Number(month?.refunds) || 0),
    };
  };

  // A janela `count` é só para exibição. O FIFO precisa enxergar TODO o
  // histórico do cartão; se calcular apenas as seis faturas exibidas,
  // pagamentos antigos sem vínculo "sobram" e quitam a fatura corrente
  // errada (enquanto EM ABERTO continua mostrando o saldo acumulado).
  const relevantDates = transactions
    .filter(
      (tx) =>
        (tx.account_id === card.id && tx.type === 'DESPESA') ||
        (tx.transfer_account_id === card.id && tx.type === 'TRANSFERENCIA') ||
        (tx.account_id === card.linked_account_id && tx.type === 'DESPESA' && tx.invoice_close)
    )
    .map((tx) => tx.payment_date)
    .filter(Boolean);
  const [refYear, refMonth] = refISO.split('-').map(Number);
  // Com agregados, o começo do histórico vem do servidor (o cliente só
  // tem a janela de exibição — sem isso, o FIFO pararia de percorrer os
  // ciclos antigos e o crédito antigo mudaria de valor).
  const earliest = agg?.firstDate
    ? String(agg.firstDate).slice(0, 10)
    : relevantDates.reduce((min, iso) => (iso < min ? iso : min), refISO);
  const [firstYear, firstMonth] = earliest.split('-').map(Number);
  // Fatura escolhida no lançamento (picker do app original, ~2 anos): a
  // janela cobre o menor e o maior invoice_close vinculados, senão a
  // despesa some até o ciclo chegar (futuro) ou some da lista (passado).
  const linkedCloses = agg
    ? Object.keys(aggCloses).sort()
    : transactions
        .filter(
          (tx) =>
            tx.account_id === card.id &&
            tx.type === 'DESPESA' &&
            tx.status !== 'CANCELADO' &&
            tx.invoice_close
        )
        .map((tx) => tx.invoice_close)
        .sort();
  const minLinkedClose = linkedCloses[0] ?? null;
  const maxLinkedClose = linkedCloses[linkedCloses.length - 1] ?? null;
  let monthsBack = Math.max(0, (refYear - firstYear) * 12 + refMonth - firstMonth);
  if (minLinkedClose) {
    const [ly, lm] = minLinkedClose.split('-').map(Number);
    monthsBack = Math.max(monthsBack, (refYear - ly) * 12 + (refMonth - lm) + 2);
  }
  const historyCount = Math.max(count + 1, monthsBack + 2);
  let futureCount = 1;
  if (maxLinkedClose) {
    const [ly, lm] = maxLinkedClose.split('-').map(Number);
    futureCount = Math.max(1, (ly - refYear) * 12 + (lm - refMonth) + 1);
  }
  // Parcela SEM vínculo com data futura estende a janela igual à
  // vinculada (espelha maxLinkedClose): sem isso, meses que só têm gasto
  // sem invoice_close não geram ciclo e a despesa fica invisível para a
  // Próxima/EM ABERTO/agendador até o mês chegar (bug Nomand).
  const maxFutureUnbound = transactions
    .filter(
      (tx) =>
        tx.account_id === card.id &&
        tx.type === 'DESPESA' &&
        tx.status !== 'CANCELADO' &&
        !tx.invoice_close &&
        String(tx.payment_date || '') > refISO
    )
    .map((tx) => tx.payment_date)
    .sort()
    .pop();
  if (maxFutureUnbound) {
    const [uy, um] = maxFutureUnbound.split('-').map(Number);
    futureCount = Math.max(futureCount, (uy - refYear) * 12 + (um - refMonth) + 1);
  }
  const cycles = cardCycles(card, refISO, historyCount, futureCount);
  const closed = cycles.filter((cycle) => cycle.closed); // mais recente primeiro
  const upcoming = cycles
    .filter((cycle) => !cycle.closed)
    .sort((a, b) => a.closeISO.localeCompare(b.closeISO));

  const round = (value) => Math.round(value * 100) / 100;

  // Despesa com fatura escolhida vai direto para o ciclo; sem vínculo
  // (legado/importado), vale o mês da data = mês do vencimento (fatura do
  // mês calendário — a data nunca empurra para o mês seguinte).
  const inCycle = (tx, cycle) =>
    tx.invoice_close
      ? tx.invoice_close === cycle.closeISO
      : String(tx.payment_date || '').slice(0, 7) === String(cycle.dueISO || '').slice(0, 7);

  // — faturas fechadas (antiga → nova: pagamento vinculado + FIFO histórico) —
  let remaining = fifoPool;
  const invoices = [];
  [...closed].reverse().forEach((cycle) => {
    const rows = expenses
      .filter((tx) => inCycle(tx, cycle))
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    // Com agregados, o total do ciclo vem do servidor (o cliente não tem
    // o histórico inteiro); sem eles, vem das linhas locais.
    const aggCycle = cycleTotals(cycle);
    const total = aggCycle
      ? round(aggCycle.total)
      : round(rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
    const billable = Math.max(0, total);
    const rawBound = boundByClose[cycle.closeISO] || 0;
    const bound = Math.min(rawBound, billable);
    const fromFifo = Math.min(remaining, Math.max(0, round(billable - bound)));
    // Excedente de pagamento vinculado e crédito líquido de estorno passam
    // para a fatura seguinte; não podem sumir nem pagar a corrente antes de
    // quitar os ciclos anteriores.
    remaining =
      Math.max(0, remaining - fromFifo) +
      Math.max(0, rawBound - billable) +
      Math.max(0, -total);
    const openAmount = round(Math.max(0, billable - bound - fromFifo));
    const pendingBound = round(Math.min(pendingByClose[cycle.closeISO] || 0, billable));
    const status =
      openAmount < 0.005
        ? pendingBound > 0.005
          ? 'AGENDADA'
          : 'PAGA'
        : cycle.dueISO < refISO
          ? 'VENCIDA'
          : 'EM_ABERTO';
    // Estornos (valores negativos na fatura) e o já pago (alocado) — bloco
    // "Fatura/Estornos/Pagamentos" do app original.
    const refunds = aggCycle
      ? round(aggCycle.refunds)
      : round(-rows.reduce((sum, tx) => sum + Math.min(0, Number(tx.amount) || 0), 0));
    const paid = round(Math.max(0, billable - openAmount));
    invoices.push({
      ...cycle,
      transactions: rows,
      total,
      refunds,
      paid,
      openAmount,
      pendingBound,
      status,
      // Crédito de FIFO já consumido por esta fatura — o planner precisa
      // dele pra revalorizar/diferenciar sem contar o crédito duas vezes.
      fifoCovered: round(fromFifo),
    });
  });
  invoices.reverse(); // mais recente primeiro (UI)

  // — fatura corrente = a do MÊS (rotulada pelo vencimento) —
  // Em outubro, corrente = Outubro (vence 07/10), não o ciclo aberto
  // (Novembro, fecha 30/10). Pode estar PAGA (foi paga no vencimento).
  const currentCycle =
    cycles.find((cycle) => String(cycle.dueISO || '').slice(0, 7) === refMonthKey) ??
    upcoming[0] ??
    closed[0] ??
    null;
  const currentCloseISO = currentCycle?.closeISO ?? null;
  const currentIsClosed = !!currentCycle?.closed;

  // — faturas futuras com despesa vinculada —
  // Lista separada (fora das fechadas): o em aberto entra no openTotal
  // (limite já comprometido), mas não viram "ativa" nem entram no FIFO
  // (só pagamento vinculado as quita, até o ciclo chegar). A corrente
  // nunca entra aqui, mesmo sendo futura.
  // `includeFutureBound` (agendador/Resumo): as despesas VINCULADAS contam
  // mesmo fora da janela — senão o espelho só nasce na fatura vigente e os
  // meses seguintes ficam sem "cobrança agendada". As SEM invoice_close só
  // entram no mês vivo: na Próxima do mês atual valem pela régua do mês
  // (bug Nomand: 513,54 × 1.096,25 — parcelas do mês seguinte sem fatura
  // escolhida sumiam da Próxima); em relatório de época a compra "ainda
  // não existia" e não pode vazar para o mês passado. Sem a flag, a fonte
  // segue a janela `expenses` (exibição de época).
  const upcomingRowsSource = includeFutureBound
    ? transactions.filter(
        (tx) =>
          tx.account_id === card.id &&
          tx.type === 'DESPESA' &&
          tx.status !== 'CANCELADO' &&
          (tx.invoice_close || live)
      )
    : expenses;
  const upcomingInvoices = upcoming
    .filter((cycle) => cycle.closeISO !== currentCloseISO)
    .map((cycle) => {
      // Mesma régua das fechadas: vinculada vai para o ciclo exato do
      // invoice_close; sem vínculo vale o mês da data = mês do
      // vencimento (as de mês anterior/da corrente nunca vazam aqui —
      // os ciclos futuros só têm vencimento > mês de referência).
      const rows = upcomingRowsSource
        .filter((tx) => inCycle(tx, cycle))
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
      if (rows.length === 0) return null;
      const total = round(rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
      const billable = Math.max(0, total);
      const bound = Math.min(boundByClose[cycle.closeISO] || 0, billable);
      const openAmount = round(Math.max(0, billable - bound));
      const pendingBound = round(Math.min(pendingByClose[cycle.closeISO] || 0, billable));
      const refunds = round(
        -rows.reduce((sum, tx) => sum + Math.min(0, Number(tx.amount) || 0), 0)
      );
      const paid = round(Math.max(0, billable - openAmount));
      return {
        ...cycle,
        future: true,
        transactions: rows,
        total,
        refunds,
        paid,
        openAmount,
        pendingBound,
        status:
          openAmount < 0.005 ? (pendingBound > 0.005 ? 'AGENDADA' : 'PAGA') : 'EM_ABERTO',
      };
    })
    .filter(Boolean);

  // Corrente: se o ciclo do mês já fechou, reaproveita o cálculo do FIFO
  // (pagamento vinculado + FIFO histórico); se ainda está aberto, calcula
  // como antes (vinculado + sobra do FIFO).
  let current;
  const closedMatch = invoices.find((inv) => inv.closeISO === currentCloseISO) ?? null;
  if (currentIsClosed && closedMatch) {
    current = {
      ...closedMatch,
      kind: 'current',
      status:
        closedMatch.total > 0 && closedMatch.openAmount < 0.005
          ? (closedMatch.pendingBound || 0) > 0.005
            ? 'AGENDADA'
            : 'PAGA'
          : 'CORRENTE',
    };
  } else {
    const lastClosed = closed.length > 0 ? closed[0] : null;
    const currentStart = lastClosed ? plusDaysISO(lastClosed.closeISO, 1) : null;
    void currentStart;
    const currentRows = expenses
      .filter((tx) =>
        tx.invoice_close
          ? tx.invoice_close === currentCloseISO
          : String(tx.payment_date || '').slice(0, 7) === refMonthKey
      )
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
    const currentTotal = round(
      currentRows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
    );
    // Pagamento agendado na fatura corrente zera o em aberto na hora; o
    // que sobrar do FIFO histórico também reduz.
    const currentBillable = Math.max(0, currentTotal);
    const currentPaid = round(
      Math.min(
        currentBillable,
        (currentCloseISO ? boundByClose[currentCloseISO] || 0 : 0) + remaining
      )
    );
    const currentOpen = round(Math.max(0, currentBillable - currentPaid));
    const currentPendingBound = round(
      Math.min(pendingByClose[currentCloseISO] || 0, currentBillable)
    );
    const currentRefunds = round(
      -currentRows.reduce((sum, tx) => sum + Math.min(0, Number(tx.amount) || 0), 0)
    );
    current = {
      kind: 'current',
      startISO: currentCycle?.startISO ?? null,
      closeISO: currentCloseISO,
      dueISO: currentCycle?.dueISO ?? null,
      transactions: currentRows,
      total: currentTotal,
      refunds: currentRefunds,
      paid: currentPaid,
      openAmount: currentOpen,
      pendingBound: currentPendingBound,
      // Parte do pagamento vinculado que veio do FIFO histórico (sobra de
      // ciclos anteriores) — mesmo papel do fromFifo das fechadas.
      fifoCovered: round(
        Math.max(
          0,
          currentPaid - (currentCloseISO ? boundByClose[currentCloseISO] || 0 : 0)
        )
      ),
      status:
        currentTotal > 0 && currentOpen < 0.005
          ? currentPendingBound > 0.005
            ? 'AGENDADA'
            : 'PAGA'
          : 'CORRENTE',
    };
  }

  // A corrente não se repete na lista de fechadas (chip único).
  const displayInvoices = invoices.filter((inv) => inv.closeISO !== currentCloseISO);
  const openInvoices = displayInvoices.filter((invoice) => Number(invoice.openAmount) > 0);
  const oldestOpenInvoice = openInvoices[openInvoices.length - 1] ?? null;
  const openTotal = round(
    displayInvoices.reduce((sum, invoice) => sum + (Number(invoice.openAmount) || 0), 0) +
      (Number(current?.openAmount) || 0) +
      upcomingInvoices.reduce((sum, invoice) => sum + (Number(invoice.openAmount) || 0), 0)
  );
  // Agendado (coberto por pagamento PENDENTE): não entra no em aberto
  // (invariant do E2E "modal parcial"), mas compromete o LIMITE até ser
  // pago — o widget usa para DISPONÍVEL/barra.
  const pendingTotal = round(
    displayInvoices.reduce((sum, invoice) => sum + (Number(invoice.pendingBound) || 0), 0) +
      (Number(current?.pendingBound) || 0) +
      upcomingInvoices.reduce((sum, invoice) => sum + (Number(invoice.pendingBound) || 0), 0)
  );

  return {
    current,
    invoices: [
      ...displayInvoices.slice(0, count),
      // Vinculadas antigas fora da janela de exibição: têm movimento e
      // dono — aparecem depois das recentes, em vez de sumirem.
      ...displayInvoices
        .slice(count)
        .filter(
          (inv) =>
            linkedCloses.includes(inv.closeISO) &&
            (Number(inv.total) > 0 || Number(inv.openAmount) > 0)
        ),
    ],
    upcomingInvoices,
    openTotal,
    pendingTotal,
    oldestOpenInvoice,
  };
};

/**
 * Payload do pagamento de fatura (total ou parcial): DESPESA na conta
 * vinculada ao cartão (o dinheiro sai de verdade), com o valor informado
 * na tela (limitado ao em aberto). O cartão não recebe transação própria:
 * ele só passa a saber "fatura paga + valor pago" pelo vínculo
 * (`invoice_close`) dessa despesa.
 *
 * - Vencimento futuro → agendamento (PENDENTE no vencimento): a linha
 *   aparece no Extrato da conta e é efetivada quando o pagamento sair.
 * - Vencimento já passado (fatura vencida) → pago hoje (PAGO).
 *
 * `invoice_close` grava em qual ciclo (fechamento) esse pagamento entra — a
 * fatura reage na hora, sem depender do FIFO das fechadas antigas. Retorna
 * null quando não há valor em aberto. Reabrir exclui essa despesa (ela
 * continua na conta vinculada — o sistema nunca troca de conta; pagar de
 * outra conta é transferência feita pelo usuário).
 */
export const buildCardPaymentTx = ({ userId, card, invoice, description, amount }) => {
  const open = Number(invoice?.openAmount) || 0;
  if (!(open > 0)) return null;
  const requested = amount == null || amount === '' ? open : Number(amount);
  if (!Number.isFinite(requested) || !(requested > 0)) return null;
  const value = Math.round(Math.min(requested, open) * 100) / 100;
  if (!(value > 0)) return null;
  const today = toISODate(new Date());
  const scheduled = !!invoice?.dueISO && invoice.dueISO > today;
  return {
    user_id: userId,
    type: 'DESPESA',
    account_id: card.linked_account_id,
    description: `${description} — ${card.name}`,
    amount: value,
    payment_date: scheduled ? invoice.dueISO : today,
    due_date: scheduled ? invoice.dueISO : null,
    effective_date: scheduled ? null : today,
    status: scheduled ? 'PENDENTE' : 'PAGO',
    invoice_close: invoice?.closeISO ?? null,
  };
};

/**
 * Marcador do pagamento-espelho (item 30): a despesa que o agendador cria e
 * mantém como reflexo da fatura na conta vinculada — valor sempre igual ao
 * que falta cobrir (a fatura muda até o fechamento e o fechamento também
 * pode mudar) e promovida para PAGO quando o vencimento passa ("não existe
 * fatura vencida não paga"). Vive em `notes` (nota visível na UI); o
 * "Reabrir" limpa o marcador e a linha passa a ser só do usuário — o
 * agendador não toca mais (nem re-promove nem re-sincroniza).
 */
export const MF_INVOICE_PAYMENT_NOTE = 'Agendado automaticamente (fatura)';

/**
 * Marcador da diferença de fatura REAJUSTADA depois de paga: o pagamento já
 * feito é evento histórico (nunca é reescrito) e a divergência vira um
 * lançamento próprio (DESPESA com sinal, PAGO, datado de HOJE) na conta
 * vinculada. Vive em `notes` (nota visível na UI) para o planner
 * reconhecer: idempotência (só cria enquanto divergir) e a corrida
 * "espelho × pagamento seu" não tratar a linha nossa como pagamento do
 * usuário (não apaga o espelho por causa dela).
 */
export const MF_INVOICE_DIFF_NOTE = 'Ajuste de fatura (reajuste de valor)';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Item 30 — plano de sincronização do pagamento de fatura de um cartão
 * (puro, sem I/O — testável direto):
 *
 * - fatura com valor e SEM nenhum pagamento vinculado não cancelado → cria o
 *   espelho: vencimento futuro = PENDENTE no vencimento; já vencido = PAGO
 *   na data do vencimento (entra no mês certo, sem fingir saldo "hoje");
 * - espelho PENDENTE (projeção, nada desembolsado) → revaloriza o valor nas
 *   DUAS direções com o que falta cobrir (fatura subiu OU desceu — o
 *   `openAmount` trava em 0 e não serve pra baixar; `fifoCovered` desconta
 *   crédito histórico) e, se vencido, promove PENDENTE → PAGO;
 * - fatura JÁ PAGA que mudou de valor (espelho PAGO, ou pagamento seu
 *   quitando tudo) → o pagamento é evento histórico e não muda: a
 *   DIFERENÇA vira lançamento novo (MF_INVOICE_DIFF_NOTE, PAGO, com sinal,
 *   datado de hoje) na conta vinculada — idempotente (só cria enquanto a
 *   conta divergir);
 * - pagamento criado por você (parcial/manual, sem marcador) → intocável:
 *   não duplica e não revaloriza;
 * - fatura zerada (só estornos) → apaga o espelho.
 */
export const planInvoicePaymentSync = ({ userId, card, invoices, transactions, today }) => {
  const creates = [];
  const updates = [];
  const deletes = [];
  const seen = new Set();
  const diffTx = (invoice, delta) => ({
    user_id: userId,
    type: 'DESPESA',
    account_id: card.linked_account_id,
    description: `Ajuste de fatura — ${card.name}`,
    amount: roundMoney(delta),
    payment_date: today,
    due_date: null,
    effective_date: today,
    status: 'PAGO',
    invoice_close: invoice.closeISO,
    notes: MF_INVOICE_DIFF_NOTE,
  });
  (invoices || []).forEach((invoice) => {
    if (!invoice?.closeISO || !invoice?.dueISO) return;
    if (seen.has(invoice.closeISO)) return;
    seen.add(invoice.closeISO);
    const billable = Math.max(0, Number(invoice.total) || 0);
    const boundRows = (transactions || []).filter(
      (tx) =>
        tx.type === 'DESPESA' &&
        tx.account_id === card.linked_account_id &&
        tx.invoice_close === invoice.closeISO &&
        tx.status !== 'CANCELADO'
    );
    const mirror =
      boundRows.find((tx) => tx.notes === MF_INVOICE_PAYMENT_NOTE) ?? null;
    if (!(billable > 0)) {
      if (mirror) deletes.push(mirror.id);
      return;
    }
    const open = Number(invoice.openAmount) || 0;
    const fifoCovered = roundMoney(invoice.fifoCovered || 0);
    const boundTotal = roundMoney(
      boundRows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
    );
    const isDiff = (tx) => tx.notes === MF_INVOICE_DIFF_NOTE;
    if (mirror) {
      // Corrida agendador × usuário: um pagamento manual entrou junto do
      // espelho (parcial feita enquanto o agendamento era gravado). O
      // usuário assumiu a fatura — apaga o espelho e sai de cena (mesma
      // régua de "pagamento seu" logo abaixo), sem duplicar o em aberto.
      // Linhas de DIFERENÇA (nossas) não contam como "pagamento seu".
      if (boundRows.some((tx) => tx.id !== mirror.id && !isDiff(tx))) {
        deletes.push(mirror.id);
        return;
      }
      if (mirror.status === 'PAGO') {
        // Fatura paga e reajustada depois: reescrever o pagamento mudaria
        // o saldo do dia em que ele saiu. A divergência vira lançamento
        // de diferença (com sinal, datado de hoje); zerado → não faz nada.
        const delta = roundMoney(billable - fifoCovered - boundTotal);
        if (Math.abs(delta) > 0.005) creates.push(diffTx(invoice, delta));
        return;
      }
      // Espelho PENDENTE = projeção (nada desembolsado): o valor segue a
      // fatura nas duas direções — subiu sobe, desceu desce.
      const others = roundMoney(boundTotal - (Number(mirror.amount) || 0));
      const target = roundMoney(Math.max(0, billable - fifoCovered - others));
      if (!(target > 0.005)) {
        // Fatura coberta sem ele (FIFO/diferença) — espelho sobrando some.
        deletes.push(mirror.id);
        return;
      }
      const patch = {};
      if (Math.abs((Number(mirror.amount) || 0) - target) > 0.005) {
        patch.amount = target;
      }
      if (invoice.dueISO <= today && mirror.status === 'PENDENTE') {
        patch.status = 'PAGO';
        patch.effective_date = invoice.dueISO;
      }
      if (Object.keys(patch).length > 0) updates.push({ id: mirror.id, patch });
      return;
    }
    if (boundRows.length > 0) {
      // Pagamento seu (parcial/manual) — intocável. Se ele já QUITOU a
      // fatura (PAGO + FIFO cobrem tudo) e ela mudou de valor depois, a
      // diferença vira lançamento; parcial (fatura ainda em aberto) não
      // mexe: cobrir o resto é decisão do usuário.
      const paidTotal = roundMoney(
        boundRows.reduce(
          (sum, tx) => sum + (tx.status === 'PAGO' ? Number(tx.amount) || 0 : 0),
          0
        )
      );
      if (paidTotal + fifoCovered >= billable - 0.005) {
        const delta = roundMoney(billable - fifoCovered - paidTotal);
        if (Math.abs(delta) > 0.005) creates.push(diffTx(invoice, delta));
      }
      return;
    }
    if (!(open > 0.005)) return; // coberto só por FIFO/transferência antiga
    const scheduled = invoice.dueISO > today;
    creates.push({
      user_id: userId,
      type: 'DESPESA',
      account_id: card.linked_account_id,
      description: `Pagamento de fatura — ${card.name}`,
      amount: roundMoney(open),
      payment_date: invoice.dueISO,
      due_date: scheduled ? invoice.dueISO : null,
      effective_date: scheduled ? null : invoice.dueISO,
      status: scheduled ? 'PENDENTE' : 'PAGO',
      invoice_close: invoice.closeISO,
      notes: MF_INVOICE_PAYMENT_NOTE,
    });
  });
  return { creates, updates, deletes };
};

let mfScheduleRunning = false;

/**
 * Ciclos cujo espelho já foi criado há pouco (60s) — evita duplicar quando
 * uma remount reavalia o plano com o cache ainda sem o espelho.
 */
const mfScheduledCloses = new Map();

/**
 * Item 30 — agendador do pagamento-espelho: para cada cartão com conta
 * vinculada, aplica planInvoicePaymentSync em todas as faturas (corrente,
 * fechadas e futuras). Roda quando contas/lançamentos mudam, é idempotente
 * (só grava quando há diferença) e best-effort (erro não derruba o módulo).
 * Fora do modo teste: a unidade cobre o plano puro e o E2E roda em dev com
 * o mock, exercitando o caminho real. Só enxerga cartões cuja conta
 * vinculada está no mesmo escopo de perfis da tela — nunca grava pagamento
 * fora do recorte visível.
 */
export function useMFScheduleCardPayments(user) {
  const queryClient = useQueryClient();
  const { data: accounts } = useMFAccounts(user);
  // Só o que o planner lê: compras no cartão, transferências para o
  // cartão e os pagamentos-espelho na conta vinculada. Antes vinha o
  // escopo "cartões + contas vinculadas" via useMFAccountTransactions —
  // que não recortava nada (as vinculadas guardam todo o histórico) e
  // paginava a tabela inteira a cada montagem do módulo. Cartões
  // arquivados ficam de fora: o agendador os ignora.
  const cardAccounts = useMemo(
    () =>
      (accounts ?? []).filter((row) => row.account_type === 'CARTAO' && !row.archived_at),
    [accounts]
  );
  const { data: cardData } = useMFCardTransactions(user, cardAccounts);
  const transactions = cardData?.transactions;
  const aggregates = cardData?.aggregates ?? null;
  useEffect(() => {
    if (!user?.id || import.meta.env.MODE === 'test') return undefined;
    if (mfScheduleRunning || !accounts || !transactions) return undefined;
    const accountIds = new Set(accounts.map((row) => row.id));
    const cards = accounts.filter(
      (row) =>
        row.account_type === 'CARTAO' &&
        row.linked_account_id &&
        accountIds.has(row.linked_account_id) &&
        !row.archived_at
    );
    if (cards.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      mfScheduleRunning = true;
      try {
        const today = toISODate(new Date());
        const creates = [];
        const updates = [];
        const deletes = [];
        cards.forEach((card) => {
          const { current, invoices, upcomingInvoices = [] } = buildCardInvoices({
            card,
            transactions,
            refISO: today,
            monthKey: currentMonthKey(),
            count: 60,
            // Faturas futuras com compra vinculada também ganham espelho
            // (parcelas de nov/dez têm data futura e ficam fora da janela
            // de exibição — sem a flag o agendador não as enxerga).
            includeFutureBound: true,
            aggregates,
          });
          const plan = planInvoicePaymentSync({
            userId: user.id,
            card,
            invoices: [current, ...invoices, ...upcomingInvoices],
            transactions,
            today,
          });
          creates.push(...plan.creates);
          updates.push(...plan.updates);
          deletes.push(...plan.deletes);
        });
        if (
          cancelled ||
          (creates.length === 0 && updates.length === 0 && deletes.length === 0)
        ) {
          return;
        }
        // Dedupe: uma remount reavalia o plano com o cache ainda sem o
        // espelho (o invalidar é adiado 750ms) e recriaria a mesma fatura.
        // O guard expira em 60s e libera quando os dados já mostram um
        // pagamento vinculado ao ciclo. Diferenças usam chave própria
        // (`#diff`): o espelho já existe no cache e liberaria o guard na
        // hora — a chave só solta quando a linha de diferença aparece.
        const nowMs = Date.now();
        const freshCreates = [];
        creates.forEach((row) => {
          const key =
            row.notes === MF_INVOICE_DIFF_NOTE
              ? `${row.invoice_close}#diff`
              : row.invoice_close;
          const last = mfScheduledCloses.get(key);
          if (last && nowMs - last < 60000) return;
          mfScheduledCloses.set(key, nowMs);
          freshCreates.push(row);
        });
        const releaseCloses = new Set();
        const releaseDiffCloses = new Set();
        transactions.forEach((tx) => {
          if (tx.type === 'DESPESA' && tx.status !== 'CANCELADO' && tx.invoice_close) {
            releaseCloses.add(tx.invoice_close);
            if (tx.notes === MF_INVOICE_DIFF_NOTE) {
              releaseDiffCloses.add(tx.invoice_close);
            }
          }
        });
        releaseCloses.forEach((closeISO) => mfScheduledCloses.delete(closeISO));
        releaseDiffCloses.forEach((closeISO) =>
          mfScheduledCloses.delete(`${closeISO}#diff`)
        );
        if (freshCreates.length === 0 && updates.length === 0 && deletes.length === 0) {
          return;
        }
        if (freshCreates.length > 0) {
          await mfMutate({
            table: 'mf_transactions',
            action: 'insert',
            payload: freshCreates,
            run: async () => {
              const { data, error } = await supabase
                .from('mf_transactions')
                .insert(freshCreates)
                .select();
              if (error) throw error;
              return data ?? [];
            },
          });
        }
        for (const { id, patch } of updates) {
          await mfMutate({
            table: 'mf_transactions',
            action: 'update',
            id,
            payload: patch,
            run: async () => {
              const { data, error } = await supabase
                .from('mf_transactions')
                .update(patch)
                .eq('id', id)
                .select()
                .single();
              if (error) throw error;
              return data;
            },
          });
        }
        for (const id of deletes) {
          await mfMutate({
            table: 'mf_transactions',
            action: 'delete',
            id,
            run: async () => {
              const { error } = await supabase.from('mf_transactions').delete().eq('id', id);
              if (error) throw error;
              return id;
            },
          });
        }
        if (!cancelled) queryClient.invalidateQueries();
      } catch {
        /* agendador é best-effort */
      } finally {
        mfScheduleRunning = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, accounts, transactions, aggregates, queryClient]);
}

/**
 * Confirmação do modal de pagamento (item 30): se já existe despesa PENDENTE
 * vinculada à fatura na conta do cartão (o espelho), ATUALIZA aquela linha —
 * um único débito por fatura. Valor total → marcador automático (o agendador
 * volta a sincronizar/promover); parcial → marcador sai: a linha é sua e o
 * em aberto continua mostrando o resto. O eq() estreita no servidor e a
 * triagem repetida no cliente cobre o mock do E2E, que devolve a tabela
 * inteira no GET.
 */
export function usePayCardInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ card, invoice, payload, payable }) => {
      const { data, error } = await supabase
        .from('mf_transactions')
        .select('*')
        .eq('account_id', card.linked_account_id)
        .eq('type', 'DESPESA')
        .eq('invoice_close', invoice.closeISO)
        .eq('status', 'PENDENTE');
      if (error) throw error;
      const rows = (data ?? []).filter(
        (row) =>
          row.account_id === card.linked_account_id &&
          row.type === 'DESPESA' &&
          row.invoice_close === invoice.closeISO &&
          row.status === 'PENDENTE'
      );
      const existing =
        rows.sort((a, b) =>
          String(b.payment_date || '').localeCompare(String(a.payment_date || ''))
        )[0] ?? null;
      // Espelhos automáticos sobrando (corrida agendador × pagamento): o
      // usuário assumiu a fatura — a linha dele fica e os duplicados somem.
      const superseded = rows.filter(
        (row) => row.notes === MF_INVOICE_PAYMENT_NOTE && row.id !== (existing?.id ?? null)
      );
      const isFull = (Number(payload.amount) || 0) >= (Number(payable) || 0) - 0.005;
      const patch = { ...payload, notes: isFull ? MF_INVOICE_PAYMENT_NOTE : null };
      const result = existing
        ? await mfMutate({
            table: 'mf_transactions',
            action: 'update',
            id: existing.id,
            payload: patch,
            run: async () => {
              const { data: updated, error: updateError } = await supabase
                .from('mf_transactions')
                .update(patch)
                .eq('id', existing.id)
                .select();
              if (updateError) throw updateError;
              return updated ?? [];
            },
          })
        : await mfMutate({
            table: 'mf_transactions',
            action: 'insert',
            payload: [patch],
            run: async () => {
              const { data: inserted, error: insertError } = await supabase
                .from('mf_transactions')
                .insert([patch])
                .select();
              if (insertError) throw insertError;
              return inserted ?? [];
            },
          });
      for (const row of superseded) {
        await mfMutate({
          table: 'mf_transactions',
          action: 'delete',
          id: row.id,
          run: async () => {
            const { error: delError } = await supabase
              .from('mf_transactions')
              .delete()
              .eq('id', row.id);
            if (delError) throw delError;
            return row.id;
          },
        });
      }
      return result;
    },
    onSuccess: invalidate,
  });
}

/**
 * Payload do estorno: lançamento negativo que anula o valor do original
 * (mesma data de pagamento; efetivação = hoje).
 */
export const buildEstornoTx = ({ userId, tx, description, notes }) => ({
  user_id: userId,
  account_id: tx.account_id,
  type: tx.type,
  description,
  amount: -Math.abs(Number(tx.amount) || 0),
  payment_date: tx.payment_date,
  due_date: null,
  effective_date: toISODate(new Date()),
  status: 'PAGO',
  category_id: tx.category_id ?? null,
  notes,
  attachment_path: null,
  recurrence: 'NONE',
});

/**
 * Payload da antecipação de parcelas: UMA transação PAGO pelo valor líquido
 * (soma das parcelas escolhidas − desconto). As parcelas escolhidas são
 * canceladas separadamente (status CANCELADO) pelo chamador.
 */
export const buildAnticipateTx = ({ userId, tx, net, description, notes }) => ({
  user_id: userId,
  account_id: tx.account_id,
  type: tx.type,
  description,
  amount: Math.round(net * 100) / 100,
  payment_date: toISODate(new Date()),
  due_date: null,
  effective_date: toISODate(new Date()),
  status: 'PAGO',
  category_id: tx.category_id ?? null,
  notes,
  attachment_path: null,
  recurrence: 'NONE',
});

/** Despesa parcelada: série com numeração N/M (`installments_total > 1`). */
export function isParceladaTx(tx) {
  return (Number(tx?.installments_total) || 0) > 1;
}

/**
 * Plano puro da antecipação de parcelas de cartão: N parcelas após a
 * âncora mudam para a fatura destino; as restantes sobem N posições
 * (cada uma assume a fatura da N-ésima anterior — "shift reverso"); se
 * N cobre todas, as faturas futuras esvaziam. Parcelas mantêm o valor
 * original — o desconto vira estorno separado (montado pelo chamador).
 * `series` ordenada por nº da parcela; retorna { moves, moved, shifted }.
 */
export function planCardAnticipation({ series, anchorId, count, targetClose }) {
  const ordered = orderSeries(series ?? []);
  const anchorIdx = Math.max(
    0,
    ordered.findIndex((row) => row?.id === anchorId)
  );
  const after = ordered.slice(anchorIdx + 1);
  const n = Math.min(Math.max(Number(count) || 0, 0), after.length);
  if (!(n > 0) || !targetClose) return { moves: [], moved: [], shifted: [] };
  const moved = after.slice(0, n);
  const rest = after.slice(n);
  const moves = [
    ...moved.map((row) => ({ id: row.id, invoice_close: targetClose })),
    ...rest.map((row, index) => ({
      id: row.id,
      invoice_close: after[index]?.invoice_close ?? row.invoice_close,
    })),
  ];
  return { moves, moved, shifted: rest };
}

/**
 * Lembretes do dia (sino do Resumo).
 *
 * Só os lançamentos PENDENTE (o planeador ignora PAGO/CANCELADO) e só
 * as colunas que ele lê. Antes o sino baixava a tabela INTEIRA (~14 mil
 * linhas ≈ 10 MB) a cada montagem do módulo — e ele fica montado o
 * tempo todo no cabeçalho.
 */
export function useMFReminderRows(user) {
  return useQuery({
    queryKey: ['mf-reminder-rows', user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mf_transactions')
        .select(
          'id,type,amount,description,payment_date,due_date,effective_date,status,account_id,invoice_close,installments_current,installments_total'
        )
        .eq('status', 'PENDENTE');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Sugestões de descrição (tela de edição de lançamento): as recentes,
 * com as colunas mínimas. Antes eram as ~14 mil linhas da tabela
 * inteira só para sugerir nomes já usados.
 */
export function useMFSuggestionRows(user, limit = 300) {
  return useQuery({
    queryKey: ['mf-suggestion-rows', user?.id, limit],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mf_transactions')
        .select('id,type,description,payment_date,category_id,amount')
        .order('payment_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Série de parcelas (antecipação): a raiz da série + as irmãs. Antes os
 * modais de antecipação baixavam a tabela inteira para achar meia
 * dúzia de linhas.
 */
export function useMFSeriesRows(user, rootId) {
  return useQuery({
    queryKey: ['mf-series-rows', user?.id, rootId ?? 'none'],
    enabled: !!user?.id && !!rootId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mf_transactions')
        .select(
          'id,type,amount,description,payment_date,due_date,effective_date,status,account_id,transfer_account_id,category_id,notes,invoice_close,installments_current,installments_total,parent_transaction_id,auto_settle'
        )
        .or(`id.eq.${rootId},parent_transaction_id.eq.${rootId}`)
        .order('installments_current', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Todos os lançamentos do usuário (janela livre — cartões e relatórios).
 *
 * `accountId` estreita o recorte (a importação só compara com a conta
 * escolhida ✓); sem ele, é a tabela inteira — use com cuidado: são ~14 mil
 * linhas. Para quem só precisa de um pedaço, prefira os hooks
 * específicos (lembretes, sugestões, série de parcelas).
 */
export function useMFAllTransactions(user, accountId = null) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-all-transactions', user?.id, profileId ?? 'all', accountId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return [];
      const { data, error } = await mfSelectAll(
        'mf_transactions',
        () => {
          let query = supabase
            .from('mf_transactions')
            .select('*')
            .order('payment_date', { ascending: false })
            .order('id', { ascending: false });
          if (accountId) query = query.eq('account_id', accountId);
          else if (scopeIds) query = query.in('account_id', scopeIds);
          return query;
        },
        {
          filter: (rows) =>
            rows.filter((row) => !scopeIds || scopeIds.includes(row.account_id)),
          sort: byDateDesc('payment_date'),
        }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Detecta viewport estreita (≤768px = mobile/tablet retrato) e reage a
 * mudanças de tamanho — base do layout compacto do Resumo, do sino e das
 * moedas no mobile.
 */
export function useMFNarrowScreen(query = '(max-width: 768px)') {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = (event) => setNarrow(event.matches);
    media.addEventListener?.('change', onChange);
    setNarrow(media.matches);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);
  return narrow;
}

/**
 * Feed do Resumo: N lançamentos mais recentes de TODAS as contas do escopo,
 * independente do mês navegado (Fase C). Ordena por data (decrescente) e id
 * para a página ser determinística.
 */
export function useMFRecentTransactions(user, limit = 10) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-recent-transactions', user?.id, limit, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return [];
      let query = supabase
        .from('mf_transactions')
        .select('*')
        .order('payment_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (scopeIds) query = query.in('account_id', scopeIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Lançamentos que tocam UM conjunto de contas (drill-down da conta):
 * origem OU destino — inclui compras dos cartões vinculados e
 * transferências de/para a conta. Sem recorte de data (saldos, 12 meses
 * e faturas precisam do histórico) — o volume cai pelo escopo de contas
 * (~13 mil linhas → centenas) e todo o cálculo client-side segue idêntico.
 */
export function useMFAccountTransactions(user, accountId, extraAccountIds = []) {
  const profileId = useMFProfileScope();
  const ids = [...new Set([accountId, ...(extraAccountIds ?? [])])].filter(Boolean);
  const idsKey = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['mf-account-transactions', user?.id, idsKey, profileId ?? 'all'],
    enabled: !!user?.id && ids.length > 0,
    queryFn: async () => {
      const inScope = (row) =>
        ids.includes(row.account_id) || ids.includes(row.transfer_account_id);
      const { data, error } = await mfSelectAll(
        'mf_transactions',
        () => {
          const list = ids.join(',');
          return supabase
            .from('mf_transactions')
            .select('*')
            .or(`account_id.in.(${list}),transfer_account_id.in.(${list})`)
            .order('payment_date', { ascending: false })
            .order('id', { ascending: false });
        },
        {
          // `local.filter` no mfSelectAll é transform de lista (o mesmo
          // contrato das outras chamadas) — como predicado, o caminho
          // offline devolvia `false` no lugar das linhas.
          filter: (rows) => rows.filter(inScope),
          sort: byDateDesc('payment_date'),
        }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Transações que o cálculo de faturas realmente lê + os agregados por
 * ciclo que o servidor calcula.
 *
 * Antes, os três consumidores (agendador do pagamento-espelho, tela de
 * Cartões e Próxima fatura do Resumo) usavam `useMFAccountTransactions`
 * com o escopo "cartões + contas vinculadas". Como as contas vinculadas
 * guardam TODO o histórico, esse filtro não recortava nada e a tabela
 * inteira era paginada (15 × 1.000 linhas ≈ 11 MB) a cada montagem do
 * módulo — o maior consumidor de egress do app (~1,4 GB/dia).
 *
 * Agora o servidor calcula os agregados por ciclo (RPC
 * `mf_card_cycle_totals`: total e estornos de cada ciclo, pagamento
 * vinculado/pendente por fechamento e o pool de pagamentos históricos) e
 * o cliente baixa só a janela de exibição. O caminho do FIFO continua
 * aqui — o mesmo código, alimentado por números em vez de thousands de
 * linhas — então os valores não podem divergir.
 *
 * Offline (sem RPC) ou com a RPC falhando: cai no caminho antigo, que
 * lê o histórico inteiro do cache local. `monthKey` define a régua de
 * época (mês navegado) — como nas faturas.
 */
export function useMFCardTransactions(user, cards, monthKey = null) {
  const cardIds = useMemo(
    () => [...new Set((cards ?? []).map((card) => card?.id).filter(Boolean))].sort(),
    [cards]
  );
  const linkedIds = useMemo(
    () =>
      [...new Set((cards ?? []).map((card) => card?.linked_account_id).filter(Boolean))].sort(),
    [cards]
  );
  const scopeKey = `${cardIds.join(',')}|${linkedIds.join(',')}`;
  const refISO = monthKey ? monthRefISO(monthKey) : toISODate(new Date());
  const live = !monthKey || monthKey === currentMonthKey();
  return useQuery({
    queryKey: ['mf-card-transactions', user?.id, scopeKey, refISO, live ? 'live' : 'epoch'],
    enabled: !!user?.id && cardIds.length > 0,
    // As faturas só mudam quando o usuário mexe em algo (aí as
    // mutations invalidam) — 10 min de staleTime evita refazer a
    // leitura a cada montagem do módulo.
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const byPaymentDate = (a, b) => {
        const cmp = String(a.payment_date || '').localeCompare(String(b.payment_date || ''));
        return cmp !== 0 ? cmp : String(a.id || '').localeCompare(String(b.id || ''));
      };
      // `local.sort` no mfSelectAll é transform de lista (mesmo contrato
      // do `local.filter`) — não um comparador de Array.sort.
      const sortByPaymentDate = (rows) => [...rows].sort(byPaymentDate);

      // 1) Agregados por ciclo no servidor (o que o FIFO consome).
      let aggregates = null;
      if (!isOffline()) {
        try {
          const { data, error } = await supabase.rpc('mf_card_cycle_totals', {
            p_ref_date: refISO,
            p_live: live,
          });
          if (error) throw error;
          aggregates = Object.fromEntries(
            (Array.isArray(data) ? data : []).map((row) => [row.card_id, row])
          );
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[MF] RPC mf_card_cycle_totals falhou; leitura local', err);
          }
          aggregates = null;
        }
      }

      // 2) Linhas: com agregados, só a janela de exibição (as faturas
      // mostradas e as compras futuras); sem eles, o histórico inteiro
      // (o caminho antigo, que sabe fazer o FIFO sozinho).
      const windowStart = shiftMonth(refISO.slice(0, 7), -13) + '-01';
      const hasWindow = !!aggregates;
      const [own, incoming, mirror] = await Promise.all([
        mfSelectAll(
          'mf_transactions',
          () => {
            let query = supabase
              .from('mf_transactions')
              .select('*')
              .in('account_id', cardIds);
            if (hasWindow) query = query.gte('payment_date', windowStart);
            return query.order('payment_date').order('id');
          },
          {
            filter: (rows) => rows.filter((row) => cardIds.includes(row.account_id)),
            sort: sortByPaymentDate,
          }
        ),
        hasWindow
          ? Promise.resolve({ data: [], error: null })
          : mfSelectAll(
              'mf_transactions',
              () =>
                supabase
                  .from('mf_transactions')
                  .select('*')
                  .in('transfer_account_id', cardIds)
                  .order('payment_date')
                  .order('id'),
              {
                filter: (rows) => rows.filter((row) => cardIds.includes(row.transfer_account_id)),
                sort: sortByPaymentDate,
              }
            ),
        linkedIds.length
          ? mfSelectAll(
              'mf_transactions',
              () =>
                supabase
                  .from('mf_transactions')
                  .select('*')
                  .in('account_id', linkedIds)
                  .or('invoice_close.not.is.null')
                  .order('payment_date')
                  .order('id'),
              {
                filter: (rows) =>
                  rows.filter((row) => linkedIds.includes(row.account_id) && row.invoice_close),
                sort: sortByPaymentDate,
              }
            )
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (own.error) throw own.error;
      if (incoming.error) throw incoming.error;
      if (mirror.error) throw mirror.error;
      // As consultas podem devolver a mesma linha (ex.: transferência
      // entre contas do mesmo cartão) — dedupe por id.
      const byId = new Map();
      [...(own.data ?? []), ...(incoming.data ?? []), ...(mirror.data ?? [])].forEach((row) => {
        byId.set(row.id, row);
      });
      return { transactions: [...byId.values()].sort(byPaymentDate), aggregates };
    },
  });
}

/* ────────────────────────────────────────────────────────────
 * Fase 6: relatórios e exportação
 * ──────────────────────────────────────────────────────────── */

/** Lançamentos + vínculos de tag para os relatórios (janela livre). */
export function useMFReportData(user) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-report-data', user?.id, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return { transactions: [], tagIdsByTx: {} };

      const buildTxsQuery = () => {
        let query = supabase
          .from('mf_transactions')
          .select('*')
          .order('payment_date')
          .order('id');
        if (scopeIds) query = query.in('account_id', scopeIds);
        return query;
      };

      const [txs, links] = await Promise.all([
        mfSelectAll('mf_transactions', buildTxsQuery, {
          // janela livre: escopo de perfil apenas
          filter: (rows) =>
            rows.filter(
              (row) => !scopeIds || scopeIds.includes(row.account_id)
            ),
        }),
        mfSelect('mf_transaction_tags', () =>
          supabase.from('mf_transaction_tags').select('*')
        ),
      ]);
      if (txs.error) throw txs.error;
      if (links.error) throw links.error;

      const transactions = txs.data ?? [];
      const ids = new Set(transactions.map((tx) => tx.id));
      const tagIdsByTx = {};
      (links.data ?? []).forEach((row) => {
        if (!ids.has(row.transaction_id)) return;
        if (!tagIdsByTx[row.transaction_id]) tagIdsByTx[row.transaction_id] = [];
        tagIdsByTx[row.transaction_id].push(row.tag_id);
      });
      return { transactions, tagIdsByTx };
    },
  });
}

/** Filtros de relatório salvos (mf_saved_reports). */
export function useMFSavedReports(user) {
  return useQuery({
    queryKey: ['mf-saved-reports', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_saved_reports',
        () =>
          supabase.from('mf_saved_reports').select('*').order('created_at', { ascending: false }),
        { sort: byDateDesc('created_at') }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateMFSavedReport() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_saved_reports')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFSavedReport() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_saved_reports').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Fase 7: importação OFX/CSV com conciliação
 * ──────────────────────────────────────────────────────────── */

/** Lotes de importação recentes (histórico). */
export function useMFImportBatches(user) {
  return useQuery({
    queryKey: ['mf-import-batches', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mf_import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Executa a importação em lote (4 passos): cria o lote (PENDING),
 * grava os lançamentos escolhidos (status PAGO), registra cada linha
 * em mf_import_rows (MATCHED/IGNORED + vínculos de sugestão) e conclui
 * o lote (COMPLETED).
 *
 * rows: linhas prontas de mfImportParse com `suggestion` e a decisão
 * `decision: 'IMPORT' | 'IGNORE'`.
 */
export function useRunMFImport() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ user, account_id, filename, format, rows }) => {
      const { data: batch, error: batchError } = await supabase
        .from('mf_import_batches')
        .insert({
          user_id: user.id,
          account_id,
          filename,
          format,
          status: 'PENDING',
          total_rows: rows.length,
        })
        .select()
        .single();
      if (batchError) throw batchError;

      const toImport = rows.filter((row) => row.decision === 'IMPORT');
      let created = [];
      if (toImport.length > 0) {
        const { data, error: txError } = await supabase
          .from('mf_transactions')
          .insert(
            toImport.map((row) => ({
              user_id: user.id,
              account_id,
              type: row.type,
              description: row.description,
              amount: row.amount,
              payment_date: row.date,
              status: 'PAGO',
            }))
          )
          .select();
        if (txError) throw txError;
        created = data ?? [];
      }

      let importIndex = 0;
      const rowPayloads = rows.map((row) => {
        const base = {
          user_id: user.id,
          batch_id: batch.id,
          payload: {
            date: row.date,
            description: row.description,
            amount: row.amount,
            type: row.type,
          },
          suggested_transaction_id: row.suggestion?.id ?? null,
        };
        if (row.decision === 'IMPORT') {
          const createdTx = created[importIndex];
          importIndex += 1;
          return { ...base, status: 'MATCHED', imported_transaction_id: createdTx?.id ?? null };
        }
        return { ...base, status: 'IGNORED', imported_transaction_id: null };
      });
      const { error: rowsError } = await supabase.from('mf_import_rows').insert(rowPayloads);
      if (rowsError) throw rowsError;

      const { error: updError } = await supabase
        .from('mf_import_batches')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', batch.id);
      if (updError) throw updError;

      return { batch, imported: created.length };
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Fase 5: orçamentos e objetivos
 * ──────────────────────────────────────────────────────────── */

/**
 * Saldo atual (PAGO até hoje) de cada conta — usado pelos objetivos
 * vinculados a conta ("progresso automático").
 *
 * `accountIds` limita o recorte às contas que interessam (no Resumo e
 * na tela de Objetivos: as contas dos objetivos). Sem ele, usa as contas
 * do perfil ativo. Antes a query trazia a tabela INTEIRA de lançamentos
 * (sem filtro de conta) só para somar saldo — o maior volume do Resumo.
 */
export function useMFAccountBalances(user, accountIds = null) {
  const profileId = useMFProfileScope();
  const scopeKey = accountIds === null ? 'profile' : [...accountIds].sort().join(',');
  return useQuery({
    queryKey: ['mf-account-balances', user?.id, profileId ?? 'all', scopeKey],
    enabled: !!user?.id,
    queryFn: async () => {
      // Contas cujo saldo interessa: quando informadas, só essas;
      // senão, as do perfil ativo.
      let scope = accountIds;
      if (scope === null) {
        const { data: profileAccounts, error: profileError } = await mfSelect(
          'mf_accounts',
          () => {
            let query = supabase.from('mf_accounts').select('*');
            if (profileId) query = query.eq('profile_id', profileId);
            return query;
          },
          { filter: byProfile(profileId) }
        );
        if (profileError) throw profileError;
        scope = (profileAccounts ?? []).map((acc) => acc.id);
      }
      const scopeIds = [...new Set((scope ?? []).filter(Boolean))];
      if (scopeIds.length === 0) return {};

      const [accounts, ownTxs, transferTxs] = await Promise.all([
        mfSelect(
          'mf_accounts',
          () => supabase.from('mf_accounts').select('*').in('id', scopeIds),
          { filter: (rows) => rows.filter((row) => scopeIds.includes(row.id)) }
        ),
        mfSelectAll(
          'mf_transactions',
          () =>
            supabase
              .from('mf_transactions')
              .select('id,type,amount,payment_date,status,account_id,transfer_account_id')
              .in('account_id', scopeIds)
              .order('payment_date')
              .order('id'),
          { filter: (rows) => rows.filter((row) => scopeIds.includes(row.account_id)) }
        ),
        mfSelectAll(
          'mf_transactions',
          () =>
            supabase
              .from('mf_transactions')
              .select('id,type,amount,payment_date,status,account_id,transfer_account_id')
              .in('transfer_account_id', scopeIds)
              .order('payment_date')
              .order('id'),
          { filter: (rows) => rows.filter((row) => scopeIds.includes(row.transfer_account_id)) }
        ),
      ]);
      if (accounts.error) throw accounts.error;
      if (ownTxs.error) throw ownTxs.error;
      if (transferTxs.error) throw transferTxs.error;
      // A mesma transferência aparece nos dois recortes (origem e destino).
      const txById = new Map();
      [...(ownTxs.data ?? []), ...(transferTxs.data ?? [])].forEach((tx) => txById.set(tx.id, tx));
      const txs = { data: [...txById.values()] };

      const today = toISODate(new Date());
      const balances = {};
      (accounts.data ?? []).forEach((acc) => {
        balances[acc.id] = Number(acc.initial_balance) || 0;
      });
      (txs.data ?? []).forEach((tx) => {
        if (tx.status !== 'PAGO' || tx.payment_date > today) return;
        const amount = Number(tx.amount) || 0;
        if (tx.type === 'TRANSFERENCIA') {
          if (tx.account_id in balances) balances[tx.account_id] -= amount;
          if (tx.transfer_account_id in balances) balances[tx.transfer_account_id] += amount;
        } else if (tx.type === 'RECEITA') {
          if (tx.account_id in balances) balances[tx.account_id] += amount;
        } else {
          if (tx.account_id in balances) balances[tx.account_id] -= amount;
        }
      });
      return balances;
    },
  });
}

export function useMFBudgets(user) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-budgets', user?.id, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_budgets',
        () =>
          supabase.from('mf_budgets').select('*').order('period_start', { ascending: false }),
        { sort: byDateDesc('period_start') }
      );
      if (error) throw error;
      const rows = data ?? [];
      if (!profileId) return rows;
      // Perfil: orçamentos da conta do perfil ou globais (sem conta).
      const ids = await profileAccountIds(profileId);
      if (ids.length === 0) return rows.filter((row) => !row.account_id);
      return rows.filter((row) => !row.account_id || ids.includes(row.account_id));
    },
  });
}

export function useCreateMFBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('mf_budgets').insert(payload).select().single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMFBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('mf_budgets')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_budgets').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/**
 * Janela de lançamentos (padrão 6 meses) para progresso e histórico
 * de orçamentos: traz receitas, despesas e vínculos de tag.
 */
export function useMFBudgetWindow(user, months = 6) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-budget-window', user?.id, months, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const firstMonth = shiftMonth(currentMonthKey(), -(months - 1));
      const { start } = monthBounds(firstMonth);
      const { end } = monthBounds(currentMonthKey());
      const scopeIds = await profileAccountIds(profileId);
      if (scopeIds && scopeIds.length === 0) return { transactions: [], tagIdsByTx: {} };

      const buildWindowQuery = () => {
        let query = supabase
          .from('mf_transactions')
          // Só as colunas que o cálculo de orçamento lê (o resto do
          // lançamento — descrição, notas, anexos — pesa no payload).
          .select('id,type,amount,payment_date,status,account_id,category_id')
          .gte('payment_date', start)
          .lte('payment_date', end)
          .order('payment_date')
          .order('id');
        if (scopeIds) query = query.in('account_id', scopeIds);
        return query;
      };

      const [txs, links] = await Promise.all([
        mfSelectAll('mf_transactions', buildWindowQuery, {
          filter: (rows) =>
            rows.filter(
              (row) =>
                row.payment_date >= start &&
                row.payment_date <= end &&
                (!scopeIds || scopeIds.includes(row.account_id))
            ),
        }),
        mfSelect(
          'mf_transaction_tags',
          () => supabase.from('mf_transaction_tags').select('transaction_id,tag_id')
        ),
      ]);
      if (txs.error) throw txs.error;
      if (links.error) throw links.error;

      const transactions = txs.data ?? [];
      const ids = new Set(transactions.map((tx) => tx.id));
      const tagIdsByTx = {};
      (links.data ?? []).forEach((row) => {
        if (!ids.has(row.transaction_id)) return;
        if (!tagIdsByTx[row.transaction_id]) tagIdsByTx[row.transaction_id] = [];
        tagIdsByTx[row.transaction_id].push(row.tag_id);
      });
      return { transactions, tagIdsByTx };
    },
  });
}

/**
 * Gasto de um orçamento: despesas não canceladas dentro do período
 * que casam com o escopo (categoria — inclui filhos —, tag, conta ou
 * global) na moeda selecionada. Estornos (valor negativo) reduzem.
 */
export const budgetSpent = ({
  budget,
  transactions,
  tagIdsByTx,
  accountsById,
  categoriesById = {},
  currency,
}) => {
  const rows = transactions.filter((tx) => {
    if (tx.type !== 'DESPESA') return false;
    if (tx.status === 'CANCELADO') return false;
    const txCurrency = accountsById[tx.account_id]?.currency || 'BRL';
    if (currency && currency !== 'all' && txCurrency !== currency) return false;
    if (tx.payment_date < budget.period_start || tx.payment_date > budget.period_end) return false;
    if (budget.account_id && tx.account_id !== budget.account_id) return false;
    if (budget.tag_id && !(tagIdsByTx[tx.id] || []).includes(budget.tag_id)) return false;
    if (budget.category_id) {
      if (tx.category_id === budget.category_id) return true;
      // subcategoria direta do escopo (módulo trabalha com 2 níveis)
      const cat = categoriesById[tx.category_id];
      return !!cat && cat.parent_id === budget.category_id;
    }
    return true;
  });
  return rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
};

/** Limite do orçamento: fixo ou % da receita do período (mesma moeda). */
export const budgetLimit = ({ budget, transactions, accountsById, currency }) => {
  if (budget.mode === 'FIXED') return Number(budget.amount) || 0;
  const income = transactions
    .filter((tx) => {
      if (tx.type !== 'RECEITA' || tx.status === 'CANCELADO') return false;
      const txCurrency = accountsById[tx.account_id]?.currency || 'BRL';
      if (currency && currency !== 'all' && txCurrency !== currency) return false;
      return (
        tx.payment_date >= budget.period_start && tx.payment_date <= budget.period_end
      );
    })
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  return (income * (Number(budget.percent_of_income) || 0)) / 100;
};

export function useMFGoals(user) {
  const profileId = useMFProfileScope();
  return useQuery({
    queryKey: ['mf-goals', user?.id, profileId ?? 'all'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_goals',
        () =>
          supabase.from('mf_goals').select('*').order('created_at', { ascending: false }),
        { sort: byDateDesc('created_at') }
      );
      if (error) throw error;
      const rows = data ?? [];
      if (!profileId) return rows;
      // Perfil: objetivos da conta do perfil ou avulsos (sem conta).
      const ids = await profileAccountIds(profileId);
      if (ids.length === 0) return rows.filter((row) => !row.account_id);
      return rows.filter((row) => !row.account_id || ids.includes(row.account_id));
    },
  });
}

export function useCreateMFGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('mf_goals').insert(payload).select().single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMFGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('mf_goals')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFGoal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_goals').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

export function useMFGoalContributions(user) {
  return useQuery({
    queryKey: ['mf-goal-contributions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_goal_contributions',
        () =>
          supabase
            .from('mf_goal_contributions')
            .select('*')
            .order('contribution_date', { ascending: false }),
        { sort: byDateDesc('contribution_date') }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddMFGoalContribution() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_goal_contributions')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFGoalContribution() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_goal_contributions').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/** Valor atual de um objetivo: conta vinculada (automático) ou aportes. */
export const goalCurrentAmount = (goal, contributions, accountBalance) => {
  if (goal.account_id) return Number(accountBalance) || 0;
  const seed = Number(goal.initial_amount) || 0;
  const delta = contributions
    .filter((item) => item.goal_id === goal.id)
    .reduce(
      (sum, item) =>
        sum + (item.kind === 'WITHDRAW' ? -1 : 1) * (Number(item.amount) || 0),
      0
    );
  return Math.max(0, seed + delta);
};

/* ────────────────────────────────────────────────────────────
 * Fase 9: pontos de restauração (snapshot → JSONB)
 * ──────────────────────────────────────────────────────────── */

/**
 * Tabelas do snapshot na ordem de leitura/INSERT (pais → filhos).
 * Fora do escopo: mf_import_* (log histórico) e mf_restore_points
 * (os pontos não são apagados por um restore).
 */
export const MF_SNAPSHOT_TABLES = [
  'mf_account_types',
  'mf_account_groups',
  'mf_accounts',
  'mf_categories',
  'mf_tags',
  'mf_responsibles',
  'mf_transactions',
  'mf_transaction_tags',
  'mf_budgets',
  'mf_goals',
  'mf_goal_contributions',
  'mf_saved_reports',
];

/** Ordem de DELETE do restore (filhos → pais, respeitando FKs). */
export const MF_RESTORE_DELETE_ORDER = [
  'mf_transaction_tags',
  'mf_goal_contributions',
  'mf_goals',
  'mf_budgets',
  'mf_transactions',
  'mf_responsibles',
  'mf_tags',
  'mf_categories',
  'mf_accounts',
  'mf_account_groups',
  'mf_account_types',
  'mf_saved_reports',
];

/** Lê todas as tabelas do snapshot (payload de um ponto). */
export const readMFSnapshot = async () => {
  const payload = {};
  for (const table of MF_SNAPSHOT_TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    payload[table] = data ?? [];
  }
  return payload;
};

/** Lista de pontos do usuário (mais recentes primeiro). */
export function useMFRestorePoints(user) {
  return useQuery({
    queryKey: ['mf-restore-points', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_restore_points',
        () =>
          supabase.from('mf_restore_points').select('*').order('created_at', { ascending: false }),
        { sort: byDateDesc('created_at') }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Salva um ponto: lê o snapshot completo e grava label + payload. */
export function useSaveMFRestorePoint() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (label) => {
      const trimmed = String(label ?? '').trim();
      if (!trimmed) throw new Error('empty-label');
      const payload = await readMFSnapshot();
      const { data, error } = await supabase
        .from('mf_restore_points')
        .insert({ label: trimmed, payload })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

/**
 * Restaura um ponto: apaga os dados atuais do usuário (filhos → pais)
 * e reinsere o snapshot (pais → filhos). Os próprios pontos de
 * restauração ficam intactos.
 */
export function useRestoreMFRestorePoint() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (point) => {
      const payload = point?.payload ?? {};
      for (const table of MF_RESTORE_DELETE_ORDER) {
        const { error } = await supabase.from(table).delete().not('id', 'is', null);
        if (error) throw error;
      }
      for (const table of MF_SNAPSHOT_TABLES) {
        const rows = payload[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const { error } = await supabase.from(table).insert(rows);
        if (error) throw error;
      }
      return point;
    },
    onSuccess: invalidate,
  });
}

/** Exclui um ponto de restauração. */
export function useDeleteMFRestorePoint() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_restore_points').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Fase 9: perfis separados (pessoal/empresa/família)
 * ──────────────────────────────────────────────────────────── */

/**
 * Ids das contas do perfil ativo.
 * Retorna `null` sem perfil (sem filtro) ou a lista de ids
 * (`[]` = perfil sem contas → telas vazias).
 */
const profileAccountIds = async (profileId) => {
  if (!profileId) return null;
  const { data, error } = await mfSelect(
    'mf_accounts',
    () => supabase.from('mf_accounts').select('id').eq('profile_id', profileId),
    {
      // select parcial: não sobrescreve o cache completo das contas
      cache: false,
      filter: (rows) => rows.filter((row) => row.profile_id === profileId),
    }
  );
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
};

/* Locais do cache offline (reaplicam filtros/ordens do servidor). */
const byProfile = (profileId) => (rows) =>
  profileId ? rows.filter((row) => row.profile_id === profileId) : rows;
const bySortOrder = (rows) =>
  [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
const byNameAsc = (rows) =>
  [...rows].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
const byDateDesc = (field) => (rows) =>
  [...rows].sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')));

/** Perfis do usuário (pessoal/empresa/família...). */
export function useMFProfiles(user) {
  return useQuery({
    queryKey: ['mf-profiles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await mfSelect(
        'mf_profiles',
        () => supabase.from('mf_profiles').select('*').order('sort_order'),
        { sort: bySortOrder }
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateMFProfile() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('mf_profiles')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data ?? payload;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMFProfile() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('mf_profiles')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteMFProfile() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('mf_profiles').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });
}

/* ────────────────────────────────────────────────────────────
 * Resumo: próxima fatura por cartão (Fase B)
 * ──────────────────────────────────────────────────────────── */

/**
 * Próxima fatura de cada cartão ativo (reaproveita `buildCardInvoices`,
 * mesma fonte da tela de Cartões). Para cada cartão retorna a fatura corrente
 * + a próxima com despesa vinculada (`upcomingInvoices`), e o total em aberto
 * a pagar. Escopo enxuto: contas de cartão + vinculadas. Mensal como o resto
 * do Resumo (e como a tela de Cartões): `monthKey` vira `refISO`/ciclo via
 * `monthRefISO` — navegar o mês troca os valores de verdade.
 */
export function useMFCardUpcoming(user, cards, monthKey = currentMonthKey()) {
  // Escopo enxuto: o próprio hook de cartões já traz compras do cartão,
  // transferências para ele e os pagamentos-espelho na conta vinculada
  // (isPaymentTx exige invoice_close) — sem ela no recorte o Resumo nunca
  // via o pagamento e a fatura já paga ficava com o cadeado.
  const { data: cardData } = useMFCardTransactions(user, cards, monthKey);
  const transactions = useMemo(() => cardData?.transactions ?? [], [cardData]);
  const aggregates = cardData?.aggregates ?? null;
  return useMemo(() => {
    if (!cards || cards.length === 0) {
      return { items: [], openTotalByCurrency: {}, upcomingTotalByCurrency: {} };
    }
    const allTxs = transactions;
    const openTotalByCurrency = {};
    const upcomingTotalByCurrency = {};
    const refISO = monthRefISO(monthKey);
    const items = cards.map((card) => {
      const cur = card.currency || 'BRL';
      const { current, upcomingInvoices = [] } = buildCardInvoices({
        card,
        transactions: allTxs,
        refISO,
        monthKey,
        count: 6,
        includeFutureBound: true,
        aggregates,
      });
      // Próxima fatura = primeira futura com despesa vinculada, senão a corrente.
      const upcoming = upcomingInvoices.find(
        (inv) => Number(inv.total) > 0 || Number(inv.openAmount) > 0
      );
      const shown = upcoming ?? current;
      // "A pagar" = fatura NÃO PAGA: agendamento PENDENTE não abate (o
      // dinheiro só sai no vencimento — só PAGO zera), na mesma régua da
      // métrica EM ABERTO de Cartões (em aberto + disponível = limite).
      const unpaidOf = (inv) =>
        Math.round(((Number(inv?.openAmount) || 0) + (Number(inv?.pendingBound) || 0)) * 100) / 100;
      const openAmount = unpaidOf(current);
      if (openAmount > 0) {
        openTotalByCurrency[cur] = (openTotalByCurrency[cur] || 0) + openAmount;
      }
      const upcomingAmount = unpaidOf(shown) || Number(shown?.total) || 0;
      if (upcomingAmount > 0) {
        upcomingTotalByCurrency[cur] = (upcomingTotalByCurrency[cur] || 0) + upcomingAmount;
      }
      // `next` = próxima fatura DISTINTA da corrente (só quando existe uma
      // futura com despesa vinculada); `upcoming` continua o mostrado no
      // rodapé (fallback para a corrente).
      return { card, current, upcoming: shown, next: upcoming ?? null, openAmount };
    });
    return { items, openTotalByCurrency, upcomingTotalByCurrency };
  }, [cards, transactions, aggregates, monthKey]);
}
