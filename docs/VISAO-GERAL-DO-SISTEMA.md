# 🗺️ Visão geral do sistema EcoSunPower — leia ANTES de criar qualquer coisa

> Para o Claude de cada dev: **antes de implementar, procure aqui (e no código) se já
> existe algo parecido.** Regra de ouro: **REUSAR, não recriar.** Muita coisa já está
> pronta — duplicar gera bug e retrabalho.

---

## 1. O que é o sistema (o todo)

Uma plataforma única com 3 frentes que compartilham o mesmo banco:

1. **Eva** — agente de IA no **WhatsApp**. Atende o lead, qualifica, calcula, faz proposta,
   agenda, fecha contrato/procuração e cuida do pós-venda. O Junior comanda a Eva por um
   **/menu** de botões (ver seção 4). Núcleo: `src/index.ts` (webhook + roteamento) + `src/modules/`.
2. **Dashboard / CRM** — painel web interno em **`/dashboard`** (server-rendered). O time
   gerencia leads, funil, propostas, usinas, financeiro, marketing. Em `src/modules/dashboard/`.
3. **Plataforma de gestão de energia** — a evolução em camadas (CRM → operação → IA → BI),
   descrita em `docs/superpowers/specs/2026-06-23-crm-dashboard-design.md` (roadmap de 7 fases).

**Stack:** Node + TypeScript (**ESM** — import relativo termina em `.js`), Supabase/Postgres,
Express **server-rendered** + Tailwind/JS leve via CDN (sem SPA). Testes: **vitest**.
Deploy: EasyPanel publica a `main` — **só o Junior Implanta** (portão de produção).

---

## 2. As áreas do código (`src/modules/`)

| Pasta | Cuida de |
|---|---|
| `dashboard/` | **CRM/painel web**: leads, funil/kanban, cockpit do lead, propostas, usinas, financeiro, marketing/blog, usuários/permissões. (Raia do Junior.) |
| `proposal/` | Geração da **proposta** (PDF, estudo personalizado, cálculos, QR). |
| `closing/` | **Fechamento**: contrato, procuração, render de PDF (`closing-render.ts`). |
| `financeiro/` | Núcleo **financeiro**: receita, imposto, materiais, caixa de entrada. |
| `monitoring/` | **Usinas monitoradas**: geração diária, alertas, adapters de inversor, `usinas-queries.ts`. |
| `marketing/` | IA de campanhas, banners, relatórios de anúncio. |
| `messaging/` | Envio/recebimento de WhatsApp. |
| `menu/` | O **/menu** da Eva (`menu.ts` — toda ação nova entra aqui). |
| `rag/` | Base de conhecimento (RAG) da Eva. |
| `relatorios/` | Relatórios (geração de usina, pós-instalação). |
| `clientes/` `anexos/` | Clientes e cofre de mídia do cliente. |

---

## 3. Onde fica cada coisa (peças JÁ PRONTAS — REUSE, não recrie)

- **Banco de dados:** TUDO via `src/modules/supabase.ts` (classe `SupabaseService`). **Não crie
  outro cliente Supabase** — use/estenda os métodos dele.
- **Telefone:** `phone.ts` (`variantesTelefone` — trata o 9º dígito) e `meta-leadgen.ts`
  (`normalizeBrazilianPhone`, `formatPhoneBR`). **Nunca compare telefone na mão** (duplica lead).
- **Concessionária / cidades:** `concessionarias.ts`, `cidades-df-go.ts` (DF=Neoenergia, GO=Equatorial).
- **Cálculo solar:** `solar-params.ts` (fonte única dos parâmetros), `solar.ts` (conversa),
  `calculo-economia.ts`, `calculo-geracao.ts`. **Confira antes de inventar conta.**
- **IA assistente:** `ia-comercial.ts` (gera mensagem), `ia-engenharia.ts` (explica economia),
  `dashboard/lead-synthesis.ts` (resumo/insights de lead — JÁ EXISTE), `sugestao-equipamento.ts`.
- **Funil/etapas:** `dashboard/pipeline.ts` (etapas de lead) + `dashboard/leads-queries.ts`
  (`agruparLeadsPorEtapa`). Usinas: `usina-etapas.ts` + `monitoring/usinas-queries.ts`. Kanban
  visual: `dashboard/kanban-views.ts` (modelo de tela).
