# Compatibilidade entre Inversores e Baterias - IMPORTANTE!

## REGRA GERAL
Nem todo inversor funciona com qualquer bateria! Algumas marcas so aceitam
suas proprias baterias (ecossistema fechado) e outras sao mais flexiveis.
O agente DEVE informar isso ao cliente antes de recomendar um sistema.

## Matriz de Compatibilidade

### ECOSSISTEMAS FECHADOS (so usa bateria da propria marca)

#### Huawei (fechado)
- Inversor: SUN2000 L1/M1/MB0
- Bateria: SOMENTE Huawei LUNA2000
- NAO funciona com Pylontech, Dyness, Deye, etc.
- Motivo: protocolo de comunicacao proprietario
- Vantagem: integracao perfeita, melhor monitoramento

#### SolarEdge (fechado para residencial)
- Inversor: Home Hub (monofasico)
- Bateria: SOMENTE SolarEdge Home Battery (BAT-10K1P)
- NAO funciona com outras baterias no modo residencial
- Inversor trifasico comercial: aceita algumas baterias terceiras
- Vantagem: acoplamento CC, eficiencia maxima

#### Sungrow (fechado)
- Inversor: SH-RS e SH-RT (hibridos)
- Bateria: SOMENTE Sungrow SBR
- NAO funciona com Pylontech, Dyness, etc.
- Motivo: barramento de comunicacao exclusivo
- Vantagem: integracao otimizada, melhor custo-beneficio em bateria modular

#### FoxESS (fechado)
- Inversor: H1, H3, H3-PRO (hibridos)
- Bateria: SOMENTE FoxESS ECS ou MIRA ou HV 2600
- NAO funciona com Pylontech, Dyness, Deye, etc.
- Vantagem: certificacao UL 9540, seguranca maxima

### ECOSSISTEMAS ABERTOS (aceita varias marcas de bateria)

#### Deye (ABERTO - mais flexivel do mercado!)
- Inversor: SUN-5K a SUN-12K (hibridos 48V)
- Baterias compativeis:
  - Deye RW-M5.12 / RW-M10.24
  - Pylontech US3000C / US5000
  - Dyness B4850 / B51100 / BX51100
  - Unipower UPLFP48
  - Freedom Lite
  - VTAC
  - Felicity Solar
  - Pylon HV (com adaptador)
- Motivo: protocolo aberto 48V compativel com diversas marcas
- Vantagem: LIBERDADE de escolher bateria pelo melhor preco

#### Solis (ABERTO - boa flexibilidade)
- Inversor: RHI series (hibridos 48V)
- Baterias compativeis:
  - Pylontech US3000C / US5000
  - Dyness B4850 / B51100
  - VTAC
  - Puredrive
  - Outras baterias 48V com protocolo CAN/RS485
- Inversor S6-EH (alta tensao): compativel com baterias HV especificas

## TABELA RESUMO RAPIDA

| Inversor | Bateria propria | Aceita terceiros? | Baterias compativeis |
|---|---|---|---|
| Huawei SUN2000 | LUNA2000 | NAO | Somente LUNA2000 |
| SolarEdge Home Hub | Home Battery | NAO (resid.) | Somente SolarEdge |
| Sungrow SH | SBR | NAO | Somente SBR |
| FoxESS H1/H3 | ECS | NAO | Somente ECS/MIRA |
| Deye Hibrido | RW-M | SIM! | Pylontech, Dyness, Unipower, etc. |
| Solis RHI | - | SIM! | Pylontech, Dyness, VTAC, etc. |

## COMO O AGENTE DEVE USAR ESTA INFORMACAO

### Cenario 1: Cliente quer inversor Huawei + bateria Pylontech
RESPOSTA: "Boa pergunta! O inversor Huawei so funciona com a bateria LUNA2000 da propria Huawei.
Se voce quer usar Pylontech, a melhor opcao e o inversor Deye ou Solis, que sao compativeis!"

### Cenario 2: Cliente quer o melhor custo em bateria
RESPOSTA: "Se o foco e custo-beneficio em bateria, recomendo o inversor Deye — ele aceita
varias marcas de bateria, entao voce pode escolher a mais em conta, como Dyness ou Pylontech!"

### Cenario 3: Cliente quer tudo da mesma marca (simplicidade)
RESPOSTA: "Se prefere um sistema todo integrado, Huawei + LUNA2000 ou Sungrow + SBR
sao otimas opcoes. Tudo da mesma marca, monitoramento unificado, garantia unica."

### Cenario 4: Cliente ja tem inversor e quer adicionar bateria
VERIFICAR: qual inversor ele tem? Se for Huawei, so LUNA2000. Se for Deye, tem opcoes.
Se for string on-grid (sem ser hibrido), NAO da pra adicionar bateria diretamente —
precisa de um inversor hibrido ou AC-coupled.

## ATENCAO: Inversor on-grid NAO aceita bateria!
Inversores string comuns (on-grid) como Huawei SUN2000-M1, Sungrow SG, Solis S6-GR, etc.
NAO possuem entrada para bateria. Para adicionar armazenamento, as opcoes sao:
1. Trocar por um inversor HIBRIDO (mais eficiente)
2. Adicionar um inversor de bateria separado (AC-coupled — mais caro)
