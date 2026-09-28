# Command Center — FASE B (dado real + Central de Atenção) — plano de implementação

> Spec: `docs/superpowers/specs/2026-09-27-command-center-design.md` (§5 fase B, §6, §7).
> Roteiro original: `docs/superpowers/plans/2026-09-27-command-center.md` (seção FASE B).
> Branch: `feat/command-center-fase-b`. Sem migration (tudo já existe no banco).

**Goal:** o Command Center passa a responder "como está a empresa agora, o que mudou e qual a
próxima ação" com **número real** vindo do que já existe (monitoramento, funil, propostas,
demonstrativos GD, manutenção, financeiro), e ganha o **motor da Central de Atenção** (puro,
testado) + a tela `/dashboard/atencao`.

**Regras que valem em toda task**
- Número só se for real. Falhou/sem dado → `—` (+ "sem dado agora"); bloco sem fonte → "Em construção".
- Toda consulta nova leva `.eq('company_id', companyId)` **no código** (dupla tranca com o RLS) e roda
  no `bancoDoOperador(req, supabase)`. Nada de `supabase.from(` novo no `router.ts`.
- Dia e mês = relógio de **Brasília** (UTC-3), nunca o fuso do servidor.
- Continua **só EcoSun** (flag `CC_ABERTO_A_TENANTS = false` em `command-center-rotas.ts`); as
  consultas já são escopadas, então abrir pro tenant é só virar a flag (+ gating por módulo).
- Cada bloco respeita a permissão do usuário (`can(user, area, 'visualizar')`): quem não vê
  Financeiro não recebe número de dinheiro nem aviso de conta; idem Usinas / Leads / Propostas.
