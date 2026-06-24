# Spec — Plataforma integrada de gestão para empresas de energia (começa como CRM)

**Data:** 2026-06-23 (atualizada com a visão de produto do Junior)
**Repo:** `ecosunpower-agente` (o dashboard é servido pelo mesmo Express do agente)
**Autor do produto:** Junior (EcoSunPower) · brainstorm conduzido com Claude

---

## 1. Visão do produto

Construir uma **plataforma integrada para empresas de Energia Solar e Engenharia Elétrica**, iniciando como **CRM comercial** e evoluindo para uma solução completa de **vendas, engenharia, instalação, homologação, pós-venda e inteligência de negócios**.

O sistema atual (dashboard do agente) é a semente. Evoluímos **no lugar**, em camadas, cada uma entregando valor usável antes da próxima. A fundação (Fase 1) destrava todo o resto.

**Objetivo final:** transformar o CRM comercial numa **plataforma única de gestão** para empresas de energia — centralizando vendas, engenharia, instalação, homologação, pós-venda e inteligência estratégica.

### Princípios
- **Evoluir no lugar** (server-rendered + JS leve), não reescrever em SPA.
- **Sem código pro Junior:** permissões e (depois) automações configuráveis por tela.
- **Multi-tenant desde o esqueleto:** cada registro carrega a empresa dona → preparado pra virar SaaS (conecta com o EcoSof) sem reescrever. Single-empresa agora, multiempresa pronto pra ligar.
- **Eva intacta:** nada do agente de atendimento muda neste projeto.
- **Auditoria e rastreabilidade** em tudo desde a fundação.

### Arquitetura inicial (mantém a stack atual)
- **Supabase/Postgres** (com RLS pra blindar permissão e tenant no nível do banco).
- **Claude/IA** (reusa o cliente já configurado).
- **Aplicação server-rendered** (Express + Tailwind via CDN), JS leve via CDN só onde precisa (kanban, painel de IA).
- Estrutura preparada para crescimento e **multi-tenant**.

---

## 2. Estado atual (reaproveitado)

- **Auth** (`dashboard/auth.ts`): cookie HMAC, senha única (`DASHBOARD_PASSWORD`). → vira multiusuário.
- **Router** (`dashboard/router.ts`): `/cockpit`, `/home`, `/leads`(+`/:id`+ações), `/clientes`(+`/:id`), `/propostas`, `/monitoramento`(+`/:id`), `/marketing`, `/financeiro`, `/cadencia`, `/manutencao`.
- **Funil de vendas:** `leads.status` (`novo/qualificando/qualificado/agendado/transferido/inativo/perdido`) + `loss_reason`.
- **Funil de pós-venda:** `leads.installation_status`.
- **Dono parcial:** `leads.vendedor_responsavel` (texto). → vira `claimed_by` (usuário).
- **Conversa:** `conversations` (mensagens Eva↔cliente, `last_message_at`).
- **Propostas:** `propostas_publicas` (vínculo `lead_id`, `dados_input`) + form + `proposta-prefill.ts`.
- **IA:** `lead-synthesis.ts` (Claude).
- **Usinas:** `sistemas_clientes` + `geracao_diaria` + `alertas_sistema`.
- **Financeiro:** `financeiro_contas_a_receber`, RBT12, fator R.
- **UI:** Tailwind CDN, cores EcoSun, badges/tabelas/cards, ECharts CDN, server-rendered.

---

## 3. Roadmap (camadas / fases)

Cada fase = seu próprio spec→plano→construção→validação. Ordem:

1. **Fundação** ⭐ (prioridade máxima) — multiusuário + permissões + pool/claim + auditoria + esqueleto multi-tenant.
2. **CRM Comercial** — kanban + cockpit do lead + timeline unificada + SLA/alertas + documentos.
3. **Operação (Engenharia/Instalação/Homologação)** — módulo de usinas com etapas + gestão de homologação + docs técnicos.
4. **Automação** — motor de regras sem código.
5. **IA Assistente** — comercial + engenharia + gestão.
6. **Cockpit Estratégico** — painel executivo + insights automáticos.
7. **Expansão** — outros segmentos (elétrica, SPDA, subestações, EV, manutenção) + multi-tenant completo (SaaS/EcoSof).

