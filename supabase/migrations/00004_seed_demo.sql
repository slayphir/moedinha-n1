-- Seed opcional para demo (rodar manualmente após criar primeiro usuário)
-- Uso: substitua 'SEED_USER_ID' pelo auth.uid() do usuário após signup.

-- Exemplo (descomente e ajuste USER_ID):
/*
DO $$
DECLARE
  uid UUID := 'SEED_USER_ID';
  oid UUID;
  aid UUID;
  cid_inc UUID;
  cid_exp UUID;
  tid UUID;
BEGIN
  INSERT INTO orgs (id, name, slug) VALUES
    (uuid_generate_v4(), 'Minha Empresa', 'minha-empresa')
    RETURNING id INTO oid;

  INSERT INTO org_members (org_id, user_id, role) VALUES (oid, uid, 'admin');

  INSERT INTO profiles (id, full_name) VALUES (uid, 'Usuário Demo') ON CONFLICT (id) DO UPDATE SET full_name = 'Usuário Demo';

  INSERT INTO accounts (org_id, name, type) VALUES
    (oid, 'Conta Corrente', 'bank'),
    (oid, 'Cartão de Crédito', 'credit_card'),
    (oid, 'Carteira', 'cash')
    RETURNING id INTO aid;

  SELECT id INTO cid_inc FROM categories WHERE org_id = oid AND type = 'income' LIMIT 1;
  IF cid_inc IS NULL THEN
    INSERT INTO categories (org_id, name, type) VALUES (oid, 'Salário', 'income'), (oid, 'Outros', 'income') RETURNING id INTO cid_inc;
  END IF;
  INSERT INTO categories (org_id, name, type) VALUES (oid, 'Alimentação', 'expense'), (oid, 'Transporte', 'expense'), (oid, 'Moradia', 'expense'), (oid, 'Lazer', 'expense') ON CONFLICT DO NOTHING;
  SELECT id INTO cid_exp FROM categories WHERE org_id = oid AND type = 'expense' LIMIT 1;

  INSERT INTO transactions (org_id, type, status, amount, account_id, category_id, description, date, created_by)
  VALUES
    (oid, 'income', 'cleared', 5000, aid, cid_inc, 'Salário', date_trunc('month', current_date)::date + 4, uid),
    (oid, 'expense', 'cleared', -1200, aid, cid_exp, 'Aluguel', date_trunc('month', current_date)::date + 5, uid),
    (oid, 'expense', 'cleared', -150, aid, cid_exp, 'Internet', current_date - 2, uid);
END $$;
*/
