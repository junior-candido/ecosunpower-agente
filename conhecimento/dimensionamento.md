# Dimensionamento Tecnico - Regras e Limites dos Inversores

## REGRA DE OURO: Sobredimensionamento (Oversize) maximo de 50%
O sobredimensionamento e quando a potencia total dos paineis (Wp) e MAIOR
que a potencia nominal do inversor (W). Isso e normal e aceito pelos fabricantes.
LIMITE ECOSUNPOWER: maximo 50% de oversize (fator 1.5x)
Exemplo: inversor de 2000W aceita ate 3000Wp em paineis (2000 x 1.5 = 3000)

Formula: Oversize = (Potencia total paineis Wp) / (Potencia nominal inversor W)
- Oversize 1.0 = sem sobredimensionamento
- Oversize 1.3 = 30% (comum e seguro)
- Oversize 1.5 = 50% (maximo recomendado Ecosunpower)
- Oversize > 1.5 = NAO FAZER! Risco de clippping excessivo e perda de garantia

---

## MICRO INVERSORES - Limites por MPPT

### Hoymiles HMS-800-2T (800W, 2 MPPT)
- Potencia nominal saida: 800W
- Entradas: 2 (2 paineis)
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 14A
- Faixa MPPT: 16-60V
- Max PV recomendado: 800W x 1.5 = **1200Wp total (600Wp por entrada)**
- Modulos compativeis: ate 600W por entrada
- ATENCAO: modulos acima de 600W NAO recomendados neste micro

### Hoymiles HMS-900-2T (900W, 2 MPPT)
- Potencia nominal saida: 900W
- Entradas: 2
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 15A
- Max PV recomendado: 900W x 1.5 = **1350Wp total (675Wp por entrada)**
- Modulos compativeis: ate 670W por entrada

### Hoymiles HMS-1000-2T (1000W, 2 MPPT)
- Potencia nominal saida: 1000W
- Entradas: 2
- Tensao maxima entrada: 65V
- Corrente maxima por entrada: 16A
- Max PV recomendado: 1000W x 1.5 = **1500Wp total (750Wp por entrada)**
- Modulos compativeis: ate 720W por entrada

### Hoymiles HMS-2000-4T (2000W, 4 MPPT)
- Potencia nominal saida: 2000W
- Potencia maxima por entrada: 500W cada (4 entradas)
- Tensao maxima entrada: 65V
- Faixa MPPT: 16-60V
- Corrente maxima por entrada: 16A
- Max PV recomendado: 2000W x 1.5 = **3000Wp total (750Wp por entrada)**
- Modulos compativeis: ate 720W por entrada (dentro do limite)
- Oversize por entrada: modulo 720W / 500W nominal = 1.44x (OK, dentro dos 50%)

### Hoymiles HMS-1800-4T (1800W, 4 MPPT)
- Potencia nominal saida: 1800W
- Max por entrada: 450W nominal
- Max PV recomendado: 1800W x 1.5 = **2700Wp total (675Wp por entrada)**
- Modulos compativeis: ate 670W por entrada

### Hoymiles HMS-1600-4T (1600W, 4 MPPT)
- Potencia nominal saida: 1600W
- Max por entrada: 400W nominal
- Max PV recomendado: 1600W x 1.5 = **2400Wp total (600Wp por entrada)**
- Modulos compativeis: ate 600W por entrada
- ATENCAO: modulos acima de 600W NAO sao recomendados neste micro

### Hoymiles HMS-1875DW-4T (1875VA, 2 MPPT pareados / 4 entradas)
- Potencia nominal saida: 1875 VA — corrente saida: 8.52A em 220V
- Entradas: 4 (2 MPPT com 2 entradas pareadas cada)
- Tensao maxima entrada: 65V
- Faixa MPPT: 16-60V (start 22V)
- Corrente max entrada: 16A por entrada (curto-circuito 20A)
- Modulos compativeis: 400W a 670W+ POR PAR (nao por entrada)
- Max PV recomendado: 1875 x 1.5 = **2812Wp total**
- Eficiencia CEC: 96.5% / MPPT: 99.8%
- Comunicacao: Wi-Fi integrado (S-Miles Cloud)
- IP67 NEMA 6, transformador HF galvanico
- Conformidade: INMETRO 140
- Max 3 unidades por ramo (cabo 10AWG)
- ATENCAO: como entradas sao PAREADAS, os 2 modulos do mesmo MPPT
  precisam ser IGUAIS (mesmo modelo, mesma orientacao, mesma sombra)