- **Proposta/fechamento:** `proposal-assistant.ts`, `proposal/`, `closing/`.
- **Texto do Junior:** `corretor-ortografico.ts` (corrige português sem mudar número/nome).
- **Tela do dashboard:** funções em `dashboard/*-views.ts` que devolvem string HTML.
  Layout/sidebar em `dashboard/views.ts` (`renderLayout`). Permissões em `dashboard/permissions.ts`.
  CSS comum do design system e logo da casa são **arquivos** com hash no nome
  (`dashboard/ui/estatico.ts`, rota pública `/dashboard/estatico/…`, cache de 1 ano) — não
  embutir base64/CSS grande no HTML. Tela nova no padrão `cc-` (sem Tailwind): entra em
  `TELAS_RENOVADAS` (`tests/helpers/teto-tailwind.ts`) e chama `renderLayout({ …, tailwind: false })`.
  Peso das telas: `npx tsx scripts/medir-telas-leves.ts` (Chrome headless, dados fictícios).

### Tabelas principais do banco
`leads` (o lead/cliente) · `propostas_publicas` · `sistemas_clientes` (usinas) + `geracao_diaria`
+ `alertas_sistema` · `lead_atividades` (timeline) + `lead_tarefas` (SLA) · `dashboard_users` +
`companies` + `audit_log` · `manutencoes` + `ordens_servico` · `blog_drafts` · `conversations`.

---

## 4. Os MENUS

### 4a. /menu da Eva (WhatsApp — `src/modules/menu/menu.ts`)
Toda ação que o Junior pede pela Eva é um **botão** aqui (nada de comando solto). Categorias:

- **💼 Propostas:** Calcular preço · Gerar proposta · Proposta de serviço · Ajustar proposta ·
  Clonar p/ outro · Abordar cliente · Resgatar antigas · Rascunho · Marcar como fechado
- **📝 Fechamento:** Fechar venda · Só contrato · Só procuração
- **📣 Marketing:** Gerar criativo · Banner promo · Reativar base · Status blog · Resgatar leads ·
  Resumo Google Ads · Banner tabela (kits) · Gerar post (teste)
- **📅 Atendimento:** Agendar reunião · Cadastrar case · Aprovar reviews · Cadastrar email
- **💰 Financeiro:** Relatório do mês · Calcular imposto · Lançar gasto/entrada · Preço de material ·
  Abrir painel · Apagar lançamento
- **🔧 Operação:** Monitoramento · Dono de usina · Manutenção

> Regra: **toda ação nova da Eva vira botão no MENU_CATEGORIES** (trigger/handler), nunca comando solto.

### 4b. Sidebar do Dashboard (web — `dashboard/views.ts`)
Menu lateral por setores (esconde por permissão):
- **Visão geral:** Cockpit · Home
- **Comercial:** Leads · Funil (Kanban) · Clientes · Propostas
- **Marketing:** Campanhas · Blog · Cadência
- **Operação:** Monitoramento · Pós-venda · Manutenção
- **Financeiro**
- **Configurações:** Usuários

---

## 5. Como tudo se ENCAIXA (a jornada do lead)

```
Anúncio Meta / formulário  ──►  lead criado em `leads` (Eva, via webhook em index.ts)
        │
        ▼
Eva atende no WhatsApp  ──►  qualifica (solar.ts) ──► gera proposta (proposal-assistant)
        │                                                      │
        ▼                                                      ▼
No DASHBOARD aparece no FUNIL (kanban) ──► etapa anda sozinha por evento
   (proposta enviada → negociação → ganho; hooks em supabase.ts)
        │
        ▼
Fecha (closing/) ──► contrato + procuração ──► vira CLIENTE (installation_status)
        │
        ▼
Sai do funil ──► entra em CLIENTES / OPERAÇÃO (sistemas_clientes / usinas)
   ──► monitoramento de geração + manutenção + pós-venda
```

A mesma pessoa é UM registro em `leads` o tempo todo (por isso telefone tem que casar — ver `phone.ts`).
O dashboard e a Eva leem/escrevem o MESMO banco via `SupabaseService`.

---

## 6. REGRAS do time (siga sempre)

- **Nunca trabalhe direto na `main`.** Branch própria → push → **abrir o PR (1 clique
  "Compare & pull request")** → a esteira testa e junta sozinho se verde.
- **TDD:** teste primeiro (veja `tests/concessionarias.test.ts` como modelo de função pura).
- **Antes do PR:** `npx tsc --noEmit` limpo e `npx vitest run` verde.
- **`git add <arquivos por nome>`** — nunca `git add -A`.
- **ESM:** import relativo termina em `.js` (`from './phone.js'`).
- **HTML:** sempre `escapeHtml(...)` no que vem de dado (evita XSS).
- **Migrations:** `supabase/migrations/NNN_*.sql` numeradas. **Combine o número no grupo do
  WhatsApp antes.** Quem aplica no banco e Implanta é o Junior.
- **Raias:** mexeu fora da sua área (ex.: dashboard)? **Avise o Junior antes.**
- **Texto pro cliente:** português claro, sem jargão. Junior assina "Responsável Técnico
  CREA/CFT", nunca "engenheiro".

