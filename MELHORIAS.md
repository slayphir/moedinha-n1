# Melhorias sugeridas – Moedinha N1

Lista objetiva de melhorias por prioridade. Marque ou implemente conforme a necessidade.

---

## Alta prioridade (segurança e consistência)

| # | Melhoria | Onde | Benefício |
|---|----------|------|-----------|
| 1 | **Proteger cron Telegram** | `src/app/api/cron/telegram/route.ts` | Exigir header `Authorization` ou `CRON_SECRET` para evitar chamadas públicas. |
| 2 | **Exigir lint e tipos no build** | `next.config.mjs` | Desligar `ignoreDuringBuilds` e `ignoreBuildErrors` após corrigir erros; build passa a garantir qualidade. |
| 3 | **.env.example** | Raiz do projeto | Arquivo versionado com variáveis esperadas (sem valores), documentando o que configurar. |

---

## Média prioridade (UX e funcional)

| # | Melhoria | Onde | Benefício |
|---|----------|------|-----------|
| 4 | **Filtro por contato nos lançamentos** | Página Lançamentos | Ver só “Empréstimos Renato” ou “Tudo que fulano me pagou”. |
| 5 | **Confiabilidade na lista de Contatos** | Cadastros > Contatos | Badge (paga em dia / atrasa / deixou de pagar) ao lado do nome na tabela. |
| 6 | **Relatório IR – dependência do useEffect** | `src/app/(dashboard)/dashboard/relatorios/ir/page.tsx` | Corrigir warning; incluir `fetchData` em deps ou usar `useCallback`. |
| 7 | **Atalho “Receita rápida”** | Command palette / FAB | Abrir modal já em aba Receita e, se possível, com última categoria de receita. |
| 8 | **Exportar Terceiros** | Página Terceiros | Botão para exportar (CSV/Excel) saldos por contato. |

---

## Baixa prioridade (qualidade e manutenção)

| # | Melhoria | Onde | Benefício |
|---|----------|------|-----------|
| 9 | **Corrigir ESLint** | Vários arquivos | Remover imports não usados, trocar `any` por tipos, escapar entidades em JSX, ajustar deps de hooks. |
| 10 | **Mais testes** | `src/app/actions/`, `src/lib/` | Testes para funding, distribution, classification (signedAmount, sumReceitas). |
| 11 | **README alinhado ao projeto** | `README.md` | Instalação, `.env`, migrations e deploy só do app Next.js (sem referência a backend Python se não existir). |
| 12 | **Acessibilidade** | Componentes do dashboard | Revisar labels, roles e contraste para leitores de tela. |

---

## Sugestões de KPIs (dashboard / relatórios)

| KPI | Descrição | Onde |
|-----|------------|------|
| **Taxa de poupança** | % da receita que “sobrou” (resultado / receitas). Ex.: “Você poupou 15% da receita este mês.” | Card no dashboard ou junto ao Resultado |
| **Dias de caixa** | Quantos dias o saldo atual cobre as despesas (saldo ÷ despesa média diária do mês). Ex.: “Seu caixa cobre 42 dias de gastos.” | Card no dashboard |
| **A receber de terceiros** | Total que terceiros te devem (resumo da página Terceiros). | Mini card no dashboard ou na barra de KPIs |
| **Pendentes** | Valor total de lançamentos com status “pendente” (a pagar). | Card ou badge junto a Despesas |
| **Maior categoria** | Nome e valor da categoria que mais gastou no mês. Ex.: “Maior gasto: Alimentação (R$ 1.200).” | Uma linha ou card no dashboard |
| **Projeção fim do mês** | Saldo projetado no último dia do mês (saldo hoje + receitas previstas − despesas no ritmo atual). | Card ou na área de Fluxo de caixa |
| **Fixas vs variáveis** | Valor (ou %) de despesas fixas vs variáveis no mês (já existe em relatórios; poderia virar card). | Card no dashboard |
| **Meta do mês (metas)** | “Separou R$ X de R$ Y para metas” (complementa a Automação de Metas). | Card ou junto à Automação de Metas |

---

## Mais melhorias (backlog)

