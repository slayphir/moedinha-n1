# Validação das melhorias implementadas

Como validar cada item após implementação.

---

## Item 1 – Cron Telegram protegido

**O que foi feito:** Em produção (Vercel), o endpoint exige `CRON_SECRET`; se não estiver configurado, retorna 503. Se estiver configurado, exige header `Authorization: Bearer <CRON_SECRET>`.

**Validação:**
1. Sem header: `curl -s -o /dev/null -w "%{http_code}" https://seu-app.vercel.app/api/cron/telegram` → deve retornar **401** (ou 503 se CRON_SECRET não estiver definido no Vercel).
2. Com header: `curl -s -H "Authorization: Bearer SEU_CRON_SECRET" https://seu-app.vercel.app/api/cron/telegram` → deve retornar **200** e JSON com `success: true`.

---

## Item 3 – .env.example

**O que foi feito:** Arquivo `.env.example` na raiz com variáveis documentadas (sem valores sensíveis).

**Validação:** Abra `.env.example` e confira: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` e comentários.

---

## Item 4 – Filtro por contato nos lançamentos

**O que foi feito:** Na página Lançamentos, dropdown "Todos os contatos" / contato específico; query filtra por `contact_id`; coluna "Contato" na tabela.

**Validação:**
1. Acesse **Dashboard → Lançamentos**.
2. Use o dropdown ao lado de "Limpar mês" e selecione um contato que tenha lançamentos.
3. A lista deve mostrar apenas lançamentos daquele contato e a coluna "Contato" preenchida.
4. Volte para "Todos os contatos" e a lista deve voltar ao normal.

---

## Item 5 – Badge confiabilidade na lista de Contatos

**O que foi feito:** Em **Cadastros → Contatos**, cada contato exibe um badge com o nível de confiabilidade (Paga em dia, Atrasa às vezes, etc.).

**Validação:**
1. Acesse **Cadastros → aba Contatos**.
2. Contatos com "Confiabilidade no pagamento" preenchida devem mostrar o badge ao lado do nome.
3. Edite um contato e altere a confiabilidade; ao salvar, o badge deve atualizar.

---

## Item 6 – Relatório IR (useEffect)

**O que foi feito:** O relatório IR já usava `useCallback(fetchData, [year])` e `useEffect(..., [fetchData])`, então a dependência está correta.

**Validação:** Acesse **Relatórios → IR**, mude o ano no select e confira se os dados são recarregados sem warning no console.

---

## Item 7 – Atalho Receita rápida

**O que foi feito:** O command palette (Ctrl+K) já possui "Adicionar receita", que abre o modal com aba **Receita** selecionada.

**Validação:** Pressione **Ctrl+K**, escolha "Adicionar receita" e confira se o modal abre na aba Receita (não Despesa).

---

## Item 8 – Exportar Terceiros CSV

**O que foi feito:** Na página **Terceiros**, botão "Exportar CSV" no card "Saldo por contato"; gera arquivo com Contato, Confiabilidade, Eu paguei por ela, Ela me pagou, Saldo.

**Validação:**
1. Acesse **Dashboard → Terceiros** (com pelo menos um contato com movimento).
2. Clique em **Exportar CSV**.
3. Deve baixar um arquivo `terceiros-YYYY-MM-DD.csv` com cabeçalho e linhas; abra no Excel/LibreOffice e confira encoding UTF-8 (BOM).

---

## Testes (Item 10 – parcial)

**O que foi feito:** Testes para `src/lib/transactions/classification.ts` (signedAmount, isReceita, isDespesa, sumReceitas, sumDespesas).

**Validação:** Execute `npm run test -- --run src/lib/transactions/classification.test.ts` → todos os testes devem passar.

---

## Build

**Validação geral:** `npm run build` deve concluir sem erro. (Lint e tipos continuam com `ignoreDuringBuilds` / `ignoreBuildErrors` até que itens 2 e 9 sejam aplicados.)
