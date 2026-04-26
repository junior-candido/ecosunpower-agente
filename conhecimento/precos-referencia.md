# Referência de Dimensionamento e Estimativas

## Módulos disponíveis para cálculo
- RASE Energy: 700W
- Trina Solar: 715W e 720W
- JA Solar: 620W e 625W
- Longi: 635W BPC e 640W

Para cálculos estimados, usar média de 670W por painel (mix de módulos).
Em projetos reais, o engenheiro define o módulo ideal para cada caso.

## Tabela de referência por consumo mensal (residencial - região Brasília/Goiás)

| Conta mensal | Consumo estimado | Qtd painéis (~670W) | Potência do sistema | Economia mensal |
|---|---|---|---|---|
| R$ 300-500 | 200-350 kWh | 3-5 painéis | 2.0 - 3.4 kWp | R$ 270 - 460 |
| R$ 500-800 | 350-550 kWh | 5-8 painéis | 3.4 - 5.4 kWp | R$ 460 - 740 |
| R$ 800-1.200 | 550-850 kWh | 8-12 painéis | 5.4 - 8.0 kWp | R$ 740 - 1.100 |
| R$ 1.200-2.000 | 850-1.400 kWh | 12-19 painéis | 8.0 - 12.7 kWp | R$ 1.100 - 1.860 |
| R$ 2.000+ | 1.400+ kWh | 19+ painéis | 12.7+ kWp | R$ 1.860+ |

## Como calcular (fórmulas para a Eva usar)
- Irradiação média em Brasília/Goiás: 5.2 kWh/m²/dia (uma das melhores do Brasil!)
- Geração média por painel de 670W: ~85 kWh/mês
- Quantidade de painéis = consumo_mensal_kwh / 85
- Potência do sistema = quantidade_paineis x 0.670 kWp
- Economia = valor_conta x 0.93 (desconta taxa mínima ~7%)
- Taxa mínima residencial: ~R$ 50-80/mês (custo de disponibilidade)
- Taxa mínima comercial: ~R$ 100-150/mês

## Payback estimado
- Residencial: 3 a 5 anos
- Comercial: 2 a 4 anos
- Agronegócio: 2 a 4 anos
- Vida útil do sistema: 25+ anos (painéis) / 10-15 anos (inversores)

## Exemplo prático de cálculo
Cliente com conta de R$ 900/mês em Brasília:
- Consumo estimado: ~620 kWh/mês
- Painéis necessários: 620 / 85 = ~8 painéis
- Potência: 8 x 0.670 = ~5.4 kWp
- Economia mensal: R$ 900 x 0.93 = ~R$ 837
- Payback: aproximadamente 3.5 a 4 anos
- Economia em 25 anos: R$ 837 x 12 x 25 = ~R$ 251.000!

## Observação importante
Estes são valores ESTIMADOS para dar uma ideia ao cliente. O dimensionamento
exato é feito pelo engenheiro Junior após análise técnica considerando:
- Orientação e inclinação do telhado
- Sombreamento
- Tipo de estrutura
- Padrão de consumo real (analisar 12 meses de conta)
- Escolha do módulo ideal para o espaço disponível
