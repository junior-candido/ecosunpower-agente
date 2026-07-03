# Curva do dia (potência + energia) ao vivo — todas as marcas

**Data:** 2026-07-03
**Autor:** Junior + Claude
**Status:** aprovado (brainstorming)

## Objetivo

Na tela de detalhe da usina, aba **"Dia"**, mostrar a **curva de geração do dia ao
vivo** com **duas grandezas juntas**:

- **Potência (kW)** ao longo do dia — o "sininho" da geração solar.
- **Energia (kWh)** acumulada ao longo do dia (linha subindo) + o **total do dia**.

Hoje só **GoodWe** e **Solis** têm a curva do dia (só potência). Esta peça:

1. Adiciona a curva do dia às **6 marcas que faltam**: SolarEdge, Deye, NEP, ABB,
   FoxESS, Sungrow.
2. Acrescenta a **energia (kWh)** à curva em todas as marcas (incluindo GoodWe/Solis).

Cada marca usa o **endpoint e a resolução nativos da sua API** (5 min, 15 min, o
que a marca entregar — "o mesmo do portal da marca"). Nada de reamostrar.

## Fora de escopo (fase 2, projeto separado)

- **Telemetria completa guardada** (tensão CC/CA, corrente, temperatura, por
  inversor, salva no banco pra análise histórica). É a "Fundação da telemetria",
  piloto Deye — outro spec.
- Esta peça é **100% ao vivo**: busca na hora que abre a aba "Dia", **não guarda
  nada** no banco. Sem migration.

## Arquitetura

Reusa a infra que já existe:

- **Interface `MonitoringAdapter.fetchIntraday(credenciais, dia)`** já existe e já é
  chamada pela rota de detalhe (`GET /dashboard/monitoramento/:id?vista=dia`). O
  resultado já é renderizado como curva, e **degrada com aviso** quando o adapter
  não implementa ou a chamada falha (nunca derruba a página).
- Só faltam: (a) enriquecer o tipo do ponto com energia; (b) implementar
  `fetchIntraday` nas 6 marcas; (c) a tela desenhar a 2ª curva + total.

### Mudança de tipo (`src/modules/monitoring/types.ts`)

```ts
export interface IntradayPonto {
  hora: string;      // "HH:MM" (hora local da usina)
  kw: number;        // potência instantânea
  kwh?: number;      // energia acumulada no dia ATÉ esta hora (opcional)
}
```

`kwh` é **opcional** → GoodWe/Solis continuam válidos sem mudança; enriquecemos
quando a API da marca fornecer. `IntradayResult` não muda.

O **total do dia** = último `kwh` da série (ou o máximo), calculado na
renderização — não precisa de campo novo no result.

### Por marca (`fetchIntraday`)

Cada adapter implementa `fetchIntraday(creds, dia)` buscando o endpoint intradiário
nativo e devolvendo `IntradayPonto[]` (potência + energia acumulada quando houver).
Ordem de entrega, cada uma isolada e testável:

1. **Sungrow** — `/openapi/platform/getPowerStationPointMinuteDataList` (pontos
   83033 potência W, 83022 energia do dia Wh). Primeira a fazer.
2. **Deye** — endpoint de histórico/curva do dispositivo (maior frota).
3. **SolarEdge**, **NEP**, **ABB**, **FoxESS** — endpoints intradiários de cada API.
4. **GoodWe / Solis** — acrescentar o `kwh` ao que já devolvem.

Marca cujo endpoint intradiário não exista/della falhe → `fetchIntraday` não
implementado ou retorna `{ ok:false }` → a tela mostra o aviso padrão. Sem quebrar.

### Tela "Dia" (`src/modules/dashboard/views.ts` — detalhe)

O gráfico do dia passa a desenhar **duas séries**: potência (kW, eixo principal) e
energia acumulada (kWh, 2ª linha / eixo secundário), + o **total de kWh do dia** em
destaque. Mantém o aviso de degradação quando não há curva.

## Erros e degradação

- `fetchIntraday` é envolvido em try/catch na rota (já é hoje) → falha vira aviso,
  não erro 500.
- Respeitar os **limites de chamada** de cada API (Solis 1/s, FoxESS, etc.) — como
  é 1 chamada por abertura de tela (não em loop), o risco é baixo; cada adapter já
  tem `fetchWithTimeout`.

## Testes

Por marca: funções puras de parsing (resposta da API → `IntradayPonto[]`) + fluxo
de rede com `fetch` mockado (igual `sungrow-adapter.test.ts`). Validação ao vivo de
cada marca conforme as credenciais estiverem disponíveis. `tsc` limpo + suíte verde
+ **code review 3×** por marca antes de pedir merge.

## Entrega

Marca por marca, com commit/PR pequeno (ou uma branch com commits separados por
marca). Começa pela **Sungrow**.
