# Spec — Dashboard EcoSun vira CRM de Vendas + Pós-venda (com gestão delegável)

**Data:** 2026-06-23
**Repo:** `ecosunpower-agente` (o dashboard é servido pelo mesmo Express do agente)
**Autor do produto:** Junior (EcoSunPower) · brainstorm conduzido com Claude

---

## 1. Problema / contexto

O time de vendas e pós-venda da EcoSun está se estruturando (2 vendedores agora, mais à frente). Hoje o dashboard é uma ferramenta de **um dono só** (senha única, todos veem tudo). Junior precisa que ele vire um **CRM**: leads da Eva entram num balcão compartilhado, cada vendedor "puxa" o que vai trabalhar, e o gestor (Junior) mantém visão total. A visão de longo prazo é uma **camada gerencial/estratégica delegável** — Junior poder entregar responsabilidades (vendas, pós-venda, financeiro, gestão) sem perder o controle, e decidir com dados na mão.

**Princípio-guia:** evoluir o dashboard **no lugar** (não reescrever). Reusa auth, layout (Tailwind via CDN), telas de detalhe, geração de proposta e a IA que já existe (`lead-synthesis.ts`, Claude). Adiciona um toque de JavaScript leve só onde precisa (kanban, painel de IA).

**Eva fica intacta** — nada do atendimento/agente muda. Este projeto é só o dashboard.

---

## 2. Objetivos

1. **Multiusuário com permissões delegáveis** — papéis com acesso por área (leads, usinas, propostas, financeiro, marketing, relatórios, usuários). Admin cria/edita papéis e usuários numa tela, sem mexer em código.
2. **Pool + dono automático de leads** — lead novo da Eva fica no balcão dos vendedores; ao abrir, o vendedor vira dono e o lead some dos outros; admin vê tudo e pode reatribuir/soltar.
3. **Pipeline visual (kanban)** — colunas por etapa, card com nome/valor/vendedor/alerta de tempo, arrasta pra mudar etapa.
4. **Cockpit do lead com "botão pra tudo"** — última conversa, dados do cliente e ações: gerar/imprimir proposta, registrar atividade, agendar tarefa, mudar etapa, fechar/perder.
5. **Alertas de tempo (SLA)** — badge automático de lead parado sem contato; lista "precisam de atenção".
6. **Registro de tudo por pessoa** — cada ação grava quem fez e quando → base dos relatórios "o que cada um fez no dia/mês/ano".
7. **IA assistente** — no lead: resume, sugere próximo passo, escreve rascunho de follow-up, ajuda com cálculo de economia/payback/valores pra fechar, guarda informações. No admin: relatórios + sugestões de melhoria (atendimento e do próprio dashboard).
8. **Camada estratégica** — cockpit de gestão cruzando performance da equipe, conversão, financeiro e geração das usinas, com leitura da IA pra decisão.

### Não-objetivos (fora deste projeto)
- Mexer na Eva / no agente de atendimento.
- Reescrever o dashboard como app SPA (React etc.).
- Dimensionamento técnico completo (isso é da Calculadora EcoSun; a IA do CRM dá estimativas rápidas e argumentos, não substitui a calculadora).
- Tempo real (websockets) no v1 — auto-refresh já existe; real-time pode entrar depois.
- App mobile nativo.

---

## 3. Estado atual (o que já existe e será reaproveitado)