### Hoymiles HMS-2250DW-4T (2250VA, 2 MPPT pareados / 4 entradas)
- Potencia nominal saida: 2250 VA — corrente saida: 10.22A em 220V
- Entradas: 4 (2 MPPT com 2 entradas pareadas cada)
- Tensao maxima entrada: 65V
- Faixa MPPT: 16-60V
- Corrente max entrada: 18A por entrada
- Modulos compativeis: 450W a 760W+ POR PAR
- Max PV recomendado: 2250 x 1.5 = **3375Wp total**
- AFCI integrado (protecao arco eletrico)
- Eficiencia CEC: 96.6% / MPPT: 99.8%
- Conformidade: ABNT NBR 16149/16150, INMETRO
- IDEAL para projetos com modulos 700W+ atuais

### Deye SUN-S130/160/180/200/220/225G4-EU-Q0 (familia monofasica 220V, 2 MPPT)
- Familia com 6 potencias: **1300, 1600, 1800, 2000, 2200, 2250 VA**
- 2 MPPT, 2 entradas DC
- Tensao maxima entrada: 65V
- Wi-Fi integrado (cloud Solarman)
- IP67, design slim
- Compatibilidade: requer DRM via DIN VDE V0126-95 (200ms desligamento)
- Eficiencia: ~96.5%
- Garantia padrao: 12 anos (extensao 25 anos disponivel)
- USO IDEAL: alternativa ao Hoymiles 4T quando cliente quer 2 entradas
  apenas (1 modulo grande por entrada, sem pareamento)

### Enphase IQ8P (475VA, 1 MPPT)
- Potencia nominal saida: 475 VA — corrente saida: 2.16A em 220V
- 1 MPPT, 1 entrada (1 modulo por microinversor)
- Tensao maxima entrada: 60V
- Faixa MPPT: 27-45V
- Corrente curto-circuito DC: 14A
- Modulos compativeis: **235-440W (3-leadwire) ou 60/72 celulas**
- ATENCAO: NAO compatativel com modulos 540W+ (entrada limita)
- Eficiencia CEC: 97.5% (a maior dessa lista)
- Conformidade: INMETRO 575
- Sistema requer cabo Engage Q + Envoy Gateway (custo adicional)
- USO IDEAL: telhados com sombreamento severo onde individualidade
  de cada modulo se paga; cliente premium que quer Enphase

### FoxESS Serie Q (Q1-1600/1800/2000/2500, 4 MPPT)
- Familia: Q1-1600, Q1-1800, Q1-2000, Q1-2500 (W de saida)
- 4 MPPT independentes, 4 entradas DC (1 modulo por entrada)
- Tensao maxima entrada: 60V
- Faixa MPPT: 25-55V
- Corrente max entrada: 16A por MPPT
- Modulos compativeis: ate 670W+ por entrada
- Max PV recomendado (1.5x):
  - Q1-1600: 2400Wp
  - Q1-1800: 2700Wp
  - Q1-2000: 3000Wp
  - Q1-2500: 3750Wp
- Eficiencia: 96.8%
- IP67, Wi-Fi via FoxCloud V2.0
- Conformidade: ABNT NBR 16149/16150, INMETRO
- USO IDEAL: cliente quer micro com 4 MPPT INDEPENDENTES (sem
  pareamento) — vantagem sobre Hoymiles em telhados com orientacoes
  diferentes nos 4 modulos

### Sungrow S2500S-L (2500VA, 2 MPPT)
- Potencia nominal saida: 2500 VA — corrente saida: 11.4A em 220V
- 2 MPPT, 2 entradas DC
- Tensao maxima entrada: 60V (Voc), 50V operacional
- Faixa MPPT: 18-43V
- Corrente max entrada: 16.2A por MPPT (curto 19.4A)
- Modulos compativeis: ate 720W por entrada
- Max PV recomendado: 2500 x 1.5 = **3750Wp total (1875Wp por MPPT)**
- Eficiencia max: 98.5% (a melhor dessa categoria)
- Eficiencia MPPT: 99.5%
- IP67, Wi-Fi
- Conformidade: ABNT NBR 16149/16150, IEC 62109
- USO IDEAL: maior potencia em micro hoje no portfolio Ecosunpower
  — cliente que quer micro mas precisa de saida alta sem pulverizar
  em varios equipamentos

