# Cérebro do Ecossistema + Máquina de E-mail — Fatia 1

**Data:** 2026-07-11
**Autor:** Junior (EcoSunPower) + Claude (brainstorm)
**Status:** Aprovado para virar plano de implementação
**Repo:** `ecosunpower-agente` (Express server-rendered + Tailwind + Supabase + Claude)
**Supabase prod:** ref `kupnsoyymulbdzakqlqc`

---

## 0. Nomes (identidade)

- **Elo** = o nome do cérebro (a inteligência central que fala e interage). Significa o "elo" que liga tudo — *nada se perde, tudo se conecta*. Faz par com a **Eva** (rosto do atendimento no WhatsApp). Decidido pelo Junior 11/07.
- **Departamentos** = os módulos do ecossistema, organizados como áreas de uma empresa que o Elo coordena:

| Departamento | Reúne |
|---|---|
| 🎯 Comercial | Leads · Funil/CRM · Propostas |
| 💬 Atendimento | Eva (WhatsApp) |
| 📣 Marketing | Campanhas · Site/Blog · **E-mail** |
| ⚡ Operação / Engenharia | Usinas · Monitoramento |
| 🤝 Relacionamento / Pós-venda | Clientes · Garantia · Indicação |
| 💰 Financeiro | Cobrança · Contas |

Na tela viva (fatia futura), o **Elo** fica no centro coordenando, e cada **departamento** é um neurônio que pulsa.

---

## 1. Visão (o norte)

Construir o **Elo — o Cérebro do Ecossistema EcoSunPower**: um lugar central que guarda *tudo que acontece* no negócio, conectado, para que **nada se perca** e a empresa consiga tirar **estudos** de dentro dela mesma. O Elo tem 3 partes, todas apoiadas na mesma espinha de dados:

- **A) A Espinha** — linha do tempo única de eventos (fundação invisível).
- **B) A Máquina de E-mail** — 1º "órgão": manda a mensagem certa na hora certa da jornada, mede comportamento e **reage**.
- **C) A Tela Viva do Cérebro** — tela cheia, **interativa**, que representa o ecossistema em movimento, fala, ouve e explica. *(Fatia futura.)*

Esta spec cobre **apenas a Fatia 1**: **A Espinha + a primeira sequência da Máquina de E-mail** (nutrir e converter lead frio), com medição e reação. As partes C e os estudos vêm em fatias seguintes, já que a espinha desta fatia é o que os alimenta.

### Regras herdadas do ecossistema
- **E-mail que fala de preço/valor tem trava**: a IA nunca crava número sozinha (mesma regra da Eva — ver `project_eva_handoff_preco_redesign`).
- **Best-effort, nunca quebra**: qualquer escrita na espinha ou envio de e-mail falha em silêncio (try/catch) e não derruba o fluxo principal (Eva, salvamento de lead, etc.).
- **Canais irmãos**: e-mail e WhatsApp/Eva coordenam para não bombardear o mesmo lead no mesmo dia.

---

## 2. Escopo da Fatia 1

**Entra:**
1. Espinha: tabela `eventos_elo` + registradores (hooks) nos pontos-chave.
2. E-mails na base: import da planilha histórica + captura no cadastro daqui pra frente + opt-out (LGPD).
3. Infra de envio: **Resend** com domínio autenticado (SPF/DKIM/DMARC).
4. Motor de sequência: 1ª jornada "nutrir e converter lead frio" (6 e-mails), autoria mista (modelo aprovado + IA personaliza assunto/abertura), com trava de preço.
5. Tracking: abertura e clique via webhooks → viram eventos na espinha.
6. Reação: lead "quente" (abriu Nx ou clicou) → alerta pra Junior/vendedor no WhatsApp com botões.
7. Tela: aba **E-mail Marketing** dentro do menu **Marketing** (métricas + ligar/pausar + ver modelos).

