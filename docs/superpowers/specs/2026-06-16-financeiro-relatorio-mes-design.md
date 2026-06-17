# Financeiro — Peça 3: Relatório do mês no WhatsApp

**Data:** 2026-06-16
**Status:** design — aprovado pelo Junior (verbal)

## Contexto
Junior quer, sob demanda, pedir no zap um relatório do mês e ver "de onde entrou e pra
onde saiu cada centavo" — controle total. Todos os números já são calculados pelo painel
(`getFinanceiroData` / `calcularKpisCaixa` / `calcularRBT12`). Esta peça empacota isso
numa mensagem de WhatsApp, com escolha do mês.

Decisões: mês atual OU mês específico ("relatório de maio" / "relatório 05"); conteúdo
completo da empresa (PJ) + bloco "Mundo PF"; sob demanda (sem cron); admin-only.

## Design

### Fluxo
mensagem admin → parseia período → `getRelatorioMensal(comp)` → `montarRelatorioMensal(data)` → `sendText`.

### 1. Parser de período (PURO, testável) — `parseRelatorioComando(texto, hojeYYYYMM)`
- Reconhece o comando: `^/?relat[óo]rio` (com ou sem barra/acento). Não casou → retorna null.
- Sem mês → competência atual (`hojeYYYYMM`).
- Com mês: aceita nome PT-BR (jan…dez / janeiro…dezembro), número (`05`, `5`), ou `YYYY-MM`.
  - Mês sem ano → ano atual; se o mês for FUTURO em relação a hoje → ano anterior (você pede mês já fechado).
- Retorna `{ competencia: 'YYYY-MM' }` ou null (não é comando de relatório).
- Hoje em BRT (mesmo `hojeBRT` já usado na Caixa de Entrada) — nunca `new Date().toISOString()` cru.

### 2. Dados do mês (I/O) — `getRelatorioMensal(client, competencia)`
Função focada (não mexe no `getFinanceiroData` do painel). Para a competência pedida, reúne:
- `faturadoMesPj` = Σ `financeiro_recebimentos.valor` na competência (com nota).
- `impostoMes` = Σ `financeiro_recebimentos.imposto` na competência (DAS daquele mês).
- `entrouSemNotaPj`, `saiuMesPj`, `lucroMes`, `entrouMesPjCaixa`, `entrouMesPf`, `saiuMesPf`,
  `pizzaCategorias` — via `calcularKpisCaixa({recebidoMesPj: faturadoMesPj, impostoMes, lancamentosMes})`,
  onde `lancamentosMes` = lançamentos confirmados da competência (mesma query do painel, parametrizada por comp).
- `rbt12` + `faixa` = `calcularRBT12(buckets, competencia)` + `faixaPorRBT12` (a janela já é relativa ao mês pedido).
- `aReceber` = saldo em aberto ATUAL das contas (snapshot do momento, não filtrado por mês — explicitar no texto que é "agora").
- Retorna um objeto estruturado (`RelatorioMensal`) com todos esses campos + a `competencia`.
- Reusa helpers existentes (`getBuckets`, `getParametros`, `calcularRBT12`, `calcularKpisCaixa`, `faixaPorRBT12`). DRY: extrair a query de `lancamentosMes` num helper se reduzir duplicação com `financeiro-queries.ts`, senão duplicar a query simples por comp (pequena).

### 3. Texto (PURO, testável) — `montarRelatorioMensal(data)`
Formata a mensagem PT-BR (layout aprovado): cabeçalho com mês/ano por extenso; Entrou (caixa
real) com faturado/por fora; Saiu + até ~5 categorias (pizzaCategorias, maiores primeiro);
Lucro; Imposto a separar + faixa/anexo; A receber (em aberto, "agora"); bloco Mundo PF;
link do painel. Esconde a linha "por fora" quando `entrouSemNotaPj === 0`. Valores em BRL.

### 4. Comando no zap — `makeRelatorioHandler(client, isAdminPhone, sendText)`
- `tryHandleRelatorioCommand(from, text)`: gateia admin; `parseRelatorioComando` → se null retorna false;
  senão `getRelatorioMensal` → `montarRelatorioMensal` → `sendText`; retorna true.
- Wire em `src/index.ts` junto dos outros comandos admin (perto de `tryHandleImpostoCommand`),
  ANTES do gate da Caixa de Entrada (pra "relatório" não ser confundido com lançamento).

## Casos de teste (TDD)
**parseRelatorioComando:**
- "relatório" / "relatorio" / "/relatorio" → competência atual.
- "relatório de maio" / "relatório maio" / "relatório 05" / "relatório 5" → '2026-05'.
- "relatório 2026-03" → '2026-03'.
- mês futuro sem ano (ex. hoje jun, pede "dezembro") → ano anterior ('2025-12').
- "bom dia" / "gastei 50" → null (não é relatório).

**montarRelatorioMensal:**
- inclui cabeçalho do mês, entrou/faturado/saiu/lucro/imposto/a receber/PF e o link.
- `entrouSemNotaPj === 0` → sem linha "por fora".
- categorias: mostra as maiores, no máx ~5.

## Arquivos
- `src/modules/financeiro/comando-relatorio.ts` (novo: parser + handler).
- `src/modules/financeiro/relatorio-mensal.ts` (novo: `getRelatorioMensal` I/O + `montarRelatorioMensal` puro + tipo `RelatorioMensal`).
- `src/index.ts` (wire do comando).
- Testes: `tests/financeiro-relatorio.test.ts`.

## Riscos / cuidados
- Gate do comando ANTES da Caixa de Entrada (senão "relatório de maio" pode virar tentativa de lançamento). Conferir ordem no index.ts.
- Sem migração, sem mudança de banco, sem tocar no motor — só leitura.
- Mês futuro/sem dados → relatório com zeros (não quebra; mostra "sem movimento").
- BRT pra "mês atual" (virada de dia/mês à noite).

## Convenções
- TDD nos puros (parser + formatter); code review por task + final; push só com autorização; PT-BR simples.
