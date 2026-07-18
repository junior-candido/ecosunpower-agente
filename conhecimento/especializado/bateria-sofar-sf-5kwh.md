---
tipo: ficha_tecnica_bateria
fabricante: SOFAR (SOFARSOLAR Co., Ltd.)
modelo: SF-5KWH-L1
quimica: LFP (LiFePO4)
classe: baixa tensão (51,2 V), formato rack 19"
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Bateria SOFAR SF-5KWH-L1 (5,12 kWh, baixa tensão)

## 1. IDENTIFICAÇÃO E ENERGIA

| Campo | Valor |
|---|---|
| Fabricante | SOFARSOLAR Co., Ltd. |
| Modelo | SF-5KWH-L1 |
| Química | LFP (LiFePO4) |
| **Energia total** | **5.120 Wh (5,12 kWh)** |
| Energia utilizável | **NÃO DECLARADA no datasheet** |
| BMS | Integrado, proteção da célula ao módulo |
| Versão do datasheet | V2.0.0 — 20250805 |

> ⚠ **LACUNA DOCUMENTAL**: o datasheet informa apenas a energia total (5.120 Wh), sem declarar a energia utilizável nem o DOD. As concorrentes GoodWe declaram 5,0 kWh úteis sobre 5,12 kWh nominais. Para comparação justa, **assumir ~5,0 kWh e registrar como premissa**, ou solicitar o dado ao fabricante.

## 2. PARÂMETROS ELÉTRICOS

| Parâmetro | Valor |
|---|---|
| Tensão nominal | 51,2 V |
| Faixa de tensão operacional | 44,8 ~ 57,6 V |
| **Potência nominal de carga / descarga** | **2.560 W / 2.560 W** |
| **Corrente nominal de carga / descarga** | **50 A / 50 A** |
| **Corrente máxima de carga / descarga** | **50 A / 100 A** |
| Máximo em paralelo | **16 unidades (≈ 81 kWh)** |
| Comunicação | CAN |

> **Ponto crítico: a corrente de carga é limitada a 50 A (≈ 2,56 kW), sem margem** — o valor nominal e o máximo são iguais. As GoodWe carregam a 90 A (~4,6 kW). Isso praticamente **dobra o tempo de recarga** por unidade.

## 3. CONDIÇÕES AMBIENTAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de carga | 0 °C a +55 °C |
| Temperatura de descarga | −20 °C a +60 °C |
| Umidade | 5 ~ 95 % |
| Altitude máxima | 4.000 m |
| Resfriamento | Natural |

## 4. MECÂNICA E INSTALAÇÃO

| Parâmetro | Valor |
|---|---|
| Peso | **45 kg** |
| Dimensões (L × A × P) | 442 × 132 × 590 mm |
| **Grau de proteção** | **IP20 — SOMENTE AMBIENTE INTERNO PROTEGIDO** |
| Métodos de instalação | Parede, piso, rack 19" (gabinete com **profundidade ≥ 600 mm**) |
| Formato | Rack 19", 3U |

## 5. LACUNAS DO DATASHEET

Itens que as concorrentes declaram e este documento **não traz**:

| Item ausente | Impacto |
|---|---|
| Energia utilizável / DOD | Impede o cálculo direto de autonomia |
| **Número de ciclos / vida útil** | Impede o cálculo de LCOE e de payback do armazenamento |
| Eficiência de carga/descarga | Impede o cálculo preciso de perdas |
| Normas de segurança (IEC 62619, IEC 63056, VDE) | Risco de não atender exigência de projeto |
| Transporte (UN 38.3) | Necessário para logística de lítio |
| Corrente de pulso | Impede avaliar partida de motores |
| Compatibilidade com inversores | Não há lista declarada |

**Conclusão documental**: é o datasheet mais pobre do grupo comparado. Antes de especificar, exigir do fornecedor: energia utilizável, número de ciclos, certificados de segurança e lista de inversores compatíveis.

---

## 6. DIMENSIONAMENTO — REGRAS DERIVADAS

### 6.1 Banco por número de unidades (assumindo 5,0 kWh úteis)

| Unidades | Energia | Pot. máx. de descarga | Peso total |
|---|---|---|---|
| 1 | ~5 kWh | ~5,1 kW (100 A) | 45 kg |
| 2 | ~10 kWh | ~10,2 kW | 90 kg |
| 4 | ~20 kWh | ~20,5 kW | 180 kg |
| 16 (máx.) | ~81 kWh | — | 720 kg |

### 6.2 Tempo de carga (uma unidade)

| Corrente | Potência | Tempo (0→100 %) |
|---|---|---|
| 50 A (nominal = máxima) | ~2,56 kW | **~2,0 h** |

Comparação: GoodWe Lynx U/A a 90 A → ~1,1 h. **A SOFAR leva quase o dobro do tempo.**

### 6.3 Autonomia estimada (~5 kWh úteis)

| Carga contínua | Autonomia aproximada |
|---|---|
| 500 W | ~9,6 h |
| 1.000 W | ~4,8 h |
| 2.000 W | ~2,4 h |
| 5.100 W (máximo) | ~1,0 h |

## 7. NOTAS DE APLICAÇÃO

1. **IP20**: ambiente interno seco e protegido apenas. Não vai em área externa nem em área de serviço aberta.
2. **Carga limitada a 50 A**: em sistema com geração solar forte e janela de sol curta, a bateria pode não absorver todo o excedente. Em banco com várias unidades o problema se dilui (a corrente se divide), mas em instalação de 1 unidade é limitação real.
3. **Descarga de 100 A / ~5,1 kW**: adequada para backup residencial; abaixo dos 150 A da GoodWe Lynx A.
4. **Rack 19" com profundidade ≥ 600 mm**: o gabinete precisa dessa profundidade (o produto tem 590 mm). Gabinetes de telecom rasos não servem.
5. **45 kg** por unidade: fixação em parede exige verificação estrutural.
6. **Sem dado de ciclos**: não é possível calcular custo por kWh ciclado nem comparar LCOE com a concorrência. **Exigir o dado antes da compra** — é o item que mais pesa na análise econômica de armazenamento.
7. **Sem normas de segurança declaradas**: verificar certificação antes de aplicar em projeto que exija conformidade (comercial, condomínio, exigência de seguradora ou do corpo de bombeiros).
