# Tela de Demonstrativos + Relatório mensal da usina (PDF)

**Data:** 23/09/2026 · **Pedido:** Junior · **Fase 2** de [2026-09-21-demonstrativo-gd-ingestao-design.md](2026-09-21-demonstrativo-gd-ingestao-design.md)

## Objetivo

Hoje o demonstrativo de GD da Neoenergia entra sozinho por e-mail e vira um resumo no WhatsApp só do
Junior. Falta: (1) **ver** os demonstrativos numa tela, (2) **colocar dados à mão** quando não vierem
por e-mail — PDF do demonstrativo e **prints da tela do monitoramento** — e (3) **gerar um relatório
mensal caprichado em PDF** para o cliente, com números exatos.

O motor de relatório nasce reaproveitável: o mesmo motor e o mesmo modelo HTML serão empacotados
depois como programa Windows de licença única para o Thiago (Sabion, Light/RJ) e servem à Jimena
(Conquista, Coelba — mesmo grupo Neoenergia). **Fora deste documento:** o programa Windows, o leitor
da Light, o botão "Enviar no zap" e o envio automático.

## Decisões

| Decisão | Por quê |
|---|---|
| **Sem IA em nenhuma leitura.** PDF lido por código (`unpdf` + regras, o leitor que já existe); print lido por **OCR** (`tesseract.js`, no navegador) + regras | Junior: "IA dá muito erro". Número exato, custo zero por uso, funciona offline no programa do Thiago |
| **Um leitor só** para e-mail e PDF manual; "Digitar" usa os mesmos campos | Uma regra única → nunca dois números diferentes para o mesmo dado |
| **Print só de tela** (não foto); OCR com **conferência obrigatória** e **modelo de tela que aprende** | Cada marca tem uma tela; regra fixa por tela vira manutenção infinita. Na 1ª vez o Junior aponta o campo; nas próximas o sistema preenche e ele só confere |
| **PDF só sai com todos os números "verdes"** | Relatório realista: nenhum número sem origem e sem conferência |
| **Motor puro + modelo HTML + `htmlToPdf` (Puppeteer) já existente** | Tela e PDF mostram o mesmo relatório; reaproveitável; menos código novo |
| **Economia = compensado × tarifa configurável** (padrão R$ 0,99/kWh), escrita "economia estimada" | O demonstrativo não traz R$; Lei 14.300 cobra parte do Fio B |
| **Vídeo fora** | Caro, erra mais; um print da tela certa resolve |

## Entradas

```
E-MAIL AUTOMÁTICO (no ar) ──┐
"ENVIAR PDF" ───────────────┼─► leitor por código ─► CONFERÊNCIA ─► grava demonstrativos_gd
"DIGITAR" (demonstrativo) ──┘

GERAÇÃO DO MÊS:
  API do monitoramento (geracao_diaria, já existe) ─────────────────────► lida na hora
  "ENVIAR PRINTS" ─► OCR ─► modelo de tela ─► CONFERÊNCIA ─► grava geracao_mensal_gd
  "DIGITAR" (geração) ─────────────────────────► CONFERÊNCIA ─► grava geracao_mensal_gd
```

- **Enviar PDF:** um ou vários arquivos de uma vez. Cada um passa pelo `demonstrativo-parser.ts`
  existente. Nada é gravado antes do "confirmo". Origem = `pdf_manual`.
- **Mês repetido:** mesma `(company_id, instalacao, referencia)` → atualiza (upsert já existe). **Se o
  conteúdo não mudou, a Eva não avisa de novo** (corrige o aviso duplicado).
- **UC sem cliente:** grava com `lead_id = null`; na lista aparece "sem cliente" com botão para ligar
  ao cliente certo.
- **Prints do monitoramento:** vários de uma vez (um por mês, ou abas diferentes). Só imagem de tela
  (PNG/JPG). Recusa com aviso "mande o print da tela" quando a imagem parece foto (resolução baixa,
  pouco texto reconhecido).

## Leitor de prints (OCR assistido)

