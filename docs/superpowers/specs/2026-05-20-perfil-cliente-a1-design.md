# Perfil do Cliente — Fatia A1

**Data:** 2026-05-20
**Status:** design aprovado, aguardando plano de execução
**Frente:** Cadastro Central de Cliente (primeira de 5 sub-fatias) + base pra frente B (Contas de Luz + Rateio)

## Contexto

Hoje a tabela `leads` tem 30+ colunas e a página `/dashboard/leads` mostra lista + detalhe com conversa e cadência — boa pra qualificação. O que falta é uma tela que sirva **cliente instalado** como entidade central: timeline da jornada, sistemas FV vinculados, propostas, alertas M6 (entregue 20/05), agendamentos, manutenções, contas de luz, anexos e ações rápidas (conversar, criar proposta, ver relatório). A Eva precisa narrar insights sobre esse cliente (sugestão de upgrade, pedido de depoimento, aniversário).

Esta spec descreve a **Fatia A1** — o esqueleto do "Perfil do Cliente" + cadastro completo + anexos. As fatias A2-A5 (calculadora, sugestão por cidade, criar proposta direto, relatório pós-instalação) e a frente B (contas de luz + rateio) vêm depois, mas o schema da A1 já cria os campos necessários pra rateio MMGD para evitar migration dupla.

## Objetivo

Tela `/dashboard/clientes/:id` no estilo cockpit dark (mesma identidade do `/cockpit` em prod) que reúne TUDO do cliente num lugar só: dados pessoais, endereço, concessionária, consumo, sistema FV, propostas, alertas, conversas, anexos, timeline narrativa e 3 cards Eva. Lista `/dashboard/clientes` que filtra leads com `installation_status` em (contrato_assinado, instalado, medidor_trocado, operando, pos_venda_concluido).

A1 entrega: estrutura completa do perfil + 5 abas ativas (**Dados**, **Anexos**, **Timeline**, **Conversa**, **Propostas** — lista, sem criar direto) + 2 abas placeholder (**Sistema+Kit** vem em A2, **Relatórios** vem em A5). KPIs e Eva Insights leem de tabelas já em prod (`sistemas_clientes`, `propostas_publicas`, `monitoring_alerts`).

## Decisões fechadas no brainstorm (2026-05-20)

| Decisão | Resposta |
|---|---|
| Tela /clientes vs /leads | Tela nova `/dashboard/clientes` separada — só quem comprou |
| Critério "quem é cliente" | Automático via `installation_status` em (contrato_assinado, instalado, medidor_trocado, operando, pos_venda_concluido) |
| Tipo de cliente | residencial / comercial / rural (substitui 'agronegocio' atual no enum) |
| Contato | 1 WhatsApp obrigatório + 1 email (sem alternativos) |
| Concessionárias | Lista pré-cadastrada de todas as principais do Brasil + opção "outra" custom |
| Consumo | Médio mensal (campo único) + opção expandir pra mês a mês (12 valores) |
| Forma de pagamento | Cartão / Boleto / À vista / Financiamento. Se financiamento: banco da lista (BV, Sol Fácil, Sol Agora, Santander, BTG Pactual + "outro") |
| Rateio MMGD | Schema entra na A1 (campos: é_consumidor_rateio, uc_geradora_id ref leads, percentual_rateio, credito_esperado_kwh). Implementação da lógica de cálculo fica pra Frente B |
| Anexos | Upload via Drive (já existe DriveUploader) → grid no perfil. Tipos: parecer_acesso, foto_telhado, foto_instalacao, foto_inversor, foto_visita_tecnica, contrato, outros |
| Visual | Cockpit dark neon (mesma estética `/cockpit`) com timeline narrativa em prosa |
| Eva Insights V1 | 3 cards: upgrade (conta subiu), depoimento (geração acima), aniversário (revisão) — leem de tabelas existentes, sem novo motor |

## Arquitetura

### Visão completa (A1-A5 + B)

