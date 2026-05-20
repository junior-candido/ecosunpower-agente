# Módulo 6 — Alerta Proativo da Carteira

**Data:** 2026-05-20
**Status:** design aprovado, aguardando plano de execução
**Frente:** Monitoramento da Carteira (continuação direta do S1 Painel Triagem + S3 Relatório, entregues 18/05)

## Contexto

A frente de monitoramento (Módulo 5 leitura) está LIVE: Deye+SolarEdge sincronizando, S1 Painel Triagem em prod, S3 Relatório branded em prod, cron de sync de 15min mantendo a base fresca. A função pura `classificarSistema` (em `src/modules/monitoring/classificacao.ts`) já detecta 4 tipos de sinal a cada chamada de `getDetalheSistema`, mas hoje os alertas morrem no dashboard — nada dispara mensagem.

Este spec descreve o **Módulo 6 (alerta proativo)** que conecta a detecção existente ao WhatsApp do Junior com botões interativos, e expande o `MaintenanceService` para suportar lembretes por aniversário de instalação.

## Objetivo

Anomalia detectada na carteira ou aniversário de instalação → Eva manda mensagem pro Junior no zap com botões de ação. Botões que iniciam atendimento ao cliente delegam o envio à própria Eva (mensagem natural Haiku) reusando o `MaintenanceService` já em produção. Throttle automático evita spam.

Filtro de valor: reter cliente (limpeza preventiva, manutenção D+1ano) + gerar venda adicional (depoimento em sistemas bombando) + reduzir tempo de resposta a anomalias (sistema offline há semanas sem ninguém notar).

## Decisões fechadas no brainstorm (2026-05-20)

| Decisão | Resposta |
|---|---|
| Escopo V1 | 4 tipos: `sistema_offline` + `queda_geracao` + `erro_integracao` + `milestone_economia` |
| Agrupamento | 1 mensagem por sistema com botões individuais (não digest) |
| Throttle | Re-mandar a cada 3 dias enquanto a condição persiste |
| Ação no alerta de queda | Eva fala automaticamente com o cliente (Haiku) |
| Ação no alerta de offline | Eva fala automaticamente (mesmo padrão) |
| Manutenção por aniversário | Entra na V1, expande `maintenance_reminders` (D+1a, D+2a, D+3a...) |
| Ação no milestone | Eva pede depoimento ao cliente |
| Janela horária | Segura até 8h dia útil / 9h sábado / domingo nada (`America/Sao_Paulo`) |

## Arquitetura

### Módulos novos

- `src/modules/monitoring/proactive-alerts/detect.ts` — função pura `detectarAlertasPendentes(sistemas, alertasAbertos, hoje) → { novos, resolvidos, persistentes_devidos }`. Sem DB, testável standalone.
- `src/modules/monitoring/proactive-alerts/service.ts` — `ProactiveAlertService.runDetectionCycle()`. Lê estado, chama `detect`, persiste intenção. Reusa padrão `MaintenanceService` (CAS lock + retry + idempotência).
- `src/modules/monitoring/proactive-alerts/dispatcher.ts` — `runDispatchCycle()`. Lê fila pronta, aplica janela horária, formata texto + botões, chama `sendAdminWithButtons`.
- `src/modules/monitoring/proactive-alerts/format.ts` — `formatAlertMessage(alerta, sistema, lead) → { texto, botoes[] }`. Função pura, testável.
- `src/modules/monitoring/proactive-alerts/janela.ts` — `dentroDaJanela(d, tz)`. Função pura.

### Modificações em arquivos existentes

