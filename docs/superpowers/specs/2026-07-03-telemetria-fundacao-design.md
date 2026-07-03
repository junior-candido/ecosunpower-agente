# Fundação da telemetria completa (piloto Sungrow)

**Data:** 2026-07-03
**Autor:** Junior + Claude
**Status:** aprovado (brainstorming)

## Objetivo

Transformar o monitoramento numa plataforma de **análise de dados**: coletar e
**guardar** TODAS as grandezas que cada inversor expõe (tensão CC/CA, corrente,
potência, energia, temperatura, etc.), de **15 em 15 minutos**, pra depois analisar
tendência e gerar relatórios de decisão.

Esta peça é a **fundação**: o modelo de dados unificado + o coletor + a retenção +
uma **tela básica** pra ver os dados. Piloto na **Sungrow** (fecha a Sungrow 100%:
geração + curva do dia + telemetria). Depois estende marca por marca.

## Decisões (do brainstorming)

- **Guardar histórico** (não só ao vivo).
- **Todos os dados** que cada inversor expõe.
- **Foto a cada 15 minutos.**
- **Retenção:** detalhe fino de 15 min pelos últimos **6 meses**; o mais antigo vira
  **resumo por dia** (mín/máx/média de cada grandeza) e o fino é apagado.
- **Piloto Sungrow**, com **tela básica** (escolhe inversor + grandeza → gráfico no tempo).

## Fora de escopo (peças de cima, depois)

- Relatórios de decisão, comparação entre usinas, dashboards sofisticados, alertas
  por grandeza. Vêm **em cima** desta fundação.
- Telemetria das outras marcas (Deye, SolarEdge, NEP, ABB, FoxESS) — mesma fundação,
  só mapear os pontos de cada API depois.

## Arquitetura

### 1. Modelo de dados (formato longo/genérico)

Como cada marca/inversor tem grandezas diferentes, NÃO usar "uma coluna por
grandeza" (rígido, quebra). Usar **formato longo**: uma linha por medida.

**Migration 067** (confirmar número no grupo antes de aplicar). 3 tabelas:

**`telemetria_catalogo`** — dá nome/unidade normalizada a cada ponto nativo da marca:
```sql
marca            text        -- 'sungrow'
device_type      int         -- 1=inversor string, 55=micro (Sungrow)
ponto_nativo     text        -- id do ponto na API da marca (ex Sungrow: '13112')
ponto            text        -- código normalizado nosso (ex: 'tensao_cc_mppt1')
rotulo           text        -- rótulo amigável ('Tensão CC MPPT1')
unidade          text        -- 'V','A','kW','kWh','°C'
categoria        text        -- 'tensao'|'corrente'|'potencia'|'energia'|'temperatura'|'outro'
PRIMARY KEY (marca, device_type, ponto_nativo)
```
O catálogo é semeado por seed/migration (Sungrow no piloto). Ponto não catalogado
pode ser ignorado OU gravado com rótulo cru (decisão: ignorar no piloto, log warn).

**`telemetria_medicoes`** — as fotos de 15 min (dado fino, particionada por mês):
```sql
sistema_id   uuid    references sistemas_clientes
device_key   text    -- identificador do inversor na marca (Sungrow: ps_key)
ponto        text    -- código normalizado (bate com telemetria_catalogo.ponto)
ts           timestamptz  -- horário da medida (UTC)
valor        double precision
unidade      text
PRIMARY KEY (sistema_id, device_key, ponto, ts)
-- PARTITIONADA POR MÊS em ts (RANGE) — retenção/volume; índice (sistema_id,device_key,ponto,ts)
```

**`telemetria_resumo`** — resumo diário do que passou de 6 meses (leve, pra sempre):
```sql
sistema_id   uuid
device_key   text
ponto        text
dia          date
valor_min    double precision
valor_max    double precision
valor_med    double precision
unidade      text
PRIMARY KEY (sistema_id, device_key, ponto, dia)
```

### 2. Coletor (cron a cada 15 min)

Novo método no adapter (opcional na interface):
`fetchTelemetry?(credenciais): Promise<TelemetryResult>` → devolve, por dispositivo,
as leituras atuais de todos os pontos catalogados: `{ deviceKey, leituras: [{ ponto, valor, unidade, ts }] }`.

