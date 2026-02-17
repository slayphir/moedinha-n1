# Especificação: Módulo Distribuição + Alertas (Cofre Clássico)

## 1. Modelo de dados

### Tabelas

| Tabela | Propósito |
|--------|-----------|
| `distributions` | Template de distribuição por org: nome, modo (auto/manual), base de renda, ativo por período. |
| `distribution_buckets` | Buckets de uma distribution: nome, percent_bps (2–8 buckets, soma = 10000), color, icon, sort_order, is_flexible. |
| `categories.default_bucket_id` | Mapeamento categoria → bucket (default). |
| `transactions.bucket_id` | Bucket da transação (inferido por categoria ou override). |
| `month_snapshots` | Pré-agregação por org/mês: base_income, base_income_mode, bucket_data (budget, spend, pace_ideal, projection), computed_at. |
| `alerts` | Instância de alerta: org_id, user_id, month, alert_code, severity, message, context_json, cta_primary/cta_secondary, created_at, acknowledged_at, snoozed_until. |
| `alert_definitions` | Catálogo estático: code, name, severity, condition_expression, cooldown_hours, hysteresis_pct, message_template, cta. |

### Regras de negócio

- **Transferências** (`type = 'transfer'`) não entram no gasto de bucket.
- Percentuais em **basis points**: 100% = 10000. UI exibe 2 decimais; persistência apenas percent_bps.
- **2 a 8 buckets** por distribution; soma obrigatória 10000.
- Salvar distribuição só quando `validateDistributionSum(buckets) === true`.

### Exemplo JSON distribution_buckets (basis points)

```json
[
  { "id": "uuid-1", "distribution_id": "uuid-d", "name": "Necessidades", "percent_bps": 5000, "color": "#2E9F62", "icon": "home", "sort_order": 1, "is_flexible": false },
  { "id": "uuid-2", "distribution_id": "uuid-d", "name": "Desejos", "percent_bps": 3000, "color": "#F1C31E", "icon": "gift", "sort_order": 2, "is_flexible": true },
  { "id": "uuid-3", "distribution_id": "uuid-d", "name": "Metas", "percent_bps": 2000, "color": "#4D79AE", "icon": "target", "sort_order": 3, "is_flexible": false }
]
```

### Exemplo month_snapshots (bucket_data)

```json
{
  "org_id": "...",
  "month": "2025-02-01",
  "base_income": 8000,
  "base_income_mode": "current_month",
  "bucket_data": [
    { "bucket_id": "uuid-1", "budget": 4000, "spend": 2100, "spend_pct": 52.5, "pace_ideal": 1800, "projection": 4200 }
  ],
  "computed_at": "2025-02-15T10:00:00Z"
}
```

---

## 2. Pseudocódigo

### Validação soma 100% (basis points)

```
function validateDistributionSum(buckets): boolean
  total = sum(b.percent_bps for b in buckets)
  return total == 10000
```

### Normalizar para 100% (modo manual)

```
function normalizeDistribution(buckets):
  total = sum(b.percent_bps for b in buckets)
  if total == 0 then return
  factor = 10000 / total
  for i = 0 to len(buckets)-2: buckets[i].percent_bps = round(buckets[i].percent_bps * factor)
  buckets[last].percent_bps = 10000 - sum(buckets[0..-2].percent_bps)
```

### Auto-balance ao editar um bucket

```
function autoBalanceOnEdit(buckets, editedId, newBps, strategy):
  others = buckets filter id != editedId
  sumOthers = sum(o.percent_bps for o in others)
  delta = 10000 - (sumOthers + newBps)
  if strategy == "flexible":
    flexible = others find is_flexible == true
    flexible.percent_bps = max(0, flexible.percent_bps + delta)
  else if strategy == "proportional":
    totalOther = sumOthers
    for o in others: o.percent_bps = round(o.percent_bps + o.percent_bps / totalOther * delta)
  apply rounding fix on last bucket so sum == 10000
```

### computeMonthlyMetrics(orgId, month)

```
function computeMonthlyMetrics(orgId, month):
  baseIncome = getBaseIncome(orgId, month)  // current_month | avg_3m | avg_6m | planned_manual
  distribution = getActiveDistribution(orgId, month)
  daysInMonth = daysIn(month)
  dayPassed = min(today(), endOf(month)) - startOf(month) + 1
  dayRatio = dayPassed / daysInMonth
  for bucket in distribution.buckets:
    budget[bucket.id] = baseIncome * (bucket.percent_bps / 10000)
    spend[bucket.id] = sum(transactions where org_id, month, type=expense, bucket_id=bucket.id, not transfer)
    paceIdeal[bucket.id] = budget[bucket.id] * dayRatio
    projection[bucket.id] = spend[bucket.id] / dayPassed * daysInMonth
  return { baseIncome, buckets: { budget, spend, paceIdeal, projection }, dayRatio }
```

### generateAlerts(orgId, month, metrics, history)

```
function generateAlerts(orgId, month, metrics, history):
  for rule in alert_definitions:
    if not condition(rule, metrics, history): continue
    if cooldown(rule, lastAlert(orgId, rule.code)): continue
    if hysteresis(rule, lastAlert, metrics): continue
    emit alert(rule, metrics, cta_primary, cta_secondary)
```

- **Cooldown:** ex. 24h por `alert_definitions.code`.
- **Histerese:** reemitir só se variação >= hysteresis_pct (ex. 5%).

---

## 3. Checklist de auditoria