---

## 4. FASE 1 — Fundação (esta é a que vamos detalhar primeiro)

### 4.1 Multiusuário e permissões (configurável sem código)

Duas tabelas:
- **`dashboard_users`**: `id`, `company_id` (multi-tenant), `nome`, `login` (único por empresa), `senha_hash` (bcrypt/argon2), `role_id`, `ativo`, `created_at`, `last_login_at`.
- **`dashboard_roles`**: `id`, `company_id`, `nome`, `permissoes` (jsonb), `is_admin`, `created_at`.

**Áreas de permissão:** Leads, Propostas, Usinas, Financeiro, Marketing, Relatórios, Usuários, Configurações.

**Níveis por área (CRUD+):** `visualizar`, `criar`, `editar`, `excluir`, `exportar`, `administrar`. Representados como flags por área no `permissoes` jsonb, ex.:
```
{
  "leads":         ["visualizar","criar","editar","exportar"],
  "propostas":     ["visualizar","criar","editar"],
  "usinas":        ["visualizar"],
  "financeiro":    [],
  "marketing":     [],
  "relatorios":    ["visualizar"],
  "usuarios":      [],
  "configuracoes": []
}
```
- `is_admin = true` → libera tudo (Junior).
- **Papéis-semente:** Administrador, Comercial, Pós-venda, Financeiro, Engenharia, Instalação. Admin cria/edita papéis e usuários pela tela `/usuarios` → **qualquer área e nível é delegável** sem código.
- Helper central `can(req, area, nivel)`; rota nega com 403 e some do menu.

### 4.2 Pool de Leads + Claim automático
- Colunas novas em `leads`: `company_id`, `claimed_by` (uuid fk users), `claimed_at`, `last_contact_at`.
- Fluxo: lead entra no **Pool** → vendedor autorizado abre → **Claim automático** (`claimed_by = ele`) → lead pertence a ele e **some da fila dos demais** → **admin reatribui/solta**.
- Visibilidade: vendedor vê `claimed_by IS NULL` (pool) OU `claimed_by = eu`; admin vê tudo. Admin abrindo não captura.
- Objetivo: sem conflito entre vendedores, sem atendimento duplicado, rastreabilidade total.

### 4.3 Auditoria completa
- Tabela **`audit_log`**: `id`, `company_id`, `user_id`, `entidade` (lead/proposta/usina/usuario/...), `entidade_id`, `acao` (criou/alterou/excluiu/claim/etapa/login/exportou), `campo` (quando alteração de campo), `valor_antigo`, `valor_novo`, `created_at`.
- Registra **quem criou/alterou/excluiu, data/hora e o campo alterado**.
- Objetivo: histórico completo, segurança operacional, base dos **relatórios de produtividade** (quem fez o quê, dia/mês/ano).
- Implementação: helper único `audit(...)` chamado nas mutações; onde couber, trigger no banco como rede de segurança.

### 4.4 Esqueleto multi-tenant
- `company_id` em todas as tabelas novas (e nas existentes conforme a fase tocar nelas).
- Tenant atual = EcoSunPower (empresa nº 0/seed). Helper resolve a empresa do usuário logado e filtra tudo por ela.
- RLS por `company_id` + por permissão nas tabelas sensíveis (defesa em profundidade; checagem primária no app).
- Não construir onboarding/billing de SaaS agora — só o esqueleto. SaaS completo = Fase 7.

### 4.5 Auth multiusuário
- Login por pessoa; cookie assinado (HMAC) com `user_id`+expiração; HttpOnly/Secure/SameSite como hoje.
- Middleware carrega usuário+papel+permissões em `req`.
- Senha com hash forte (definir bcrypt vs argon2 no plano).
- Migração: criar admin (Junior) + `comercial1`/`comercial2` (seed, Junior renomeia). `DASHBOARD_PASSWORD` como fallback de emergência só até o admin existir (decidir corte no plano).