**Sungrow** implementa via `getDeviceListByPsId` (inversores tipo 1/55) →
`getDeviceRealTimeData` (ps_key + `device_type` + `point_id_list` = os pontos
nativos do catálogo). A resposta (Wh/W/V/A, sempre menor unidade) é normalizada pra
`telemetria_medicoes`. Refresca a cada ~5 min na origem → foto de 15 min pega dado fresco.

Serviço `TelemetriaService.coletar()`: itera sistemas ativos cuja marca tem
`fetchTelemetry`, chama o adapter (com o `AdapterContext` pra persistir rotação do
token Sungrow), faz UPSERT em `telemetria_medicoes`. Cron novo de 15 min
(`*/15 * * * *`). Erro por-sistema não derruba os demais (padrão do syncAll).

Limites de API: 1 chamada de real-time por inversor a cada 15 min — folgado em todas
as marcas. `fetchWithTimeout` já protege o cron.

### 3. Retenção / resumo (job diário)

`TelemetriaService.resumirAntigos()`: 1×/dia, agrega `telemetria_medicoes` com
`ts < hoje-6meses` em `telemetria_resumo` (mín/máx/média por sistema+device+ponto+dia)
e **dropa as partições** de mês vencidas (drop de partição = barato, sem DELETE
linha a linha). Cron diário (junto do de monitoramento, ~3h BRT).

### 4. Tela básica ("Dados")

Nova aba na página de detalhe da usina (`/dashboard/monitoramento/:id`), ao lado de
Dia/Mês/Ano: **"Dados"**. Fluxo:
- Seletor de **inversor** (device_key) + seletor de **grandeza** (ponto, do catálogo).
- Seletor de período (dia/semana/mês).
- **Gráfico** da grandeza no tempo (linha), lendo de `telemetria_medicoes` (período
  recente) ou `telemetria_resumo` (período antigo). Degrada com aviso se sem dados.

Server-rendered + Chart.js (igual às outras abas). Query nova no `MonitoringService`
ou num `TelemetriaService` (`serieTelemetria(sistemaId, deviceKey, ponto, periodo)`).

## Tipos (interface do adapter)

```ts
export interface TelemetryLeitura { ponto: string; valor: number; unidade: string; ts: string }
export interface TelemetryDevice { deviceKey: string; leituras: TelemetryLeitura[] }
export type TelemetryResult =
  | { ok: true; devices: TelemetryDevice[] }
  | { ok: false; reason: string; invalidCredentials?: boolean };
// MonitoringAdapter ganha: fetchTelemetry?(credenciais, ctx?): Promise<TelemetryResult>
```

Adapter sem `fetchTelemetry` = marca sem telemetria ainda (coletor pula).

## Erros e volume

- Coletor: erro por-sistema logado, não interrompe os outros; `invalidCredentials`
  desativa o sistema (igual geração).
- Volume: 15 min × ~15 grandezas × inversor ≈ ~1.400 linhas/dia/inversor; partição
  mensal + drop de partição na retenção mantém previsível. Piloto (2 usinas Sungrow,
  1 inversor + 1 micro) é minúsculo — valida a arquitetura sem risco.
- Micro Sungrow (Cesar): não reporta minuto/telemetria via API (investigado 03/07) →
  o coletor simplesmente não acha pontos e não grava nada pra ele (degrada limpo).

## Testes

- Funções puras: normalização da resposta da API → leituras; agregação do resumo
  (mín/máx/média). Testadas sem rede.
- `fetchTelemetry` Sungrow: fetch mockado (device list → real-time → leituras).
- Coletor/resumo: testados contra um supabase fake/mock (padrão dos testes de service).
- `tsc` limpo + suíte verde + **code review 3×**. Validação ao vivo do `fetchTelemetry`
  Sungrow com as usinas reais antes do merge.

## Entrega (ordem sugerida)

1. Migration 067 (catálogo + medições particionada + resumo) + seed do catálogo Sungrow.
2. Tipos + `fetchTelemetry` no adapter Sungrow (validado ao vivo).
3. `TelemetriaService.coletar()` + cron 15 min.
4. `resumirAntigos()` + cron diário.
5. Tela "Dados" (aba + gráfico).
6. Review 3× → PR → (confirmar 067 no grupo + aplicar) → Implantar → smoke.
