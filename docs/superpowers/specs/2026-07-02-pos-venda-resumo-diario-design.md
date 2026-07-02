# Resumo diário do pós-venda no zap (incremento 2 da memória de relacionamento)

Data: 2026-07-02
Autor: Junior + Claude

## Problema

A Eva manda pro Junior **uma mensagem por usina** no zap (📉 queda, 🟢 BOMBANDO,
"🟡 Abordagem pronta"…). Com a frota crescendo (NEP + GoodWe + Solis + FoxESS),
isso virou bombardeio. A memória anti-repetição (migration 065, incremento 1)
só vale na **tela** do pós-venda — o zap continua no modelo antigo.

## Decisões do Junior (02/07)

1. **Urgente na hora, resto no resumo** — usina OFFLINE e erro de integração
   continuam chegando individuais, na hora. Queda, relatório/parabéns, boa
   notícia e upgrade viram linhas de UM resumo diário.
2. **Ação pelo painel** — o resumo traz link pro `/dashboard/pos-venda`; lá os
   botões do incremento 1 (Enviar pela Eva / Agora não / ⭐ depoimento) já
   resolvem. Sem botões de ação no resumo.
3. **Fim do dia** — o resumo chega entre 17h e 18h de Brasília.
4. **Avisos de resultado continuam na hora** — 📋 encerramentos, 👍/👎 de
   treino, "💰 topou — fecha o valor", eco "🤖 Mandei" do modo auto: tudo
   igual a hoje (são consequência de conversa em andamento, poucos por dia).

## Abordagem escolhida: resumo nasce do MESMO motor da tela

O resumo lê as mesmas sugestões que o painel mostra —
`listarClientesPosVenda` (pos-venda-queries) + `sugestaoProativa`
(pos-venda-sugestao) — **com a memória 065 filtrando** o que está em descanso.
Garantia: o zap e o painel nunca discordam; cliente snoozed não aparece no
resumo. Nada de segundo motor lendo alertas (descartado: podia divergir da
tela e não usa a memória).

## A mensagem

1× ao dia, **só quando tem sugestão** (dia sem nada = silêncio). Formato
(texto simples, sem botões):

```
☀️ Resumo das usinas — 4 pedem atenção
📉 Queda: Denivaldo, Francisco (+1)
☀️ Boa notícia pra dar: Maria, Sonia
🔋 Upgrade: José
👉 Resolver no painel: https://dashboard.ecosunpower.eng.br/dashboard/pos-venda
```

- Agrupado por situação, na ordem de prioridade do motor: queda → sem contato
  há 90d ("manda um oi") → boa notícia → upgrade.
- Até **3 primeiros nomes por grupo**; o resto vira "(+n)".
- Link = `DASHBOARD_BASE_URL` (env, fallback `https://dashboard.ecosunpower.eng.br`)
  + `/dashboard/pos-venda` — mesmo padrão já usado no index.
- Montagem em função **PURA** (`montarResumoDiario`), testável sem I/O.

## Disparo (quando e como)

- Pega carona no **ciclo de 15 min** que já roda o dispatch/pendências.
- Janela própria do resumo: **17h–18h de Brasília**. Primeiro ciclo dentro da
  janela manda; os seguintes veem a marca e pulam.
- **Só 1 por dia**: coluna nova `resumo_diario_enviado_em timestamptz` em
  `monitoring_config` (**migration 066** — additiva; combinar o número no
  grupo). Porteiro CAS no padrão do repo: grava a marca ANTES do envio
  (update condicional "marca < hoje"); falha de envio = perde o resumo do dia
  (aceitável — duplicar é pior; lição do orquestrador).
- **Dry-run** (`PROACTIVE_ALERTS_DRY_RUN`): loga o texto, não envia e NÃO
  grava a marca.

## O que muda no dispatcher (fim das individuais não-urgentes)

Hoje `runDispatchCycle` manda alerta individual ou vira `proporAbordagem`
(queda/milestone/offline com dono). Passa a valer:

| alerta | dono vinculado | autonomia | comportamento NOVO |
|---|---|---|---|
| `sistema_offline` | qualquer | qualquer | **igual hoje** (urgente: abordagem/alerta na hora) |
| `erro_integracao` | — | — | **igual hoje** (alerta admin na hora) |
| usina órfã (sem dono) | não | — | **igual hoje** (alerta "cadastrar dono") |
| `queda_geracao` | sim | **auto ON** | **igual hoje** (Eva manda sozinha + eco 🤖) |
| `queda_geracao` | sim | auto OFF | **não manda nada individual** — marca o alerta como absorvido pelo resumo (`acao_disparada='resumo_diario'`, `next_send_at` +3d); a queda aparece no resumo via saúde da tela (ver pré-requisito abaixo) |
| `milestone_economia` | sim | **auto ON** | **igual hoje** |
| `milestone_economia` | sim | auto OFF | **não manda nada individual** — absorvido pelo resumo (a boa notícia aparece como `geracao_saudavel`); coerente com "depoimento é decisão manual do Junior" |

- Sem proposta individual em treino, o envio real passa a nascer no painel
  (copiloto do incremento 1, que já registra abordagem + memória + snooze).
- O motor de abordagens (escada/lembrete/encerramento/vassoura) **continua
  intocado** pras conversas já abertas e pro modo auto.

## Pré-requisito descoberto no código: a queda não pinta a tela hoje

A saúde da tela (`pos-venda-queries` → `saudeUsina`) lê alertas só de
`alertas_sistema` — tabela em que **ninguém escreve** (só leitura e resolve).
A queda detectada pelo monitoramento mora em `monitoring_alerts`. Sem conserto,
absorver a queda no dispatcher a deixaria invisível (nem zap, nem tela).

Conserto (2 pontos, também melhora a tela por si só):
1. `pos-venda-queries` passa a ler TAMBÉM `monitoring_alerts` abertos
   (`resolved_at is null`) e junta na entrada de `saudeUsina` (os nomes de
   tipo já casam: `sistema_offline` → vermelho, `queda_geracao` → amarelo).
2. `sugestaoProativa` passa a sugerir `queda` também com saúde **amarela**
   (hoje só vermelha) — amarelo é exatamente "queda de geração aberta".

## O que NÃO muda (compatibilidade travada)

Tela do pós-venda e copiloto (incremento 1), avisos de resultado (📋/👍👎/💰),
alertas offline/integração/órfã, modo auto e seu eco, lembretes/encerramentos
de abordagens em andamento, atendimento de LEAD. Migration 066 é additiva
(1 coluna em `monitoring_config`).

## Tratamento de erro

- Falha ao montar/enviar o resumo: loga erro, NÃO derruba o ciclo dos outros
  crons (padrão try/catch por peça do orquestrador).
- Marca gravada e envio falhou → sem resumo naquele dia (aceito; nunca 2).
- Motor da tela indisponível (query falhou) → pula o ciclo, tenta no próximo
  dentro da janela.

## Testes

- **Puro `montarResumoDiario`:** agrupa por situação na ordem de prioridade;
  cap de 3 nomes + "(+n)"; 0 sugestões → null (não manda); 1 sugestão singular
  ("1 usina pede atenção"); link presente.
- **Janela/porteiro:** fora de 17h–18h BRT não manda; segunda chamada no mesmo
  dia não manda (CAS); dia seguinte manda de novo; dry-run loga sem marcar.
- **Dispatcher:** queda/milestone com dono + auto OFF → nada individual e
  alerta marcado absorvido; auto ON → igual hoje; offline/erro/órfã intocados.
- **Validação real:** rodar um fim de dia com a frota e conferir com o Junior
  que o resumo bate com a tela do pós-venda.
