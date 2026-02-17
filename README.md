# Financeiro Lazy

MÃ³dulo web de controle financeiro com **mÃ­nimo de cliques**: FAB para novo lanÃ§amento, Command Palette (Ctrl+K), modal Ãºnico para cadastro, sugestÃµes por descriÃ§Ã£o e templates rÃ¡pidos.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, TanStack Table, React Hook Form + Zod, Supabase (Auth, Postgres, Storage, RLS).

---

## VariÃ¡veis de ambiente

Crie `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
CRON_SECRET=um-segredo-forte-opcional-para-endpoints-cron
```

No Supabase: **Settings â†’ API** â†’ URL e anon key.

---

## Rodar local

1. Instale dependÃªncias:

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
- `npm run db:bundle` gera o SQL unico `SETUP_DB.sql` a partir de `supabase/migrations/*`.

---

## Configurar Supabase

### 1. Criar projeto

Em [supabase.com](https://supabase.com) crie um projeto e anote a URL e a **anon key**.

### 2. Migrations

Padrao oficial: execute somente **um SQL unico**.

No dashboard do Supabase: **SQL Editor** -> New query:

1. Cole e execute todo o conteudo de `SETUP_DB.sql`.

Esse arquivo e gerado automaticamente a partir de `supabase/migrations/*` e e o setup padrao para ambiente novo.

Se voce alterar uma migration, regenere o SQL unico com:

```bash
npm run db:bundle
```

(Opcional) Para seed de demo: `supabase/migrations/00004_seed_demo.sql` (ajuste o `SEED_USER_ID` apos criar um usuario).

### 3. Auth

- **Authentication â†’ Providers**: habilite Email (e opcionalmente outros).
- **URL Configuration**: em "Redirect URLs" adicione `http://localhost:3000/auth/callback` e, em produÃ§Ã£o, `https://seu-dominio.vercel.app/auth/callback`.

### 4. Storage

O bucket `attachments` Ã© criado na migration 00003. RLS estÃ¡ configurado para pastas por `org_id`.

### 5. RLS

As policies garantem isolamento por organizaÃ§Ã£o e papÃ©is (admin, financeiro, leitura). Nenhuma configuraÃ§Ã£o extra necessÃ¡ria apÃ³s rodar as migrations.

---

## Deploy no Vercel

1. Conecte o repositÃ³rio ao Vercel.
2. Em **Settings â†’ Environment Variables** defina:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Em **Redirect URLs** do Supabase (Auth), adicione a URL do projeto (ex.: `https://financeiro-lazy.vercel.app/auth/callback`).
4. Deploy.

NÃ£o Ã© necessÃ¡rio build command ou output custom; o Next.js Ã© detectado automaticamente.

---

## Uso

- **Login:** e-mail/senha (Supabase Auth).
- **Primeiro acesso:** crie uma organizaÃ§Ã£o (onboarding).
- **Dashboard:** Saldo em Ã“rbita, receitas/despesas do mÃªs, fluxo de caixa (90 dias), despesas por categoria, insights e painel de gamificaÃ§Ã£o (nÃ­vel, XP, missÃµes e conquistas).
- **LanÃ§amentos:** lista com filtro e busca; botÃ£o **+** (FAB) ou Command Palette (**Ctrl+K**) para novo lanÃ§amento em um Ãºnico modal.
- **Cadastros:** abas Contas, Categorias, Tags (e futuramente regras recorrentes).
- **ConfiguraÃ§Ãµes:** organizaÃ§Ã£o, usuÃ¡rios, integraÃ§Ãµes (em breve).

### Embed

- URL: `/embed?token=SEU_TOKEN`.
- O token deve corresponder a um `token_hash` em `api_tokens` (criado por admin na org). Para demo, pode-se inserir um registro em `api_tokens` com `token_hash` = valor que vocÃª usar na URL.

### API (para sistema existente)

- **POST /api/transactions** â€“ criar lanÃ§amento (body JSON com `org_id`, `type`, `amount`, `date`, `account_id`, etc.). Requer sessÃ£o Supabase (cookie).
- **GET /api/kpis?org_id=UUID** â€“ retorna `saldo_orbita`, `receitas_mes`, `despesas_mes`, `resultado_mes`. Requer sessÃ£o e que o usuÃ¡rio seja membro da org.

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

## SeguranÃ§a

- RLS ativo em todas as tabelas; polÃ­ticas por org e role.
- ValidaÃ§Ã£o server-side com Zod nas APIs e server actions.
- NÃ£o exponha a `service_role` key no front; use apenas `anon` key com RLS.


