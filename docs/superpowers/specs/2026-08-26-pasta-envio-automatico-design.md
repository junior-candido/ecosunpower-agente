# Envio automático da Pasta Digital pós-obra — design (26/08/2026)

Pedido do Junior: "automatizar esse envio para o cliente após pasta pronta e troca do medidor". Decisões tomadas 25–26/08 (ver memória `automacao-envio-pasta-pos-medidor`).

## 1. Regras (decididas)

| # | Regra | Decisão |
|---|---|---|
| R1 | Gatilho "medidor trocado" | Manual (dashboard/ficha ou rota `/leads/:id/installation-status`) **ou** automático: usina do lead com geração real em `geracao_diaria` por **3 dias** consecutivos → sistema marca `medidor_trocado` e avisa o Junior |
| R2 | Publicar só com pasta completa | As **7 seções** (`fotos`, `projeto`, `art`, `homologacao`, `manuais`, `garantia`, `contrato`) com ≥1 arquivo cada. `monitoramento` opcional. Botão "Publicar" desabilitado com "falta: X, Y" |
| R3 | Pasta só pra cliente com venda | "Abrir pasta" num lead sem venda registrada → tela oferece registrar (valor · kWp · data) na hora (reusa `registrarVenda`) |
| R4 | Publicar move a jornada | `publicar()` → se `installation_status` anterior a `instalado`, seta `instalado` + `installed_at` |
| R5 | **Envio = modo (b)** | Quando pasta `publicada` **e** lead `medidor_trocado` → sistema manda ao Junior (ENGINEER_PHONE) mensagem com botões **Enviar agora / Segurar** (WABA interactive; fallback texto). Nada vai ao cliente sem o toque. |
| R6 | Lembrete | Se "Segurar" ou sem resposta: lembra 1×/dia às 9h (janela `dentroDaJanela`) enquanto pendente, no máximo 5 dias; depois só no dashboard |
| R7 | Envio ao cliente | Reusa `PastaService.enviarPorWhatsApp` (template `pasta_digital_v1` → fallback texto + convite Google). Marca `enviada_em` (já existe) |
| R8 | Idempotência | 1 aviso por pasta (`pastas_clientes.aviso_envio_em`). Reenvio de aviso só pelo lembrete R6. Nunca enviar 2× ao cliente |

## 2. Fluxo

```
[pasta rascunho] --(7 seções ok)--> Publicar --> status=publicada, lead>=instalado
[lead] --(manual | monitoramento 3 dias)--> medidor_trocado (meter_swapped_at)
              \______ ambos verdadeiros ______/
                          |
                 cron 15 min (dentro da janela 8h–20h)
                          |
        WhatsApp Junior: "📁 Pasta do(a) {nome} pronta. Medidor trocado em {data}.
                          Enviar agora?"  [Enviar agora] [Segurar] [Ver pasta]
                          |
      evabt:pasta-enviar:<pastaId>  -> enviarPorWhatsApp -> confirma "✅ enviada pro (61) 9…"
      evabt:pasta-segurar:<pastaId> -> aviso_segurado_ate = amanhã 9h (lembra de novo)
```

## 3. Dados

Migration `0XX_pasta_envio_auto.sql`:
- `pastas_clientes.aviso_envio_em timestamptz` (quando o Junior foi avisado)
- `pastas_clientes.aviso_segurado_ate timestamptz` (próximo lembrete)
- `pastas_clientes.avisos_enviados int default 0`
- `leads.medidor_detectado_auto boolean default false` (marcou pelo monitoramento)

## 4. Código (módulos novos, pequenos, testáveis)

- `src/modules/relatorios/pasta/completude.ts` — `secoesFaltando(pasta): SecaoId[]` (puro)
- `src/modules/relatorios/pasta/envio-auto.ts` — `listarPastasProntasParaAviso(supabase, agora)` + `montarAvisoJunior(pasta, lead)` + `tickEnvioAutoPasta(ctx)` (cron 15 min)
- `src/modules/monitoring/detectar-medidor.ts` — `leadsComGeracaoReal(supabase, dias=3)` → marca `medidor_trocado` + `medidor_detectado_auto` + chama `postInstall.scheduleOnMeterSwap` + avisa Junior ("⚡ {nome}: usina gerando há 3 dias — marquei medidor trocado")
- `eva-admin-buttons.ts` — novos cases `pasta-enviar`, `pasta-segurar` (callbacks `onPastaEnviar/onPastaSegurar`)
- `router.ts` — `/pastas/:id/publicar` usa `secoesFaltando`; view da pasta mostra checklist e trava; `/pastas/novo?lead=` oferece registrar venda se não houver
- `index.ts` — registra os 2 crons (`setInterval` 15 min, padrão dos demais) e liga callbacks

## 5. Testes (vitest, sem rede)

- completude: 7 seções ok → []; falta contrato → ['contrato']; monitoramento vazio não bloqueia
- envio-auto: só lista pasta publicada + lead medidor_trocado + sem enviada_em + sem aviso (ou segurado vencido); fora da janela não avisa; 2 ticks seguidos = 1 aviso
- detectar-medidor: 3 dias >0 kWh → marca; 2 dias → não; lead já medidor_trocado → ignora
- botões: `evabt:pasta-enviar:<id>` chama enviarPorWhatsApp 1× e responde; `pasta-segurar` agenda amanhã 9h
- publicar: com seção faltando → erro "falta …"; ok → status publicada + lead instalado

## 6. Fora de escopo (depois)

Relatório pós-instalação junto da pasta · avaliação Google já vai no texto · Hoymiles/Deye sem adapter = manual · modo (a) imediato como flag `PASTA_ENVIO_AUTO_MODO=imediato` (fácil de ligar depois).
