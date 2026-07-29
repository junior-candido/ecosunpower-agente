# Fase 2B — Vigias de tensão e corrente (telemetria → alerta com motivo)

**Data:** 2026-07-28 (noite) · Fecha o pedido do Thiago: "a usina avisar o
problema: falta de wifi, tensão, corrente, geração baixa". WiFi/falha = fase 2A
(no ar); geração baixa = régua (no ar); **tensão/corrente = este spec**.

## Pré-requisito descoberto: catálogo FoxESS vazio

A telemetria só grava ponto que está no `telemetria_catalogo`, e o seed (067)
é só Sungrow. A FoxESS coleta ao vivo (validada 03/07) mas TUDO era descartado.
**Migration 087** semeia o catálogo FoxESS (device_type 1, unidades finais,
fator ignorado pelo parse): `generationPower`→potencia · `RVolt`→tensao_fase_r ·
`RCurrent`→corrente_fase_r · `pv1..pv4 Volt/Current`→tensao_pv1..4/corrente_pv1..4
· `invTemperation`→temperatura. A partir daí a frota Fox do Thiago acumula
tensão/corrente de 15 em 15 min.

## As 2 regras (módulo puro `proactive-alerts/telemetria-regras.ts`)

Janela: **últimos 3 dias** das `telemetria_medicoes` (finas — o resumo diário
só existe pra dado com 6+ meses), agregadas em **máximo por ponto por dia**.

1. **`tensao_rede_alta`** (aviso): pontos `tensao_fase*` com máximo diário
   **> 242 V** (220 V +10%, NBR 16149) em **≥2 dos 3 dias** → "Tensão da rede
   alta (pico X V)... inversor pode estar desligando nos horários de pico —
   problema da REDE, vale reclamação na concessionária."
2. **`string_zerada`** (aviso): ponto `corrente_pv*`/`corrente_mppt*` com
   máximo diário **= 0** num dia em que a usina **gerou** (geracao_diaria > 0)
   em **≥2 dos 3 dias** → "Entrada(s) X sem corrente com a usina gerando —
   string solta/fusível/conector; visita técnica." Várias entradas = 1 alerta
   listando todas. Usina parada não dispara (offline já cobre).

## Integração

- Tipos novos na união `MonitoringAlertTipo` + `format.ts` (header/botões:
  ver detalhe · adiar 3d · já resolvi — problema técnico é do operador, não
  vira abordagem Eva ao cliente).
- **Ciclo próprio 1×/dia às 18h BRT** (idioma do cron do aniversário):
  `runTelemetriaRulesCycle` no ProactiveAlertService — só sistemas cuja marca
  tem `fetchTelemetry`; leitura paginada (`buscarPaginado`) das medições 3d
  filtrada por ponto (`tensao_fase%`/`corrente_pv%`/`corrente_mppt%`);
  cria pendente (dedupe pelo aberto existente) e **resolve** quando a condição
  some. Dispatcher/fila existentes cuidam do envio (throttle padrão 3d).
- **Detect principal NÃO resolve os tipos de telemetria** (hoje ele resolve
  qualquer alerta de tipo diferente do atual — "mudou de natureza"; os tipos
  novos ficam fora dessa família).

## Fora (fase 2C — adiada com motivo)

Código de alarme do fabricante (F-XX): sem endpoint validável hoje sem caso
real ao vivo; o status 'falha' (2A) já aponta o equipamento. Entra quando
aparecer o primeiro caso real pra validar.

## Testes (TDD)

Regras puras (sobretensão 2/3 · 1/3 não dispara · string zerada com geração ·
sem geração não dispara · várias entradas agregadas) · detect não resolve tipo
de telemetria · format dos 2 tipos novos · suite inteira + tsc.