```
/dashboard/clientes                  → lista (A1)
/dashboard/clientes/:id              → perfil cockpit (A1: estrutura + 2 abas)
    ↓ abas:
    👤 Dados          ← A1 LIVE
    📸 Anexos         ← A1 LIVE
    ☀ Sistema + Kit  ← A2 (calculadora)
    📄 Propostas     ← A4 (criar direto)
    📖 Timeline      ← A1 LIVE (narrativa simples)
    💬 Conversa      ← A1 LIVE (puxa de eva_conversations existente)
    📋 Relatórios    ← A5 (pós-instalação)
    🤖 Eva Sugere    ← A1 LIVE (3 cards)
```

### Módulos novos (A1)

- `src/modules/dashboard/clientes-queries.ts` — `listClientes`, `getClienteDetail`, `listAnexosCliente`, `getEvaInsights` (3 insights V1)
- `src/modules/dashboard/clientes-views.ts` — `renderClientesListPage`, `renderClienteDetailPage`, `renderClienteEditFormInline`
- `src/modules/anexos/upload.ts` — `uploadAnexoToDrive(file, leadId, tipo)`, reusa `DriveUploader` existente (do proposal-assistant)
- `src/modules/anexos/service.ts` — `AnexoService.list(leadId)`, `.delete(id)`, `.classify(tipo)`

### Modificações em arquivos existentes

- `src/modules/dashboard/router.ts` — registrar 3 rotas: `GET /clientes`, `GET /clientes/:id`, `POST /clientes/:id/edit`, `POST /clientes/:id/anexos`, `DELETE /clientes/:id/anexos/:anexoId`
- `src/modules/dashboard/views.ts` — adicionar import dos novos renders no `renderLayout` (nav side com link "Clientes")

### Schema (migration `033_clientes_perfil.sql`)

Vai alterar `leads` com campos novos + criar `lead_anexos`. NÃO mexe em estrutura existente.

```sql
-- 033_clientes_perfil.sql — Perfil do Cliente Fatia A1

-- 1. Campos novos em leads (cadastro completo + rateio MMGD)
alter table leads add column if not exists cpf_cnpj text;
alter table leads add column if not exists data_nascimento date;
alter table leads add column if not exists estado_civil text;
-- profile já existe; vamos coagir 'agronegocio' -> 'rural'
update leads set profile = 'rural' where profile = 'agronegocio';
-- endereço completo
alter table leads add column if not exists cep text;
alter table leads add column if not exists endereco_rua text;
alter table leads add column if not exists endereco_numero text;
alter table leads add column if not exists endereco_complemento text;
alter table leads add column if not exists uf text;
-- concessionária
alter table leads add column if not exists concessionaria text;       -- ex 'neoenergia-df', 'equatorial-go'
alter table leads add column if not exists uc_numero text;            -- Unidade Consumidora
alter table leads add column if not exists tarifa_classe text;        -- 'B1', 'B3' etc
alter table leads add column if not exists tarifa_modalidade text;    -- 'convencional', 'branca', 'verde', 'azul'
-- consumo
alter table leads add column if not exists consumo_medio_kwh integer;
alter table leads add column if not exists conta_media_brl numeric(10,2);
-- consumo mês a mês (JSON) — opcional, expandido sob clique
alter table leads add column if not exists consumo_mensal_json jsonb; -- {"2025-01": 1200, "2025-02": 1340, ...}
-- pagamento
alter table leads add column if not exists forma_pagamento text;      -- 'cartao', 'boleto', 'a_vista', 'financiamento'
alter table leads add column if not exists banco_financiamento text;  -- 'bv', 'solfacil', 'solagora', 'santander', 'btg', 'outro'
-- rateio MMGD (schema só, lógica de cálculo fica pra Frente B)
alter table leads add column if not exists eh_consumidor_rateio boolean not null default false;
alter table leads add column if not exists uc_geradora_lead_id uuid references leads(id) on delete set null;
alter table leads add column if not exists percentual_rateio numeric(5,2);  -- 0.00 .. 100.00
alter table leads add column if not exists credito_esperado_kwh integer;
-- vendedor/responsável
alter table leads add column if not exists vendedor_responsavel text;
-- observações livres
alter table leads add column if not exists observacoes_perfil text;

-- 2. Tabela de anexos (Drive)
create table lead_anexos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null,                     -- 'parecer_acesso','foto_telhado','foto_instalacao','foto_inversor','foto_visita_tecnica','contrato','outros'
  descricao text,                          -- texto livre
  drive_file_id text not null,             -- ID do arquivo no Google Drive
  drive_url text not null,                 -- link público pra visualização
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  created_by text                          -- 'junior' ou 'eva'
);

create index lead_anexos_by_lead on lead_anexos (lead_id, created_at desc);
create index lead_anexos_by_tipo on lead_anexos (lead_id, tipo);
```

