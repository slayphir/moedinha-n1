# Relatório de Revisão do Projeto – Moedinha N1

Resumo da análise geral, testes realizados e melhorias sugeridas.

**Atualização:** As melhorias listadas abaixo foram implementadas (proteção do cron, correção de lint, documentação e build com lint/tipos ativos).

---

## 1. Estrutura do Projeto

- **Raiz** – App **Next.js 14** + Supabase (Auth, Postgres, Storage) na raiz do repositório: `src/`, `package.json`, `next.config.mjs`, etc. Deploy (Vercel) com Root Directory = raiz.
- **backend/** – Código Python (FastAPI) **não encontrado**: só há `__pycache__` e pastas vazias.
- **frontend/** – HTML/CSS/JS estático (legado ou alternativo).
- **supabase/** – Migrations e SQL (schema, RLS, etc.).

---

## 2. Testes Realizados (app na raiz)

| Item | Resultado |
|------|-----------|
| **Vitest** (`npm run test`) | 4 testes passando (goals.test.ts, reserves.test.ts) |
| **Build Next.js** (`npm run build`) | Sucesso; 25 rotas geradas |
| **ESLint** (`npm run lint`) | Vários erros (veja seção 4) |

O build está configurado com `eslint.ignoreDuringBuilds: true` e `typescript.ignoreBuildErrors: true`, por isso o build passa mesmo com erros de lint e tipo.

---

## 3. Segurança

- O **.env** na raiz contém credenciais reais (Supabase, Gemini). O `.gitignore` já ignora `.env`; **nunca** faça commit desse arquivo.
- Se o `.env` já tiver sido commitado no passado, **rotacione todas as chaves** no Supabase e no Google AI e atualize o `.env` apenas localmente.
- Endpoint **`/api/cron/telegram`** está **sem autenticação**. O código tem um trecho comentado que checaria `CRON_SECRET`. Em produção (ex.: Vercel Cron), é importante proteger esse endpoint (ex.: header `Authorization: Bearer CRON_SECRET`).

**Correções já feitas:** Ajustes no cron Telegram (imports e variáveis não usadas) e no `global-filter.tsx` (imports não usados e tipo `any`).

---

## 4. ESLint – Erros Encontrados

Resumo dos tipos de problema (ao rodar `npm run lint`):

- **Variáveis/imports não usados** – Vários arquivos (ex.: recurring-rule-dialog, financial-calendar, create-account-dialog, calendar.ts, ir-helper.ts, notifications.ts, metrics.ts, use-toast, date-range-picker).
- **`@typescript-eslint/no-explicit-any`** – Uso de `any` em create-org.ts, funding.ts, insights.ts, ir-helper.ts, goal-funding-widget, cash-flow-chart, global-filter, calendar.ts, insights-engine.
- **`react/no-unescaped-entities`** – Aspas `"` em texto JSX em metas-client, break-pig-dialog, goal-funding-widget (substituir por `&quot;` ou `{'"'}`).
- **`react-hooks/exhaustive-deps`** – Em `relatorios/ir/page.tsx`: `useEffect` com dependência faltando (`fetchData`).

**Sugestão:** Corrigir aos poucos (por pasta ou por tipo de regra) e, quando estável, remover `ignoreDuringBuilds` e `ignoreBuildErrors` no `next.config.mjs` para que o build exija lint e tipos corretos.

---

## 5. Melhorias Sugeridas

### 5.1 Imediatas

1. **Proteger o cron Telegram**  
   Descomentar e ativar a checagem de `CRON_SECRET` em `/api/cron/telegram/route.ts` e configurar o mesmo segredo no Vercel (ou no agendador que chama o endpoint).

2. **Documentação**  
   - Atualizar README/LEIA-ME/INSTALL para refletir apenas o fluxo **financeiro-lazy** (Next.js), ou documentar claramente que o backend Python está descontinuado/opcional.
   - Incluir no README: `npm install`, `npm run dev`, variáveis em `.env.example` e como obter as chaves do Supabase.

3. **Ambiente**  
   Manter apenas um `.env` de referência versionado (ex.: `.env.example` na raiz e/ou em `financeiro-lazy`), sem valores reais, e documentar cada variável.

### 5.2 Qualidade de Código

4. **Lint e tipos**  
   - Corrigir os erros de ESLint listados acima (remover não usados, trocar `any` por tipos adequados, escapar entidades em JSX, ajustar dependências de hooks).
   - Depois, desligar `ignoreDuringBuilds` e `ignoreBuildErrors` para que o build quebre em caso de regressão.

5. **Testes**  
   - Há apenas 2 arquivos de teste (goals, reserves). Vale ampliar para outras actions (ex.: distribution, funding, create-org) e para funções de `lib/` (ex.: `utils`, `distribution/metrics`, `insights-engine`).

6. **Validação de env no CI**  
   O script `scripts/validate-env.mjs` pode ser usado no pipeline (ex.: GitHub Actions) antes do build, garantindo que em deploy as variáveis obrigatórias estejam documentadas/checadas (sem expor valores).

### 5.3 Funcional e UX

7. **Página de relatório IR**  
   Corrigir o warning de dependência do `useEffect` em `relatorios/ir/page.tsx` (incluir `fetchData` no array de dependências ou envolver em `useCallback`).

8. **Calendário**  
   Em `financial-calendar.tsx` há variáveis e imports não usados; limpar para evitar confusão e manter o componente mais fácil de evoluir.

9. **Acessibilidade e i18n**  
   Revisar labels, roles e textos fixos em português; considerar preparar para i18n se houver plano de múltiplos idiomas.

### 5.4 Infra e Deploy

10. **Vercel**  
    - Root Directory = `financeiro-lazy`.  
    - Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (para o cron).  
    - Cron job para `/api/cron/telegram` (e outros, se houver) com o header de autorização configurado.

11. **Backend Python**  
    Se não for mais usado, remover referências em LEIA-ME, INSTALL e PROJETO_COMPLETO; se for usado, restaurar os arquivos `.py` em `backend/` e os scripts `install.bat`/`run.bat` a partir do que está documentado.

---

## 6. Resumo

| Área           | Status | Ação sugerida |
|----------------|--------|----------------|
| Build Next.js  | OK     | Manter; depois exigir lint e tipos no build |
| Testes unitários | Parcial | Aumentar cobertura (actions e lib) |
| Lint           | Com erros | Corrigir e tirar ignore no build |
| Segurança .env | Cuidado | Nunca commitar; rotacionar se já vazou |
| Cron Telegram  | Desprotegido | Ativar checagem de CRON_SECRET |
| Documentação   | Desatualizada | Alinhar ao fluxo financeiro-lazy (Next.js) |
| Backend Python | Ausente | Decidir: remover da doc ou restaurar código |

Se quiser, posso detalhar os passos para algum item específico (por exemplo: ativar CRON_SECRET, corrigir um arquivo de lint ou adicionar um teste).