### NEP BDM-2000 (2000W, 4 MPPT)
- Potencia nominal saida: 2000W
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 18A
- Faixa MPPT: 35-55V
- Max PV recomendado pelo fabricante: **3000Wp total (750Wp por entrada)**
- Modulos compativeis: ate 720W por entrada

### NEP BDM-2250 (2250VA, 4 MPPT INDEPENDENTES) — DATASHEET CONFIRMADO
- Potencia nominal saida: 2250 VA / corrente saida: 10.23A em 220V
- 4 entradas DC INDEPENDENTES (1 modulo por entrada, sem pareamento)
- Tensao maxima entrada: 60V
- Faixa MPPT: 22-55V (start 24V)
- Corrente maxima por entrada: 18A
- **Max PV recomendado fabricante: 750W x 4 = 3000Wp total**
  (especificacao do datasheet — limite POR entrada eh 750Wp)
- Modulos compativeis: ate 750W por entrada (cobre TODOS modulos atuais
  incluindo Jinko Tiger Neo 735W)
- Eficiencia max: 97.3% / Eficiencia MPPT: >99.5%
- Consumo noturno: 110 mW
- Comunicacao: PLC ou WiFi (modelos variantes)
- Conexao CA: cabo trunco
- Quantidade max por ramal de 32A: 3 unidades
- Faixa temperatura: -40 a +65 C
- Dimensoes: 351 x 275.5 x 39.5 mm / Peso: 6 kg / IP67
- Conector DC: MC4

VANTAGEM NEP vs Hoymiles HMS-1875/2250: 4 MPPT INDEPENDENTES (Hoymiles 4T
pareia entradas em 2 MPPTs). NEP permite 4 modulos diferentes ou
orientacoes diferentes nas 4 entradas.

### NEP BDM-600 (500W, 2 MPPT)
- Potencia nominal saida: 500W
- Max PV recomendado: 500W x 1.5 = **750Wp total (375Wp por entrada)**
- Modulos compativeis: ate 375W por entrada
- ATENCAO: NAO usar modulos acima de 400W neste micro

### Deye SUN-M2000G4 (2000W, 4 MPPT)
- Potencia nominal saida: 2000W
- Tensao maxima entrada: 60V
- Max PV recomendado: 2000W x 1.5 = **3000Wp total (750Wp por entrada)**
- Modulos compativeis: ate 720W por entrada

### Deye SUN-M2250G4 (2250W, 4 MPPT)
- Potencia nominal saida: 2250W
- Max PV recomendado: 2250W x 1.5 = **3375Wp total (843Wp por entrada)**

### Hoymiles HMT-1800-6T (1800W, 6 entradas, TRIFASICO)
- Potencia nominal saida: 1800W
- Entradas: 6 (6 paineis) — 3 MPPT com 2 entradas cada
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 11.5A
- Faixa MPPT: 16-60V
- Max PV recomendado: 1800W x 1.5 = **2700Wp total (450Wp por entrada)**
- ATENCAO: max 450Wp por entrada — nao aceita modulos de 600W+!
- Ideal para modulos menores ou projetos trifasicos pequenos

### Hoymiles HMT-2250-6T (2250W, 6 entradas, TRIFASICO)
- Potencia nominal saida: 2250W
- Entradas: 6 (6 paineis) — 3 MPPT com 2 entradas cada
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 11.5A
- Faixa MPPT: 16-60V
- Eficiencia MPPT: 99.8%
- Max PV recomendado: 2250W x 1.5 = **3375Wp total (562Wp por entrada)**
- Modulos compativeis: ate 560W por entrada
- ATENCAO: modulos acima de 560W NAO recomendados neste HMT!
- Para modulos de 620W+ em trifasico, usar string inversor

---

## INVERSORES STRING - Limites

### Huawei SUN2000-2/3/3.68/4/4.6/5/6KTL-L1 (familia 2-6kW monofasico, High Current Version)

