-- Limpeza completa do módulo Minhas Finanças (15 tabelas mf_*).
-- Todas as FKs são internas ao módulo (mf -> mf): um TRUNCATE único é seguro.
-- Schema/RLS permanecem (definidos em supabase/migrations).
truncate table
  public.mf_import_rows,
  public.mf_import_batches,
  public.mf_restore_points,
  public.mf_saved_reports,
  public.mf_budgets,
  public.mf_goal_contributions,
  public.mf_goals,
  public.mf_transaction_tags,
  public.mf_transactions,
  public.mf_categories,
  public.mf_tags,
  public.mf_accounts,
  public.mf_account_types,
  public.mf_responsibles,
  public.mf_profiles
restart identity;