- **Auth** (`src/modules/dashboard/auth.ts`): cookie HMAC, senha **única** (`DASHBOARD_PASSWORD`), TTL 60 dias. → vai virar multiusuário.
- **Router** (`src/modules/dashboard/router.ts`, ~1962 linhas): rotas `/cockpit`, `/home`, `/leads`(+`/:id` e ações), `/clientes`(+`/:id`), `/propostas`, `/monitoramento`(+`/:id`), `/marketing`, `/financeiro`, `/cadencia`, `/manutencao`.
- **Telas de detalhe** já existem (lead, cliente, usina).
- **Funil de vendas** já existe: `leads.status` enum (`novo/qualificando/qualificado/agendado/transferido/inativo/perdido`) + `loss_reason`.
- **Funil de pós-venda**: `leads.installation_status` (`contrato_assinado→…→pos_venda_concluido`).
- **Dono (parcial)**: campo `leads.vendedor_responsavel` (texto livre, sem login por pessoa).
- **Conversa por lead**: tabela `conversations` (mensagens Eva↔cliente, `last_message_at`).
- **Propostas**: `propostas_publicas` (vínculo `lead_id`, `dados_input` com investimento/sistemas) + form de criação + `proposta-prefill.ts`.
- **IA já existe**: `lead-synthesis.ts` (síntese de leads + insights) usando Claude (`anthropicApiKey`).
- **Usinas**: `sistemas_clientes` + `geracao_diaria` + `alertas_sistema`.
- **Financeiro**: `financeiro_contas_a_receber`, RBT12, fator R.
- **UI**: Tailwind via CDN, cores EcoSun (navy→sky + amarelo solar), componentes de badge/tabela/card, ECharts via CDN. Tudo server-rendered (sem build de front).

---

## 4. Arquitetura

**Abordagem escolhida: evoluir no lugar (server-rendered + JS leve), recusada a reescrita SPA.**

- **Backend:** continua no Express do agente, módulo `src/modules/dashboard/`. Novos arquivos seguindo o padrão atual (`*-queries.ts` + `*-views.ts`).
- **Banco:** Supabase/Postgres. Novas tabelas + colunas via migrations numeradas (próximas após a 055). Onde fizer sentido, **RLS** reforça o "delegável" no nível do banco (defesa em profundidade; a checagem principal de permissão fica no app, mas RLS blinda).
- **Auth:** cookie passa a identificar o **usuário** (id), não só "logado/sim". Middleware carrega o usuário + papel + permissões e expõe em `req` pra cada rota checar a área.
- **Front:** server-rendered. JS leve via CDN só onde precisa: **SortableJS** (arrastar kanban) e um pequeno script pro **painel de IA** (fetch + render). Sem framework, sem build novo.
- **IA:** reusa o cliente Claude já configurado. Endpoints novos pra assistente do lead e insights estratégicos. Conteúdo de fonte externa/entrada do usuário tratado como dado (mesma disciplina anti-injection já usada).

### Modelo de permissões (o coração do "delegável")

Duas tabelas novas:

- **`dashboard_users`**: `id`, `nome`, `login` (único), `senha_hash`, `role_id` (fk), `ativo` (bool), `created_at`, `last_login_at`.
- **`dashboard_roles`**: `id`, `nome`, `permissoes` (jsonb), `is_admin` (bool), `created_at`.

`permissoes` é um mapa **área → nível**:
```
{
  "leads":      "edit",   // none | view | edit
  "usinas":     "view",
  "propostas":  "edit",
  "financeiro": "none",
  "marketing":  "none",
  "relatorios": "none",
  "usuarios":   "none"    // só admin gerencia usuários
}
```
- Níveis: `none` (não vê), `view` (só leitura), `edit` (opera).
- `is_admin = true` → ignora o mapa e libera tudo (Junior).
- **Papéis-semente:** `admin` (Junior), `vendedor` (leads edit + usinas view + propostas edit), e exemplos prontos pra delegar depois: `gerente_vendas`, `pos_venda`, `financeiro`. Admin cria/edita papéis pela tela de usuários → **qualquer área é delegável** sem código.

### Posse de lead (claim) e visibilidade

Colunas novas em `leads`:
- `claimed_by` (uuid, fk `dashboard_users`, nullable) — o dono atual.
- `claimed_at` (timestamptz, nullable).
- `last_contact_at` (timestamptz, nullable) — alimenta o SLA (atualizado por atividade manual e/ou última mensagem da conversa).