### Terceiros e contatos
| # | Melhoria | Benefício |
|---|----------|-----------|
| 13 | **Alerta de terceiros em risco** | No dashboard ou Terceiros: aviso quando alguém com saldo “te deve” tem confiabilidade “deixou de pagar” ou “atrasa com frequência”. |
| 14 | **Lembrete de empréstimo** | Opção de data “previsão de devolução” no contato ou no lançamento; lembrete (notificação ou e-mail) próximo à data. |
| 15 | **Histórico por contato** | Na página Terceiros, clicar no nome e ver lista de lançamentos (eu paguei / me pagou) daquele contato. |

### Lançamentos e categorias
| # | Melhoria | Benefício |
|---|----------|-----------|
| 16 | **Duplicar lançamento** | Botão “Duplicar” no editar: cria novo com mesma descrição, valor, categoria e contato; só ajusta data. |
| 17 | **Templates de lançamento** | Salvar combinação categoria + contato + valor fixo (ex.: “Aluguel”, “Parcela João”) e criar em um clique. |
| 18 | **Busca por descrição/tag** | Campo de busca na lista de lançamentos (por texto ou tag) além dos filtros atuais. |

### Dashboard e relatórios
| # | Melhoria | Benefício |
|---|----------|-----------|
| 19 | **Comparativo mensal** | Gráfico ou tabela: receitas e despesas mês a mês (últimos 6 ou 12 meses). |
| 20 | **Evolução do saldo** | Linha do tempo do saldo no período (já existe fluxo 90d? alinhar rótulos e tooltip). |
| 21 | **Relatório por categoria** | Página ou export: total por categoria no período (despesas e receitas separados). |
| 22 | **Filtros salvos** | Salvar “Só cartão X” ou “Março 2026” como filtro nomeado e reaplicar com um clique. |

### Metas e distribuição
| # | Melhoria | Benefício |
|---|----------|-----------|
| 23 | **Barra de progresso nas metas** | Card de cada meta com barra visual (atingido / alvo) no dashboard ou na página Metas. |
| 24 | **Aporte sugerido por meta** | “Faltam R$ X para bater a meta Y; sugerido R$ Z este mês” com link para Separar. |
| 25 | **Resumo da distribuição no dashboard** | Um card com “Gasto por bucket este mês” (ou % do orçamento) sem sair do painel. |

### Cartões e faturas
| # | Melhoria | Benefício |
|---|----------|-----------|
| 26 | **Aviso de fechamento de fatura** | Lembrete X dias antes do fechamento (ex.: “Fatura Santander fecha em 3 dias”). |
| 27 | **Total da fatura no menu** | Ao lado de “Faturas” ou no dropdown, valor total a pagar no mês (somando faturas abertas). |

### Geral e técnico
| # | Melhoria | Benefício |
|---|----------|-----------|
| 28 | **Backup / export completo** | Exportar contas, lançamentos, categorias, contatos (JSON ou CSV) para backup ou migração. |
| 29 | **Modo offline básico** | PWA com cache: ver último saldo e últimos lançamentos sem internet. |
| 30 | **Notificações no navegador** | Pedir permissão e enviar lembretes (ex.: “Separar para metas”, “Fatura próxima”) via Web Push. |

---

## Já implementado (referência)

- Regra única receita/despesa (contato + categoria “Esta pessoa me paga”) em dashboard, KPIs, cofre, distribuição e automação de metas.
- Campo “Confiabilidade no pagamento” em contatos e exibição em Terceiros.
- Categoria “Esta pessoa me paga” para tipo Receita; ao editar lançamento com contato + essa categoria, grava como receita no banco.
- Emojis do cumprimento (Bom dia / Boa tarde / Boa noite) corrigidos no Painel Principal.
- Automação de Metas usando a mesma base de receitas e período do card Receitas.
- Itens 1, 3 a 8: cron protegido, .env.example, filtro contato, badge confiabilidade, IR ok, atalho receita, export CSV Terceiros; item 10 parcial: testes classification. Validação: VALIDACAO_MELHORIAS.md.

---

Para implementar algum item, diga o número (ex.: “implementar 1 e 4”) ou descreva o que quer primeiro. Itens 13–30 são backlog para quando as prioridades altas/médias estiverem resolvidas.
