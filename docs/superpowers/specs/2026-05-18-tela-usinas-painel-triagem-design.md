# Spec — S1: Tela de Usinas "Painel de Triagem" (reorganização do /monitoramento)

Data: 2026-05-18
Status: aprovado pelo Junior (design + D1a/D2a/D3a + fundo a + escopo S1-já)

## Problema

Hoje `/dashboard/monitoramento` (`renderMonitoramentoPage` em `src/modules/dashboard/views.ts`) é **uma tabela única, plana, de TODOS os sistemas**: sem busca, filtro, agrupamento, ordenação, e fundo branco genérico. Funciona com ~24 sistemas; com 100+ usinas de várias marcas vira uma parede de linhas impossível de monitorar. Junior quer simplificar pra ajudar o monitoramento real (O&M de carteira), e usar a tela como ponto de partida do "mostrar pro cliente em campo e já gerar/mandar relatório".

## Decomposição (contexto — só o S1 é escopo desta spec)

O pedido completo do Junior foi fatiado em 4 sub-projetos independentes:

- **S1 (ESTA SPEC)** — Tela reorganizada: radar de problemas + visão filtrável + busca + mini-dashboard + botão excluir + cronômetro de garantia (S2 embutido) + tema escuro.
- **S2** — Cronômetro garantia/vida útil: função pura `garantiaInfo()`. **Embutida no S1.**
- **S3** — Relatório de geração branded (PDF mês/ano, marca EcoSun, inversor/placa, garantias). Reaproveita infra do Proposta v2. **Fora do escopo S1** (S1 só deixa o gancho).
- **S4** — Eva manda o relatório no follow-up de manutenção. **Fora do escopo S1.** Liga no Módulo 6 (fluxo de alerta/manutenção).

Ordem: S1 → S3 → S4. Migração de outras marcas roda em trilha paralela (acesso de API externo) e é aditiva (interface `MonitoringAdapter` uniforme) — não conflita com o S1.

## Objetivo e critério de sucesso

Abrir `/monitoramento` e, em segundos, ver **o que precisa de ação** sem rolar 100 linhas; conseguir filtrar/buscar a carteira inteira; ver idade e garantia de cada usina; excluir/pausar uma usina; e ter o gancho pra gerar relatório pro cliente. Escala pra 100+ sem N+1. Zero regressão fora da UI de monitoramento.

## Decisões travadas

- **D1 = (a)**: "Excluir usina" = **hard delete** (remove `sistemas_clientes` + `geracao_diaria` da usina) com **confirmação dupla**. "Pausar" (`ativo=false`, reversível, já existe via editar) permanece como opção branda separada.
- **D2 = (a)**: botão "Gerar relatório" no S1 é só **gancho** pro S3 (rota que, por ora, leva a uma página stub "relatório em breve / S3"). S1 não implementa o PDF.
- **D3 = (a)**: usina "acima do esperado" (>110%) **não** entra no bloco de ação — vira só um selo "🌟 acima" na lista.
- **Fundo = (a)**: tema escuro futurista reusando a paleta do **cockpit** (`/dashboard/cockpit`). Sem foto atrás de dado.
- **Escopo do tema = (a)**: aplicar no layout compartilhado (`renderLayout`) já no S1; ajuste fino de legibilidade das OUTRAS telas do dashboard = **follow-up separado** (não atrasa o S1; conferir página por página depois).

## Arquitetura / stack

Mesma stack atual, sem framework novo, sem SPA:
- View server-rendered em `src/modules/dashboard/views.ts` (`renderMonitoramentoPage`), layout compartilhado `renderLayout`.
- Rota `GET /dashboard/monitoramento` em `src/modules/dashboard/router.ts`, dados via `MonitoringService`.
- Filtros/busca/ordenação **server-side por querystring** (mesmo padrão do filtro de período já existente no detalhe): `?status=&marca=&cidade=&q=&ord=`.
- Auto-refresh 30s mantido.
- Tailwind; paleta dark reusada do cockpit (`src/modules/dashboard/cockpit-views.ts`).

## Componentes (unidades isoladas, testáveis)

### 1. `classificarSistema(sistema, geracaoRecente)` — função pura (o radar)
Retorna `{ nivel: 'urgente' | 'aviso' | 'info' | 'ok', motivo: string }`.
- `urgente`: sem geração > 0 há ≥ 3 dias (offline) **OU** `ultimo_erro` setado. (Nota: "sem sincronizar > 36h" continua APENAS como o selo de status já existente na linha — **não** vira gatilho do radar; manter fiel aos 3 gatilhos aprovados na decisão, sem over-trigger com usina nova/pausada.)
- `aviso`: ratio últimos 7 dias < 0,70 (geração real 7d ÷ esperado, esperado = `potencia_kwp · HSP · 0,80`, HSP 5,3 GO / 5,2 default — **reusar o cálculo já existente em `getDetalheSistema`**) e produziu algo > 0.
- `info`: ratio > 1,10.
- `ok`: o resto.
**Refatoração dirigida:** extrair a lógica de alerta hoje embutida em `getDetalheSistema` (offline/queda/acima) para esta função compartilhada e fazer `getDetalheSistema` consumi-la (não duplicar regra).

### 2. `garantiaInfo(sistema)` — função pura (S2 embutido)
A partir de `data_instalacao`:
- **Idade da usina** (ex: "2 anos 3 meses"; "—" se sem `data_instalacao`).
- **Garantia EcoSunPower**: 12 meses de mão de obra/instalação (regra fixa da empresa). Status: `vigente` (faltam N meses) | `encerrada` (há N meses) | `indefinida` (sem data).
- **Garantia fabricante**: por equipamento, lida de `inversor_modelo` / `painel_marca` (campos da migration 022) cruzado com uma **tabela de garantias por marca** (constante no código; defaults conservadores: inversor 5–12 anos conforme marca; painel produto 12–25 / performance 25–30). Quando faltar dado do equipamento → texto `"informar equipamento"` + link editar. **Nunca inventar prazo.**
Saída usada em 3 lugares: badge compacto na lista, bloco no cartão de ação, e (futuro) relatório S3.

