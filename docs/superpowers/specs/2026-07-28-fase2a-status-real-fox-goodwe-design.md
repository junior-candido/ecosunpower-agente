# Fase 2A — Status real de FoxESS e GoodWe no alerta com motivo

**Data:** 2026-07-28 · Continuação do #163/#164 (pedido Thiago/SunBright).
Fase 2 completa = A (este spec) + B (regras de tensão/corrente da telemetria) +
C (código de alarme do fabricante). B e C têm specs próprias depois.

## Problema

Desde o #163, o alerta de usina parada diz o MOTIVO usando o `statusInversor`
do adapter — mas FoxESS/GoodWe/Solis/Sungrow devolvem `'desconhecido'` (o 'ok'
antigo era proxy mentiroso). Na carteira do Thiago (FoxESS+NEP+GoodWe), só o
NEP dá motivo real hoje.

## O que as APIs entregam (sem endpoint novo exótico)

- **FoxESS** `/op/v0/device/list` (já usado no listSites): cada device vem com
  `status`: 1=online · 2=falha · 3=offline.
- **GoodWe SEMS** `QueryPowerStationMonitor` (já usado no listSites): cada
  usina vem com `status`: -1=offline · 0=em espera (standby, ex.: noite) ·
  1=gerando · 2=falha.

## Desenho

1. **Funções puras** (testáveis sem HTTP):
   - `derivarStatusFoxDevices(devices, deviceSNs)` → qualquer device meu com
     status 2 → `'falha'`; senão algum 1 → `'ok'`; senão todos 3 → `'offline'`;
     nada casou/sem status → `'desconhecido'`.
   - `mapStatusGoodweStation(status)` → -1→`'offline'` · 2→`'falha'` ·
     0|1→`'ok'` · resto→`'desconhecido'` (0 = standby normal, não é problema).
2. **fetchGeneration** de cada marca consulta o status **best-effort** ao fim:
   - FoxESS: pagina `/op/v0/device/list` (mesmo shape do listSites) e filtra
     pelos `deviceSNs` da usina.
   - GoodWe: `QueryPowerStationMonitor` com `key: site_id` (busca) e acha o
     record `powerstation_id === site_id`.
   - **Falha na consulta de status NUNCA derruba o sync** (try/catch →
     `'desconhecido'`). Geração continua igual byte a byte.
3. Solis/Sungrow: ficam `'desconhecido'` (fase 2 futura, carteira menor).

## Testes (TDD)

- `derivarStatusFoxDevices`: falha vence; ok vence offline; todos offline;
  SNs não encontrados; sem status.
- `mapStatusGoodweStation`: os 4 mapeamentos + undefined.
- Zero-regressão: geração dos dois adapters intocada (suite atual).

## Validação final

Adapter só se prova AO VIVO: 1º sync pós-deploy → conferir `status_inversor`
gravado pras usinas FoxESS/GoodWe do Thiago (query no SQL Editor ou tela).
