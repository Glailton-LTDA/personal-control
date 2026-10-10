-- Ícone (marca/genérico) e bandeira do cartão para a identidade visual das contas.
alter table public.mf_accounts
  add column if not exists icon text,
  add column if not exists card_brand text;

comment on column public.mf_accounts.icon is
  'Chave do ícone: brand:<marca> (logotipo embutido), glyph:<lucide> (genérico) ou NULL (inicial com a cor da conta).';
comment on column public.mf_accounts.card_brand is
  'Bandeira do cartão: visa, mastercard, elo, amex, hipercard, outro ou NULL.';