- `src/modules/maintenance.ts` — `processMaintenanceReminders` já é generalizado por `topic`. Estender prompt do Haiku em `generateMaintenanceMessage` com branches para os novos topics: `alerta_offline`, `alerta_limpeza`, `pedido_depoimento`, `aniversario_1a`, `aniversario_2a`, `aniversario_3a`, `aniversario_4a`, `aniversario_5a`.
- `src/modules/eva-admin-buttons.ts` — estender `tryHandleEvaAdminButton` com novos `case`s (`alert-eva-offline`, `alert-eva-limpeza`, `alert-eva-depoimento`, `alert-ligar`, `alert-snooze3d`, `alert-snooze7d`, `alert-resolvido`, `alert-ignorar`, `alert-ver`). Parser do regex atual (`/^evabt:([a-z-]+)(?::([0-9a-f-]{36}))?$/i`) já suporta sem mudanças.
- `src/modules/supabase.ts` — métodos novos: `getAlertasAbertosBySistemas`, `criarAlertaPendente`, `marcarAlertaEnviado`, `snoozeAlerta`, `resolverAlerta`, `resolverAlertaManual`, `lockAlertaParaEnvio`, `unlockAlerta`, `getAlertasParaDespachar`, `marcarAlertaAcaoDisparada`, `getSistemasNoAniversarioHoje`, `upsertMaintenanceReminder` (já existe via `MaintenanceService`, expor publicamente).
- `src/index.ts` — registrar 3 crons novos: `processProactiveAlerts` (60min), `dispatchPendingAlerts` (15min, com janela), `enqueueAnniversaryReminders` (1x/dia 6h). Estender handler de botões com nova família `alert-*`.
- `src/modules/dashboard/*.ts` — tile "Alertas ativos" + sparkline "Alertas enviados 7d" + lista filtrável (extensão da página `/monitoramento`).

### Diagrama de fronteira

```
[cron 60min processProactiveAlerts]
        │
        ▼
[detect.ts] (puro) ─── lê sistemas + alertas abertos
        │ retorna { novos[], resolvidos[], persistentes_devidos[] }
        ▼
[service.ts] grava/atualiza monitoring_alerts (next_send_at = agora ou +3d)

[cron 15min dispatchPendingAlerts]
        │ filtra: next_send_at <= now AND dentro_janela_horaria AND não snoozed
        ▼
[dispatcher.ts] → format.ts (texto + botões) → sendAdminWithButtons
        │ sucesso: marca last_sent_at, next_send_at = +3d
        ▼ falha: unlock (retry no próximo ciclo)

[cron 1x/dia 6h enqueueAnniversaryReminders]
        │ sistemas com data_instalacao = hoje - N*365 (N=1..5)
        ▼
upsert em maintenance_reminders (topic = "aniversario_Na")
        │
        ▼ (cron horário já existente)
[MaintenanceService.processMaintenanceReminders] manda Haiku natural pro cliente

[handler botão evabt:alert-*:<sId>]
        │ atualiza monitoring_alerts.acao_disparada
        ▼ se ação for "Eva fala" → upsert em maintenance_reminders (topic alerta_*)
        │ Eva manda no próximo ciclo horário
```

## Schema de dados

### Migration `032_monitoring_alerts.sql`

```sql
create table monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references sistemas(id) on delete cascade,
  tipo text not null,            -- 'sistema_offline' | 'queda_geracao' | 'erro_integracao' | 'milestone_economia'
  severidade text not null,      -- 'urgente' | 'aviso' | 'info'
  texto text not null,           -- snapshot do classificarSistema na hora de criar
  primeiro_visto_em timestamptz not null default now(),
  last_sent_at timestamptz,      -- null = ainda não enviou
  next_send_at timestamptz,      -- quando o próximo envio é DEVIDO; null = em envio (locked) ou já resolvido
  snoozed_until timestamptz,
  resolved_at timestamptz,       -- alerta sumiu (condição não vale mais)
  resolved_reason text,          -- 'auto' | 'manual' | 'ignorada'
  acao_disparada text,           -- ex 'eva_avisou_limpeza', 'junior_ligar', 'eva_pediu_depoimento'
  acao_disparada_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index monitoring_alerts_dedupe
  on monitoring_alerts (sistema_id, tipo)
  where resolved_at is null;

create index monitoring_alerts_pendente
  on monitoring_alerts (next_send_at)
  where resolved_at is null and snoozed_until is null;

create index monitoring_alerts_sistema
  on monitoring_alerts (sistema_id, resolved_at);
```

**Junior aplica manual no SQL Editor do projeto `kupnsoyymulbdzakqlqc`** (MCP aponta pro projeto errado — ver `reference_supabase_mcp_mismatch`).

### `maintenance_reminders` (já em prod, sem migration)

Reusa-se. Campo `topic` é texto livre, aceita novos valores:
- `alerta_offline`
- `alerta_limpeza`
- `pedido_depoimento`
- `aniversario_1a`, `aniversario_2a`, `aniversario_3a`, `aniversario_4a`, `aniversario_5a`

Constraint de upsert (`onConflict: lead_id,scheduled_date,topic`, `ignoreDuplicates: true`) já garante idempotência.

## Detecção (função pura `detect.ts`)