- Reusar: `classificarSistema`, `esperadoDiaKwh`, `medianaEspecifica7d` (monitoring/classificacao),
  `empresaDe` (régua da empresa), `tarifaPorConcessionaria` (solar-params), `alertasDoDia`
  (financeiro/alertas-vencimento), `statusAgendaItem` (manutencao-motor), `alertaVencimento` /
  `tipoAvisoVencimento` / `hojeBrasilia` (gd/demonstrativos-tela), critério do Cockpit para lead
  esperando (exportado de `cockpit-queries.ts`), `fetchCommandCenterKpis` (queries.ts),
  `extrairValorTotal` (queries.ts, passa a ser exportado), componentes `ui/*`.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/dashboard/central-atencao.ts` | Criar | **Puro.** `EventoAtencao`, `priorizar`, `contarPorSeveridade`, `topoDaHome`, `acoesRecomendadas`, `filtrarEventos` |
| `src/modules/dashboard/central-atencao-fontes.ts` | Criar | **Puro.** adaptadores: `eventosDeUsinas`, `eventosDeLeadsEsperando`, `eventosDeSlaVencido`, `eventosDePropostas`, `eventosDeCreditosGd`, `eventosDeManutencao`, `eventosDeContas` |
| `src/modules/dashboard/command-center-calc.ts` | Criar | **Puro.** janelas de Brasília, estado de cada usina, resumo da frota (energia hoje/mês/7d, geração agora, curva 30 dias real × esperada), "o que mudou desde ontem", frases do resumo da Eva |
| `src/modules/dashboard/command-center-queries.ts` | Criar | leituras escopadas por `company_id`, cada fonte isolada (falha = `null` + nome da fonte em `fontesComFalha`) |
| `src/modules/dashboard/command-center-views.ts` | Modificar | KPIs reais, hero (resumo + mudanças + 3 ações), curva, usinas por estado/cidade, Central de Atenção, cartões por área, página `/atencao` |
| `src/modules/dashboard/command-center-rotas.ts` | Modificar | usa `carregarCommandCenter`; nova `rotaCentralAtencao`; flag de tenant; selos do menu |
| `src/modules/dashboard/ui/estilo.ts` | Modificar | CSS dos eventos (`cc-ev`), ações (`cc-act`), chips (`cc-chip`), gráfico (`cc-chart`) |
| `src/modules/dashboard/menu-areas.ts` | Modificar | item `atencao` no grupo Command Center |
| `src/modules/dashboard/router.ts` | Modificar | `router.get('/atencao', rotaCentralAtencao(supabase))` |
| `src/modules/dashboard/cockpit-queries.ts` | Modificar | exporta `CRITERIO_LEAD_ESPERANDO` e passa a usá-lo (mesma regra nos dois lugares) |
| `src/modules/dashboard/queries.ts` | Modificar | exporta `extrairValorTotal`; `fetchCommandCenterKpis` deixa de contar `maintenance_reminders` (O&M passa a ler `manutencoes`, a mesma tabela da tela de Manutenção) |
| `tests/cc-central-atencao.test.ts`, `tests/cc-central-atencao-fontes.test.ts`, `tests/cc-command-center-calc.test.ts`, `tests/cc-command-center-queries.test.ts` | Criar | testes |
| `tests/cc-command-center-view.test.ts`, `tests/cc-rotas.test.ts`, `tests/cc-menu-areas.test.ts` | Modificar | novos casos |

## Task B1 — motor puro da Central de Atenção
**Files:** `central-atencao.ts`, `tests/cc-central-atencao.test.ts`
1. Teste falhando: `priorizar` ordena severidade → impacto R$ desc (sem impacto depois) → mais antigo
   primeiro; dedupe por `id` fica o mais grave; `contarPorSeveridade` devolve as 5 chaves;
   `topoDaHome(ev, 8)`; `acoesRecomendadas(ev, 3)` = 3 primeiros priorizados, só crítico/atenção/
   acompanhar/oportunidade (info nunca vira ação); `filtrarEventos` ignora área/severidade desconhecida.
2. `npx vitest run tests/cc-central-atencao.test.ts` → FAIL. 3. Implementar. 4. Verde. 5. Commit.

## Task B2 — adaptadores puros das fontes
**Files:** `central-atencao-fontes.ts`, `tests/cc-central-atencao-fontes.test.ts`
- **Usinas:** estado `critico` (parada) → 1 evento crítico por usina; `atencao` (abaixo do esperado)
  → 1 evento de atenção por usina; `sem_comunicacao` → **1 evento agrupado** de atenção com os nomes;
  perda R$/dia **estimada** = (esperado/dia − média real 7 d) × tarifa, só quando há kWp e tarifa;
  texto diz "estimada". Link `/dashboard/monitoramento/:id` (agrupado → `/dashboard/monitoramento`).
- **Leads esperando** (critério do Cockpit, > 24 h): 1 evento de atenção com a contagem e o mais antigo → `/dashboard/leads`.
- **SLA vencido** (`lead_tarefas` pendentes com prazo passado): 1 evento crítico → `/dashboard/leads/kanban`.
- **Propostas 72 h:** sem resposta, sem abrir/enviar há ≥ 72 h, não revogada/vencida, lead não
  fechado/perdido → 1 evento de atenção com "R$ X em jogo" (soma do valor das propostas) → `/dashboard/propostas`.
- **Créditos GD:** último demonstrativo de cada UC com `alertaVencimento` → 1 evento "acompanhar"
  (N clientes, kWh total, vencimento mais próximo); 1 cliente → link direto da UC.
- **Manutenção vencida:** `statusAgendaItem === 'vencida'` → 1 evento de atenção → `/dashboard/manutencao`.
- **Contas a pagar:** `alertasDoDia` (lembretes zerados, a tela sempre mostra) → atraso crítico,
  hoje atenção, 3 dias acompanhar, com o valor → `/dashboard/financeiro`.

## Task B3 — cálculo puro do Command Center
**Files:** `command-center-calc.ts`, `tests/cc-command-center-calc.test.ts`
- `janelaBrasilia(agora)`: `hoje`, `ontem`, `inicioMes`, `ha7`, `ha30` (datas de Brasília) — testar
  a virada 30/09 22h (01/10 01:00Z) e 31/12 23h.
- `estadoDaUsina(...)`: manual → `sem_monitoramento`; erro de integração / inversor offline /
  sem sincronizar há > 24 h → `sem_comunicacao`; senão `classificarSistema` (urgente → crítico,
  aviso → atenção, resto → normal) com a régua da empresa e a mediana da carteira.
- `resumirFrota(...)`: potência instalada, contagem por estado, energia hoje/mês, geração agora
  (telemetria dos últimos 30 min, último valor por inversor), curva 30 dias (real; esperada só das
  usinas com kWp que mandaram dado no dia), por cidade.
- `mudancasDesdeOntem(...)` e `frasesDoResumo(...)`: só frase com número real.

## Task B4 — consultas escopadas
**Files:** `command-center-queries.ts`, `tests/cc-command-center-queries.test.ts` (cliente falso que registra filtros)
- TODA consulta tem `eq company_id = sessão`; fonte que falha → `null` e entra em `fontesComFalha`;
  área sem permissão não é consultada; paginação que **lança** em erro (dado parcial nunca vira número).

## Task B5 — tela com dado real
**Files:** `command-center-views.ts`, `ui/estilo.ts`, `tests/cc-command-center-view.test.ts`
- 8 KPIs (geração agora, energia hoje, energia no mês, potência instalada, usinas comunicando,
  faturamento recebido, leads do mês, vendas); hero com resumo real, chips e 3 ações (a 1ª dourada);
  curva SVG real × esperada (sem JS; `<title>` por barra); "Usinas agora" com estados reais e lista
  por cidade (mapa continua "em construção"); Central de Atenção com top 8 e "Ver todos";
  lista vazia → "Tudo em dia"; fonte com falha → aviso "não consegui ler: …" (nunca "tudo em dia").

## Task B6 — `/dashboard/atencao` + menu + selos
**Files:** `command-center-views.ts`, `command-center-rotas.ts`, `router.ts`, `menu-areas.ts`, testes
- Página com trilha, contagem por severidade, filtros por área/severidade (links), lista completa
  agrupada por severidade, painel "De onde vêm os avisos" (fonte ligada / não carregou / sem acesso).
- Selos do menu (Usinas, Comercial, O&M, Financeiro, Clientes) com a contagem real de avisos
  crítico+atenção — só nas telas do Command Center e da Central (onde a carga já existe).

## Task B7 — verificação
- `npx tsc --noEmit` limpo; `npx vitest run` verde (branded-frame/closing-render: rodar sozinhos se falharem sob carga).
- 2 revisões completas do diff; prints 1440×1000 e 390 no Desktop `COMMAND-CENTER-FASE-B\`.

## Fica para depois (anotado)
- Curva **intradiária** (30 min) do portfólio e "esperada até agora" por irradiação do dia — exige
  série intradiária de todas as marcas (hoje só Sungrow/FoxESS via telemetria).
- Mapa por região (fase C), pipeline em R$ (fase E), obras paradas por etapa (fase F),
  garantias e certificado A1 como avisos, "Resolvidos hoje" (exige guardar o histórico dos avisos).
- Selos do menu em **todas** as telas (exige cache por empresa de ~60 s).
