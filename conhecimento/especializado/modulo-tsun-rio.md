---
tipo: ficha_tecnica_modulo_fotovoltaico
fabricante: TSUN (Tsunrio / TSUN Power)
serie: RIOxxxW-144BIF-2278
tecnologia: N-type bifacial, vidro-vidro, moldura de poliuretano
potencias_stc_w: [580, 585, 590, 595, 600]
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Módulo TSUN — RIOxxxW-144BIF-2278 (580–600 W)

## 1. IDENTIFICAÇÃO

| Campo | Valor |
|---|---|
| Fabricante | TSUN Power (www.tsunrio.com) |
| Código de série | RIO580W a RIO600W-144BIF-2278 |
| Faixa de potência | 580 W a 600 W (passos de 5 W) |
| Tecnologia de célula | N-type monocristalino, SMBB, Hot 2.0 (baixo LID/LETID) |
| Tipo construtivo | **Bifacial vidro-vidro** (2,0 + 2,0 mm) |
| Nº de células | 144 (6 × 24) |
| Eficiência máxima | 23,2 % |
| Tolerância de potência | 0 a +3 % |
| Anti-PID | declarado |

---

## 2. PARÂMETROS ELÉTRICOS — STC e NOCT

**STC**: 1000 W/m², célula 25 °C, AM 1,5 — **NOCT**: 800 W/m², ambiente 20 °C, AM 1,5, vento 1 m/s.

| Modelo | Cond. | Pmax | Vmp | Imp | Voc | Isc | Efic. STC |
|---|---|---|---|---|---|---|---|
| RIO580W | STC | 580 Wp | 43,88 V | 13,22 A | 52,50 V | 13,95 A | 22,5 % |
| RIO580W | NOCT | 437 Wp | 40,89 V | 10,69 A | 49,87 V | 11,26 A | — |
| RIO585W | STC | 585 Wp | 44,02 V | 13,29 A | 52,70 V | 14,01 A | 22,7 % |
| RIO585W | NOCT | 441 Wp | 41,05 V | 10,74 A | 50,06 V | 11,31 A | — |
| RIO590W | STC | 590 Wp | 44,17 V | 13,36 A | 52,90 V | 14,07 A | 22,8 % |
| RIO590W | NOCT | 445 Wp | 41,21 V | 10,79 A | 50,25 V | 11,36 A | — |
| RIO595W | STC | 595 Wp | 44,31 V | 13,43 A | 53,10 V | 14,13 A | 23,0 % |
| RIO595W | NOCT | 448 Wp | 41,40 V | 10,84 A | 50,44 V | 11,41 A | — |
| RIO600W | STC | 600 Wp | 44,45 V | 13,50 A | 53,30 V | 14,19 A | 23,2 % |
| RIO600W | NOCT | 452 Wp | 41,50 V | 10,89 A | 50,63 V | 11,46 A | — |

> **Único dos quatro módulos comparados que publica a tabela NOCT completa** — permite simulação térmica sem premissas inventadas. Em contrapartida, **NÃO publica tabela BNPI**, apenas o fator bifacial.

## 3. FATOR BIFACIAL

| Grandeza | Valor |
|---|---|
| Fator bifacial de referência | 80 % ± 5 % |
| Tabela BNPI | **NÃO FORNECIDA** |

Estimativa de trabalho: com irradiância traseira de 135 W/m² e bifacialidade de 80 %, o ganho fica em torno de +10 % (≈ 660 W para o 600 W). **É estimativa derivada, não dado de fabricante** — sinalizar como tal em qualquer memorial.

## 4. COEFICIENTES DE TEMPERATURA

| Parâmetro | Valor |
|---|---|
| Coef. de temperatura de Pmax | −0,29 %/°C |
| Coef. de temperatura de Voc | −0,25 %/°C |
| Coef. de temperatura de Isc | +0,045 %/°C |
| **NOCT** | **45 ± 2 °C** |

## 5. PARÂMETROS OPERACIONAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de operação | −40 a +85 °C |
| Máxima tensão do sistema | 1500 V DC (IEC) |
| Máxima corrente de fusível de série | 30 A |
| Tolerância de potência | 0 a +3 % |
| Carga de vento | 2400 Pa |
| Carga de neve | 5400 Pa |

## 6. DADOS MECÂNICOS

| Parâmetro | Valor |
|---|---|
| Dimensões | 2278 × 1134 × 30 mm |
| Área | 2,583 m² |
| Peso | 32 kg |
| Carga por área (peso próprio) | ≈ 12,4 kg/m² |
| Vidro frontal | 2,0 mm com revestimento antirreflexo |
| Vidro posterior | 2,0 mm temperado térmico |
| **Moldura** | **Poliuretano (Polyurethane Frame)** — não metálica |
| Caixa de junção | IP68 |
| Cabos | TÜV 1 × 4,0 mm² — (+) 400 mm / (−) 200 mm (customizável) |
| Tolerâncias dimensionais | comprimento ±2 mm, largura ±2 mm, altura ±1 mm |