Regras de visibilidade (aplicadas nas queries de lista/kanban e no detalhe):
- **Admin / quem tem `leads` e `is_admin` ou papel com visão total:** vê **todos** os leads.
- **Vendedor:** vê leads com `claimed_by IS NULL` (balcão) **OU** `claimed_by = eu`. Não vê os de outro vendedor.
- **Claim automático:** quando um vendedor abre `/leads/:id` de um lead com `claimed_by IS NULL`, o sistema seta `claimed_by = ele` + `claimed_at = now()` (e registra a atividade "assumiu o lead"). Admin abrindo **não** captura o lead.
- **Reatribuir/soltar:** admin pode `claimed_by = outro` ou `NULL` (volta pro balcão). Vira ação no detalhe (visível só pra admin).

> Mantemos `vendedor_responsavel` (texto) por compatibilidade, mas o **dono real** passa a ser `claimed_by`. Na migração, se `vendedor_responsavel` casar com um usuário, podemos popular `claimed_by` (best-effort, opcional).

### Atividades e tarefas

Tabela nova **`lead_activities`**:
- `id`, `lead_id` (fk), `user_id` (fk `dashboard_users`, quem fez), `tipo` (`ligacao|whatsapp|email|visita|proposta|nota|tarefa|mudanca_etapa|claim`), `descricao` (text), `due_at` (timestamptz, só pra `tarefa`), `done_at` (timestamptz, tarefa concluída), `created_at`.
- **Powers:** timeline do lead, tarefas/lembretes (pendências), cálculo de SLA (última atividade), e os **relatórios por pessoa** (agrupa por `user_id` + período).
- Parte é automática (claim, mudança de etapa, proposta gerada registram atividade sozinhos); parte é manual via botões ("registrar ligação", "agendar tarefa", "anotação").

### SLA / alertas de tempo

Cálculo no servidor (sem infra nova): para cada lead em aberto, `horas_sem_contato = now - max(last_contact_at, claimed_at, última conversa)`. Badge:
- 🟢 ok · 🟡 > 24h parado · 🔴 > 72h parado (limiares configuráveis depois).
Lista "**Precisam de atenção**" = leads do usuário (ou de todos, pro admin) ordenados por mais parados + tarefas vencidas.

---

## 5. As fatias (escopo incremental — entregar valor cedo)

Cada fatia é um plano próprio (writing-plans gera o detalhamento). A Fatia 1 é a fundação que destrava o resto.

### Fatia 1 — Fundação multiusuário + permissões delegáveis + claim
- Migrations: `dashboard_users`, `dashboard_roles` (com papéis-semente), colunas `claimed_by`/`claimed_at`/`last_contact_at` em `leads`.
- Auth multiusuário: login por pessoa, cookie com `user_id`, middleware carrega usuário+papel+permissões, helper `can(req, area, nivel)`.
- Tela **admin de usuários** (`/usuarios`): criar/editar/desativar usuário, escolher papel; criar/editar papel (mapa de áreas). Só quem tem `usuarios:edit`/admin.
- Gate de permissão nas rotas existentes (leads, usinas/monitoramento, propostas, financeiro, marketing) conforme o papel.
- Claim automático + filtro de visibilidade nas listas de leads. Admin reatribui/solta.
- Seed inicial: usuário admin (Junior) + `vendedor1`/`vendedor2` (Junior renomeia depois).

### Fatia 2 — Pipeline kanban + cockpit do lead
- Página **`/pipeline`** (kanban): colunas por `status`, cards (nome, valor estimado, dono, badge SLA), arrastar p/ mudar etapa (SortableJS → reusa `/leads/:id/set-status`). Respeita visibilidade.
- **Cockpit do lead** (evolui `/leads/:id`): última conversa + dados + botões: **gerar/imprimir proposta** (reusa form + `proposta-prefill`), **registrar atividade** (ligação/nota), **agendar tarefa**, **mudar etapa**, **fechar/perder**. Permissão de proposta pra vendedor.
- Tabela `lead_activities` + timeline no detalhe. `last_contact_at` atualizado a cada atividade.
- Badges de SLA + bloco "Precisam de atenção".

### Fatia 3 — Registro por pessoa + relatórios
- Log de ação por `user_id` consolidado (já gravado na Fatia 2; aqui vira relatório).
- Painel **admin "Equipe"** (`/equipe`): o que cada vendedor fez no **dia/mês/ano** (atividades, leads assumidos, propostas, fechamentos), conversão por etapa, comparativo entre vendedores.
- Relatórios exportáveis (CSV) e visão por período.

