/**
 * Estado de vista do Minhas Finanças que sobrevive ao F5 (a aba em si já
 * é persistida pelo useRouter): mês selecionado + conta em drill-down.
 * Tudo com try/catch (storage pode estar indisponível) e validação na
 * leitura (mês fora do formato ou conta inexistente são ignorados).
 */

export const MF_MONTH_STORAGE_KEY = 'mf_month_key';
export const MF_DETAIL_STORAGE_KEY = 'mf_detail_drill';
export const MF_INVOICE_STORAGE_PREFIX = 'mf_invoice_sel_';

const CLOSE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readMonthKey(fallback) {
  try {
    const raw = localStorage.getItem(MF_MONTH_STORAGE_KEY);
    if (raw && MONTH_RE.test(raw)) return raw;
  } catch {
    /* storage indisponível — vale o padrão */
  }
  return fallback;
}

export function writeMonthKey(value) {
  try {
    if (value && MONTH_RE.test(value)) localStorage.setItem(MF_MONTH_STORAGE_KEY, value);
  } catch {
    /* melhor esforço */
  }
}

/** Lê { tab: 'accounts' | 'cards', id } ou null. */
export function readDrill() {
  try {
    const raw = localStorage.getItem(MF_DETAIL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.tab === 'accounts' || parsed.tab === 'cards') &&
      typeof parsed.id === 'string' &&
      parsed.id.length > 0
    ) {
      return { tab: parsed.tab, id: parsed.id };
    }
  } catch {
    /* JSON inválido — ignora */
  }
  return null;
}

/** Grava o drill; null limpa (ao fechar o detalhe). */
export function writeDrill(value) {
  try {
    if (!value) localStorage.removeItem(MF_DETAIL_STORAGE_KEY);
    else localStorage.setItem(MF_DETAIL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* melhor esforço */
  }
}

/**
 * Fatura selecionada de um cartão (chip da fatura): 'current' ou o
 * closeISO. Chave por cartão — vale em qualquer superfície (Cartões,
 * detalhe da conta, Resumo). Inválido/ausente = 'current'.
 */
export function readInvoiceSel(cardId) {
  try {
    if (!cardId) return null;
    const raw = localStorage.getItem(`${MF_INVOICE_STORAGE_PREFIX}${cardId}`);
    if (raw && CLOSE_RE.test(raw)) return raw;
  } catch {
    /* storage indisponível */
  }
  return null;
}

/** Grava a seleção; 'current'/nulo limpa (volta ao padrão). */
export function writeInvoiceSel(cardId, value) {
  try {
    if (!cardId) return;
    const key = `${MF_INVOICE_STORAGE_PREFIX}${cardId}`;
    if (!value || value === 'current') localStorage.removeItem(key);
    else if (CLOSE_RE.test(value)) localStorage.setItem(key, value);
  } catch {
    /* melhor esforço */
  }
}

/** Limpa todas as seleções de fatura (higiene de testes). */
export function clearInvoiceSel() {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(MF_INVOICE_STORAGE_PREFIX)) drop.push(key);
    }
    drop.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* melhor esforço */
  }
}