### 3. `listarParaDashboard()` estendido — dados
Hoje traz `geracao_hoje_kwh` + `geracao_mes_kwh` por sistema em 1 query agregada. Estender para também trazer a **soma dos últimos 7 dias** por sistema **na mesma query agregada** (sem N+1 — requisito duro p/ 100+). Classificação e `garantiaInfo` rodam em memória sobre o resultado.

### 4. `renderMonitoramentoPage(rows)` reescrito — layout
Topo→baixo:
1. **Faixa de KPIs** (PT-BR): Usinas ativas (+kWp total) · Geração hoje · Geração mês · **Saúde da frota** (`N OK / total`, cor) · Marcas.
2. **Bloco "⚠️ Precisa de ação"**: cartões só de `urgente` + `aviso`, ordenados por severidade. Cada cartão: cliente + local, logo da marca, motivo em 1 linha, `garantiaInfo` resumido, botões **Sincronizar · Ver detalhe · Gerar relatório (→S3) · Excluir**. Zero problemas → estado verde "tudo certo ✅".
3. **Barra de controle**: busca (q: apelido/cidade) + filtros (status/marca/cidade) + ordenação (querystring, server-side). Botões globais: Importar sites · Atualizar todas.
4. **Lista completa compacta**: todas as usinas (inclui saudáveis e selo "🌟 acima" p/ info), respeitando filtro/busca/ordenação; coluna cronômetro; linha → detalhe; botão **Excluir** por linha (confirm duplo).

### 5. Excluir usina — rota nova
`POST /dashboard/monitoramento/:id/excluir` → deleta `geracao_diaria` da usina e depois a linha `sistemas_clientes`. Confirmação dupla no front (`confirm()` + digitar/checar nome ou segundo confirm). Método no `MonitoringService` (ex.: `excluirSistema(id)`), com teste.

### 6. Tema escuro (layout compartilhado)
`renderLayout` ganha o tema escuro (grafite/azul-noite + brilho radial sutil + acentos neon), reusando tokens de cor do cockpit. Cards translúcidos leves. Cores de dado escolhidas pra **contraste máximo no escuro** (geração verde/âmbar/ciano "acende"). Sem imagem atrás de dado. Constraint dura: legibilidade de número/gráfico não pode piorar.

## Fluxo de dados

`GET /monitoramento?status=&marca=&cidade=&q=&ord=` → `MonitoringService.listarParaDashboard()` (1 query agregada: hoje/mês/7d por sistema) → mapeia rows → para cada: `classificarSistema()` + `garantiaInfo()` → aplica filtro/busca/ordenação server-side → `renderMonitoramentoPage()` → HTML (auto-refresh 30s).
`POST /:id/excluir` → `excluirSistema(id)` → redirect `/monitoramento`.

## Casos de borda

- Sem `data_instalacao` → cronômetro "data não cadastrada" + link editar (não conta como problema).
- Sem `inversor_modelo`/`painel_marca` → garantia fabricante "informar equipamento".
- Marca futura sem adapter → linha aparece como "sem integração" (não classifica como `urgente`).
- Sem usinas → estado vazio (reaproveitar o já existente).
- Filtro/busca sem resultado → estado "nenhuma usina com esse filtro" + limpar filtros.
- 100+ usinas → 1 query agregada (sem N+1), classificação O(n) em memória, render server-side.

## Erros

Erro ao listar → página de erro atual mantida. Erro no excluir → mensagem + volta pra lista (não deixa estado parcial: deletar `geracao_diaria` antes da linha; se falhar a 2ª etapa, logar e reportar).

## Testes (TDD)

- `garantiaInfo`: dentro/fora da garantia EcoSun 12m; fabricante por equipamento (com e sem dado); sem `data_instalacao`; idade formatada.
- `classificarSistema`: offline ≥3d; `ultimo_erro` setado; queda <70%; acima >110%; ok; sem `potencia_kwp`.
- `excluirSistema`: remove geração + sistema; idempotente/seguro se id inexistente.
- Smoke de render opcional (não quebra com rows variados).

## Blast radius / zero-regressão

Toca: `views.ts` (renderMonitoramentoPage + renderLayout tema), `router.ts` (rota excluir + querystring), `monitoring/service.ts` (query 7d estendida + excluirSistema), 2 funções puras novas, refactor de extração da regra de alerta de `getDetalheSistema`. **NÃO toca** path da Eva, adapters, nem cron. `getDetalheSistema` deve continuar com saída idêntica após consumir `classificarSistema` (teste guarda). Tema global pode exigir ajuste de legibilidade em outras telas → tratado como follow-up declarado.

## Fora de escopo (explícito)

Relatório PDF (S3); Eva mandar no follow-up (S4); motor de aprendizagem; migração de novas marcas; ajuste fino de tema das demais telas do dashboard (follow-up).

## Restrições de produto (memória Junior)

- Labels/títulos em **PT-BR** (siglas técnicas OK: kWp, kWh, CPL).
- Cara da **EcoSunPower**, não SaaS genérico.
- Observabilidade obrigatória (KPIs/filtros/comparação na própria tela).
- Contexto visível de cara (decidir em segundos, sem clique extra).
- Texto cliente-facing (relevante no S3/S4): "Responsável Técnico CREA/CFT", nunca "engenheiro".
