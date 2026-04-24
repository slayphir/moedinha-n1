-- Agregação no banco para o previsto de compromissos (igual ao SQL manual no Editor):
-- type = expense, status in (pending, cleared, reconciled), deleted_at is null,
-- e (due_date entre início/fim do mês) OU (due_date is null e date entre início/fim do mês).
-- p_month: qualquer dia do mês alvo (normaliza com date_trunc).

CREATE OR REPLACE FUNCTION public.forecast_commitments_tx_total(p_org_id uuid, p_month date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('month', p_month)::date AS month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date AS month_end
  )
  SELECT COALESCE(SUM(ABS(t.amount)), 0)::numeric
  FROM public.transactions t
  CROSS JOIN bounds b
  WHERE t.org_id = p_org_id
    AND t.deleted_at IS NULL
    AND t.type = 'expense'
    AND t.status IN ('pending', 'cleared', 'reconciled')
    AND (
      (t.due_date IS NOT NULL AND t.due_date >= b.month_start AND t.due_date <= b.month_end)
      OR (t.due_date IS NULL AND t.date >= b.month_start AND t.date <= b.month_end)
    );
$$;

COMMENT ON FUNCTION public.forecast_commitments_tx_total(uuid, date) IS
  'Previsto de compromissos por mês civil: soma abs(amount) com due_date no mês ou à vista (date) no mês.';

GRANT EXECUTE ON FUNCTION public.forecast_commitments_tx_total(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forecast_commitments_tx_total(uuid, date) TO service_role;