Familia monofasica 220V Brasil/LATAM com 7 modelos. **2 MPPTs, 1 string por MPPT.**
Tensao max entrada: 600V | Faixa MPPT: 90-560V (rated 360V)
Corrente max por MPPT: **13.5A** | Corrente curto-circuito por MPPT: **20A**
Eficiencia max: **98.3%** | Eur weighted: 96.7-97.5%
Compativel com bateria LUNA2000-5/10/15-S0 e otimizadores SUN2000-450W-P2/600W-P
Backup: via SmartGuard ESA SG | Standards: ABNT 16149/16150, INMETRO

| Modelo | Pnom AC | Max AC | Saida A | Max PV fabricante | Max PV Eco (1.5x) |
|--------|---------|--------|---------|-------------------|-------------------|
| SUN2000-2KTL-L1 | 2000W | 2000W | 10.0A | 3,000 Wp | 3,000 Wp |
| SUN2000-3KTL-L1 | 3000W | 3000W | 14.5A | 4,500 Wp | 4,500 Wp |
| SUN2000-3.68KTL-L1 | 3680W | 3680W | 17.0A | 5,520 Wp | 5,520 Wp |
| SUN2000-4KTL-L1 | 4000W | 4000W | 18.0A | 6,000 Wp | 6,000 Wp |
| SUN2000-4.6KTL-L1 | 4600W | 4600W | 21.0A | 6,900 Wp | 6,900 Wp |
| SUN2000-5KTL-L1 | 5000W | 5000W | 23.0A | 7,500 Wp | 7,500 Wp |
| SUN2000-6KTL-L1 | 6000W | 6000W | 27.3A | 9,000 Wp | 9,000 Wp |

NOTA: a "High Current Version" L1 ja vem com max PV recomendado fabricante
no LIMITE de oversize 1.5x — ou seja, ja eh o limite Ecosunpower.

### Huawei SUN2000-7.5K-LC0 (7.5kW monofasico — VERSAO BRASIL)
- Potencia nominal saida: 7500W (single-phase)
- Max apparent power: 7500 VA / corrente max saida: 34.09A em 220V
- Max PV recomendado fabricante: **11,250 Wp** (oversize 1.5x)
- 3 MPPTs, 1 entrada por MPPT
- Tensao maxima entrada: 600V | Startup: 50V | Vmpp: 40-560V
- Corrente max por MPPT: 16A / curto: 22A
- Eficiencia max: 98.1% / Eur weighted: 97.5%
- Bateria: LUNA2000-5/10/15-S0 ou LUNA2000-7/14/21-S1 (350-560V, 25A)
- Carga max: 7,500W / Descarga max: 7,500W
- Backup: SmartGuard ESA SG | Tensao saida: 220V (180-264V), 50/60Hz
- Active Arc Protection (AFCI) | DPS tipo II (CC e CA)
- Comunicacao: WLAN nativa + LED, RS485, Ethernet, Smart Dongle
- Dimensoes: 425 x 500 x 156.5 mm / Peso: 14.5 kg / IP65
- Faixa temp operacao: -25 a +60 C (>45 C aplica derate)
- Otimizadores compativeis: SUN2000-450W-P2, 600W-P
- Standards: ABNT 16149, NBR 16150, IEC 62109-1/-2, Ordinance 140

### Huawei SUN2000-8K-LC0 e SUN2000-10K-LC0 (8 e 10kW monofasicos — VERSAO BRASIL)

Compartilham mesma plataforma (3 MPPTs, mesmas specs DC). Diferenca: potencia AC.

| Spec | 8K-LC0 | 10K-LC0 |
|------|--------|---------|
| Potencia nominal AC | 8000W | 10000W |
| Max apparent power | 8800VA | 10000VA |
| Corrente max saida (220V) | 40.0A | 45.5A |
| Max PV recomendado fabricante | **12,000 Wp** | **15,000 Wp** |
| Carga max bateria | 8000W | 10000W |
| Descarga max bateria | 8800W | 10000W |
| Cooling | Conveccao natural | Smart Air Cooling |
| Peso | 14.5 kg | 15 kg |

Specs comuns 8K/10K-LC0:
- 3 MPPTs, 1 entrada por MPPT
- Tensao maxima entrada: 600V | Vmpp: 40-560V | Startup: 50V
- Corrente max por MPPT: 16A / curto: 22A
- Eficiencia max: 98.1%
- Bateria: LUNA2000-5/10/15-S0 ou LUNA2000-7/14/21-S1
- Tensao saida: 220V (180-264V), 50/60Hz, single-phase
- Backup: SmartGuard ESA SG
- Comunicacao: WLAN + LED, RS485, Ethernet, Smart Dongle
- Dimensoes: 425 x 500 x 156.5 mm / IP65
- Active Arc Protection | DPS II CC e CA
- Standards: ABNT 16149/16150, IEC 62109, Ordinance 140

