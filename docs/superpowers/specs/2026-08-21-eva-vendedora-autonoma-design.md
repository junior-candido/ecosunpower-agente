# Eva Vendedora Autônoma — desenho

**Data:** 21/08/2026 · **Decisor:** Junior · **Status:** aprovado em conversa, aguardando revisão do documento

## 1. Objetivo

Eva passa a fechar o ciclo comercial sozinha dentro de uma faixa de autonomia: qualifica → dimensiona e precifica (motor determinístico) → pede o **OK do Junior no zap** → envia a proposta personalizada → faz **follow-up sem fim** até agendar, fechar, perder ou o cliente pedir o Junior.

Dor que resolve: leads que recebem proposta tarde ou esfriam depois da visita; Junior como gargalo de precificação; proposta da IA "chutada" (erros do passado).

## 2. Princípios (regras duras — código, não prompt)

1. **Nenhum número nasce na IA.** kWp, módulos, geração, preço, parcela: tudo vem do motor (`proposal/calculator.ts` + régua 3,75 kWh/kWp·dia + tabela de parcelamento 18×). A IA só conversa, extrai campos e traduz pedidos de ajuste em parâmetros.
2. **Nada chega ao cliente sem OK do Junior** enquanto o lead estiver em `AGUARDANDO_OK`. Ajustes em texto livre → recalcula → mostra de novo → novo OK.
3. **Qualificação continua como está.** O formulário/conversa já descarta "só R$ 300". A faixa de autonomia usa o **consumo-alvo** (fatura atual *ou* carga futura declarada), nunca corta pela fatura de hoje.
4. **Follow-up nunca inventa condição.** Sem desconto por conta própria (pede ao Junior), preço sempre o da versão aprovada.
5. **Cliente pede o Junior → Eva para** (`QUER_JUNIOR`, takeover existente) e avisa.
6. Tudo versionado e auditável (quem pediu o quê, quando, qual versão foi enviada).

## 3. Esteira de estados (por lead)

```
QUALIFICADO ──(500–1.500 kWh alvo)──► PRECIFICANDO ──► AGUARDANDO_OK ──OK──► PROPOSTA_ENVIADA ──► FOLLOWUP_VIVO
     │                                                    ▲     │ ajuste                          │
     ├─(>1.500 ou fora da faixa)──► CHAMA_JUNIOR ─────────┘     └──► (refaz vN)                  ├──► AGENDADO (meet/visita) ──► FECHADO
     │      (Junior posta link/PDF → PROPOSTA_ENVIADA)                                            ├──► QUER_JUNIOR (takeover)
     └─(<500 sem carga futura)──► fluxo atual (descarte educado)                                  └──► PERDIDO (opt-out / motivo)
```

Persistência: coluna `estado_venda` + `estado_venda_em` na tabela de leads; tabela nova `propostas_versoes` (lead_id, versao, params_json, resultado_json, autor: eva|junior, pedido_texto, enviada_em). Transições só por funções nomeadas (`transicionar(lead, para, motivo)`), com log.

## 4. Precificação (motor)

Entrada (da qualificação): consumo-alvo kWh/mês, cidade/concessionária, tipo de telhado, fase (mono/tri), preferência de marca (opcional), infra extra declarada (opcional).

1. **Dimensionamento**: kWp = consumo-alvo × 12 / (3,75 × 365); módulos = teto(kWp / Wp do modelo); microinversores pelo FDI admitido do fabricante (mesmo código da calculadora).
2. **Kit**: tabela do Junior (`tabela_precos`: item, modelo, preço unitário, fonte, atualizado_em). Estrutura por tipo de telhado; cabos/proteção por kWp. Linha com mais de **15 dias** → aviso "preço velho" no card.
   - Atualização pelo zap: `/tabela JA 625 = 980` ou print da loja (Belenus/Sol Fácil) que a Eva lê (vision existente) e propõe a atualização para confirmação.
3. **Serviço** (aprovado 21/08, referência Greener jun/2025):

   | Consumo-alvo | kWp típico | Serviço R$/Wp |
   |---|---|---|
   | 500–700 kWh | 4–6 | 0,95 |
   | 700–1.000 | 6–9 | 0,80 |
   | 1.000–1.500 | 9–13 | 0,70 |

   Infra extra (padrão de entrada, carregador EV, laje com bloquete) = itens à parte, como hoje.
4. **Trava de mercado**: total ≤ **2,60 R$/Wp**; acima disso o card avisa "acima do mercado (Greener 8 kWp = 2,31)".
5. **Duas opções** (A/B, marcas diferentes, comparação neutra e modular, 18× e 90×) → página `/propostas/<slug>` com radar de abertura (existente).

Acima de 1.500 kWh: roda só o passo 1 e manda card "preciso de você" com resumo; Junior responde `proposta: <link|PDF>` e a esteira segue.

## 5. Interface do Junior no zap

Card por proposta pronta (template aprovado / janela aberta):