| Item | Existe? | Evidência / Fonte | Prioridade |
|------|---------|-------------------|------------|
| Distribuição configurável (2–8 buckets) | Sim | CRUD distributions + distribution_buckets | P0 |
| Soma obrigatória 100% (basis points) | Sim | Validação no save; UI em % com 2 decimais | P0 |
| Modo auto-balance e manual + botão Normalizar | Sim | Tela de edição com toggle e estratégia S1/S2 | P0 |
| Base de renda configurável | Sim | distribution.base_income_mode / planned_income | P0 |
| Mapeamento categoria → bucket + pendências | Sim | categories.default_bucket_id; tela Reclassificar | P0 |
| Métricas por bucket (orçado, gasto, %, ritmo, projeção) | Sim | computeMonthlyMetrics + month_snapshots | P0 |
| Feed de alertas com severidade e CTA | Sim | alerts + componente Feed no dashboard | P0 |
| Cooldown/histerese/deduplicação de alertas | Sim | alert_definitions + generateAlerts | P1 |
| Dashboard com widgets (sem gamificação) | Sim | Widgets de distribuição; gamificação em /dashboard/cofre | P0 |
| Módulo gamificação em rota própria | Sim | /dashboard/cofre | P0 |

---

## 4. Catálogo de alertas (base)

| Code | Condição | Severidade | Mensagem (ex.) | CTA | Cooldown |
|------|----------|------------|----------------|-----|----------|
| bucket_70 | spend_pct >= 70 | warn | "{bucket} atingiu 70% do orçamento." | Ajustar orçamento / Reclassificar | 24h |
| bucket_90 | spend_pct >= 90 | warn | "{bucket} atingiu 90% do orçamento." | Ajustar orçamento | 24h |
| bucket_over | spend_pct >= 100 | critical | "{bucket} estourou o orçamento." | Ajustar distribuição | 12h |
| pace_15 | (spend - pace_ideal) / pace_ideal >= 0.15 | warn | "Gasto em {bucket} está 15% acima do ritmo ideal." | Ver transações | 24h |
| pace_30 | idem >= 0.30 | critical | "Gasto em {bucket} está 30% acima do ritmo ideal." | Ajustar orçamento | 24h |
| projection | projection_pct >= 90 ou 100 | warn/critical | "Se continuar assim, {bucket} fecha em {projection_pct}%." | Ajustar gastos | 24h |
| concentration_bucket | share do bucket no gasto total > 60% | warn | "Um bucket representa mais de 60% dos gastos." | Ver distribuição | 24h |
| concentration_top5 | top 5 transações > 50% gasto do bucket | warn | "Poucas transações concentram mais da metade do gasto em {bucket}." | Ver transações | 24h |
| pending_pct | despesas sem bucket > 10% | warn | "Mais de 10% das despesas sem bucket." | Reclassificar pendentes | 24h |
| pending_count | transações sem bucket >= 20 no mês | warn | "20+ transações sem categoria/bucket neste mês." | Reclassificar pendentes | 24h |

---

## 5. Métricas e widgets do dashboard

### Estado por bucket

- **OK:** spend_pct < 70
- **Warning:** 70 <= spend_pct < 90 ou pace/projection em faixa de alerta
- **Critical:** spend_pct >= 90 ou estouro

### Fórmulas

- Orçamento bucket: `base_income * (percent_bps / 10000)`
- Ritmo ideal: `budget * (dias_decorridos / dias_mês)`
- Projeção simples: `gasto_ate_hoje / dias_decorridos * dias_mês`
- % usado: `spend / budget * 100`

### Widgets obrigatórios

1. **Resumo da distribuição do mês** — por bucket: orçamento (R$), gasto (R$), % usado, barra 70/90/100, status OK/warn/critical.
2. **Ritmo do mês** — gasto total vs ritmo ideal; projeção de fechamento (R$ e %).
3. **Comparativo mês atual vs média 3 meses** — por bucket: variação % e R$.
4. **Top drivers** — top 3 categorias por bucket; top transações do mês.
5. **Pendências** — contagem e link para transações sem bucket/categoria.
6. **Feed de alertas** — últimos alertas com severidade, mensagem e CTA.

### Fonte de dados

Todos os dados do dashboard vêm de **month_snapshots** + queries leves (ou cache revalidate). Sem gamificação (XP, moedas, streak) no dashboard.

---

## 6. UX da tela de distribuição

- **Modo Auto-balance (default):** ao alterar percentual de um bucket, redistribuir o delta nos demais (S1: só bucket flexível; S2: proporcional). Total sempre 100%; Salvar habilitado.
- **Modo Manual:** usuário edita livremente; exibir "Faltam X%" ou "Sobram Y%" (10000 - sum em bps); botão "Normalizar para 100%"; Salvar desabilitado enquanto `sum(percent_bps) != 10000`.
- Limite: 2 a N buckets (N configurável, ex. 8). UI: percentuais com 2 casas decimais; persistência em basis points.

---

## 7. Performance (Vercel)

- **Request leve:** dashboard não calcula métricas pesadas na hora. Usar **month_snapshots**; preencher/atualizar via Server Action ou cron.
- **Cache:** `revalidate = 60` (ou 300) na página do dashboard.
- **Cálculo de métricas:** rodar em cron (ex. 1x/dia) ou após eventos relevantes (nova transação, mudança de distribuição) com debounce; escrever em `month_snapshots`.
- **Alertas:** geração em job agendado (ou após atualização de snapshot); ler `month_snapshots` + transações agregadas; inserir em `alerts` com cooldown/histerese.
- **Índices:** `transactions(org_id, date, type, bucket_id)`, `month_snapshots(org_id, month)`, `alerts(org_id, month, created_at)`.