ATENCAO COMERCIAL: Linha LC0 (Brasil) eh BATTERY-READY de fabrica — cliente
que pretende adicionar bateria depois ja sai com hardware preparado, so
liga LUNA2000 sem trocar inversor.

### Huawei SUN2000-10KTL-M1 (10kW trifasico)
- Potencia nominal: 10000W
- Max PV recomendado fabricante: 15000Wp (oversize 1.5!)
- Max PV Ecosunpower: **15000Wp**
- Tensao maxima entrada: 1100V
- Faixa MPPT: 140-980V
- Corrente max por MPPT: 13.5A
- MPPTs: 2 (2 strings cada)

### Huawei SUN2000-20K-MB0 (20kW trifasico)
- Potencia nominal: 20000W
- Max PV Ecosunpower (1.5x): **30000Wp**
- Tensao maxima entrada: 1100V
- MPPTs: 3

### Sungrow SG5.0RS-L (5kW monofasico)
- Potencia nominal: 5000W
- Max PV recomendado fabricante: 7500Wp (oversize 1.5!)
- Max PV Ecosunpower: **7500Wp**
- Tensao maxima entrada: 600V
- Faixa MPPT: 40-560V
- MPPTs: 2 (1 string cada)

### Sungrow SG10RT (10kW trifasico)
- Potencia nominal: 10000W
- Max PV recomendado fabricante: 15000Wp (oversize 1.5)
- Max PV Ecosunpower: **15000Wp**
- Tensao maxima entrada: 1100V
- Faixa MPPT: 160-1000V
- Corrente max: 37.5A total (25A + 12.5A por MPPT)
- MPPTs: 2

### Solis S6-GR1P2.5K (2.5kW monofasico)
- Potencia nominal: 2500W
- Max PV recomendado fabricante: 3750Wp (oversize 1.5)
- Max PV Ecosunpower: **3750Wp**
- Tensao maxima entrada: 600V
- Faixa MPPT: 50-450V
- Corrente max por string: 16A
- MPPTs: 2 (1 string cada)

### Solis S6-GR1P3K (3kW monofasico)
- Potencia nominal: 3000W
- Max PV recomendado: 4500Wp (oversize 1.5)
- Max PV Ecosunpower: **4500Wp**
- Tensao maxima entrada: 600V
- Faixa MPPT: 50-450V
- MPPTs: 2 (1 string cada)
- Eficiencia: 97.3%

### Solis S6-GR1P5K (5kW monofasico)
- Potencia nominal: 5000W
- Max PV recomendado: 7500Wp (oversize 1.5)
- Max PV Ecosunpower: **7500Wp**
- Tensao maxima entrada: 600V
- Faixa MPPT: 50-450V
- Corrente max por string: 16A
- MPPTs: 2 (1 string cada)
- Eficiencia: 97.7%
- AFCI integrado (protecao arco eletrico)

### Solis S6-GR1P6K (6kW monofasico)
- Potencia nominal: 6000W
- Max PV recomendado: 9000Wp (oversize 1.5)
- Max PV Ecosunpower: **9000Wp**
- Tensao maxima entrada: 600V
- MPPTs: 2 (1 string cada)

### Solis S5-GC15K-LV (15kW trifasico 220V)
- Potencia nominal: 15000W
- Max PV recomendado: 22500Wp (oversize 1.5)
- Max PV Ecosunpower: **22500Wp**
- Tensao maxima entrada: 1100V
- Corrente max por MPPT: 32A
- MPPTs: 3 (2 strings cada)
- Eficiencia: 98.3%

### Solis S5-GC25K-LV (25kW trifasico 220V)
- Potencia nominal: 25000W
- Max PV recomendado: 37500Wp (oversize 1.5)
- Max PV Ecosunpower: **37500Wp**
- Tensao maxima entrada: 1100V
- MPPTs: 4

### Solis S5-GC30K-LV (30kW trifasico 220V)
- Potencia nominal: 30000W
- Max PV entrada: 45000Wp
- Tensao maxima entrada: 1100V
- MPPTs: 4