**Junior aplica manual no SQL Editor** (projeto `kupnsoyymulbdzakqlqc`) — MCP aponta pro projeto errado.

## Rotas

### `GET /dashboard/clientes`

Lista filtrada por `installation_status` ∈ {contrato_assinado, instalado, medidor_trocado, operando, pos_venda_concluido}. Suporta query params: `q` (busca nome/telefone/email/CPF), `concessionaria`, `cidade`, `status_jornada` (proposta_aceita, instalado, operando), `ord` (recente, nome, kwp_desc, economia_desc). Limit 50 por página, paginação simples.

Resposta: HTML com cards de cliente em grid 3 colunas (avatar, nome, KPIs principais, status chip). Cada card linka pro detalhe.

### `GET /dashboard/clientes/:id`

Detalhe completo do cliente — a tela cockpit. Carrega em paralelo:
1. `leads.*` (dados base)
2. `sistemas_clientes` onde `lead_id = :id` (sistema FV vinculado, KPIs de geração)
3. `propostas_publicas` onde `lead_id = :id` (lista de propostas)
4. `monitoring_alerts` via `sistema_id` (alertas ativos)
5. `lead_anexos` onde `lead_id = :id` (grid de anexos)
6. `conversations.messages` últimas 5 (preview da aba Conversa)
7. `eva_cadence` onde `lead_id = :id` e `status = 'pending'` (cadência ativa)
8. `eva_intro_pending` (intro pendente?)
9. `maintenance_reminders` futuros 90d (manutenção agendada)

Render: `renderClienteDetailPage(detail)` com layout do mockup aprovado.

### `POST /dashboard/clientes/:id/edit`

Atualiza campos da aba Dados (form inline). Body: subconjunto de leads campos. Validação:
- `phone` obrigatório, formato brasileiro normalizado
- `name` obrigatório, ≥ 2 chars
- `email` opcional, formato email se preenchido
- `cep` opcional, 8 dígitos se preenchido
- `cpf_cnpj` opcional, 11 ou 14 dígitos se preenchido (sem formatação)
- `percentual_rateio` 0-100 se `eh_consumidor_rateio=true`

Retorna 303 redirect pra `/dashboard/clientes/:id` (PRG pattern, já usado em outras rotas).

### `POST /dashboard/clientes/:id/anexos`

Multipart upload. `enctype=multipart/form-data`. Campos: `tipo`, `descricao`, `file`. Upload via `DriveUploader.upload(buffer, filename, leadId)`, grava em `lead_anexos`, redirect pra `/dashboard/clientes/:id#anexos`.

Limite: 20 MB por arquivo. MIME aceito: `image/*`, `application/pdf`. Rejeita resto com 415.

### `DELETE /dashboard/clientes/:id/anexos/:anexoId` (via POST com `_method=delete`)

Remove do `lead_anexos`. NÃO remove do Drive (preserva — pode ser usado em proposta). Confirmação JS antes de submeter.

## Componentes da tela

### Header (sempre visível)

- Avatar circular com iniciais (gradient ciano→roxo)
- Nome completo (h1)
- Subtítulo: 📍 Cidade-UF · Cliente desde {data} · Concessionária
- Chip de status (cor por `installation_status`)
- Botão `📞 Conversar` → abre `wa.me/{phone}` em nova aba
- Botão `📄 Nova proposta` → redirect pra `/dashboard/propostas/novo?lead_id={id}` (rota existente)

