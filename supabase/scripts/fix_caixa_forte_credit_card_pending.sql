-- Correção pontual: despesas em cartão com vencimento (fatura) ainda no futuro
-- não devem estar como cleared/reconciled (evita "Pago" indevido no dashboard).
--
-- Ajuste o filtro da org se o nome for diferente de "Caixa forte".
-- Rode no SQL Editor do Supabase (revisar nome da org antes).

UPDATE transactions AS t
SET
  status = 'pending',
  updated_at = now()
FROM accounts AS a
JOIN orgs AS o ON o.id = a.org_id
WHERE t.account_id = a.id
  AND t.deleted_at IS NULL
  AND t.type = 'expense'
  AND (a.type = 'credit_card' OR a.is_credit_card = true)
  AND t.due_date IS NOT NULL
  AND t.due_date > CURRENT_DATE
  AND t.status IN ('cleared', 'reconciled')
  AND o.name ILIKE 'Caixa forte';