### Solis S5-GC50K (50kW trifasico 380V)
- Potencia nominal: 50000W
- Max PV entrada: 75000Wp
- Tensao maxima entrada: 1100V
- MPPTs: 5

### Solis S5-GC60K (60kW trifasico 380V)
- Potencia nominal: 60000W
- Max PV entrada: 90000Wp
- Tensao maxima entrada: 1100V
- MPPTs: 6

### Solis S5-GC75K (75kW trifasico 380V - 5G Pro)
- Potencia nominal: 75000W
- Max PV entrada: 112500Wp
- Tensao maxima entrada: 1100V
- MPPTs: 6
- Eficiencia: 98.3%

### SolarEdge SE5000H Home Hub (5kW monofasico)
- Potencia nominal: 5000W
- Max PV oversizing: **200%** pelo fabricante! (ate 10000Wp)
- Max PV Ecosunpower: **7500Wp** (mantemos 50% max)
- Funciona com otimizadores (S440, S500, S650B)
- Cada otimizador conecta 1 modulo
- Eficiencia: 99%

---

## INVERSORES HIBRIDOS - Limites

### Deye SUN-5K-SG01LP1-US (5kW bifasico)
- Potencia nominal: 5000W
- Max PV entrada: **6500Wp** (oversize 1.3 pelo fabricante)
- Tensao max entrada: 500V
- Faixa MPPT: 125-425V
- Corrente max por MPPT: 11A + 11A
- MPPTs: 2 (1 string cada)
- Bateria: 48V, corrente carga ate 120A

### Deye SUN-7.5K-SG05LP2-US (7.5kW Split Phase)
- Potencia nominal: 7500W
- Max PV entrada: **9750Wp** (oversize 1.3)
- Tensao max entrada: 500V
- Faixa MPPT: 125-425V
- Corrente max por MPPT: 22A + 22A
- MPPTs: 2 (2 strings cada)
- Bateria: 48V, corrente carga ate 190A

### Deye SUN-8K-SG01LP1-US (8kW monofasico)
- Potencia nominal: 8000W
- Max PV entrada: **10400Wp** (oversize 1.3)
- Max PV Ecosunpower: **12000Wp** (1.5x)
- Tensao max entrada: 500V
- MPPTs: 2

### Deye SUN-12K-SG04LP3-EU (12kW trifasico)
- Potencia nominal: 12000W
- Max PV entrada: **15600Wp** (oversize 1.3)
- Max PV Ecosunpower: **18000Wp** (1.5x)
- Tensao max entrada: 500V
- MPPTs: 2

---

## REGRA CRITICA: SISTEMA SOLAR NAO E CARGA!

### ENTENDA ISSO ANTES DE DIMENSIONAR:
O sistema fotovoltaico e GERACAO, nao e CARGA!
- CARGA = o que CONSOME energia (ar-condicionado, chuveiro, geladeira, etc.)
- GERACAO = o que PRODUZ energia (paineis + inversor solar)

### O padrao de entrada e dimensionado SOMENTE pela CARGA da edificacao!
- O inversor solar NAO entra no calculo de carga do padrao de entrada
- A corrente do inversor NAO se soma a corrente de carga da casa
- A potencia do sistema solar NAO aumenta a demanda do padrao
- O disjuntor do padrao de entrada protege a CARGA, nao a geracao

### Exemplo do que NAO fazer (ERRADO!):
- Casa com carga de 30A + inversor de 45A = 75A → "precisa trocar padrao" ← ERRADO!
- A corrente do inversor NAO soma com a carga!

### Exemplo CORRETO:
- Casa com carga de 30A e disjuntor de 40A
- Instala inversor solar de 10kW (45A)
- O padrao de entrada continua o mesmo (40A) porque a CARGA nao mudou!
- O inversor nao aumenta a carga — ele GERA energia
- So precisa trocar padrao se a CARGA da casa aumentar (novo ar-condicionado, etc.)

### Quando PRECISA alterar padrao por causa do solar:
- SOMENTE se a potencia do inversor for MAIOR que a potencia disponibilizada
  no padrao (a distribuidora pode limitar a injecao ao padrao existente)
- Ou se a distribuidora exigir no parecer de acesso (raro para micro)
- Em geral: sistema ate 75kW NAO exige mudanca de padrao por causa do solar

