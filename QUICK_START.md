# ⚡ Guia Rápido - Sistema Financeiro (Vercel + Supabase)

## 🚀 Início Rápido (5 minutos)

### 1️⃣ Instale o Node.js
- Baixe em: https://nodejs.org (LTS)

### 2️⃣ Instale o projeto
```bash
npm install
```
(na raiz do repositório)

### 3️⃣ Configure o Supabase
Crie `.env.local` na raiz do projeto com:
```
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

Execute as migrations SQL no Supabase (SQL Editor), **na ordem abaixo** (cada arquivo em `supabase/migrations/`):

1. `00001_initial_schema.sql`
2. `00002_rls_policies.sql`
3. `00003_storage_bucket.sql`
4. `00004_seed_demo.sql` (opcional – dados de demonstração)
5. `00005_org_bootstrap_policy.sql`
6. `00005_distribuicao_alertas.sql`
7. `00006_credit_card_fields.sql`
8. `00007_emergency_reserve.sql`
9. `00008_emergency_goal_unique.sql`
10. `00009_create_contacts_table.sql`
11. `00010_setup_wizard_fields.sql`
12. `00010_transactions_optional_fields.sql`
13. `00011_add_contact_id_to_transactions.sql`
14. `00012_balance_start_date.sql`
15. `00013_income_sources.sql`
16. `00014_last_consolidated_month.sql`
17. `00015_categories_is_creditor_center.sql`
18. `00016_contacts_payment_reliability.sql`

### 4️⃣ Inicie o Sistema
```bash
npm run dev
```

### 5️⃣ Acesse
Abra seu navegador em: **http://localhost:3000**

---

## 📊 Funcionalidades

- **Dashboard** – Saldo em Órbita, receitas/despesas do mês, gráficos
- **Lançamentos** – Adicionar via FAB ou Command Palette (Ctrl+K)
- **Cadastros** – Contas, Categorias, Tags (em abas)
- **Relatórios** – Análises e comparativos
- **Configurações** – Organização, integrações

---

## ☁️ Deploy no Vercel

1. Conecte o repositório ao Vercel
2. Root Directory = raiz do repositório (padrão)
3. Adicione variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

Documentação completa: `README.md`
