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

### NEP BDM-2000 (2000W, 4 MPPT)
- Potencia nominal saida: 2000W
- Tensao maxima entrada: 60V
- Corrente maxima por entrada: 18A
- Faixa MPPT: 35-55V
- Max PV recomendado pelo fabricante: **3000Wp total (750Wp por entrada)**
- Modulos compativeis: ate 720W por entrada

### NEP BDM-2250 (2250W, 4 MPPT)
- Potencia nominal saida: 2250W
- Tensao maxima entrada: 60V
- Max PV recomendado: 2250W x 1.5 = **3375Wp total (843Wp por entrada)**
- Modulos compativeis: todos os modulos atuais (ate 720W)

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

### Huawei SUN2000-5KTL-L1 (5kW monofasico)
- Potencia nominal: 5000W
- Max PV recomendado fabricante: 5520Wp (oversize 1.1)
- Max PV Ecosunpower (1.5x): **7500Wp**
- Tensao maxima entrada: 600V
- Faixa MPPT: 90-560V
- Corrente max por MPPT: 12.5A
- MPPTs: 2 (1 string cada)
- Strings: calcular tensao dos modulos em serie (nao ultrapassar 600V)

### Huawei SUN2000-6KTL-L1 (6kW monofasico)
- Potencia nominal: 6000W
- Max PV recomendado fabricante: 6600Wp
- Max PV Ecosunpower (1.5x): **9000Wp**
- Mesmas specs de tensao/corrente do 5KTL

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

## COMO DIMENSIONAR UM KIT (passo a passo para a Eva)

### Passo 1: Definir consumo do cliente
- Consumo mensal em kWh (da conta de luz ou calculo NASA)

### Passo 2: Calcular potencia necessaria
- Potencia kWp = consumo_kwh / (irradiacao x 30 x 0.82)
- Irradiacao media BSB/GO: 5.2 kWh/m2/dia
- Fator de performance: 0.82

### Passo 3: Escolher quantidade de paineis
- Qtd paineis = potencia_kwp x 1000 / potencia_painel_w
- Arredondar para cima

### Passo 4: Escolher inversor
- Potencia total paineis (Wp) deve ser <= potencia inversor x 1.5
- Verificar se tensao dos modulos em serie nao ultrapassa Vmax do inversor
- Verificar se corrente dos modulos nao ultrapassa Imax do MPPT

### Passo 5: Verificar oversize
- Oversize = potencia_total_paineis / potencia_inversor
- Se > 1.5: reduzir paineis ou aumentar inversor

### Exemplo pratico:
Cliente em Brasilia, conta de R$900, consumo ~620 kWh/mes
1. Potencia: 620 / (5.2 x 30 x 0.82) = 4.85 kWp
2. Com paineis Trina 720W: 4850 / 720 = 6.7 → **7 paineis**
3. Potencia total: 7 x 720W = **5040Wp**
4. Inversor Huawei SUN2000-5KTL-L1 (5000W): oversize = 5040/5000 = **1.008x** (perfeito!)
5. Ou 2x micro Hoymiles HMS-2000-4T: cada um com 3-4 paineis (1440-2160Wp por micro, dentro do limite)

### ALERTAS para a Eva:
- Se oversize > 1.5: "Esse dimensionamento ficaria com sobredimensionamento acima do recomendado. Vou ajustar!"
- Se tensao em serie > Vmax: "Precisamos ajustar a quantidade de paineis em serie pra ficar dentro do limite do inversor"
- Se corrente > Imax MPPT: "A corrente do modulo excede o limite do MPPT. Vou recomendar outro inversor"
- SEMPRE diga que o dimensionamento EXATO e feito pelo engenheiro Junior na visita tecnica