**NÃO entra (fatias futuras):**
- Tela viva interativa do cérebro (Parte C).
- Estudos automáticos / cérebro "falando insights reais".
- Newsletter, pós-venda por e-mail, campanhas pontuais (a jornada só vai até o dia 30; depois "encosta" — os próximos ciclos são fatias seguintes).
- Multi-tenant / EcoSof.

---

## 3. Arquitetura

```
                        ┌─────────────────────────────┐
   Eva/Leads/Propostas  │   ESPINHA: eventos_elo   │   Estudos (futuro)
   ──── registradores ─▶│  (linha do tempo única)      │◀── Tela viva (futuro)
                        └──────────────┬──────────────┘
                                       │ lê pra decidir / escreve o que acontece
                        ┌──────────────▼──────────────┐
                        │   MÁQUINA DE E-MAIL          │
                        │  - motor de sequência (15min)│──▶ Resend ──▶ inbox do lead
                        │  - autoria mista (Claude)    │
                        │  - trava de preço            │◀── webhooks (aberto/clicado)
                        │  - reação (lead quente)      │──▶ alerta WhatsApp (Eva)
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │  Aba "E-mail Marketing"      │
                        │  (menu Marketing) — métricas │
                        └─────────────────────────────┘
```

### 3.1 A Espinha — `eventos_elo`

Tabela única, append-only, um registro por evento.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `tipo` | text | enum-like: `lead_criado`, `mensagem_enviada`, `mensagem_recebida`, `proposta_gerada`, `proposta_aberta`, `email_enviado`, `email_entregue`, `email_aberto`, `email_clicado`, `email_descadastro`, `email_bounce`, `venda_ganha`, `feedback_junior`, ... |
| `lead_id` | bigint fk null | quando aplicável |
| `cliente_id` | uuid null | quando aplicável |
| `canal` | text | `whatsapp` \| `email` \| `sistema` \| `web` |
| `origem` | text | quem gerou (módulo/função) |
| `payload` | jsonb | dados do evento (ex: `{email_id, step, subject, link}`) |
| `company_id` | uuid | default EcoSun `...0001` (esqueleto multi-tenant) |
| `created_at` | timestamptz default now() | |

Índices: `(lead_id, created_at)`, `(tipo, created_at)`, GIN em `payload`.

**Registradores (hooks):** funções `registrarEvento(...)` chamadas nos pontos-chave que já existem (criação de lead, envio/recebimento de mensagem, geração/abertura de proposta, fechamento). Reaproveitam o que já é feito hoje em `lead_atividades`/`audit_log` — a espinha é a visão unificada, não substitui as tabelas atuais nesta fatia. Toda chamada é best-effort.

> **Nota de reuso:** verificar antes de codar se parte disso já pode ser derivado de `lead_atividades`/`conversations`/`audit_log`. Decidir com o dev se `eventos_elo` é tabela nova (recomendado, pela flexibilidade do `jsonb` e por ser a base da tela viva) ou uma *view* unificadora. Recomendação: **tabela nova**, com os hooks alimentando ela em paralelo.

### 3.2 E-mails na base
- Verificar se a tabela `leads` já tem coluna `email`; se não, criar (migration).
- **Import histórico:** script one-off que lê a planilha (CSV/XLSX exportada pelo Junior), casa por telefone/nome/e-mail e preenche `email` + marca `email_origem='import'`.
- **Captura daqui pra frente:** onde o lead é criado (formulário/webhook/Eva), guardar o e-mail quando vier.
- **Opt-out (LGPD):** tabela `email_descadastro (email, motivo, created_at)` OU flag `email_opt_out` no lead. Todo e-mail tem link de descadastro. Nunca enviar pra quem descadastrou/bounce duro. Leads são de terceiros → consentimento e descadastro são obrigatórios.

### 3.3 Infra de envio — Resend
- Conta Resend + domínio de envio autenticado (ex: `ecosunpower.eng.br` ou subdomínio `news.ecosunpower.eng.br`) com **SPF, DKIM, DMARC** no DNS. **Passo bloqueante para entregabilidade** — sem isso cai no spam.
- Envio via API a partir do Node. Webhooks do Resend (`email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`) → endpoint no Express → `registrarEvento`.
- **Aquecimento:** começar com volume baixo/dia e subir gradualmente pra não queimar a reputação do domínio.
- Segredos (`RESEND_API_KEY`, webhook signing secret) via env no EasyPanel — **nunca no chat/repo**.