## 7. GARANTIA E DEGRADAÇÃO

| Item | Valor |
|---|---|
| Garantia de produto | **12 anos** |
| Garantia de performance linear | 30 anos |
| Potência garantida após 1º ano | 99 % |
| Degradação anual (30 anos) | 0,40 % |
| Potência garantida no ano 30 | 87,4 % |

> **Menor garantia de produto do grupo comparado** (12 anos, contra 15 dos outros três). Impacta o risco pós-venda e deve ser precificado ou declarado na proposta.

## 8. CERTIFICAÇÕES

IEC 61215 (2016); IEC 61730 (2016); ISO 9001:2015; ISO 14001:2015; ISO 45001:2018; CE; TÜV Rheinland; PV CYCLE; Clean Energy Council (membro); Positive Quality.

> **SEM INMETRO no datasheet.** Verificação obrigatória do registro na Tabela INMETRO antes de qualquer projeto de homologação no Brasil.

---

## 9. CÁLCULOS DERIVADOS PARA DIMENSIONAMENTO (base 600 W)

### 9.1 Voc corrigido pela temperatura
`Voc(T) = Voc_STC × [1 + β × (T − 25)]`, β = −0,25 %/°C.

| T célula | Fator | Voc (600 W) | Voc (580 W) |
|---|---|---|---|
| −10 °C | 1,0875 | 57,96 V | 57,09 V |
| 0 °C | 1,0625 | 56,63 V | 55,78 V |
| 5 °C | 1,0500 | 55,97 V | 55,13 V |
| 10 °C | 1,0375 | 55,30 V | 54,47 V |
| 25 °C | 1,0000 | 53,30 V | 52,50 V |
| 70 °C | 0,8875 | 47,30 V | 46,59 V |

### 9.2 Máximo de módulos em série (base 600 W)

| Tensão máx. | A 0 °C (56,63 V) | A 5 °C (55,97 V) |
|---|---|---|
| 1500 V | 26 | 26 |
| 1100 V | 19 | 19 |
| 1000 V | 17 | 17 |
| 600 V | 10 | 10 |

**Voc mais alto do grupo (53,30 V)** → strings mais curtas para a mesma classe de tensão. Consequência direta: em inversor de 1000 V o limite é 17 módulos, contra 18–19 dos concorrentes.

### 9.3 Strings em paralelo sem proteção individual
Com Isc STC 14,19 A: `1 + 30 / (1,25 × 14,19)` = 2,69 → **2 strings**.
Com Isc bifacial estimado (≈ 15,6 A): 2,54 → **2 strings**. Conclusão estável.

### 9.4 Corrente de projeto
Isc STC 14,19 A → Isc de projeto (×1,25) = **17,7 A**.
**Menor corrente do grupo comparado.** Excelente compatibilidade com MPPTs de 16–20 A e com condutores de menor seção; menor perda ôhmica no lado CC.

### 9.5 Densidade e área

| Métrica | 600 W | 580 W |
|---|---|---|
| Potência por m² | 232,3 W/m² | 224,5 W/m² |
| Área por kWp | 4,306 m² | 4,454 m² |
| Módulos p/ 10 kWp | 17 (10,20 kWp) | 18 (10,44 kWp) |
| Módulos p/ 75 kWp | 125 (75,00 kWp) | 130 (75,40 kWp) |

## 10. LOGÍSTICA / EMBALAGEM

| Item | Valor |
|---|---|
| Módulos por palete | 37 |
| Módulos por stack (2 paletes) | 74 |
| Módulos por contêiner 40' HQ | 740 |

## 11. NOTAS DE APLICAÇÃO E RISCOS DE PROJETO

1. **MOLDURA DE POLIURETANO (não metálica)**: mesmas ressalvas do Ronma — compatibilidade de grampos, torque de aperto, aterramento por furos dedicados (não por moldura), e aceitação em inspeção. Consultar o manual de instalação antes de fechar a estrutura.
2. **Voc alto (53,30 V)**: encurta strings. Recalcular o arranjo ao substituir este módulo por outro (ou vice-versa) — não é troca direta.
3. **Corrente baixa (14,19 A)**: vantagem real em cabeamento CC e em MPPTs limitados.
4. **Garantia de produto de 12 anos**: o mais fraco do grupo. Declarar na proposta.
5. **Sem tabela BNPI**: qualquer ganho bifacial usado em simulação é estimativa própria — identificar como premissa.
6. **Sem INMETRO no datasheet**: risco direto de homologação no Brasil. Resolver ANTES da compra.
7. **Módulo mais curto do grupo (2278 mm)**: pode ser vantagem em telhado com limitação de comprimento de água.
8. **NOCT 45 ± 2 °C** publicado — usar diretamente na simulação, sem premissa arbitrária.