### Entregável da Fase 1
Pronto pra: cada pessoa entra com seu login; admin cria papéis/usuários e delega áreas; leads viram pool com claim automático; tudo auditado; banco preparado pra multiempresa. **Sem ainda** o kanban/cockpit novo (Fase 2) — as telas atuais já passam a respeitar permissão e claim.

---

## 5. Fases seguintes (resumo — viram specs próprias)

- **Fase 2 — CRM Comercial:** Kanban com etapas (Novo Lead · Primeiro Contato · Qualificação · Análise de Consumo · Proposta Enviada · Negociação · Fechado Ganho · Fechado Perdido; etapas customizáveis depois). Cockpit do lead (dados/telefones/WhatsApp/consumo/distribuidora/histórico/atividades/tarefas/propostas/documentos/observações) com ações rápidas (criar proposta, agendar atividade, criar tarefa, mudar etapa, ganho, perdido). Timeline unificada (ligações/WhatsApp/e-mails/visitas/propostas/contratos/instalações/homologações). SLA/alertas ("lead sem contato 24h", "sem atualização 48h", "proposta sem retorno 7d") + painel "Precisam de Atenção". Gestão de documentos (conta de energia, proposta, contrato, ART, parecer, fotos, projetos).
- **Fase 3 — Operação:** módulo de usinas (cliente, potência, módulos, inversores, estrutura, distribuidora, status) com etapas (projeto→aprovação→instalação→vistoria→homologação→operação). Gestão de homologação (solicitação→análise→aprovação→instalação→troca de medidor→liberação).
- **Fase 4 — Automação:** motor de regras sem código (ex.: aprovar proposta→criar instalação; homologar→solicitar avaliação; perder lead→pedir motivo; vencer prazo→gerar alerta).
- **Fase 5 — IA Assistente:** Comercial (gerar mensagens/e-mails, resumir histórico, criar propostas), Engenharia (cálculo de geração, economia, payback, sugestão de equipamentos), Gestão (gargalos, oportunidades, insights).
- **Fase 6 — Cockpit Estratégico:** vendas, conversão, ticket médio, faturamento, kWp vendido, receita prevista/realizada, tempo médio de fechamento. Insights automáticos (melhor vendedor/origem/região/tipo de projeto/gargalos).
- **Fase 7 — Expansão:** Energia Solar, Engenharia Elétrica, SPDA, Subestações, Eficiência Energética, Carregadores Veiculares, Manutenção + multi-tenant completo (SaaS/EcoSof).

---

## 6. Não-objetivos (deste projeto / desta fase)
- Mexer na Eva / no agente de atendimento.
- Reescrever como SPA.
- Dimensionamento técnico completo (é da Calculadora EcoSun; a IA dá estimativa rápida).
- Tempo real (websockets) no v1.
- Onboarding/billing de SaaS multiempresa agora (só esqueleto; completo na Fase 7).

---

## 7. Testes e implantação
- **Testes (vitest):** lógica de permissão `can()`, regras de visibilidade/claim, auditoria, cálculo de SLA — funções puras, sem rede, no padrão atual. Review 3× + tsc limpo antes do push (padrão do projeto).
- **Implantação:** migrations aplicadas no Supabase **antes** do deploy de cada fase. Sem deps pesadas. Cada fase: push → migration → Implantar → smoke. Nunca pushar sem autorização do Junior.

---

## 8. Decisões fechadas no brainstorm
- Claim **automático ao abrir**. Vendedores acessam leads + usinas; admin tudo.
- **Kanban** no pipeline (8 etapas, customizáveis depois).
- Permissões **por área e nível (CRUD+exportar+administrar)**, delegáveis sem código, desde a Fase 1.
- **Auditoria completa** entra na Fase 1.
- **Multi-tenant** preparado no esqueleto desde a Fase 1 (single-empresa agora).
- Usuários genéricos no seed, Junior renomeia/adiciona pela tela.
- Eva intacta. Stack atual (Supabase + Claude + server-rendered + JS leve) é suficiente e moderna; sem reescrita.
- Ordem das 7 fases acima; **Fase 1 (fundação) é o próximo plano a escrever**.
