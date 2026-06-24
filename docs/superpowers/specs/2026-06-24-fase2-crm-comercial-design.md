# Spec — CRM Fase 2: Funil Comercial que anda sozinho (kanban + timeline + tarefas/SLA + cockpit)

**Data:** 2026-06-24
**Repo:** `ecosunpower-agente` (dashboard servido pelo mesmo Express do agente)
**Autor do produto:** Junior (EcoSunPower) · brainstorm conduzido com Claude
**Depende de:** Fase 1 (Fundação) — já LIVE (multiusuário, papéis/permissões, claim, auditoria, multi-tenant, `leads.last_contact_at`). Migration 056.
**Norte do Junior (24/06):** *"tudo rico e automatizado, o mais prático possível"* + *"Eva avisa no zap"*.

---

## 1. Objetivo

Transformar a tela de leads num **funil comercial que se move sozinho**: o card pula de etapa por evento, cada acontecimento vira item na linha do tempo, o sistema cria a próxima tarefa e cobra o prazo — e a **Eva avisa o Junior no WhatsApp** quando algo está parado. O vendedor só intervém pra corrigir. Tudo respeitando claim/permissões da Fase 1, auditado e multi-tenant.

**Princípios herdados:** evoluir no lugar (server-rendered + JS leve), Eva (atendimento) intacta, auditoria em tudo, `company_id` em toda tabela nova.

---

## 2. Escopo desta fase (o que ENTRA)

1. **Pipeline automatizado + Kanban** — funil visual com colunas; transições de etapa **disparadas por evento** (proposta gerada, proposta aberta, visita marcada, fechamento). Vendedor pode arrastar (override manual).
2. **Timeline automática do lead** (`lead_atividades`) — todo evento relevante vira um item, sem ninguém digitar. Vendedor pode adicionar nota/ligação manual.
3. **Tarefas + SLA automáticos** (`lead_tarefas`) — ao entrar numa etapa, o sistema cria a próxima tarefa com prazo; prazo estourado vira **alerta**.
4. **Eva avisa no WhatsApp** — SLA estourado dispara mensagem da Eva pro Junior (reusa o canal de alerta já existente), com botão de ação.
5. **Cockpit do lead** — uma tela só com tudo: dados, conversa Eva, consumo, propostas, **timeline**, **tarefas**, próxima ação, dias na etapa, status do SLA, ações rápidas.
6. **Painel "Precisam de atenção"** — lista priorizada de leads com SLA estourado / tarefa vencida.

### Não-objetivos (ficam pra leva seguinte)
- Módulo de **documentos** organizados (contrato/ART/parecer/fotos com upload estruturado) — Fase 2.5/3.
- **IA do funil** (resumir histórico, sugerir próxima ação, gerar mensagem) — Fase 5.
- Etapas **configuráveis por tela** (admin cria colunas) — fica a estrutura pronta, a tela de config vem depois.
- Mexer na Eva de atendimento (conversa com cliente). As automações são **hooks aditivos** (logam/agendam), nunca mudam o que a Eva fala.
- Tempo real (websockets). Atualização por reload/polling, como hoje.

---

## 3. Pipeline / etapas do funil

### 3.1 Etapas (colunas do kanban, em ordem)
Mantém o enum atual e **adiciona 3 etapas** que o **sistema** seta automaticamente (a Eva continua escrevendo só as que já escreve):

| # | Etapa (valor enum) | Quem seta | Gatilho |
|---|---|---|---|
| 1 | `novo` | Eva / criação | lead entra |
| 2 | `qualificando` | Eva | cliente respondeu, em conversa |
| 3 | `qualificado` | Eva | consumo/conta capturado, lead qualificado |
| 4 | `proposta_enviada` 🆕 | Sistema | proposta gerada pro lead |
| 5 | `negociacao` 🆕 | Sistema | cliente **abriu** a proposta ou voltou a falar depois dela |
| 6 | `agendado` | Eva | visita/Meet marcado |
| 7 | `transferido` | Eva | repassado pro Junior (fechamento) |
| 8 | `ganho` 🆕 | Sistema | fechamento confirmado (contrato/`/fechar`) |
| — | `perdido` | manual/Eva | não rolou (coluna terminal, à parte) |