```ts
interface DetectInput {
  sistemas: Array<SistemaComKpis>;
  alertasAbertos: Array<MonitoringAlert>;
  hoje: Date;
}
interface DetectOutput {
  novos: Array<{ sistema_id: string; alerta: Alerta }>;
  resolvidos: string[];        // ids de monitoring_alerts
  persistentes_devidos: string[]; // ids prontos pra re-envio
}
```

Para cada sistema ativo, chama `classificarSistema` (reuso puro). Compara com `alertasAbertos`:

| Estado da classificação | Estado da fila | Ação |
|---|---|---|
| `nivel='ok'` ou `alerta=null` | tem aberto com mesmo tipo | adicionar id a `resolvidos` (marcar `resolved_at`, `resolved_reason='auto'`) |
| `alerta` existe, tipo NOVO | sem aberto desse tipo | adicionar a `novos` |
| `alerta` existe, mesmo tipo aberto, `next_send_at <= hoje`, não snoozed | aberto | adicionar a `persistentes_devidos` (dispatcher cuida) |
| `alerta` existe, mesmo tipo aberto, ainda em throttle ou snoozed | aberto | nada |

Critério de "tipo NOVO": classificação retorna `alerta.tipo` diferente de qualquer aberto do mesmo sistema. Exemplo: estava `queda_geracao`, virou `sistema_offline` → resolve queda + cria offline.

### Query `getAlertasParaDespachar`

```sql
select * from monitoring_alerts
where resolved_at is null
  and next_send_at is not null         -- exclui em envio (locked)
  and next_send_at <= $1               -- $1 = now
  and (snoozed_until is null or snoozed_until <= $1)
order by
  case severidade when 'urgente' then 0 when 'aviso' then 1 else 2 end,
  primeiro_visto_em asc
limit 8;
```

Locking via `lockAlertaParaEnvio` faz `update monitoring_alerts set next_send_at = null where id = $1 and next_send_at is not null returning id` — só pega quem ainda não foi pego (CAS atômico). Se 0 rows: outro processo levou.

`marcarAlertaEnviado` recoloca `next_send_at = $2` (now + 3d). `unlockAlerta` recoloca o `next_send_at` original pra retry.

## Dispatch (cron 15min)

```ts
async runDispatchCycle(hoje: Date) {
  if (!dentroDaJanela(hoje, 'America/Sao_Paulo')) return;

  const fila = await supabase.getAlertasParaDespachar(hoje, { limit: 8, ordenarPorSeveridade: true });
  for (const alerta of fila) {
    const locked = await supabase.lockAlertaParaEnvio(alerta.id);
    if (!locked) continue;
    try {
      const sistema = await supabase.getSistemaById(alerta.sistema_id);
      const lead = sistema?.lead_id ? await supabase.getLeadById(sistema.lead_id) : null;
      const { texto, botoes, footer } = formatAlertMessage(alerta, sistema, lead);
      await sendAdminWithButtons(adminCtx, ENGINEER_PHONE, texto, botoes, footer);
      await supabase.marcarAlertaEnviado(alerta.id, hoje, addDays(hoje, 3));
    } catch (err) {
      console.error('[proactive-alerts] dispatch falhou:', (err as Error).message);
      await supabase.unlockAlerta(alerta.id);
    }
  }
}
```

### Janela horária

```ts
function dentroDaJanela(d: Date, tz = 'America/Sao_Paulo'): boolean {
  const dow = diaSemana(d, tz);     // 0=domingo..6=sábado
  const hour = hora(d, tz);
  if (dow === 0) return false;
  if (dow === 6) return hour >= 9 && hour < 20;
  return hour >= 8 && hour < 20;
}
```

Função pura, testável. **V1 não trata feriado nacional** (fast-follow).

### Limite global

Máximo **8 alertas/dia** pro Junior. Se a fila tem mais, despacha 8 e deixa o resto pra o próximo ciclo (mesmo dia se ainda na janela, senão amanhã). Ordenação: `severidade=urgente` > `aviso` > `info`, depois `primeiro_visto_em ASC`.

## Mensagens (texto formatado por tipo)

Todas em PT-BR, tom direto, dois blocos curtos (não bolhas — alerta admin é mensagem única pra leitura de relance):

### `sistema_offline`
```
🔴 OFFLINE
{nome_cliente} — {kwp} kWp ({marca_inversor})
Sem geração há {N} dias. Última leitura: {data}.
```

### `queda_geracao`
```
🟡 QUEDA
{nome_cliente} — {kwp} kWp
Últimos 7 dias {pct}% abaixo do esperado. Possível sujeira/sombreamento.
Real: {x} kWh · Esperado: {y} kWh.
```