### Jornada linear (sempre visível)

Barra horizontal com 6 segmentos coloridos. Cada segmento é uma fase: `Lead → Proposta → Contrato → Instalado → Operando → Pós-venda`. Verde sólido pras fases concluídas, gradient apagando pra atual, cinza pras futuras.

Mapeamento `installation_status` → fase atual:
- `null`/`novo`/`qualificando` → Lead
- `qualificado` → Proposta
- `proposta_aceita`/`contrato_assinado` → Contrato
- `instalado`/`medidor_trocado` → Instalado
- `operando` → Operando
- `pos_venda_concluido` → Pós-venda

### KPIs strip (5 cards)

1. **SISTEMA** — `{kwp} kWp · {qtd_paineis} painéis {painel_marca}`
2. **ECONOMIA** — Em A1: estimativa simples = `geracao_acumulada_kwh * tarifa_estimada(R$1,00)`. Em A2 vira cálculo real.
3. **SAÚDE** — `{ratio_ultimos_7d}%` vs esperado, cor por classificação (`classificarSistema` reuso)
4. **PROPOSTAS** — `{total} · {aceitas} aceita(s)`
5. **ALERTAS** — `{count}` ativos em `monitoring_alerts` (resolved_at is null)

Se cliente não tem sistema vinculado: KPIs 1, 3, 5 mostram "— · vincular sistema" com link pra `/monitoramento/{sistema_id}/editar` se houver candidato por telefone, senão `/monitoramento/importar`.

### Eva Insights (3 cards)

Card 1 — **Upgrade**: dispara se conta de luz subiu ≥ 25% nos últimos 3 meses (precisa de `consumo_mensal_json` populado — V1 mostra placeholder "configure consumo mensal" se vazio).

Card 2 — **Depoimento**: dispara se `geracao_7d > 110%` do esperado E `installed_at` > 60 dias atrás E sem `review_confirmed_at`. Botão "▶ Eva pedir" → cria `maintenance_reminders` com `topic=pedido_depoimento` (cron horário pega).

Card 3 — **Aniversário**: dispara se mês atual = mês de `installed_at` e ano > ano de `installed_at`. Botão "▶ Agendar revisão" → cria `maintenance_reminders` `topic=aniversario_Na`.

Se nenhum insight aplica: card único "✅ Cliente em ordem — nada urgente agora."

### Abas

7 abas no menu horizontal. Em A1:
- 👤 **Dados** — ATIVA
- 📸 **Anexos** — ATIVA
- 📖 **Timeline** — ATIVA (narrativa simples, leitura de eventos cruzados)
- 💬 **Conversa** — ATIVA (puxa `conversations.messages` últimas 20, render igual `renderLeadDetailPage` atual)
- ☀ **Sistema + Kit** — PLACEHOLDER ("Vem na próxima fatia (A2)")
- 📄 **Propostas** — ATIVA (lista filtrada de `propostas_publicas` onde `lead_id=:id`, link pra cada uma, botão "Nova"). Sem criar direto (A4).
- 📋 **Relatórios** — PLACEHOLDER ("Vem na próxima fatia (A5)")

### Aba Dados — form inline editável

Cada bloco (Identificação, Contato, Endereço, Concessionária, Consumo, Rateio, Pagamento, Comercial, Observações) é um card editável. Clique no card → revela inputs → botão Salvar/Cancelar. Sem modal — edita in-place.

Campos por bloco:
- **Identificação:** name, cpf_cnpj, data_nascimento, profile (residencial/comercial/rural), estado_civil
- **Contato:** phone, email
- **Endereço:** cep, endereco_rua, endereco_numero, endereco_complemento, neighborhood, city, uf
- **Concessionária:** concessionaria (select lista BR), uc_numero, tarifa_classe (B1/B2/B3/B4/A4...), tarifa_modalidade (convencional/branca/verde/azul)
- **Consumo:** consumo_medio_kwh, conta_media_brl, botão "📅 Mês a mês" → expande `consumo_mensal_json` (12 inputs do ano corrente)
- **Rateio MMGD:** checkbox eh_consumidor_rateio. Se marcado: select uc_geradora_lead_id (lista de leads com `is_geradora`), percentual_rateio (0-100), credito_esperado_kwh
- **Pagamento:** forma_pagamento, banco_financiamento (visível só se forma=financiamento)
- **Comercial:** lead_source (existente), installation_status, vendedor_responsavel
- **Observações:** observacoes_perfil (textarea)