## 7. Check rápido ANTES de codar
1. Já existe módulo/função pra isso? (procure por nome em `src/modules/` + leia a seção 3.)
2. Tem padrão parecido pra copiar? (kanban de leads, agrupamento por etapa, *-views.ts…)
3. Vai mexer no banco? Combine o número da migration com o Junior.
4. Vai mexer fora da sua raia? Avise o Junior.

**Na dúvida, pergunte ao Junior.** Reusar > recriar.

## Acesso: convite por e-mail e "esqueci minha senha" (28/08/2026)
`src/modules/dashboard/senha-tokens.ts` + migration 108 `dashboard_senha_tokens`. Rotas públicas
`/dashboard/definir-senha` e `/dashboard/esqueci-senha`. Empresas → Nova sem senha = convite por
e-mail (72 h); reset = 2 h; ninguém vê senha de ninguém. Detalhes em `docs/ecosof/07-fase2-tenant2.md`.

## Gestão de Energia — medidor Shelly por empresa (G1, 28/09/2026)
`src/modules/energia/` (funções puras + `energia-service.ts` + `energia-repo.ts`) e telas em
`dashboard/energia-rotas.ts` / `energia-views.ts` (`/dashboard/energia`, módulo `medicao`).
Migrations 136 (`medidores_energia`, token por medidor, chave da nuvem cifrada com
`ENERGIA_CRED_KEY`) e 137 (`energia_15min`, `energia_diaria`). O webhook `/webhooks/shelly`
resolve empresa pelo token do medidor. Medidor de quadro **não** é inversor: registro
irmão (`medidor-registry.ts`), nunca em `sistemas_clientes`. Spec e plano em
`docs/superpowers/specs|plans/2026-09-28-gestao-de-energia*.md`.

## Atendimento — responder o WhatsApp pelo painel (Parte 2, 28/09/2026)
Tela Leads › Conversas (`dashboard/atendimento-views.ts`). Rotas em `dashboard/atendimento-rotas.ts`
(registradas no router DEPOIS da trava `/leads/:id`): `POST /leads/:id/responder` (texto — no número
oficial da Eva só na janela de 24 h, conferida no servidor com 1 h de margem) e `/responder-modelo`
(modelo aprovado, `dashboard/modelos-atendimento.ts`). **"Assumir" é um estado só** (`leads.eva_active`):
o botão "✋ Assumir" do WhatsApp (`eva-admin-buttons.ts`), o topo do chat e o envio pelo painel chamam
`assumir-atendimento.ts`; só "Devolver para a Eva" traz ela de volta. Histórico completo (envios com
autor/canal + eventos assumiu/devolveu) na tabela `mensagens_whatsapp` (migration 138, `mensagens-whatsapp.ts`);
a Eva continua com a memória curta em `conversations`. Com a Eva pausada a mensagem do cliente é gravada
(sem resposta). Anti envio duplo = `chave_envio` única por empresa reservada antes de enviar.
**Parte 2b — número PESSOAL do dono (QR/Evolution, só EcoSun):** tela `/dashboard/whatsapp/pessoal`
(`dashboard/numero-pessoal-rotas.ts` + `whatsapp-pessoal-views.ts`) cria a instância na Evolution e guarda
em `whatsapp_numeros_pessoais` (migration 139) quem conectou. O webhook `/webhook` desvia essa instância
ANTES de tudo da Eva (`numero-pessoal.ts` → só grava, `visivel_so_para` = dono; a Eva nunca responde lá).
Conversas de quem não é lead aparecem na lista com "Virar lead" (`?contato=`); mesmo telefone = um lead
(variantes com 55, dentro da empresa). A resposta sai pelo número em que o cliente escreveu por último
("Responder como 🤖 Eva / 👤 Junior").
**Sem recarregar:** com `Accept: application/json` as rotas de envio devolvem JSON (balão otimista no
script); `GET /leads/:id/conversa.json` e `/leads/conversas/contato.json` devolvem os pedaços da tela
(`pedacosDaConversa`/`pedacosDoContato` + `assinaturaDaConversa`) — o chat se atualiza a cada 8 s.
**Histórico do pessoal (90 dias):** `numero-pessoal-historico.ts` — o webhook `messages.set` só enfileira
(importador em memória, lotes de 200, anti-duplicado pelo `wamid`); "Buscar histórico (reconectar)" em
`/dashboard/whatsapp/pessoal` liga `syncFullHistory`, assina `MESSAGES_SET`, desconecta (QR de novo) e
puxa o que a Evolution já guardou (`/chat/findMessages`). Eva/dono/equipe (`definirNumerosInternos` +
`contatos_internos`) ficam fora da caixa pessoal. A lista pessoal usa `conversas_pessoais_recentes`
(migration 140: uma linha por contato; sem ela, cai nas 1000 mensagens mais novas).