### `erro_integracao`
```
🔴 INTEGRAÇÃO
{nome_cliente} — {marca}
Erro API: {ultimo_erro}
(problema técnico interno, sem ação cliente necessária)
```

### `milestone_economia`
```
🟢 BOMBANDO
{nome_cliente} — {kwp} kWp
Últimos 7 dias {pct}% ACIMA do esperado. Bom momento pra pedir depoimento.
```

## Botões por tipo (máx 3 WABA, padrão `evabt:<acao>:<sistemaId>`)

| Tipo | Botão 1 | Botão 2 | Botão 3 |
|---|---|---|---|
| `sistema_offline` | 🔧 Eva avisar cliente | 📞 Eu ligar | 💤 Adiar 3d |
| `queda_geracao` | 🧽 Eva agendar limpeza | 📞 Eu ligar | 💤 Adiar 3d |
| `erro_integracao` | 🔍 Ver detalhe | 💤 Adiar 3d | ✅ Já resolvi |
| `milestone_economia` | ⭐ Eva pedir depoimento | 💤 Adiar 7d | ❌ Ignorar |

IDs:
- `evabt:alert-eva-offline:<sId>`
- `evabt:alert-eva-limpeza:<sId>`
- `evabt:alert-eva-depoimento:<sId>`
- `evabt:alert-ligar:<sId>`
- `evabt:alert-snooze3d:<sId>`
- `evabt:alert-snooze7d:<sId>`
- `evabt:alert-resolvido:<sId>`
- `evabt:alert-ignorar:<sId>`
- `evabt:alert-ver:<sId>`

## Ações "Eva fala" — fluxo de delegação

Padrão único, sem novo serviço de envio: **toda ação "Eva fala" cria uma row em `maintenance_reminders` com `scheduled_date=hoje` e um `topic` específico**. O cron horário `processMaintenanceReminders` (já em prod, batalhado) pega e manda.

```ts
case 'alert-eva-limpeza': {
  const sistema = await supabase.getSistemaById(sistemaId);
  if (!sistema?.lead_id) {
    await sendText(from, '⚠️ Sistema sem cliente vinculado, vincule o lead antes.');
    return true;
  }
  await supabase.upsertMaintenanceReminder({
    lead_id: sistema.lead_id,
    scheduled_date: isoDate(hoje),
    topic: 'alerta_limpeza',
  });
  await supabase.marcarAlertaAcaoDisparada(sistemaId, 'eva_avisou_limpeza', hoje);
  await sendText(from, `✅ Eva vai falar com ${nome} sobre limpeza no próximo ciclo (até 1h).`);
  return true;
}
```

Branch correspondente em `generateMaintenanceMessage` cobre os novos topics com prompts próprios (e fallback fixo no `catch`).

### Sistema sem `lead_id`

Realidade: alguns sistemas da carteira ainda não têm lead vinculado no Supabase. Junior tem os dados de todos os clientes e fará o vínculo manualmente quando aparecer o aviso. Pra esses casos, alerta ainda dispara pro Junior, mas botões "Eva falar" respondem com pedido de vincular o lead antes. Demais botões (snooze, resolver, ver) continuam funcionando.

### Cliente em `opt_out` ou `eva_active=false`

`upsertMaintenanceReminder` cria normal, mas `processMaintenanceReminders` já filtra `opt_out`. Pra dar feedback imediato ao Junior, o handler verifica antes:
```ts
const lead = await supabase.getLeadById(sistema.lead_id);
if (lead.opt_out) {
  await sendText(from, '⚠️ Lead em opt-out, Eva não pode falar.');
  return true;
}
```

## Aniversário (cron `enqueueAnniversaryReminders`, 1x/dia 6h)

```ts
async runAnniversaryEnqueue(hoje: Date) {
  const due = await supabase.getSistemasNoAniversarioHoje(hoje);  // data_instalacao = hoje - N*365, N=1..5
  for (const s of due) {
    const anos = anosDesdeInstalacao(s.data_instalacao, hoje);
    if (!s.lead_id) continue;
    await supabase.upsertMaintenanceReminder({
      lead_id: s.lead_id,
      scheduled_date: isoDate(hoje),
      topic: `aniversario_${anos}a`,
    });
  }
}
```

Idempotente via `onConflict: lead_id,scheduled_date,topic, ignoreDuplicates`. Tolerância: a SQL aceita "aniversário caiu em ano bissexto" (calcula por subtração de anos, não por dias exatos).