**Regras de automação (avanço só pra frente):** o sistema **nunca recua** uma etapa automaticamente. Ex.: se o lead já está em `negociacao` e a Eva manda um `qualificando`, ignora o downgrade automático (mas o vendedor pode arrastar pra trás manualmente). Implementado por uma função pura `proximaEtapaPorEvento(etapaAtual, evento)` que retorna a nova etapa **ou a mesma** (ordem fixa via `ORDEM_ETAPAS`).

**Migration:** `ALTER TYPE lead_status ADD VALUE 'proposta_enviada' / 'negociacao' / 'ganho'` (idempotente, `IF NOT EXISTS`). Leads existentes mantêm o valor atual (não-quebra). `perdido` já existe.

### 3.2 Kanban (UI)
- Rota nova: `GET /dashboard/leads/kanban` (alterna com a lista atual via toggle "Lista | Kanban").
- Colunas = `ORDEM_ETAPAS` (sem `perdido`, que vira um rodapé/coluna recolhida). Cada coluna mostra contagem + cards do vendedor (respeita claim: vendedor vê pool + os seus; admin vê tudo).
- Card: nome, telefone, dias na etapa, **selo de SLA** (verde/âmbar/vermelho), próxima tarefa + prazo, origem.
- **Drag-drop** com SortableJS (CDN). Soltar numa coluna → `POST /dashboard/leads/:id/set-etapa` (reusa a lógica do `set-status` + audit + grava atividade `etapa_mudou` manual). Gating: `exigir('leads','editar')`.
- Sem deps pesadas; SortableJS via `<script>` CDN, dados via `<script type="application/json">` (padrão atual do cockpit).

---

## 4. Timeline automática — `lead_atividades`

Cada evento do lead vira um registro. Alimenta a timeline do cockpit e os relatórios de produtividade (Fase 6).

**Tabela `lead_atividades`:**
- `id` uuid pk
- `company_id` uuid (multi-tenant)
- `lead_id` uuid fk → leads (ON DELETE CASCADE)
- `tipo` text — `contato | whatsapp | ligacao | email | visita | proposta_enviada | proposta_aberta | etapa_mudou | cadencia | tarefa_criada | tarefa_concluida | nota | ganho | perdido`
- `titulo` text (curto, ex.: "Proposta #2026-X enviada")
- `descricao` text (opcional)
- `automatica` boolean (true = gerada por evento; false = lançada por pessoa)
- `user_id` uuid null (autor; null quando é sistema/Eva)
- `payload` jsonb (dados do evento: proposta_id, etapa_de/para, etc.)
- `created_at` timestamptz default now()

Índice: `(lead_id, created_at desc)`.

**Helper único `registrarAtividade(client, {company_id, lead_id, tipo, titulo, ...})`** — chamado pelos hooks. Idempotência onde fizer sentido (ex.: não duplicar `proposta_aberta` no mesmo acesso — dedupe por payload/janela).

**Hooks que geram atividade (aditivos, não mudam a Eva):**
| Evento (de onde) | Atividade | Efeito colateral |
|---|---|---|
| Proposta gerada (`proposal-assistant` salva `propostas_publicas`) | `proposta_enviada` | etapa → `proposta_enviada`; cria tarefa "cobrar retorno em 3 dias" |
| Cliente abre a proposta (`propostas_publicas.acessos`/`ultimo_acesso_at` sobe) | `proposta_aberta` | etapa → `negociacao` |
| Mudança de status/etapa (kanban ou Eva) | `etapa_mudou` | cria a próxima tarefa da etapa |
| Cadência disparada (`eva_cadence` enviou um toque) | `cadencia` | atualiza `last_contact_at` |
| Fechamento (`/fechar`/contrato) | `ganho` | etapa → `ganho`; fecha tarefas abertas |
| Vendedor lança nota/ligação no cockpit | `nota`/`ligacao` | atualiza `last_contact_at` |

> Vínculo proposta↔lead: hoje `propostas_publicas` liga por **telefone** (não tem `lead_id`). Esta fase adiciona `propostas_publicas.lead_id` (nullable, backfill best-effort por telefone) pra o hook achar o lead com segurança.

---

## 5. Tarefas + SLA — `lead_tarefas`

