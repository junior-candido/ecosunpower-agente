---
tipo: ficha_conhecimento_bateria
fabricante: Unipower (grupo UNICOBA / UCB Power) — marca brasileira
familia: baterias de lítio LiFePO4 (nacional)
modelos: UPLFP48V 100Ah (rack baixa tensão) · U-HOME "Unipower Slim" (all-in-one)
idioma: pt-BR
publico: cliente (linguagem simples)
uso: base de conhecimento da assistente Eva (EcoSunPower)
---

# Baterias Unipower (lítio nacional)

## O que é a Unipower

A **Unipower** é uma marca **brasileira** de baterias, do grupo **UNICOBA / UCB Power**, uma das maiores fabricantes de bateria de lítio do Brasil (fábricas em Manaus e Extrema-MG). Foi uma das primeiras a ter bateria estacionária de lítio **certificada pelo INMETRO** no país.

Por ser nacional, tem duas vantagens que pesam pro cliente: **assistência técnica no Brasil** (sem depender de importação pra garantia) e **bom custo-benefício**.

As baterias usam a química **LiFePO4** (lítio ferro fosfato, ou "LFP") — a mais **segura** do mercado de lítio: aguenta bem calor, não "incha" nem pega fogo com facilidade, e dura muitos anos.

## Para que serve uma bateria

A bateria guarda a energia que o sol gera de dia (ou que sobra da rede) pra você usar de noite ou quando **falta luz**. É o que dá **energia de reserva (backup)** na casa: quando a rua fica sem energia, sua casa continua ligada.

---

## Modelo 1 — Unipower UPLFP48V 100Ah (formato "rack", baixa tensão)

É a bateria de lítio que trabalha junto com um inversor separado. Formato de "gaveta" (rack), instalação interna.

| O que | Valor (datasheet Unipower) |
|---|---|
| Química | LiFePO4 (lítio ferro fosfato) |
| Tensão | 48V (baixa tensão) — 100Ah |
| Energia guardada | **4.800 Wh (4,8 kWh)** — nas lojas costuma aparecer como "5 kWh" |
| Potência de descarga | até ~100A (≈4,8 kW) |
| Vida útil | **6.000 ciclos** a 80% de descarga |
| Eficiência | ~95% |
| Peso | 43 kg |
| Comunicação | RS232 / RS485 / CAN |
| Segurança / proteção | UN38.3 · grau **IP20 (só ambiente interno seco)** |
| **Garantia** | **5 anos** |

> Observação técnica: a tabela de correntes de recarga no datasheet veio com valores desalinhados. A **corrente de recarga recomendada** deve ser **confirmada no datasheet com o Responsável Técnico** antes de dimensionar.

## Modelo 2 — Unipower U-HOME "Slim" (all-in-one: bateria + inversor juntos)

É a solução **tudo-em-um**: inversor e bateria de lítio no **mesmo gabinete**, "plug & play". Menos peças pra instalar, monitoramento pelo Wi-Fi (app ou web) e **backup de energia** já integrado. Ideal para residência e comércio pequeno.

| O que | Valor (datasheet Unipower) |
|---|---|
| Modelos | U-HOME 4,5 kW e U-HOME 5 kW |
| Bateria | **4,8 kWh ou 9,6 kWh** (LiFePO4, 48V) |
| Potência solar de entrada | até 6.000 W (1 rastreador MPPT) |
| Saída | senoidal pura · 50/60 Hz · troca pra backup em **10 ms** |
| Eficiência do inversor | até 92% |
| Peso | 70 kg (4,8 kWh) / 120 kg (9,6 kWh) |
| Proteção | IP20 (interno) · ventilação forçada · comunicação RS485 |

---

## Para quem a Eva indica

- Cliente que quer **energia de reserva** pra não ficar no escuro quando falta luz.
- Quem prefere **marca nacional**, com garantia e suporte aqui no Brasil.
- Quem busca **bom custo-benefício** em lítio seguro (LiFePO4).
- **U-HOME (all-in-one)**: quem quer a solução mais simples de instalar, tudo num equipamento só.
- **UPLFP48V 100Ah (rack)**: quem já tem (ou vai ter) um inversor híbrido e quer só a bateria.

## Como a Eva responde ao cliente

- "É bateria de lítio **nacional** (Unipower), com **garantia de 5 anos** e assistência aqui no Brasil."
- "A química **LiFePO4** é a mais **segura** do mercado — dura muitos anos (até 6.000 ciclos)."
- "Com a bateria, sua casa **não fica sem luz** quando falta energia na rua."
- Se o cliente pedir número exato (kWh, quantas horas de autonomia, corrente): confirmar sempre **no datasheet com o Responsável Técnico** — a Eva **não inventa** valor.
- A Eva **nunca crava preço no chat**: dúvida de valor ou desconto vira **visita técnica**.

> **Nunca** dizer "engenheiro" ou "eletrotécnico" — sempre **Responsável Técnico (CREA/CFT)**.

## Precisa confirmar com o Responsável Técnico (não estava claro no datasheet)

- Linha **"Pulse" 3 kWh/5 kWh**: nome de linha **não confirmado** nos datasheets lidos — as buscas trazem a rack UPLFP48-100 anunciada como "5 kWh". Confirmar o nome comercial oficial.
- Energia útil real da UPLFP48V: datasheet declara **4,8 kWh (C5)**; lojas anunciam "~5 kWh". Usar 4,8 kWh como base e confirmar.
- **Corrente de recarga recomendada** da UPLFP48V (tabela do PDF desalinhada).
- Detalhe de **tensão de saída** do U-HOME (127 V / 220 V) por modelo.
- Compatibilidade da rack Unipower com o inversor híbrido escolhido em cada projeto.

Fontes: datasheets Unipower/UCB (INVERTERS_600486/600487 e DATASHEET_IBT00007) + site oficial [ucbpower.com.br](https://ucbpower.com.br).