```
📋 Proposta pronta — Joel (Lago Oeste)
734 kWh · tri · fibrocimento · 8,58 kWp
A) 12× Risen 715 + 3× Hoymiles — kit 14.520 + serv 6.900 = 21.420 (2,50 R$/Wp)
B) 14× JA 625 + 4× Sungrow — kit 16.515 + serv 6.900 = 23.415
🔗 ecosunpower.eng.br/propostas/joel-lima-peres
Responda OK · ou ajuste · ou PARA
```

Comandos (texto livre → parser IA → parâmetros → **recalcula no motor**):
- `OK` → envia, inicia follow-up
- `19200` / `fecha em 19.200` → ajusta total (recalcula serviço)
- `tira B` · `só A` · `inverte`
- `16 módulos` · `GoodWe` · `troca pra JA` (motor valida FDI/Voc; se inválido, explica)
- `kit 14520` → cola preço real da cotação
- `PARA` / `deixa comigo` → `QUER_JUNIOR`
- Silêncio 2 h → 1 lembrete; 24 h → cliente recebe "Junior está finalizando sua proposta" (nada mais)

## 6. Follow-up vivo

Job agendado (reaproveita `proposal-followup.ts` + `reengagement-cadence.ts`), horário 8h–20h, nunca domingo, para em `FECHADO`/`PERDIDO`/`QUER_JUNIOR`/`AGENDADO` (após visita reinicia).

| Gatilho | Ação | Fonte |
|---|---|---|
| Envio | link + 3 linhas | — |
| Abriu, não respondeu (radar) | +2 h: "dúvida na A ou B?" | beacon |
| Não abriu 24 h | reenvio curto + oferta de áudio | — |
| D+3 | economia concreta (conta → nova conta) | motor |
| D+5 | financiamento 18× / 90× | tabela parcelamento |
| D+8 | prova social: obra parecida na região | portfólio/cases |
| D+12 | validade do preço do kit | data da cotação |
| D+20, 35, 60, 90, mensal | toque leve (notícia ANEEL/bandeira, "ainda faz sentido?") | news-scraper |
| 24 h após visita sem fechamento | "ficou dúvida?" + proposta atualizada (se Junior postar) | agenda |

Regras: resposta do cliente → conversa normal; pedido de desconto → card ao Junior ("libero até X%?"); opt-out → `PERDIDO` com motivo.

## 7. Componentes (novos × reaproveitados)

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `vendas/estado-venda.ts` (novo) | máquina de estados + transições + log | supabase |
| `vendas/precificador.ts` (novo) | dimensiona + cota + serviço + trava; retorna resultado puro | `proposal/calculator.ts`, `tabela_precos` |
| `vendas/tabela-precos.ts` (novo) | CRUD da tabela + comando `/tabela` + leitura de print | vision, supabase |
| `vendas/card-ok.ts` (novo) | monta card, envia ao Junior, parser de ajustes, lembretes | meta-whatsapp, IA (parser) |
| `vendas/autonomia.ts` (novo) | decide faixa (500–1.500 / chama Junior / fluxo atual) | dados do lead |
| `proposal-assistant.ts` (existente) | gera página/PDF a partir do resultado | — |
| `proposal-followup.ts` + `reengagement-cadence.ts` (evoluir) | follow-up vivo por estado | radar, news |
| `scheduling-assistant.ts` (existente) | meet/visita | calendar |
| `takeover.ts` (existente) | `QUER_JUNIOR` | — |

## 8. Erros e segurança

- Motor falha (tabela sem item, FDI inválido) → card "preciso de você" com o erro; nunca envia parcial.
- Parser de ajuste incerto → pergunta de volta ao Junior ("entendi 'fecha em 19.200' como total; confirma?").
- Preço velho (>15 d) → aviso no card, não bloqueia.
- Envio ao cliente só com `estado=AGUARDANDO_OK` + `versao_aprovada = versao_atual` (checagem no código de envio).
- `/eva off` continua como freio geral.
- Observabilidade: cada transição e cada envio logados (padrão da casa).

## 9. Testes

- Unitários do precificador com os 3 casos reais de 21/08 (Nelson 5,72 kWp, Joel 8,58, Udson 8,75) como golden: totais dentro de ±5% e R$/Wp entre 2,2 e 2,6.
- Máquina de estados: toda transição inválida rejeitada; envio sem OK impossível (teste negativo).
- Parser de ajustes: tabela de frases → parâmetros (20 casos).
- Follow-up: simulação de calendário (D+0…D+90) com e sem resposta; horário/ domingo.
- Teste de fogo com Junior: 3 leads reais em modo "sombra" (Eva monta, Junior compara com a proposta que faria) antes de ligar o envio.

## 10. Fatias de entrega (ordem)

1. **Follow-up vivo + pós-visita** sobre propostas que o Junior já posta hoje (ganho imediato, sem precificação).
2. **Estado de venda + tabela de preços + precificador** em modo sombra (card pro Junior, sem envio).
3. **Card OK + ajustes + envio** (liga a autonomia 500–1.500).
4. **Faixa >1.500 / handoff** e polimentos.

Fora de escopo desta spec: pós-homologação automático (pasta + avaliação Google/site) — spec própria, Frente 2.