## Handlers (extensão de `tryHandleEvaAdminButton`)

```ts
case 'alert-ligar': {
  const sistema = await supabase.getSistemaById(sistemaId);
  const lead = sistema?.lead_id ? await supabase.getLeadById(sistema.lead_id) : null;
  const phone = lead?.phone ?? sistema?.telefone_contato;
  if (!phone) {
    await sendText(from, '⚠️ Sem telefone cadastrado.');
    return true;
  }
  await sendText(from, `📞 ${lead?.name ?? 'Cliente'} — wa.me/${phone}\nMotivo: ${alerta.texto}`);
  await supabase.marcarAlertaAcaoDisparada(sistemaId, 'junior_ligar', hoje);
  return true;
}

case 'alert-snooze3d':
case 'alert-snooze7d': {
  const dias = action === 'alert-snooze3d' ? 3 : 7;
  await supabase.snoozeAlerta(sistemaId, addDays(hoje, dias));
  await sendText(from, `💤 Alerta adiado ${dias} dias.`);
  return true;
}

case 'alert-resolvido':
case 'alert-ignorar': {
  const reason = action === 'alert-ignorar' ? 'ignorada' : 'manual';
  await supabase.resolverAlertaManual(sistemaId, reason);
  await sendText(from, '✅ Alerta encerrado.');
  return true;
}

case 'alert-ver': {
  await sendText(from, `📊 ${DASHBOARD_BASE}/monitoramento/${sistemaId}`);
  return true;
}
```

Toda ação verifica `resolved_at IS NULL` antes de agir. Se já resolvido: `⚠️ Alerta já encerrado` (idempotência se Junior clicar 2x).

## Error handling

| Cenário | Comportamento |
|---|---|
| WABA falha ao enviar | `sendAdminWithButtons` cai para `sendText` puro. Se até texto falhar: não marca `last_sent_at`, próximo ciclo retenta. `next_send_at` só atualiza após sucesso → sem loop infinito. |
| Lock CAS concorrente | `lockAlertaParaEnvio` retorna `false` → `continue`. |
| `classificarSistema` joga exception | Try/catch por sistema. Erro logado, segue. |
| Sistema deletado entre detect e dispatch | `FK on delete cascade` na `monitoring_alerts` → some junto. |
| Cliente em `opt_out` no momento do botão | Handler verifica e responde, sem criar row. |
| Sistema sem `lead_id` | "Eva falar" pede vínculo. Demais botões funcionam. |
| Janela fechada e fila acumula | Dispatcher pula. Próximo ciclo dentro da janela pega tudo (até `LIMIT 8`). |
| `next_send_at` no passado por dias (cron caiu) | `LIMIT 8` ordenado por severidade evita avalanche. |
| Botão chega após `resolved_at` | Handler responde "já encerrado" sem efeito. |

## Observabilidade

Logs estruturados (prefixo `[proactive-alerts]`, mesma convenção dos demais crons em prod):

- `[proactive-alerts] detect: {sistemasVarridos} sistemas, {novos} novos, {resolvidos} resolvidos, {persistentes} persistentes`
- `[proactive-alerts] dispatch: {enviados} enviados, {fila_restante} na fila, janela={true|false}`
- `[proactive-alerts] action evabt:alert-eva-limpeza:<sId>: lead {leadId}, topic agendado`
- `[proactive-alerts] anniversary: {N} aniversários enfileirados pra hoje`

Dashboard `/monitoramento` (extensão da página S1):
- Tile "Alertas ativos" — contagem por severidade (urgente/aviso/info), clique abre lista filtrada.
- Sparkline "Alertas enviados (7d)".
- Lista filtrável por tipo, colunas: cliente, sistema, tipo, primeiro_visto, último_envio, próximo_envio, ação_disparada, snooze_até.

Aba "Histórico de ações Eva" — fast-follow V2.

## Testes (TDD por camada)

### Pura (`detect.test.ts`)
- Sistema OK + sem alerta aberto → nada
- Sistema OK + alerta aberto mesmo tipo → resolvido
- Sistema com queda + sem aberto → novo
- Sistema com queda + aberto com `next_send_at` futuro → nada
- Sistema com queda + aberto com `next_send_at` passado → `persistente_devido`
- Sistema com queda + aberto snoozed → nada
- Sistema com `ativo=false` → nada
- Transição de tipo (queda → offline) → resolve queda + cria offline