**Tabela `lead_tarefas`:**
- `id` uuid pk
- `company_id` uuid
- `lead_id` uuid fk → leads (ON DELETE CASCADE)
- `titulo` text (ex.: "Ligar pro lead (sem contato 24h)")
- `tipo` text — `ligar | cobrar_proposta | confirmar_visita | enviar_documentos | follow_up | custom`
- `due_at` timestamptz (vencimento)
- `prioridade` text — `baixa | media | alta`
- `status` text — `pendente | concluida | cancelada`
- `automatica` boolean (true = criada por regra de SLA/etapa)
- `assigned_to` uuid null (default = `claimed_by` do lead; admin reatribui)
- `created_by` uuid null (null = sistema)
- `completed_at` timestamptz null
- `alert_sent_at` timestamptz null (quando a Eva já avisou o Junior — evita spam)
- `created_at` / `updated_at`

Índices: `(lead_id, status)`, `(status, due_at)`.

### 5.1 Regras de SLA (v1 — fixas no código, configuráveis depois)
Funções **puras e testáveis** (`sla-rules.ts`), sem rede:
| Regra | Condição | Tarefa criada | Prazo |
|---|---|---|---|
| Primeiro contato | lead `novo`/`qualificando` sem contato | `ligar` | +24h do `last_contact_at` |
| Retorno da proposta | etapa `proposta_enviada` sem resposta | `cobrar_proposta` | +3 dias |
| Sem atualização | qualquer etapa ativa parada | `follow_up` | +48h |
| Confirmar visita | etapa `agendado` | `confirmar_visita` | 24h antes da visita |

- Tarefa **automática é idempotente por (lead, tipo, etapa)** — não duplica.
- Tarefa **vencida** (`status=pendente && due_at < agora`) = SLA estourado → entra no painel "Precisam de atenção" e dispara o aviso da Eva.
- **Selo de SLA** do card: verde (sem tarefa vencida), âmbar (vence em <12h), vermelho (vencida).

### 5.2 Motor de tarefas/SLA (job periódico)
- Reusa o **scheduler que já roda a cadência/alertas** (não criar cron novo se já existir loop). A cada ciclo: varre leads ativos, aplica `sla-rules` → cria tarefas faltantes (idempotente) e marca vencidas.
- Para cada tarefa **vencida e ainda não avisada** (`alert_sent_at IS NULL`): dispara o aviso da Eva (§6) e grava `alert_sent_at`.

---

## 6. Eva avisa no WhatsApp (decisão do Junior)

- Reusa o canal de alerta **Eva → Junior** já existente (o mesmo de alertas/monitoramento; ex.: `criarAlertaPendente`/notify ao `ENGINEER_PHONE`/`ADMIN_EXTRA_PHONES`).
- Mensagem curta e acionável, ex.: *"⏰ Lead **Fernanda** está há 3 dias com a proposta sem retorno. Quer que eu mande uma mensagem cobrando?"* + **botões** (padrão do projeto: toda ação no zap tem botão): **[Cobrar agora] [Eu falo] [Adiar 2 dias]**.
  - **Cobrar agora** → dispara um toque (reusa cadência/mensagem) e marca a tarefa.
  - **Eu falo** → atribui ao Junior, silencia o alerta dessa tarefa.
  - **Adiar 2 dias** → empurra `due_at`.
- **Anti-spam:** 1 aviso por tarefa (`alert_sent_at`); resumo no máximo 1×/dia por lead. Respeita `DRY_RUN` se o projeto usar (igual aos alertas proativos).

---

## 7. Cockpit do lead (`/dashboard/leads/:id`)

Evolui a tela de detalhe atual (não cria rota nova) num cockpit completo, em blocos:
1. **Cabeçalho + KPIs:** nome/telefone/cidade · etapa atual (badge) · **dias na etapa** · **selo de SLA** · dono (claim) · próxima ação (tarefa mais urgente).
2. **Ações rápidas:** mudar etapa · criar proposta (link prefill atual) · agendar visita · **nova tarefa** · **registrar ligação/nota** · marcar ganho/perdido. (cada ação grava atividade + audit.)
3. **Timeline** (novo): lista cronológica de `lead_atividades` com ícone por tipo, autor (Eva/sistema/vendedor) e hora (`timeAgo`).
4. **Tarefas** (novo): pendentes (com prazo + selo) e concluídas; concluir/cancelar.
5. **Conversa Eva ↔ cliente** (já existe) · **Cadência** (já existe) · **Anexos** (já existe) · **Propostas do lead** (agora via `lead_id`).
6. **Dados/consumo/oportunidades** (já existe).

