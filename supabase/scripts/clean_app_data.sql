-- Limpa todos os dados da aplicação (multi-tenant), mantendo:
--   - auth.users e public.profiles (contas de login)
--   - public.alert_definitions (catálogo estático de alertas)
--
-- Não remove arquivos do Storage (bucket attachments); apague manualmente no
-- Supabase Storage se quiser zerar anexos também.
--
-- Execução: SQL Editor no dashboard do Supabase (como postgres / service role),
-- ou: npm run db:clean (requer DATABASE_URL no .env.local).

BEGIN;

SET LOCAL statement_timeout = '120s';

TRUNCATE TABLE
  public.transaction_tags,
  public.attachments,
  public.recurring_runs,
  public.income_source_runs,
  public.transactions,
  public.recurring_rules,
  public.income_sources,
  public.budgets,
  public.goals,
  public.month_snapshots,
  public.alerts,
  public.audit_logs,
  public.api_tokens,
  public.contacts,
  public.tags,
  public.categories,
  public.distribution_buckets,
  public.distributions,
  public.accounts,
  public.org_members,
  public.orgs
RESTART IDENTITY;

COMMIT;
