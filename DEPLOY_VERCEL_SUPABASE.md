# Deploy no Vercel com Supabase

Projeto **Financeiro Lazy** – Next.js 14 + Supabase (sem Python).

## 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Em **Settings → API** copie a **URL** e a **anon key**.

## 2. Configurar variáveis de ambiente no Vercel

No painel do projeto no Vercel: **Settings → Environment Variables**:

| Nome | Valor |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |

## 3. Deploy no Vercel

1. No [Vercel](https://vercel.com), **Add New → Project**.
2. Importe o repositório.
3. Defina **Root Directory** = `financeiro-lazy`.
4. Adicione as variáveis de ambiente.
5. Clique em **Deploy**.

### Ou pela CLI

```bash
cd financeiro-lazy
vercel
# Configure variáveis no dashboard
vercel --prod
```

## 4. Tabelas no Supabase

No Supabase: **SQL Editor** → execute na ordem:

1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_rls_policies.sql`
3. `supabase/migrations/00003_storage_bucket.sql`

## 5. Auth

- **Authentication → URL Configuration**: adicione em Redirect URLs:
  - `http://localhost:3000/auth/callback` (local)
  - `https://seu-dominio.vercel.app/auth/callback` (produção)

## 6. Rodar local

```bash
cd financeiro-lazy
npm install
# Crie .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Acesse: http://localhost:3000
