/**
 * Parsing e conciliação de extratos (Fase 7) — lógica pura, sem UI.
 * Suporta OFX (SGML/OFX2) e CSV (delimitador detectado, mapeamento de
 * colunas) + sugestão de conciliação por valor + data (±3 dias) +
 * descrição semelhante (ignora acento/caixa).
 */

const round2 = (value) => Math.round(value * 100) / 100;

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

const toISO = (y, m, d) => {
  if (!(m >= 1 && m <= 12)) return null;
  if (!(d >= 1 && d <= daysInMonth(y, m))) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Valor monetário em texto → número. Entende 'R$ 1.234,56' (pt),
 * '1,234.56' (en), '(50,00)' (contabilidade), sinal '-' e moedas.
 */
export const parseAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value ?? '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,+-]/g, '');
  if (s.includes('-')) negative = true;
  s = s.replace(/[+-]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // os dois separadores: o último é o decimal, o outro é milhar
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('');
    s = s.replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    // 3 dígitos depois → milhar ('1,234'); senão → decimal ('1234,56')
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const dots = s.split('.').length;
    // vários pontos com 3 dígitos → milhar pt-BR ('1.234.567')
    if (decimals === 3 && dots > 1) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
};

/**
 * Data em texto → 'YYYY-MM-DD'. Aceita YYYY-MM-DD, DD/MM/YYYY (inverte
 * quando o 2º campo > 12 → MM/DD/YYYY) e YYYYMMDD (DTPOSTED do OFX).
 */
export const parseFlexibleDate = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    if (d <= 12 && mo > 12) {
      const swap = d;
      d = mo;
      mo = swap;
    }
    return toISO(Number(m[3]), mo, d);
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})(\d*)/);
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]));

  return null;
};

/** Lê um File como texto (usa file.text() com fallback FileReader). */
export const readTextFile = (file) => {
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
};

/** Extrai as linhas STMTTRN de um OFX (SGML ou XML). */
export const parseOfx = (text) => {
  const raw = String(text ?? '');
  const curdefMatch = raw.match(/<CURDEF>([A-Za-z]{3})/);
  const curdef = curdefMatch ? curdefMatch[1].toUpperCase() : null;

  if (!/<STMTTRN/i.test(raw)) return { ok: false, rows: [], curdef };

  const rows = [];
  raw
    .split(/<STMTTRN/i)
    .slice(1)
    .forEach((chunk) => {
      const block = chunk.split(/<\/STMTTRN>/i)[0];
      const tag = (name) => {
        const match = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
        return match ? match[1].trim() : '';
      };
      const amount = parseAmount(tag('TRNAMT'));
      const date = parseFlexibleDate(tag('DTPOSTED'));
      if (amount == null || amount === 0 || !date) return;
      const description = tag('MEMO') || tag('NAME') || tag('REF') || '';
      rows.push({
        date,
        description: description || '—',
        amount: round2(Math.abs(amount)),
        type: amount < 0 ? 'DESPESA' : 'RECEITA',
        external_id: tag('FITID') || null,
      });
    });

  return { ok: rows.length > 0, rows, curdef };
};

/** Detecta o delimitador pelo cabeçalho e separa células (com aspas). */
export const parseCsv = (text) => {
  const clean = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const candidates = [';', ',', '\t', '|'];
  const delimiter = candidates
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows = [];
  let cell = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length < 2) return { ok: false, headers: [], rows: [], delimiter };
  return {
    ok: true,
    headers: nonEmpty[0].map((h) => h.trim()),
    rows: nonEmpty.slice(1),
    delimiter,
  };
};

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** Heurística de colunas: índice por sinônimos (exato, depois contém). */
export const guessCsvMapping = (headers) => {
  const find = (keywords) => {
    const exact = headers.findIndex((h) => keywords.includes(norm(h)));
    if (exact >= 0) return exact;
    const partial = headers.findIndex((h) =>
      keywords.some((k) => k.length >= 3 && norm(h).includes(k))
    );
    return partial;
  };
  const date = find(['data', 'date', 'dt', 'movimento', 'competencia', 'lancamento']);
  const description = find([
    'descricao',
    'description',
    'historico',
    'memo',
    'detalhe',
    'lancamento',
    'narrativa',
    'favorecido',
  ]);
  const amount = find(['valor', 'value', 'amount', 'montante', 'quantia', 'importe']);
  const type = find(['tipo', 'type', 'natureza', 'credito/debito', 'credito-debito', 'sentido']);
  return { date, description, amount, type: type >= 0 ? type : -1 };
};

/**
 * Converte as células do CSV em linhas padrão {date, description,
 * amount, type}. 'invertAmount' = positivo é despesa (bancos que
 * exportam débito sem sinal).
 */
export const mapCsvRows = ({ rows, mapping, invertAmount = false }) => {
  const out = [];
  let invalid = 0;
  rows.forEach((cells) => {
    const date = parseFlexibleDate(cells[mapping.date]);
    const amount = parseAmount(cells[mapping.amount]);
    if (!date || amount == null || amount === 0) {
      invalid += 1;
      return;
    }
    const description =
      mapping.description >= 0 ? String(cells[mapping.description] ?? '').trim() : '';
    let signed = amount;
    if (invertAmount) signed = -signed;

    let type = null;
    if (mapping.type >= 0) {
      const raw = norm(cells[mapping.type]);
      if (raw) {
        if (/^(d|deb|debito|despesa|saida|saída)/.test(raw) || raw.includes('debit')) {
          type = 'DESPESA';
        } else if (/^(c|cred|credito|receita|entrada)/.test(raw) || raw.includes('cred')) {
          type = 'RECEITA';
        }
      }
    }
    if (!type) type = signed < 0 ? 'DESPESA' : 'RECEITA';

    out.push({
      date,
      description: description || '—',
      amount: round2(Math.abs(signed)),
      type,
      external_id: null,
    });
  });
  return { rows: out, invalid };
};

/** Texto normalizado para comparação de descrição. */
export const normalizeDescription = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Duas descrições são parecidas? (exato,substring ou 50% dos tokens) */
export const similarDescription = (a, b) => {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(' ').filter((tk) => tk.length >= 3);
  const tb = nb.split(' ').filter((tk) => tk.length >= 3);
  if (ta.length === 0 || tb.length === 0) return false;
  const common = ta.filter((tk) => tb.includes(tk)).length;
  return common >= Math.ceil(Math.min(ta.length, tb.length) * 0.5);
};

const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * Sugestão de conciliação: mesma assinatura de valor (±R$0,01), data
 * dentro de ±3 dias e descrição semelhante. Retorna as linhas com
 * `suggestion` (transação existente) ou null.
 */
export const suggestMatches = (rows, existingTxs) => {
  const pool = (existingTxs ?? []).filter(
    (tx) => tx.status !== 'CANCELADO' && tx.type !== 'TRANSFERENCIA'
  );
  return rows.map((row) => {
    const rowSigned = row.type === 'RECEITA' ? row.amount : -row.amount;
    const suggestion =
      pool.find((tx) => {
        const txSigned =
          tx.type === 'RECEITA' ? Number(tx.amount) : -Number(tx.amount);
        if (Math.abs(txSigned - rowSigned) > 0.011) return false;
        if (dayDiff(tx.payment_date, row.date) > 3) return false;
        return similarDescription(tx.description, row.description);
      }) ?? null;
    return { ...row, suggestion };
  });
};