### Aba Anexos — upload + grid

Grid 6 colunas (responsive 4 em tablet, 2 em mobile). Cada item:
- Thumbnail (imagem direto / ícone PDF / ícone genérico)
- Tipo (label tipo cadastrado)
- Data
- Hover: descrição
- Click: abre `drive_url` em nova aba
- Botão `×` no canto (delete com confirm)

Botão `+ Adicionar` (card tracejado no grid). Abre modal upload com: tipo (select), descrição (input), arquivo (file). Submete via `POST /clientes/:id/anexos`.

### Timeline narrativa (sempre visível, abaixo das abas)

Cruza eventos de várias tabelas em ordem cronológica desc, máx 20 eventos:
- `leads.created_at` → "Lead via {acquisition_source}"
- `propostas_publicas.created_at` → "Proposta R$ {valor}"
- `leads.contract_signed_at` → "Contrato assinado"
- `leads.installed_at` → "Instalação concluída · {sistema}"
- `monitoring_alerts.primeiro_visto_em` → cor por severidade, texto do alerta
- `monitoring_alerts.acao_disparada_em` → "Eva avisou cliente sobre {acao}"
- `maintenance_reminders.sent_at` → "Lembrete {topic} enviado"
- `eva_cadence.sent_at` (último) → "Cadência toque #{step}"

Render: linha vertical com bullet colorida + 80px de data relativa + texto narrativo.

## Eva Insights (lógica V1)

Função `getEvaInsights(detail) → InsightCard[]` em `clientes-queries.ts`. Pura, sem chamadas externas. Recebe o detalhe completo, retorna 0-3 cards. Cada card:
```ts
{ id: 'upgrade'|'depoimento'|'aniversario',
  texto: string,
  cta: { label: string, action: string, params: object } | null }
```

Action types em A1: `eva_pedir_depoimento`, `agendar_revisao_aniversario`. POST handler `/clientes/:id/eva-action` chama `supabase.upsertMaintenanceReminderPublic` apropriado.

## Integrações com módulos existentes

| Fonte | Como A1 usa |
|---|---|
| `sistemas_clientes` | KPI Sistema, KPI Saúde, link pra `/monitoramento/{sistema_id}` |
| `propostas_publicas` | KPI Propostas, aba Propostas |
| `monitoring_alerts` (M6) | KPI Alertas, eventos da Timeline |
| `conversations.messages` | Aba Conversa, eventos Timeline (resumo) |
| `eva_cadence` | Timeline (toques enviados) |
| `maintenance_reminders` | Eva Insights → cria reminders, eventos Timeline (lembretes enviados) |
| `DriveUploader` (proposal-assistant.ts) | Upload de anexos |

## Lista de concessionárias do Brasil (V1)

Hardcoded em constante exportada de `src/modules/concessionarias.ts`:

