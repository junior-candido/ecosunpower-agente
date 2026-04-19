# Referencia de Dimensionamento e Estimativas

## Modulos disponiveis para calculo
- RASE Energy: 700W
- Trina Solar: 715W e 720W
- JA Solar: 620W e 625W
- Longi: 635W BPC e 640W

Para calculos estimados, usar media de 670W por painel (mix de modulos).
Em projetos reais, o engenheiro define o modulo ideal para cada caso.

## Tabela de referencia por consumo mensal (residencial - regiao Brasilia/Goias)

| Conta mensal | Consumo estimado | Qtd paineis (~670W) | Potencia do sistema | Economia mensal |
|---|---|---|---|---|
| R$ 300-500 | 200-350 kWh | 3-5 paineis | 2.0 - 3.4 kWp | R$ 270 - 460 |
| R$ 500-800 | 350-550 kWh | 5-8 paineis | 3.4 - 5.4 kWp | R$ 460 - 740 |
| R$ 800-1.200 | 550-850 kWh | 8-12 paineis | 5.4 - 8.0 kWp | R$ 740 - 1.100 |
| R$ 1.200-2.000 | 850-1.400 kWh | 12-19 paineis | 8.0 - 12.7 kWp | R$ 1.100 - 1.860 |
| R$ 2.000+ | 1.400+ kWh | 19+ paineis | 12.7+ kWp | R$ 1.860+ |

## Como calcular (formulas para a Eva usar)
- Irradiacao media em Brasilia/Goias: 5.2 kWh/m2/dia (uma das melhores do Brasil!)
- Geracao media por painel de 670W: ~85 kWh/mes
- Quantidade de paineis = consumo_mensal_kwh / 85
- Potencia do sistema = quantidade_paineis x 0.670 kWp
- Economia = valor_conta x 0.93 (desconta taxa minima ~7%)
- Taxa minima residencial: ~R$ 50-80/mes (custo de disponibilidade)
- Taxa minima comercial: ~R$ 100-150/mes

## Payback estimado
- Residencial: 3 a 5 anos
- Comercial: 2 a 4 anos
- Agronegocio: 2 a 4 anos
- Vida util do sistema: 25+ anos (paineis) / 10-15 anos (inversores)

## Exemplo pratico de calculo
Cliente com conta de R$ 900/mes em Brasilia:
- Consumo estimado: ~620 kWh/mes
- Paineis necessarios: 620 / 85 = ~8 paineis
- Potencia: 8 x 0.670 = ~5.4 kWp
- Economia mensal: R$ 900 x 0.93 = ~R$ 837
- Payback: aproximadamente 3.5 a 4 anos
- Economia em 25 anos: R$ 837 x 12 x 25 = ~R$ 251.000!

## Observacao importante
Estes sao valores ESTIMADOS para dar uma ideia ao cliente. O dimensionamento
exato e feito pelo engenheiro Junior apos analise tecnica considerando:
- Orientacao e inclinacao do telhado
- Sombreamento
- Tipo de estrutura
- Padrao de consumo real (analisar 12 meses de conta)
- Escolha do modulo ideal para o espaco disponivel