### Pura (`janela.test.ts`)
- Domingo qualquer hora → false
- Sábado 8h → false; 9h → true; 19h59 → true; 20h → false
- Seg-sex 7h59 → false; 8h → true; 19h59 → true; 20h → false
- Fixar timezone `America/Sao_Paulo` com `MockDate`.

### Pura (`format.test.ts`)
- Cada um dos 4 tipos gera texto com placeholders corretos
- Botões corretos por tipo (snapshot)
- Cliente sem `nome` → fallback "Cliente sem nome cadastrado"

### Service (Supabase mockado)
- `runDetectionCycle` chama detect com input correto
- Aplica resolvidos/novos no supabase
- Não duplica `criarAlertaPendente` quando já existe (constraint protege, mas idealmente filtrar antes)

### Dispatcher (WABA mockado)
- Fila vazia → sem chamada
- Fora da janela → sem chamada
- Lock falha → não duplica
- `LIMIT 8` aplicado ordenado por severidade
- Sucesso → `last_sent_at` e `next_send_at = +3d`
- Falha WABA → `last_sent_at` permanece null, retenta

### Handler (extensão de `eva-admin-buttons.test.ts`)
- Cada novo `case` com lead vinculado / sem lead / opt-out / alerta já resolvido
- Snooze persiste em DB

### Aniversário (`anniversary.test.ts`)
- Sistema instalado em 18/05/2025 + hoje=18/05/2026 → enfileira `aniversario_1a`
- Idempotência: rodar 2x no mesmo dia não duplica
- Sistema sem `data_instalacao` → ignorado sem erro
- Ano bissexto: instalado 29/02/2024 + hoje 28/02/2025 → enfileira `aniversario_1a` (decisão: aniversário no dia equivalente do calendário ou na quebra de ano? V1 = quebra de ano; data exata fica como aceitável ±1 dia).

### Smoke em prod
- Env `PROACTIVE_ALERTS_DRY_RUN=1` cadastrada no Easypanel (App → Environment) antes do primeiro deploy — dispatcher loga mas não envia ao WhatsApp.
- Verificar que os ~5 sistemas business hoje silenciosos viram alerta no log na primeira passada.
- Verificar 0 alertas duplicados na fila (`select sistema_id, tipo, count(*) from monitoring_alerts where resolved_at is null group by 1,2 having count(*) > 1` → vazio).
- Tirar `DRY_RUN` (remover env no Easypanel), redeploy.

## Deploy

1. Junior aplica `032_monitoring_alerts.sql` manual no SQL Editor (projeto `kupnsoyymulbdzakqlqc`).
2. Implementação task-por-task com TDD (plano detalhado em separado via writing-plans).
3. Junior cadastra env `PROACTIVE_ALERTS_DRY_RUN=1` no Easypanel (App → Environment).
4. `git push` → Easypanel auto-deploy (SSH).
5. Junior clica Implantar.
6. Primeiro ciclo (até 60min). Confirmar logs.
7. Smoke: 5 silenciosos viram alerta no log? Botão snooze num alerta de teste funciona?
8. Remover env `PROACTIVE_ALERTS_DRY_RUN`, novo deploy.
9. Monitorar 1ª semana.

## Fast-follows (fora da V1)

- Feriado nacional na janela horária.
- Aba "Histórico de ações Eva" no dashboard cruzando `acao_disparada` × resposta cliente.
- Flag por sistema `auto_outreach=false` (alguns clientes podem não querer que Eva fale sozinha).
- Cruzar `acao_disparada` com efetividade (cliente respondeu? agendou? virou venda?) — alimenta o motor de aprendizagem real-vs-estimado.
- Variar prompt do Haiku por marca de inversor (Deye/SolarEdge têm UX diferente para "verificar WiFi").
- Configurar limites por severidade (não só 8 global).
- Integrar com S3 Relatório: ação "Eva mandar relatório atualizado" no alerta de queda.

## Referências internas

- `frente-monitoramento-manutencao-alerta-carteira` (memória)
- `visao-plataforma-ecosun` — Módulo 5 + Módulo 6
- `botoes-zap`
- `observabilidade-obrigatoria`
- `dashboard-sempre-pt-br`
- `contexto-antes-de-acessar`
- `reference_supabase_mcp_mismatch` (Junior aplica SQL manual)
- `reference_easypanel_github_auth` (SSH Deploy Key)
- `motor-de-aprendizagem-real-vs-estimado-pendente-visao-junior-08-05` (fast-follow conexão)