Tudo server-rendered no padrão atual (`renderLayout`, Tailwind). JS leve só pro drag do kanban e ações inline.

---

## 8. Permissões, claim, multi-tenant, auditoria (Fase 1)

- **Claim/visibilidade:** kanban e cockpit respeitam `podeVerLead` (vendedor vê pool + os seus; admin tudo). Abrir card no kanban **não** captura (só abrir o cockpit captura, como hoje); decidir no plano se o claim continua no `/leads/:id`.
- **Gating:** `exigir('leads','visualizar')` no kanban/cockpit; `'editar'` em mudar etapa, criar/concluir tarefa, lançar nota. Tarefa atribuída segue o dono do lead.
- **Multi-tenant:** `company_id` em `lead_atividades` e `lead_tarefas`; toda query filtra por empresa do usuário (helper atual).
- **Auditoria:** mutações (mudar etapa, criar/concluir/cancelar tarefa, lançar atividade manual) chamam o `audit(...)` da Fase 1. Atividade automática **não** precisa de audit (a própria atividade é o registro).

---

## 9. Arquitetura / arquivos (evoluir no lugar)

Novos (pequenos, isolados, testáveis):
- `src/modules/dashboard/pipeline.ts` — `ORDEM_ETAPAS`, `proximaEtapaPorEvento()`, rótulos/cores das etapas (pura).
- `src/modules/dashboard/atividades.ts` — `registrarAtividade()`, fetch da timeline.
- `src/modules/dashboard/tarefas.ts` — CRUD de tarefa + `aplicarRegrasSla()` (pura) + fetch.
- `src/modules/dashboard/sla-rules.ts` — regras puras (condição → tarefa/prazo) + cálculo do selo.
- `src/modules/dashboard/kanban-views.ts` — render do kanban (colunas/cards/JS Sortable).
- Hooks: pontos de chamada em `proposal-assistant` (proposta gerada), no acesso da proposta pública (proposta aberta), no `/fechar` (ganho), no processador de cadência.
- Aviso Eva: `src/modules/dashboard/sla-notifier.ts` (monta a mensagem + botões, usa o notify existente).

Evoluídos:
- `dashboard/router.ts` — rotas `/leads/kanban`, `/leads/:id/set-etapa`, `/leads/:id/tarefas` (criar/concluir), `/leads/:id/atividade` (nota/ligação), e o callback dos botões do zap.
- `dashboard/leads-views.ts` — cockpit (timeline + tarefas) + toggle Lista/Kanban.
- `dashboard/leads-queries.ts` — `dias na etapa`, próxima tarefa, selo SLA por lead, agrupamento por etapa pro kanban.
- Migration nova (**057**): enum +3 valores, `lead_atividades`, `lead_tarefas`, `propostas_publicas.lead_id`, índices, RLS por `company_id`.

---

## 10. Testes e implantação

- **Testes (vitest, funções puras, sem rede):** `proximaEtapaPorEvento` (avanço só pra frente, ignora downgrade), `aplicarRegrasSla` (cria a tarefa certa no prazo certo, idempotente por lead/tipo/etapa), selo de SLA (verde/âmbar/vermelho por `due_at`), dedupe de atividade, visibilidade/claim no agrupamento do kanban. Review 3× + tsc limpo antes do push (padrão do projeto).
- **Implantação:** migration **057** aplicada no Supabase **antes** do deploy. Push → migration → Implantar → smoke (criar lead, gerar proposta → card anda sozinho pra "Proposta enviada", abrir proposta → "Negociação", deixar vencer → aviso da Eva no zap). Nunca pushar sem OK do Junior.

---

## 11. Ordem de construção sugerida (fatias)

1. **Fundação do funil:** migration 057 + `pipeline.ts` + `propostas_publicas.lead_id`. (sem UI ainda)
2. **Timeline:** `atividades.ts` + hooks (proposta/etapa/cadência/fechar) + bloco timeline no cockpit.
3. **Tarefas + SLA:** `tarefas.ts` + `sla-rules.ts` + motor no scheduler + bloco tarefas + painel "Precisam de atenção".
4. **Eva no zap:** `sla-notifier.ts` + botões + callbacks.
5. **Kanban:** `kanban-views.ts` + drag-drop + `set-etapa` + toggle Lista/Kanban.

Cada fatia: TDD → review 3× → commit. Deploy só no fim, com OK do Junior.