### Regra da concessionaria:
- A potencia do sistema de microgeracao deve ser MENOR OU IGUAL a potencia
  disponibilizada (carga instalada / demanda contratada) da unidade consumidora
- Isso NAO significa que soma — significa que o sistema nao pode ser MAIOR
  que o padrao ja existente
- Exemplo: padrao de 40A monofasico 220V = ~8.8kW disponibilizado
  → pode instalar sistema solar de ate 8.8kW sem alterar padrao

---

## COMO DIMENSIONAR UM KIT (passo a passo para a Eva)

### Passo 1: Definir consumo do cliente
- Consumo mensal em kWh (da conta de luz ou calculo NASA)

### Passo 2: Calcular potencia necessaria do sistema
- Potencia kWp = consumo_kwh / (irradiacao x 30 x 0.80)
- Irradiacao media BSB/GO: 5.2 kWh/m2/dia
- Fator de performance: 0.80 (padrao Ecosunpower: considera 20% de perdas totais
  — cabos, inversor, temperatura, sujeira, mismatch, disponibilidade)

### Passo 3: Escolher quantidade de paineis
- Qtd paineis = potencia_kwp x 1000 / potencia_painel_w
- Arredondar para cima

### Passo 4: Escolher inversor
- Potencia total paineis (Wp) deve ser <= potencia inversor x 1.5 (oversize max 50%)
- Verificar se tensao dos modulos em serie nao ultrapassa Vmax do inversor
- Verificar se corrente dos modulos nao ultrapassa Imax do MPPT

### Passo 5: Verificar oversize
- Oversize = potencia_total_paineis / potencia_inversor
- Se > 1.5: reduzir paineis ou aumentar inversor

### Passo 6: Verificar padrao de entrada (IMPORTANTE!)
- A potencia do inversor NAO se soma a carga da casa!
- Verificar: potencia do inversor <= potencia disponibilizada no padrao atual?
  - Padrao monofasico 40A x 220V = ~8.8kW disponivel
  - Padrao monofasico 50A x 220V = ~11kW disponivel
  - Padrao trifasico 40A x 380V = ~26kW disponivel
  - Padrao trifasico 63A x 380V = ~41kW disponivel
- Se o inversor for MENOR que a potencia disponivel: NAO precisa mudar padrao!
- Se o inversor for MAIOR: pode precisar aumentar padrao (mas e raro em residencial)
- Na DUVIDA: o engenheiro Junior verifica na visita tecnica

### Exemplo pratico CORRETO:
Cliente em Brasilia, conta de R$900, consumo ~620 kWh/mes
Padrao atual: monofasico 40A (220V) = ~8.8kW disponivel

1. Potencia: 620 / (5.2 x 30 x 0.80) = 4.97 kWp
2. Com paineis Trina 720W: 4970 / 720 = 6.9 → **7 paineis**
3. Potencia total: 7 x 720W = **5040Wp**
4. Inversor Huawei SUN2000-5KTL-L1 (5kW): oversize = 5040/5000 = 1.008x ✅
5. Padrao: inversor 5kW < 8.8kW disponivel → **NAO precisa mudar padrao!** ✅
6. Alternativa: 2x micro Hoymiles HMS-2000-4T (total 4kW) → tambem NAO precisa mudar

### Exemplo com sistema MAIOR:
Cliente comercial, padrao trifasico 63A (380V) = ~41kW disponivel
Quer sistema de 50kWp

1. Inversor Sungrow SG50CX (50kW)
2. Potencia do inversor (50kW) > disponivel (41kW) → PODE precisar adequar padrao
3. Neste caso, verificar com a distribuidora no parecer de acesso

### ALERTAS para a Eva:
- NUNCA diga que precisa mudar padrao porque "a corrente do inversor + carga ultrapassa o disjuntor"
- O correto e: "O inversor de X kW cabe no seu padrao atual de Y kW? Se sim, nao precisa mudar nada!"
- Se oversize > 1.5: "Vou ajustar o dimensionamento pra ficar dentro do recomendado"
- Se tensao em serie > Vmax: "Preciso ajustar a configuracao das strings"
- SEMPRE: "O engenheiro Junior confirma tudo na visita tecnica — pode ficar tranquilo!"
- NUNCA some corrente do inversor com corrente de carga — sao coisas DIFERENTES!
