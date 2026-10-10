/**
 * Gerador da migração de dados reais (app Minhas Finanças) -> tabelas mf_*.
 * Lê os CSVs em C:\repos\PersonalControl\docs\Extratos e escreve arquivos .sql
 * em ...\Temp\opencode\mfsql (executados depois pela Management API).
 *
 * Decisões de mapeamento (validadas com os dados):
 *  - payment_date = due_date = DATA VENCIMENTO (extrato original agrupa por vencimento)
 *  - effective_date = DATA PAGAMENTO/RECEBIMENTO (quando existe)
 *  - status: Efetivada -> PAGO, Pendente -> PENDENTE; transferências: venc <= hoje ? PAGO : PENDENTE
 *  - despesa com cartão -> account_id = conta do cartão (fatura); com conta -> conta
 *  - categoria "Cartão" + desc tipo fatura -> TRANSFERENCIA (conta -> cartão)
 *  - parceladas "N/M" -> parse em installments + parent (grupo válido = currents únicos)
 *  - moeda: todas BRL; flag "não somada" (HTML) não existe no schema -> importa tudo
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const USER_ID = '9659a65c-7a82-4b08-a9d4-64fd2346cbb1';
const BASE = 'C:/repos/PersonalControl/docs/Extratos';
const OUT = 'C:/Users/glail/AppData/Local/Temp/opencode/mfsql';
const TODAY = '2026-10-04';

const warnings = [];
const W = (msg) => warnings.push(msg);

/* ---------------- utils ---------------- */