### 3.4 Motor de sequência
- Tabela `email_sequencia (id, lead_id, step, status, agendado_para, enviado_em, ...)` com **unique (lead_id, step)** pra idempotência (mesmo padrão da cadência da Eva `eva_cadence`).
- Scheduler no `setInterval` do `index.ts` (a cada 15 min, mesmo motor da cadência): busca quem está "due" pro próximo step, gera e envia, agenda o próximo.
- **Respeita horário comercial BRT (9h–20h) e envia SÓ em dias úteis** (não envia sábado/domingo) — decidido pelo Junior 11/07.
- **Para a sequência** (status `cancelled`) se o lead: responde (qualquer canal), fecha venda (`venda_ganha`), ou descadastra.
- **Coordenação com WhatsApp:** não enviar e-mail no mesmo dia em que a Eva já mandou toque de cadência pro mesmo lead (checar `eva_cadence`/últimas mensagens).

**Jornada v1 — "nutrir e converter lead frio"** (tempos calibráveis conforme dados reais):

| Step | Quando | Tema do modelo |
|---|---|---|
| 1 | Dia 0 | Boas-vindas + o valor de gerar a própria energia |
| 2 | Dia 2 | Prova social (caso de sucesso real) |
| 3 | Dia 5 | Educação: quanto economiza / derrubando mitos |
| 4 | Dia 10 | Condição / leve urgência |
| 5 | Dia 18 | História de um cliente parecido |
| 6 | Dia 30 | "Ainda pensando?" + convite pra conversar |
| — | após 30d | Encosta (entra em Newsletter — fatia futura) |

### 3.5 Autoria mista dos textos
- **Corpo:** modelos HTML aprovados pelo Junior, guardados em `email_modelos` (ou arquivos versionados). Variáveis: `{nome}`, `{cidade}`, `{o_que_pediu}`, `{link_descadastro}`.
- **Personalização por IA (Claude Haiku, como a cadência):** gera **assunto** + **primeira linha/abertura** por lead, a partir do contexto (nome, cidade, o que pediu, etapa). Determinístico o suficiente pra não fugir da marca.
- **Trava de preço:** um verificador rejeita/reescreve qualquer saída da IA que contenha valor em R$ ou promessa de preço — cai pro texto neutro do modelo. Reusar a lógica de trava que já existe pra Eva, se aplicável.

### 3.6 Reação (comportamento → ação)
- Regra viva (configurável): `email_aberto >= 3` **OU** `email_clicado >= 1` num lead → marca "quente" (evento + flag) → dispara alerta.
- **Alerta:** `sendAdminWithButtons` (mesmo canal dos alertas de SLA/proativos) pro WhatsApp do Junior/vendedor responsável: *"🔥 {nome} abriu o e-mail 3x e clicou. Tá quente — falar agora?"* com botões [Falo agora] [Depois] [Ver lead].
- ⚠️ Herdar o cuidado da janela de 24h do WABA (alerta livre só entrega dentro da janela) — registrado como risco; fix definitivo = template WABA aprovado (fatia futura, mesmo problema já mapeado no CRM).
- Opcional v1: encurtar o intervalo do próximo e-mail se o lead esquentou.

### 3.7 Tela — aba "E-mail Marketing" (menu Marketing)
Nova rota no dashboard, dentro do setor **Marketing** (ao lado de Campanhas/Blog/Cadência), gateada por permissão `marketing`:
- **Métricas** da sequência: enviados · entregues · abertos (taxa) · clicados (taxa) · descadastros · quentes · convertidos.
- **Ligar/Pausar** a sequência (global e por lead).
- **Ver e aprovar** os modelos + preview.
- Reaproveita `renderLayout` e o padrão da aba Blog.

---