### Fatia 4 — IA assistente
- **No lead:** painel de IA (reusa Claude) — resume a conversa, sugere próximo passo, escreve rascunho de follow-up, faz **estimativa rápida de economia/payback/valor** pra ajudar a fechar (puxa consumo/conta do lead), e guarda anotações geradas. Botão pra tudo.
- **No admin:** "sugestões de melhoria" — IA analisa atendimentos e o uso do dashboard e propõe melhorias (do atendimento e da própria ferramenta).
- **Board de pós-venda:** kanban/quadro do `installation_status` (clientes que fecharam), com dono delegável (papel `pos_venda`).

### Fatia 5 — Cockpit de gestão estratégica
- Evolui `/cockpit` numa visão executiva: performance por vendedor, conversão por etapa/canal, saúde financeira (RBT12, a receber), geração das usinas, alertas.
- **IA estratégica:** cruza os dados e entrega leitura + recomendação pra decisão ("gargalo na etapa X", "canal Y esfriando", "vendedor Z forte em comercial").
- Tudo respeitando permissões (delegável a um papel "Diretor/Gestor").

---

## 6. Modelo de dados (resumo das mudanças)

**Tabelas novas:**
- `dashboard_users` (id, nome, login, senha_hash, role_id, ativo, created_at, last_login_at)
- `dashboard_roles` (id, nome, permissoes jsonb, is_admin, created_at)
- `lead_activities` (id, lead_id, user_id, tipo, descricao, due_at, done_at, created_at)

**Colunas novas em `leads`:** `claimed_by` (uuid), `claimed_at` (timestamptz), `last_contact_at` (timestamptz).

**RLS:** habilitar nas tabelas sensíveis onde o app já usa service role; políticas espelham as regras de visibilidade como defesa em profundidade (a checagem primária é no app via `can()`).

---

## 7. Segurança

- Senhas com hash forte (bcrypt/argon2 — escolher no plano; nada de senha em texto).
- Cookie assinado (HMAC) com `user_id` + expiração; HttpOnly/Secure/SameSite como hoje.
- Toda rota passa por `can(req, area, nivel)`; negação retorna 403 e some do menu.
- Migração da senha única: durante a transição, manter `DASHBOARD_PASSWORD` como fallback de emergência do admin (opcional, decidir no plano) ou cortar de vez após criar o admin.
- Entrada do usuário e conteúdo pra IA tratados como dado (anti-injection).

---

## 8. Testes

- **Unitários (vitest):** lógica de permissão `can()`, cálculo de SLA (função pura), regras de visibilidade de lead (dado usuário+papel → quais leads), parsing de períodos dos relatórios. Seguir o padrão dos testes existentes.
- **Sem rede nos testes:** funções puras isoladas; queries mockadas como nos testes atuais.
- Cada fatia entrega seus testes antes do push (padrão do projeto: review 3× + tsc limpo).

---

## 9. Implantação

- Migrations aplicadas no Supabase **antes** do deploy de cada fatia (padrão do projeto).
- Sem novas dependências pesadas (SortableJS via CDN; hash de senha é lib pequena). Mesmo deploy EasyPanel.
- Cada fatia: push → migration → Implantar → smoke. Não pushar sem autorização do Junior.

---

## 10. Decisões fechadas no brainstorm

- Claim **automático ao abrir** (não por botão).
- Vendedores acessam **leads + usinas**; admin tudo.
- **Kanban** no pipeline.
- Usuários **genéricos** no seed (`vendedor1`/`vendedor2`), Junior renomeia/adiciona pela tela.
- Permissões **por área, delegáveis** desde a Fatia 1 (fundação do acoplamento gerencial).
- Eva **intacta**. Stack atual (Supabase + Claude + server-rendered + JS leve) é suficiente e moderna; sem reescrita.
- Ordem: Fatia 1 (fundação) → 2 (pipeline+cockpit) → 3 (relatórios) → 4 (IA+pós-venda) → 5 (gestão estratégica).