function uid(salt) {
  const h = crypto.createHash('sha1').update('mf-import:' + salt).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsv(name) {
  const text = fs.readFileSync(path.join(BASE, name), 'utf8');
  const rows = parseCSV(text);
  const norm = (s) => s.trim().replace(/^[^\p{L}\p{N}]+/u, '');
  const headers = rows[0].map(norm);
  const out = [];
  for (const r of rows.slice(1)) {
    if (r.length === 1 && !r[0].trim()) continue;
    const o = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
    out.push(o);
  }
  return out;
}

function num(s) {
  if (s == null) return NaN;
  let v = String(s).replace(/R\$/g, '').replace(/\u00a0/g, '').replace(/\s/g, '');
  if (!v) return NaN;
  let neg = false;
  if (v.startsWith('(') && v.endsWith(')')) { neg = true; v = v.slice(1, -1); }
  if (v.startsWith('-')) { neg = true; v = v.slice(1); }
  if (v.includes(',') && v.includes('.')) {
    v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (v.includes(',')) {
    const dec = v.split(',')[1] || '';
    v = dec.length === 3 ? v.replace(/,/g, '') : v.replace(',', '.');
  }
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return NaN;
  return neg ? -n : n;
}

function isoDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function q(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/'/g, "''")}'`;
}
const n2 = (v) => Number(v).toFixed(2);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------------- leitura ---------------- */

const dAll = readCsv('_Despesas.csv');
const rAll = readCsv('_Receitas.csv');
const tAll = readCsv('Transferências.csv');

const dRows = dAll.filter((r) => r['SITUAÇÃO']);
const rRows = rAll.filter((r) => r['SITUAÇÃO']);
const tRows = tAll.filter((r) => r['Descrição'] && isoDate(r['Vencimento']));
if (dAll.length - dRows.length > 1) W(`D: ${dAll.length - dRows.length} linhas ignoradas (sem SITUAÇÃO)`);
if (rAll.length - rRows.length > 1) W(`R: ${rAll.length - rRows.length} linhas ignoradas (sem SITUAÇÃO)`);
if (tAll.length - tRows.length) W(`T: ${tAll.length - tRows.length} linhas ignoradas (sem descrição/vencimento)`);

/* ---------------- contas e cartões ---------------- */

const contaSet = new Set();
const cardSet = new Set();
const cardPayers = new Map();

for (const r of dRows) {
  if (r['Conta']) contaSet.add(r['Conta']);
  const cc = r['Cartão de Crédito'];
  if (cc) {
    cardSet.add(cc);
    if (r['Conta']) {
      const m = cardPayers.get(cc) ?? new Map();
      m.set(r['Conta'], (m.get(r['Conta']) ?? 0) + 1);
      cardPayers.set(cc, m);
    }
  }
}
for (const r of rRows) if (r['Conta']) contaSet.add(r['Conta']);
for (const r of tRows) {
  for (const key of ['Origem', 'Destino']) {
    const nm = r[key];
    if (!nm) continue;
    if (cardSet.has(nm) && !contaSet.has(nm)) continue; // ponta é cartão (sem conta homônima)
    contaSet.add(nm);
  }
}

function typeFor(name) {
  const n = name.toLowerCase();
  if (n.includes('poupança') || n.includes('poupanca')) return 'POUPANCA';
  if (/(invest|cdb|tesouro|renda fixa|bolsa|fundos|corretora|\blca\b)/.test(n)) return 'INVESTIMENTO';
  if (/^(minha carteira|dinheiro estrangeiro|euro|nomad dollar|wise d[oó]lar|d[oó]lar estrangeiro|dinheiro guardado.*)$/.test(n)) return 'DINHEIRO';
  if (/(caixinha|libercard|sodexo|pluxee|ifood|m[ée]liuz|ben visa|ipva|xbox|ar condicionado|[f]érias|^carro$|^pets$)/.test(n)) return 'OUTRO';
  return 'CORRENTE';
}

const accounts = new Map(); // key -> {id, name, type, linked}
function ensureConta(name) {
  const k = 'conta|' + name;
  if (!accounts.has(k)) accounts.set(k, { key: k, id: uid('acc|' + k), name, type: typeFor(name), linked: null });
  return accounts.get(k);
}
function ensureCard(name) {
  const k = 'card|' + name;
  if (!accounts.has(k)) {
    let payer = null, best = -1;
    for (const [c, n] of cardPayers.get(name) ?? []) {
      if (n > best) { best = n; payer = c; }
      if ((cardPayers.get(name)?.size ?? 0) > 1) { /* reportado abaixo */ }
    }
    if (payer && (cardPayers.get(name)?.size ?? 0) > 1) W(`cartão ${name}: pagadores múltiplos, usando "${payer}"`);
    const linked = payer ? ensureConta(payer) : null;
    accounts.set(k, { key: k, id: uid('acc|' + k), name, type: 'CARTAO', linked: linked?.id ?? null });
  }
  return accounts.get(k);
}
function endpointId(name) {
  if (contaSet.has(name)) return ensureConta(name);
  if (cardSet.has(name)) return ensureCard(name);
  return ensureConta(name);
}

/* ---------------- categorias ---------------- */

const catParents = new Map(); // name -> {D,R}
const catChildren = new Map(); // parent -> Set(child)
function addCat(cat, sub, kind) {
  if (!cat) { W('linha sem CATEGORIA'); return; }
  const p = catParents.get(cat) ?? { D: false, R: false };
  p[kind === 'DESPESA' ? 'D' : 'R'] = true;
  catParents.set(cat, p);
  if (sub && sub !== cat) {
    const cs = catChildren.get(cat) ?? new Set();
    cs.add(sub);
    catChildren.set(cat, cs);
  }
}

const catRows = [];
[...catParents.keys()].sort(cmp).forEach((name, i) => { /* placeholder: parents ainda não completos */ });
// (construído após coleta das linhas — ver abaixo)

/* ---------------- tags ---------------- */

const tags = new Map(); // lower -> {id, name}
function addTags(csv) {
  for (const raw of (csv || '').split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const k = t.toLowerCase();
    if (!tags.has(k)) tags.set(k, { id: uid('tag|' + k), name: t });
  }
}

/* ---------------- transações (coleta) ---------------- */

const txs = [];
let faturaCount = 0;

for (const r of dRows) addCat(r['CATEGORIA'], r['SUBCATEGORIA'], 'DESPESA');
for (const r of rRows) addCat(r['CATEGORIA'], r['SUBCATEGORIA'], 'RECEITA');

// constrói linhas de categorias (pai + filhos) e mapa por chave
[...catParents.keys()].sort(cmp).forEach((name, i) => {
  const p = catParents.get(name);
  const type = p.D && p.R ? 'AMBAS' : p.D ? 'DESPESA' : 'RECEITA';
  const parentId = uid('cat|p|' + name);
  catRows.push({ id: parentId, name, type, parentId: null, sort: i, key: 'p|' + name });
  [...(catChildren.get(name) ?? [])].sort(cmp).forEach((cn, j) => {
    catRows.push({ id: uid('cat|c|' + name + '|' + cn), name: cn, type, parentId, sort: j, key: 'c|' + name + '|' + cn });
  });
});
const catByKey = new Map(catRows.map((c) => [c.key, c]));
function categoryIdOf(cat, sub) {
  if (!cat) return null;
  if (sub && sub !== cat) {
    const c = catByKey.get('c|' + cat + '|' + sub);
    if (c) return c.id;
    W(`subcategoria ausente: ${cat} > ${sub}`);
  }
  return catByKey.get('p|' + cat)?.id ?? null;
}

dRows.forEach((r, i) => {
  const origDesc = r['DESCRIÇÃO'] || 'Sem descrição';
  let desc = origDesc;
  let cur = null, tot = null;
  const rec = r['RECORRÊNCIA'] || '';
  if (rec.startsWith('Parcelada')) {
    const m = /\s+(\d+)\/(\d+)\s*$/.exec(desc);
    if (m) {
      const c = Number(m[1]), t = Number(m[2]);
      if (t >= 2 && c >= 1 && c <= t) {
        cur = c; tot = t;
        desc = desc.replace(/\s+\d+\/\d+\s*$/, '').trimEnd();
      }
    }
  }
  const cartao = r['Cartão de Crédito'];
  const conta = r['Conta'];
  const amount = num(r['VALOR']);
  if (Number.isNaN(amount)) { W(`D[${i}] valor inválido: ${r['VALOR']}`); return; }
  if (amount === 0) { W(`D[${i}] valor zero: ${origDesc}`); return; }
  const payment = isoDate(r['DATA VENCIMENTO']);
  if (!payment) { W(`D[${i}] sem vencimento: ${origDesc}`); return; }
  const st = r['SITUAÇÃO'] === 'Efetivada' ? 'PAGO' : r['SITUAÇÃO'] === 'Pendente' ? 'PENDENTE' : (W(`D[${i}] situação desconhecida: ${r['SITUAÇÃO']}`), 'PENDENTE');
  // pagamento de fatura: categoria "Cartão" + descrição tipo fatura.
  // o cartão pode vir no campo Cartão de Crédito OU só na subcategoria (ex.: "Pagamento cartão"/Nubank)
  const catIsCartao = r['CATEGORIA'] === 'Cartão';
  const cardName = cartao || (catIsCartao && cardSet.has(r['SUBCATEGORIA']) ? r['SUBCATEGORIA'] : null);
  const isFatura = !!(cardName && conta && catIsCartao && /^(Fatura\b|Contas acumuladas|Pagamento cart)/i.test(desc));
  let type = 'DESPESA', accountId = null, transferId = null, categoryId = null;
  if (isFatura) {
    type = 'TRANSFERENCIA';
    accountId = endpointId(conta).id;
    transferId = ensureCard(cardName).id;
    faturaCount += 1;
  } else if (cartao) {
    accountId = ensureCard(cartao).id;
    categoryId = categoryIdOf(r['CATEGORIA'], r['SUBCATEGORIA']);
  } else if (conta) {
    accountId = endpointId(conta).id;
    categoryId = categoryIdOf(r['CATEGORIA'], r['SUBCATEGORIA']);
  } else {
    W(`D[${i}] sem conta nem cartão: ${origDesc}`);
    return;
  }
  txs.push({
    id: uid(`tx|d|${i}`), type, accountId, transferId, desc, origDesc, amount,
    payment, due: payment, eff: isoDate(r['DATA PAGAMENTO']), status: st, categoryId,
    recurrence: rec === 'Fixa mensal' ? 'MONTHLY' : 'NONE',
    cur, tot, parent: null, notes: r['OBSERVACOES'] || null,
    tags: [...(r['TAGS'] || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)],
    seq: i, src: 'd',
  });
});

rRows.forEach((r, i) => {
  const origDesc = r['DESCRIÇÃO'] || 'Sem descrição';
  const amount = num(r['VALOR']);
  if (Number.isNaN(amount)) { W(`R[${i}] valor inválido: ${r['VALOR']}`); return; }
  if (amount === 0) { W(`R[${i}] valor zero: ${origDesc}`); return; }
  const payment = isoDate(r['DATA VENCIMENTO']);
  if (!payment) { W(`R[${i}] sem vencimento: ${origDesc}`); return; }
  const st = r['SITUAÇÃO'] === 'Efetivada' ? 'PAGO' : r['SITUAÇÃO'] === 'Pendente' ? 'PENDENTE' : (W(`R[${i}] situação desconhecida: ${r['SITUAÇÃO']}`), 'PENDENTE');
  if (!r['Conta']) { W(`R[${i}] sem conta: ${origDesc}`); return; }
  txs.push({
    id: uid(`tx|r|${i}`), type: 'RECEITA', accountId: endpointId(r['Conta']).id, transferId: null,
    desc: origDesc, origDesc, amount, payment, due: payment,
    eff: isoDate(r['Data recebimento']), status: st,
    categoryId: categoryIdOf(r['CATEGORIA'], r['SUBCATEGORIA']),
    recurrence: r['RECORRÊNCIA'] === 'M' ? 'MONTHLY' : 'NONE',
    cur: null, tot: null, parent: null, notes: r['OBSERVACOES'] || null,
    tags: [...(r['TAGS'] || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)],
    seq: i, src: 'r',
  });
});

tRows.forEach((r, i) => {
  const origDesc = r['Descrição'] || 'Sem descrição';
  let desc = origDesc;
  let cur = null, tot = null;
  const rec = r['Recorrência'] || '';
  if (rec.startsWith('Parcelada')) {
    const c = Number.parseInt(r['Parcela'], 10);
    const t = Number.parseInt(r['Parcelas'], 10);
    if (t >= 2 && c >= 1 && c <= t) {
      cur = c; tot = t;
      desc = desc.replace(/\s+\d+\/\d+\s*$/, '').trimEnd();
    }
  }
  let amount = num(r['Valor']);
  if (Number.isNaN(amount)) { W(`T[${i}] valor inválido: ${r['Valor']}`); return; }
  if (amount === 0) { W(`T[${i}] valor zero: ${origDesc}`); return; }
  if (amount < 0) { W(`T[${i}] valor negativo (${amount}) em "${origDesc}" -> usado valor absoluto`); amount = Math.abs(amount); }
  const payment = isoDate(r['Vencimento']);
  if (!payment) { W(`T[${i}] sem vencimento: ${origDesc}`); return; }
  if (!r['Origem'] || !r['Destino']) { W(`T[${i}] sem origem/destino: ${origDesc}`); return; }
  if (r['Origem'].trim() === r['Destino'].trim()) W(`T[${i}] origem == destino: ${origDesc}`);
  txs.push({
    id: uid(`tx|t|${i}`), type: 'TRANSFERENCIA',
    accountId: endpointId(r['Origem']).id, transferId: endpointId(r['Destino']).id,
    desc, origDesc, amount, payment, due: payment,
    eff: payment <= TODAY ? payment : null,
    status: payment <= TODAY ? 'PAGO' : 'PENDENTE',
    categoryId: null,
    recurrence: rec === 'Fixa mensal' ? 'MONTHLY' : 'NONE',
    cur, tot, parent: null, notes: r['Observações'] || null,
    tags: [], seq: i, src: 't',
  });
});

for (const r of [...dRows, ...rRows]) addTags(r['TAGS']);

/* ---------------- parcelamentos: agrupar e encadear por data ----------------
   Mesma descrição+conta+categoria+total pode ter vários parcelamentos ao longo
   dos anos. Estratégia em 2 passos:
   1) toda parcela "1/M" ancora uma série (parent = âncora);
   2) parcelas seguintes entram na série aberta que espera exatamente aquele
      número (escolha pela data mais próxima da última parcela da série).
   Sobras mantêm installments sem parent (badge sem cascata). */

let seriesLinked = 0, installmentsKept = 0, installmentsLinked = 0, installmentsParentless = 0;
{
  const dayNum = (iso) => Date.parse(iso + 'T00:00:00Z') / 86400000;
  const groups = new Map();
  for (const t of txs) {
    if (t.cur == null) continue;
    const key = [t.desc, t.accountId, t.transferId ?? '', t.categoryId ?? '', t.tot].join('\u0001');
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    // passo 1: âncoras (parcela 1) em ordem de data
    const anchors = g.filter((t) => t.cur === 1).sort((a, b) => cmp(a.payment, b.payment));
    const series = anchors.map((t) => ({ expected: 2, last: t.payment, anchor: t }));
    seriesLinked += anchors.length;
    // passo 2: demais parcelas em ordem de data, na série compatível mais próxima
    const rest = g.filter((t) => t.cur !== 1).sort((a, b) => cmp(a.payment, b.payment));
    for (const t of rest) {
      let best = null, bestDist = Infinity;
      for (const s of series) {
        if (s.expected !== t.cur) continue;
        const dist = Math.abs(dayNum(t.payment) - dayNum(s.last));
        if (dist < bestDist) { bestDist = dist; best = s; }
      }
      if (best) {
        t.parent = best.anchor.id;
        best.expected += 1;
        best.last = t.payment;
      }
    }
  }
  for (const t of txs) {
    if (t.cur == null) continue;
    installmentsKept += 1;
    if (t.parent) installmentsLinked += 1;
    else if (t.cur !== 1) installmentsParentless += 1;
  }
}

/* ---------------- ordenação e escrita ---------------- */

const parentless = txs.filter((t) => !t.parent);
const children = txs
  .filter((t) => t.parent)
  .sort((a, b) => (a.parent < b.parent ? -1 : a.parent > b.parent ? 1 : a.cur - b.cur));
const ordered = [...parentless, ...children];

const accRows = [...accounts.values()].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
accRows.forEach((a, i) => { a.sort = i; });

function write(name, content) {
  fs.writeFileSync(path.join(OUT, name), content, { encoding: 'utf8' });
  return content.length;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* 00 wipe (idempotência: regenerar + reexecutar = estado exato; só linhas desta migração) */
write('00_wipe.sql',
  `DELETE FROM public.mf_transaction_tags;\n` +
  `DELETE FROM public.mf_transactions;\n` +
  `DELETE FROM public.mf_categories;\n` +
  `DELETE FROM public.mf_tags;\n` +
  `DELETE FROM public.mf_accounts;\n`);

/* 01 contas */
{
  const lines = accRows.map((a) =>
    `('${a.id}','${USER_ID}',${q(a.name)},'${a.type}',0,${a.sort},true,'BRL',${a.linked ? `'${a.linked}'` : 'NULL'})`);
  write('01_accounts.sql',
    `INSERT INTO public.mf_accounts (id, user_id, name, account_type, initial_balance, sort_order, is_active, currency, linked_account_id)\nVALUES\n${lines.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
}

/* 02 categorias */
{
  const lines = catRows.map((c) =>
    `('${c.id}','${USER_ID}',${q(c.name)},'${c.type}',${c.parentId ? `'${c.parentId}'` : 'NULL'},${c.sort},false)`);
  write('02_categories.sql',
    `INSERT INTO public.mf_categories (id, user_id, name, type, parent_id, sort_order, is_archived)\nVALUES\n${lines.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
}

/* 03 tags */
{
  const tagList = [...tags.values()].sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()));
  const lines = tagList.map((t) => `('${t.id}','${USER_ID}',${q(t.name)},NULL)`);
  write('03_tags.sql',
    `INSERT INTO public.mf_tags (id, user_id, name, color)\nVALUES\n${lines.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
}

/* 04 transações em lotes */
const TX_COLS = 'id, user_id, account_id, transfer_account_id, type, description, amount, payment_date, due_date, effective_date, status, category_id, responsible_id, notes, attachment_path, recurrence, installments_current, installments_total, parent_transaction_id';
const BATCH = 1200;
let txFiles = 0, txBytes = 0;
for (let i = 0; i < ordered.length; i += BATCH) {
  const slice = ordered.slice(i, i + BATCH);
  const lines = slice.map((t) =>
    `('${t.id}','${USER_ID}','${t.accountId}',${t.transferId ? `'${t.transferId}'` : 'NULL'},'${t.type}',${q(t.desc)},${n2(t.amount)},'${t.payment}',${q(t.due)},${q(t.eff)},'${t.status}',${t.categoryId ? `'${t.categoryId}'` : 'NULL'},NULL,${q(t.notes)},NULL,'${t.recurrence}',${t.cur ?? 'NULL'},${t.tot ?? 'NULL'},${t.parent ? `'${t.parent}'` : 'NULL'})`);
  const name = `04_tx_${String(txFiles + 1).padStart(3, '0')}.sql`;
  txBytes += write(name, `INSERT INTO public.mf_transactions (${TX_COLS})\nVALUES\n${lines.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
  txFiles += 1;
}

/* 05 vínculos tx<->tag */
const linkLines = [];
for (const t of txs) {
  for (const key of t.tags) {
    const tag = tags.get(key);
    if (!tag) { W(`tag ausente: ${key}`); continue; }
    linkLines.push(`('${t.id}','${tag.id}','${USER_ID}')`);
  }
}
let linkFiles = 0;
for (let i = 0; i < linkLines.length; i += 3000) {
  const slice = linkLines.slice(i, i + 3000);
  const name = `05_links_${String(linkFiles + 1).padStart(3, '0')}.sql`;
  write(name, `INSERT INTO public.mf_transaction_tags (transaction_id, tag_id, user_id)\nVALUES\n${slice.join(',\n')}\nON CONFLICT DO NOTHING;\n`);
  linkFiles += 1;
}

/* ---------------- relatório ---------------- */

const sum = (arr) => arr.reduce((s, t) => s + (t.amount ?? t), 0);
const byType = (ty) => txs.filter((t) => t.type === ty);
const dSum = sum(dRows.map((r) => num(r['VALOR'])).filter((v) => !Number.isNaN(v)));
const rSum = sum(rRows.map((r) => num(r['VALOR'])).filter((v) => !Number.isNaN(v)));
const tSum = sum(tRows.map((r) => num(r['Valor'])).filter((v) => !Number.isNaN(v)));
const faturaSum = sum(txs.filter((t) => t.type === 'TRANSFERENCIA' && t.src === 'd'));

const report = [];
report.push('=== Migração Minhas Finanças -> mf_* ===');
report.push(`linhas: D=${dRows.length} R=${rRows.length} T=${tRows.length} | transações geradas=${txs.length}`);
report.push(`por tipo: DESPESA=${byType('DESPESA').length} RECEITA=${byType('RECEITA').length} TRANSFERENCIA=${byType('TRANSFERENCIA').length} (fatura->transfer=${faturaCount})`);
report.push(`somas: D=${dSum.toFixed(2)} R=${rSum.toFixed(2)} T=${tSum.toFixed(2)}`);
report.push(`esperado: D=977367.48 R=1109504.60`);
report.push(`DESPESA importada=${sum(byType('DESPESA')).toFixed(2)} (= ${dSum.toFixed(2)} - fatura ${faturaSum.toFixed(2)} = ${(dSum - faturaSum).toFixed(2)})`);
report.push(`RECEITA importada=${sum(byType('RECEITA')).toFixed(2)} | TRANSFERENCIA=${sum(byType('TRANSFERENCIA')).toFixed(2)}`);
report.push(`contas=${accRows.length} (cartões=${accRows.filter((a) => a.type === 'CARTAO').length}) categorias=${catRows.length} tags=${tags.size} links=${linkLines.length}`);
report.push(`parcelados: com installments=${installmentsKept} (séries=${seriesLinked} com pai=${installmentsLinked}, sem pai=${installmentsParentless})`);
report.push(`status: PAGO=${txs.filter((t) => t.status === 'PAGO').length} PENDENTE=${txs.filter((t) => t.status === 'PENDENTE').length}`);
report.push(`mensais: MONTHLY=${txs.filter((t) => t.recurrence === 'MONTHLY').length}`);
report.push(`negativos: DESPESA=${byType('DESPESA').filter((t) => t.amount < 0).length} RECEITA=${byType('RECEITA').filter((t) => t.amount < 0).length}`);
report.push(`arquivos: ${txFiles} de transações (${(txBytes / 1024).toFixed(0)} KB), ${linkFiles} de links`);
report.push('');
report.push('--- contas ---');
for (const a of accRows) {
  const linked = a.linked ? accRows.find((x) => x.id === a.linked)?.name : null;
  report.push(`  ${a.type.padEnd(12)} ${a.name}${linked ? `  -> paga por ${linked}` : ''}`);
}
report.push('');
report.push('--- categorias (pais) ---');
for (const c of catRows.filter((x) => !x.parentId)) {
  const kids = catRows.filter((x) => x.parentId === c.id).length;
  report.push(`  ${c.name} [${c.type}]${kids ? ` (${kids} filhas)` : ''}`);
}
report.push('');
report.push('--- avisos ---');
if (!warnings.length) report.push('  (nenhum)');
else for (const w of warnings) report.push('  ' + w);

const text = report.join('\n');
fs.writeFileSync(path.join(OUT, 'report.txt'), text, 'utf8');
console.log(text);