1. `tesseract.js` roda **no navegador** (idioma `por`), devolve palavras com posição e confiança.
2. Um código **puro** (`print-leitor.ts`) junta palavras em pares **rótulo → número** ("Geração do mês"
   → `612,4 kWh`), entende número brasileiro (`1.234,5`) e unidade (Wh, kWh, MWh).
3. Procura um **modelo de tela** salvo que combine com o print (palavras-chave da tela, ex.: "SEMS",
   "Energia mensal"). Achou → pré-seleciona o campo. Não achou → o Junior clica no par certo e dá um
   nome ao modelo ("SEMS – tela mensal"); o modelo guarda as palavras-chave e o rótulo-âncora.
4. Mês de referência: lido do print quando aparece; senão o Junior escolhe.
5. **Conferência:** recorte do print ao lado do número. Botões Confirmar / Corrigir.

## Travas de exatidão

Rodam em código puro (`gd-validacao.ts`) antes de gravar e antes de gerar o PDF:

| Trava | Regra | Falha |
|---|---|---|
| Geração ≥ injetado | `geracao_mes ≥ injetado_mes` | 🔴 |
| Geração plausível | entre 40 % e 160 % de `kWp × 3,75 kWh/kWp/dia × dias do mês` (sem kWp cadastrado: só avisa) | 🔴 |
| Soma dos dias = mês | quando o print traz os dois, diferença ≤ 1 % | 🔴 |
| Print × API | cliente com API: diferença ≤ 3 % | 🔴 |
| Leitura do PDF | `inconsistencias` do parser vazia | 🔴 |
| Faltando dado | sem geração do mês, sem cliente ligado | 🟡 |

Estados da linha: 🟢 pronto · 🟡 falta dado · 🔴 inconsistente · ⚪ sem cliente. **O botão "Gerar PDF"
só acende em 🟢** e diz o que falta quando não.

**Origem de todo número:** cada dado guarda de onde veio (`email`, `pdf_manual`, `print`, `api`,
`digitado`), o arquivo/modelo quando houver, quem conferiu e quando. A tela mostra; o PDF cita as
fontes no rodapé.

## Telas (`/dashboard/demonstrativos`, no menu)

- **A — Lista:** filtro por mês, situação e busca (nome/UC). Uma linha por UC com mês, geração,
  saldo de créditos, estado (cores acima) e alerta de crédito a vencer. No topo: [Enviar PDF]
  [Enviar prints] [Digitar].
- **B — Cliente:** navegação ◄ mês ►; 4 números (gerou, consumiu, economia estimada, saldo de
  créditos); gráfico de barras 13 meses (geração × consumo × injetado); créditos e vencimento;
  rateio; "de onde veio cada número"; botões [Gerar PDF] [Baixar].
- **C — Conferência:** arquivo de um lado, números do outro, travas visíveis; Confirmar / Corrigir.

Acesso por permissão nova `demonstrativos` (padrão das outras telas, `exigir(...)`). Tudo filtrado por
`company_id` (multi-tenant).

## Relatório (PDF A4 em pé, 2 páginas)

