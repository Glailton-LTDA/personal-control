// Gera o SQL pós-carga: (1) as 213 transferências que existem só no banco
// (pagamentos de fatura do backfill), (2) restore de campos de cadastro que o
// gerador não insere (closing_day/due_day/etc.), (3) links de tag dessas extras.
// Lê o backup JSON e o SQL do gerador; escreve em mfsql_restore. Só números no console.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'C:/repos/PersonalControl/backup/mf-data-2026-10-08';
const genDir = 'C:/Users/glail/AppData/Local/Temp/opencode/mfsql';
const outDir = 'C:/Users/glail/AppData/Local/Temp/opencode/mfsql_restore';

const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
const tx = read('mf_transactions.json');
const acc = read('mf_accounts.json');
const cats = read('mf_categories.json');
const tags = read('mf_tags.json');
const links = read('mf_transaction_tags.json');

/* ids que o gerador (re)cria */
const genIds = new Set();
const lineRe = /^\('([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/;
for (const f of fs.readdirSync(genDir).filter((x) => /^04_tx_.*\.sql$/.test(x))) {
  for (const line of fs.readFileSync(path.join(genDir, f), 'utf8').split('\n')) {
    const m = line.match(lineRe);
    if (m) genIds.add(m[1]);
  }
}

const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const val = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return esc(v);
};
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const write = (name, content) => fs.writeFileSync(path.join(outDir, name), content, 'utf8');

/* 1) transferências extras */
const TX_COLS = [
  'id', 'user_id', 'account_id', 'transfer_account_id', 'type', 'description',
  'amount', 'payment_date', 'due_date', 'effective_date', 'status', 'category_id',
  'responsible_id', 'notes', 'attachment_path', 'recurrence', 'installments_current',
  'installments_total', 'parent_transaction_id', 'invoice_close', 'created_at', 'updated_at',
];
const extra = tx.filter((t) => !genIds.has(t.id));
const accIds = new Set(acc.map((a) => a.id));
const catIds = new Set(cats.map((c) => c.id));
const orphans = extra.filter((t) => (t.account_id && !accIds.has(t.account_id)) ||
  (t.transfer_account_id && !accIds.has(t.transfer_account_id)) ||
  (t.category_id && !catIds.has(t.category_id)));
if (orphans.length) throw new Error(`extras com referencia quebrada: ${orphans.length}`);

{
  const rows = extra.map((t) => '(' + TX_COLS.map((c) => val(t[c])).join(',') + ')');
  write('06_extra_transfers.sql',
    `INSERT INTO public.mf_transactions (${TX_COLS.join(', ')})\nVALUES\n${rows.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
}

/* 2) restore de campos de cadastro (só valores não nulos no backup) */
const ACC_FIELDS = ['color', 'icon', 'image_url', 'closing_day', 'due_day', 'credit_limit', 'card_brand', 'archived_at', 'is_active'];
const CAT_FIELDS = ['color', 'icon', 'is_archived'];
const TAG_FIELDS = ['color'];
function updates(rows, table, fields) {
  const out = [];
  let changed = 0;
  for (const r of rows) {
    const sets = fields.filter((f) => r[f] !== null && r[f] !== undefined && r[f] !== '')
      .map((f) => `${f} = ${val(r[f])}`);
    if (sets.length) { out.push(`update public.${table} set ${sets.join(', ')} where id = ${esc(r.id)};`); changed++; }
  }
  return { sql: out.join('\n') + (out.length ? '\n' : ''), changed };
}
const a = updates(acc, 'mf_accounts', ACC_FIELDS);
const c = updates(cats, 'mf_categories', CAT_FIELDS);
const g = updates(tags, 'mf_tags', TAG_FIELDS);
write('07_restore_fields.sql', a.sql + c.sql + g.sql);

/* 3) links de tag das extras (o 05 do gerador cobre só as dele) */
const extraIds = new Set(extra.map((t) => t.id));
const extraLinks = links.filter((l) => extraIds.has(l.transaction_id));
if (extraLinks.length) {
  const rows = extraLinks.map((l) => `(${esc(l.transaction_id)},${esc(l.tag_id)},${esc(l.user_id)})`);
  write('08_extra_links.sql',
    `INSERT INTO public.mf_transaction_tags (transaction_id, tag_id, user_id)\nVALUES\n${rows.join(',\n')}\nON CONFLICT DO NOTHING;\n`);
}

const sum = extra.reduce((s, t) => s + Number(t.amount), 0);
console.log(JSON.stringify({
  extras: extra.length,
  extrasSoma: Math.round(sum * 100) / 100,
  extrasComInvoiceClose: extra.filter((t) => t.invoice_close).length,
  extrasLinks: extraLinks.length,
  updates: { contas: a.changed, categorias: c.changed, tags: g.changed },
  geradorIds: genIds.size,
}, null, 1));