```ts
export const CONCESSIONARIAS_BR = [
  { id: 'neoenergia-df', nome: 'Neoenergia Brasília', uf: 'DF' },
  { id: 'equatorial-go', nome: 'Equatorial Goiás', uf: 'GO' },
  { id: 'cemig', nome: 'CEMIG', uf: 'MG' },
  { id: 'cpfl-paulista', nome: 'CPFL Paulista', uf: 'SP' },
  { id: 'enel-sp', nome: 'Enel São Paulo', uf: 'SP' },
  { id: 'enel-rj', nome: 'Enel Rio de Janeiro', uf: 'RJ' },
  { id: 'enel-ce', nome: 'Enel Ceará', uf: 'CE' },
  { id: 'light', nome: 'Light', uf: 'RJ' },
  { id: 'coelba', nome: 'Coelba (Neoenergia BA)', uf: 'BA' },
  { id: 'celpe', nome: 'Celpe (Neoenergia PE)', uf: 'PE' },
  { id: 'cosern', nome: 'Cosern (Neoenergia RN)', uf: 'RN' },
  { id: 'copel', nome: 'Copel', uf: 'PR' },
  { id: 'celesc', nome: 'Celesc', uf: 'SC' },
  { id: 'rge', nome: 'RGE Sul', uf: 'RS' },
  { id: 'ceee', nome: 'CEEE Equatorial', uf: 'RS' },
  { id: 'energisa-mt', nome: 'Energisa MT', uf: 'MT' },
  { id: 'energisa-ms', nome: 'Energisa MS', uf: 'MS' },
  { id: 'energisa-to', nome: 'Energisa Tocantins', uf: 'TO' },
  { id: 'energisa-pb', nome: 'Energisa Paraíba', uf: 'PB' },
  { id: 'energisa-se', nome: 'Energisa Sergipe', uf: 'SE' },
  { id: 'energisa-mg', nome: 'Energisa Minas Gerais', uf: 'MG' },
  { id: 'amazonas-energia', nome: 'Amazonas Energia', uf: 'AM' },
  { id: 'cea-equatorial', nome: 'CEA Equatorial', uf: 'AP' },
  { id: 'equatorial-ma', nome: 'Equatorial Maranhão', uf: 'MA' },
  { id: 'equatorial-pa', nome: 'Equatorial Pará', uf: 'PA' },
  { id: 'equatorial-pi', nome: 'Equatorial Piauí', uf: 'PI' },
  { id: 'roraima-energia', nome: 'Roraima Energia', uf: 'RR' },
  { id: 'eletroacre', nome: 'Energisa Acre', uf: 'AC' },
  { id: 'energisa-ro', nome: 'Energisa Rondônia', uf: 'RO' },
  { id: 'outra', nome: 'Outra (custom)', uf: null },
];
```

Quando user seleciona `outra`, libera input texto livre que grava em `leads.concessionaria` como string custom (não validada).

## Error handling

| Cenário | Comportamento |
|---|---|
| Cliente sem sistema vinculado | KPIs 1/3/5 mostram "—" + link "vincular sistema" |
| Cliente sem `installed_at` | KPI Economia mostra "—". Aniversário insight não dispara |
| Upload Drive falha | Retorna 500 com mensagem clara, anexo NÃO entra na tabela |
| Lead_anexo cuja `drive_file_id` foi removido externamente | Link 404 — anexo ainda aparece no grid, mas click leva a erro Drive. Fast-follow: cron de verificação de integridade |
| Cliente em opt_out | Header mostra chip "🚫 OPT-OUT" + Eva Insights `cta` desabilitados ("Eva não pode falar com esse lead") |
| Concessionária = "outra" sem texto custom | Aceita `null` no banco (sem validação extra) |
| `eh_consumidor_rateio = true` sem `uc_geradora_lead_id` | Validação 400 no POST edit; UI mostra erro inline |
| Junior tenta marcar cliente como rateio cuja UC geradora não existe | Select de uc_geradora_lead_id só lista leads com flag (futuro: `is_geradora_mmgd`). Em A1, mostra TODOS os leads com `lead_source` (workaround manual) |

## Observabilidade

Logs estruturados (mesmo padrão do M6):
- `[clientes] list: {total} clientes (filtros: {q,concessionaria,...})`
- `[clientes] detail loaded sistema={id} alerts_ativos={n}`
- `[clientes] edit lead={id} fields_changed={count}`
- `[clientes] anexo uploaded lead={id} tipo={tipo} drive_file={id}`
- `[clientes] eva_action {action} lead={id} reminder_created={topic}`

Dashboard `/cockpit`: adicionar tile "Clientes operando" — count de `installation_status='operando'` (1 query). Não bloqueia A1 mas é fast-follow trivial (~10min).

## Testes (TDD por camada)