**Página 1 — Como foi o mês:** logo grande da empresa do tenant; cliente, UC, mês; 4 números grandes
(gerou, consumiu, economia estimada, créditos); uma frase em português simples montada por código a
partir dos números ("Em agosto sua usina gerou 612 kWh. Você usou 390 kWh direto do sol e mandou 222
kWh pra rede, que viraram créditos."); gráfico de barras dos 13 meses.

**Página 2 — Seus créditos e sua usina:** saldo, usados no mês, **a vencer com data em destaque**;
rateio (só se houver mais de uma unidade); desempenho gerado × esperado (kWp × 3,75 × dias);
glossário curto (injetado, compensado, crédito, rateio); rodapé com fontes, fórmula da economia
estimada, contato da empresa e Responsável Técnico.

Regras: página A4 medida antes de gerar (nada corta, nada vira 3ª página); letra grande; gráficos
Chart.js esperados antes do `htmlToPdf`; o gerador confere o PDF pronto (2 páginas, rodapé presente).
**Aprovação visual pelo print do PDF real de um cliente** (ex.: João Rangel, jul e ago/2026).

## Dados

**Migration 131** (nova, com `company_id` + FORCE RLS + policy, padrão ≥ 080):

- `demonstrativos_gd` + colunas `origem text not null default 'email'`, `conferido_por uuid`,
  `conferido_em timestamptz`.
- `geracao_mensal_gd` — `company_id`, `lead_id`, `instalacao`, `referencia` (1º dia do mês), `kwh
  numeric(12,2)`, `origem` (`print` | `digitado`), `fonte jsonb` (arquivo, modelo, recorte), `conferido_por`,
  `conferido_em`; único `(company_id, instalacao, referencia)`. A geração da API **não é copiada**: é
  lida da `geracao_diaria` na hora (sem dado velho).
- `modelos_tela_monitoramento` — `company_id`, `nome`, `palavras_chave text[]`, `rotulo_ancora
  text`, `campo text` (`geracao_mes` nesta entrega), `criado_por`, `criado_em`.
- `relatorios_gd_gerados` — `company_id`, `instalacao`, `referencia`, `gerado_por`, `gerado_em`,
  `numeros jsonb` (o que saiu no PDF). Rastreabilidade.
- Tarifa da economia: campo `gd_tarifa_rs_kwh` na configuração da empresa (padrão 0,99).

Precedência da geração do mês: print/digitado conferido; se também houver API, a trava Print × API
precisa passar.

## Unidades de código

| Arquivo | Faz | Depende de |
|---|---|---|
| `src/modules/gd/relatorio-motor.ts` | **Puro.** Demonstrativo + geração + config → `RelatorioGd` (números, frase, 13 meses, créditos, rateio, desempenho, fontes) | nada |
| `src/modules/gd/gd-validacao.ts` | **Puro.** Travas → estado 🟢🟡🔴⚪ + motivos | nada |
| `src/modules/gd/print-leitor.ts` | **Puro.** Palavras do OCR → pares rótulo/número, casamento com modelo | nada |
| `src/modules/gd/relatorio-html.ts` | `RelatorioGd` → HTML A4 (Chart.js) | motor |
| `src/modules/gd/relatorio-pdf.ts` | HTML → PDF via `htmlToPdf`, mede páginas, confere | `proposal/pdf-generator.ts` |
| `src/modules/gd/demonstrativos-repo.ts` (estende `demonstrativo-repo.ts`) | leitura/gravação das tabelas | Supabase |
| `src/modules/dashboard/demonstrativos-views.ts` | telas A, B, C | motor, validação |
| rotas em `router.ts` | GET lista/cliente, POST pdf/print/digitar/confirmar, GET relatório.pdf | — |
| OCR no navegador | `tesseract.js` via CDN jsdelivr, só na tela C | — |

`demonstrativo-ingestao.ts`: passa a comparar com o registro existente e **não avisar** se nada mudou.

## Erros

- PDF ilegível ou fora do layout → mensagem na conferência, nada gravado.
- OCR sem confiança suficiente → "print pouco nítido — mande o print da tela ou digite".
- Falha do Puppeteer → mensagem na tela e log; nunca PDF pela metade.
- Tudo em português simples na tela.

## Testes

- Motor, validação e leitor de print: testes unitários com fixtures (texto do PDF do João Tavares
  já existente; palavras de OCR fixas escritas à mão; nada de dado real de cliente no repositório).
- Travas: cada regra com caso que passa e caso que falha.
- HTML/PDF: gera com dados fixos, confere 2 páginas e rodapé presente.
- Ingestão: mês repetido sem mudança → não avisa; com mudança → avisa.
- Multi-tenant: empresa A não lê dado da empresa B.

## Fatias de entrega

1. **Lista + cliente + PDF manual + digitar + travas** (sem relatório) — valida os dados.
2. **Relatório PDF** (motor + HTML + PDF) — aprovação por print real.
3. **Leitor de prints (OCR assistido + modelos de tela).**
4. Depois (fora deste documento): botão "Enviar no zap" com aprovação; programa Windows do Thiago;
   leitor Light; Coelba para a Jimena.
