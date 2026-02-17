# Financeiro Lazy

Módulo web de controle financeiro com **mínimo de cliques**: FAB para novo lançamento, Command Palette (Ctrl+K), modal único para cadastro, sugestões por descrição e templates rápidos.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, TanStack Table, React Hook Form + Zod, Supabase (Auth, Postgres, Storage, RLS).

---

## Variáveis de ambiente

Crie `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
CRON_SECRET=um-segredo-forte-opcional-para-endpoints-cron
```

No Supabase: **Settings → API** → URL e anon key.

---

## Rodar local

1. Instale dependências:

```bash
npm install
```

2. Valide o ambiente:

```bash
npm run validate:env
npm run db:check
```

3. Configure o Supabase (veja abaixo) e rode as migrations.

4. Inicie o app:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Scripts de diagnostico

- `npm run validate:env` valida formato e placeholders das variaveis obrigatorias.
- `npm run db:check` testa conectividade com o endpoint Auth do Supabase.

---

## Configurar Supabase

### 1. Criar projeto

Em [supabase.com](https://supabase.com) crie um projeto e anote a URL e a **anon key**.

### 2. Migrations

No dashboard do Supabase: **SQL Editor** → New query. Execute na ordem:

1. Conteúdo de `supabase/migrations/00001_initial_schema.sql`
2. Conteúdo de `supabase/migrations/00002_rls_policies.sql`
3. Conteúdo de `supabase/migrations/00003_storage_bucket.sql`
4. Conteúdo de `supabase/migrations/00005_org_bootstrap_policy.sql`

(Opcional) Para seed de demo: `supabase/migrations/00004_seed_demo.sql` (ajuste o `SEED_USER_ID` após criar um usuário).

### 3. Auth

- **Authentication → Providers**: habilite Email (e opcionalmente outros).
- **URL Configuration**: em "Redirect URLs" adicione `http://localhost:3000/auth/callback` e, em produção, `https://seu-dominio.vercel.app/auth/callback`.

### 4. Storage

O bucket `attachments` é criado na migration 00003. RLS está configurado para pastas por `org_id`.

### 5. RLS

As policies garantem isolamento por organização e papéis (admin, financeiro, leitura). Nenhuma configuração extra necessária após rodar as migrations.

---

## Deploy no Vercel

1. Conecte o repositório ao Vercel.
2. Em **Settings → Environment Variables** defina:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Em **Redirect URLs** do Supabase (Auth), adicione a URL do projeto (ex.: `https://financeiro-lazy.vercel.app/auth/callback`).
4. Deploy.

Não é necessário build command ou output custom; o Next.js é detectado automaticamente.

---

## Uso

- **Login:** e-mail/senha (Supabase Auth).
- **Primeiro acesso:** crie uma organização (onboarding).
- **Dashboard:** Saldo em Órbita, receitas/despesas do mês, fluxo de caixa (90 dias), despesas por categoria, insights e painel de gamificação (nível, XP, missões e conquistas).
- **Lançamentos:** lista com filtro e busca; botão **+** (FAB) ou Command Palette (**Ctrl+K**) para novo lançamento em um único modal.
- **Cadastros:** abas Contas, Categorias, Tags (e futuramente regras recorrentes).
- **Configurações:** organização, usuários, integrações (em breve).

### Embed

- URL: `/embed?token=SEU_TOKEN`.
- O token deve corresponder a um `token_hash` em `api_tokens` (criado por admin na org). Para demo, pode-se inserir um registro em `api_tokens` com `token_hash` = valor que você usar na URL.

### API (para sistema existente)

- **POST /api/transactions** – criar lançamento (body JSON com `org_id`, `type`, `amount`, `date`, `account_id`, etc.). Requer sessão Supabase (cookie).
- **GET /api/kpis?org_id=UUID** – retorna `saldo_orbita`, `receitas_mes`, `despesas_mes`, `resultado_mes`. Requer sessão e que o usuário seja membro da org.

Webhooks (transaction.created, budget.alert, etc.) podem ser implementados via Supabase Database Webhooks ou Edge Functions.

---

## Estrutura principal

```
src/
  app/
    page.tsx              # Login ou redirect
    (dashboard)/          # Layout com shell + org
      dashboard/          # /dashboard, /dashboard/lancamentos, etc.
    auth/callback/        # OAuth callback
    onboarding/           # Criar org
    embed/                # /embed?token=...
    api/
      transactions/       # POST criar
      kpis/               # GET KPIs
  components/
    ui/                   # shadcn-style
    dashboard/
    transactions/
    command-palette/
  lib/
    supabase/
    types/
  contexts/
  app/actions/
supabase/migrations/      # SQL + RLS
```

---

## Segurança

- RLS ativo em todas as tabelas; políticas por org e role.
- Validação server-side com Zod nas APIs e server actions.
- Não exponha a `service_role` key no front; use apenas `anon` key com RLS.