### Pura (`tests/clientes-insights.test.ts`)
- `getEvaInsights` retorna upgrade quando conta subiu ≥25% em 3 meses
- Retorna depoimento quando ratio_7d > 110% E installed > 60d E sem review
- Retorna aniversário quando mês atual = mês installed_at E ano > ano installed
- Retorna 0 cards quando nenhuma regra aplica
- Não dispara aniversário se cliente já recebeu lembrete `aniversario_Na` nos últimos 30d

### Pura (`tests/clientes-mappers.test.ts`)
- Map `installation_status` → fase da jornada (todos os 8+ valores)
- Map `installation_status` → cor do chip de status
- Map `installation_status` → label legível PT-BR

### Service Supabase (`tests/clientes-queries.test.ts`)
- `listClientes` filtra apenas `installation_status` ∈ {whitelist}
- `getClienteDetail` agrega em paralelo (mock 9 chamadas, valida resultado mesclado)
- `listAnexosCliente` ordena por `created_at desc`
- Query degrada graciosamente quando uma das 9 fontes falha (logs erro, segue)

### Router (`tests/clientes-router.test.ts`)
- GET /clientes responde 200 + HTML
- GET /clientes/:id com :id inválido → 400
- GET /clientes/:id inexistente → 404
- POST /clientes/:id/edit aceita atualização parcial
- POST /clientes/:id/edit rejeita phone vazio (400)
- POST /clientes/:id/edit rejeita CEP malformado quando preenchido
- POST /clientes/:id/anexos rejeita arquivo > 20MB (413)
- POST /clientes/:id/anexos rejeita MIME não permitido (415)

### Smoke em prod
- Aplica migration 033, redeploya, abre `/dashboard/clientes`
- Confirma que clientes da carteira já populam a lista (todos com `installation_status` >= contrato)
- Abre 1 cliente, edita um campo (telefone), salva, recarrega — campo persistiu
- Upload de 1 foto de teste, vê no grid, deleta, vê sumir

## Deploy

1. Junior aplica `033_clientes_perfil.sql` no SQL Editor (`kupnsoyymulbdzakqlqc`)
2. Implementação task-por-task com TDD (plano detalhado via `writing-plans`)
3. Push, Easypanel auto-pull SSH, Junior Implanta
4. Smoke conforme checklist acima
5. Monitora 1 dia. Próxima sessão = A2 (calculadora)

## Fast-follows (fora de A1)

- **A2** — Aba Sistema+Kit ativa: calculadora (HSP, perda, kit, serviço, imposto → total), reusa Eva Precificadora
- **A3** — Sugestão por cidade (motor aprendizagem real-vs-estimado, project 08/05)
- **A4** — Aba Propostas: botão "Criar proposta" direto (reusa `/proposta`)
- **A5** — Aba Relatórios: pós-instalação automático (reusa template S3)
- **Frente B (B1-B4)** — Coleta automática de contas + parser + rateio MMGD cálculo
- Marcar lead como "geradora MMGD" (`is_geradora_mmgd` flag + tela própria gestão de UCs beneficiárias) — pré-requisito pra B4
- Cron de integridade Drive (verifica `drive_file_id` ainda existe)
- Tile "Clientes operando" no /cockpit
- Comando `/cliente buscar João` no WhatsApp pra Junior achar cliente direto (memória contextual prevista pra Fatia C anterior — mantida na fila)

## Referências internas

- `frente-monitoramento-manutencao-alerta-carteira` (M6 acabou de entregar — usa monitoring_alerts)
- `visao-plataforma-ecosun` — Módulos 4 (cadastro), 5 (monitoramento), 6 (alerta), portal cliente futuro
- `cockpit-redondo-13-05` — estética visual
- `eva-proposta-v2-em-prod` — DriveUploader reuso
- `dashboard-sempre-pt-br`
- `contexto-antes-de-acessar`
- `observabilidade-obrigatoria`
- `reference-supabase-mcp-mismatch` (Junior aplica SQL manual)
- `motor-aprendizagem-real-vs-estimado-pendente-visao-junior-08-05` (alimenta A3)
- `lei-14300-limites-mmgd` (regras rateio na Frente B)