## 4. Fora de escopo / decisões adiadas
- Tela viva interativa do cérebro (Parte C) — próxima fatia; a espinha desta fatia já a alimenta.
- Estudos automáticos ("a venda leva 34 dias", "qual assunto converte mais") — fatia de estudos.
- Newsletter / pós-venda / campanha pontual — ciclos seguintes da jornada.
- Template WABA aprovado pra alertas fora da janela de 24h.
- Multi-tenant / EcoSof (linha separada — retomar segunda 14/07).

### 4.1 NORTE estratégico do Elo (fatias futuras — não construir agora, mas a espinha já prepara)
- **Elo ORQUESTRADOR:** o Elo não só guarda eventos — ele **coordena e designa tarefas** pros departamentos e pessoas (o "maestro" que sabe de tudo e distribui o trabalho no momento certo). A reação de "lead quente → avisa vendedor" desta Fatia 1 é o **primeiro embrião** disso. Evolui pra um motor de regras/tarefas que atribui e acompanha (liga com Fase 4 Automação do CRM — `project_crm_plataforma`).
- **Departamentos com ZOOM (peças neurais internas):** na tela viva, cada departamento é um neurônio **clicável que se subdivide**, revelando as tarefas/peças internas em andamento (dar "zoom no cérebro" e ver os sub-neurônios de cada área trabalhando). Requer que cada evento/tarefa carregue `departamento` + hierarquia — por isso `eventos_elo.payload` (jsonb) já nasce flexível e a espinha guarda `origem`/`canal`.
- **Princípio de orquestração — "chefe de 1000 → 100 → 10 → 5 → um cérebro"** (Jetro/Êxodo 18: líderes de milhares, centenas, cinquentas, dezenas): o Elo não gerencia tudo direto — ele delega em **camadas hierárquicas** de "chefes" (orquestradores), cada um cuidando de um span menor, até a tarefa na ponta. É como o Elo escala a coordenação sem virar caos. Casa com os "departamentos com zoom" (cada nível da hierarquia é um sub-neurônio que abre). Modelagem futura: eventos/tarefas carregam a cadeia hierárquica (quem delegou → quem executa).
- **Implicação pra Fatia 1:** manter os eventos ricos o suficiente (departamento de origem, tipo, referência, e espaço no `payload` pra cadeia hierárquica futura) pra que essas evoluções sejam só "ler a espinha de outro jeito", sem retrabalho de dados.

---

## 5. Riscos e cuidados
1. **Muitos leads só têm telefone** → a sequência só roda pra quem tem e-mail (import + captura). Medir a cobertura de e-mail da base logo no início.
2. **Entregabilidade** → sem DNS autenticado + aquecimento, cai no spam. É a parte mais crítica e não-negociável.
3. **LGPD** → leads de terceiros; opt-out e respeito ao descadastro obrigatórios.
4. **Janela de 24h WABA** → alerta de lead quente pode não entregar fora da janela; workaround = também mostrar na aba/dashboard.
5. **Não bombardear** → coordenar e-mail com a cadência da Eva.
6. **Reputação** → começar devagar; monitorar bounce/spam-complaint no Resend.

---

## 6. Critérios de pronto (Fatia 1)
- [ ] `eventos_elo` criada + registradores nos pontos-chave gravando eventos reais.
- [ ] E-mails históricos importados; cobertura de e-mail da base medida; captura ligada daqui pra frente.
- [ ] Domínio autenticado no Resend (SPF/DKIM/DMARC verdes); e-mail de teste chega na **caixa de entrada**.
- [ ] Sequência v1 (6 e-mails) dispara pelo motor de 15min, respeita horário, é idempotente e para quando o lead responde/fecha/descadastra.
- [ ] Autoria mista funcionando com trava de preço comprovada (teste com caso que tentaria citar valor).
- [ ] Abertura e clique viram eventos; lead quente dispara alerta no WhatsApp.
- [ ] Aba "E-mail Marketing" no menu Marketing com métricas reais + ligar/pausar + modelos.
- [ ] Descadastro funciona ponta a ponta (link → não recebe mais).
