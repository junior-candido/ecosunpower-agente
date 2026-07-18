---
tipo: ficha_tecnica_modulo_fotovoltaico
fabricante: Hanersun Energy Co., Ltd.
linha: Hitouch 6N
serie: HN21N-66H
tecnologia: N-type TOPCon monofacial, backsheet branco
wafer_mm: 210
potencias_stc_w: [685, 690, 695, 700, 705, 710]
versao_datasheet: 2025
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Módulo Hanersun Hitouch 6N — HN21N-66H (685–710 W)

## 1. IDENTIFICAÇÃO

| Campo | Valor |
|---|---|
| Fabricante | Hanersun Energy Co., Ltd. |
| Linha comercial | Hitouch 6N |
| Código de série | HN21N-66H |
| Faixa de potência | 685 W a 710 W (passos de 5 W) |
| Tecnologia de célula | N-type TOPCon monocristalino, MBB (multi-busbar) |
| Tipo construtivo | **MONOFACIAL** — vidro frontal + backsheet branco |
| Nº de células | 132 — arranjo 2 × (11 × 6), meia-célula |
| Wafer | 210 mm |
| Eficiência máxima | 22,9 % |
| Tolerância de potência | 0 a +3 % (somente positiva) |
| Classificação | Tier 1 BloombergNEF |
| Parceiro de garantia | Munich RE (seguradora de garantia) |
| Contato fabricante | sales@hanersun.com — www.hanersun.com |

---

## 2. PARÂMETROS ELÉTRICOS — STC

**STC**: Irradiância 1000 W/m², temperatura de célula 25 °C, AM1.5.

| Parâmetro | Un. | 685 | 690 | 695 | 700 | 705 | 710 |
|---|---|---|---|---|---|---|---|
| Modelo | — | HN21N-66H685W | ...690W | ...695W | ...700W | ...705W | ...710W |
| Pmax | W | 685 | 690 | 695 | 700 | 705 | 710 |
| Vmp | V | 39,80 | 40,00 | 40,20 | 40,40 | 40,60 | 40,80 |
| Imp | A | 17,22 | 17,25 | 17,29 | 17,33 | 17,37 | 17,41 |
| Voc | V | 47,60 | 47,80 | 48,00 | 48,20 | 48,40 | 48,60 |
| Isc | A | 18,22 | 18,26 | 18,30 | 18,34 | 18,38 | 18,42 |
| Eficiência | % | 22,1 | 22,2 | 22,4 | 22,5 | 22,7 | 22,9 |

> Módulo MONOFACIAL — **não há tabela BNPI nem ganho bifacial**. O campo "Bifacility" no datasheet vem preenchido com "/" (não aplicável). Todo o dimensionamento usa exclusivamente os valores STC acima.

## 3. COEFICIENTES DE TEMPERATURA

| Parâmetro | Valor |
|---|---|
| Coef. de temperatura de Pmax | −0,28 %/°C |
| Coef. de temperatura de Voc | −0,23 %/°C |
| Coef. de temperatura de Isc | +0,045 %/°C |
| NMOT / NOCT | **NÃO INFORMADO no datasheet** |

Ausência do NMOT limita o cálculo de temperatura de célula em operação por método de datasheet. Para simulação, adotar NMOT típico de 43–45 °C e registrar a premissa, ou solicitar o dado ao fabricante.

## 4. PARÂMETROS OPERACIONAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de operação | −40 a +85 °C |
| Máxima tensão de sistema | 1500 V DC (IEC) |
| Máxima corrente de fusível de série | **30 A** |
| Bifacialidade | não aplicável (monofacial) |
| Classificação ao fogo | Classe C |
| Anti-PID | declarado com desempenho reforçado |

**NOTA DO FABRICANTE (transcrita do datasheet):** "Do not connect Fuse in Combiner Box with two or more strings in parallel connection" — redação ambígua no original. A interpretação técnica segura é: em qualquer associação com duas ou mais strings em paralelo, a proteção deve ser dimensionada conforme NBR 16690 / IEC 62548, com fusível série ≤ 30 A por string. **Confirmar a intenção junto ao fabricante antes de definir a string box.**

## 5. DADOS MECÂNICOS

| Parâmetro | Valor |
|---|---|
| Dimensões | 2384 × 1303 × 33 mm |
| Área | 3,106 m² |
| Peso | 30,5 kg |
| Carga por área (peso próprio) | ≈ 9,8 kg/m² |
| Vidro frontal | 3,2 mm temperado, low-iron, alta transmissão, revestimento antirreflexo |
| Backsheet | Branco |
| Moldura | Liga de alumínio anodizado |
| Caixa de junção | IP68 |
| Cabos | 4,0 mm² — 300/300 mm (customizável) |
| Conectores | MC4-EVO 2A / Z4S-abcd / outros |
| Carga de vento | 2400 Pa |
| Carga de neve | 5400 Pa |
| Furação | 4× 7×10 mm e 8× 9×14 mm (fixação); 4× R2,1 (aterramento); furos de drenagem |
| Perfil de moldura | Long frame 33 mm / Short frame 33 × 15 mm |

## 6. GARANTIA E DEGRADAÇÃO

| Item | Valor |
|---|---|
| Garantia de produto | 15 anos |
| Garantia de performance linear | 30 anos |
| Potência garantida após 1º ano | 99,0 % |
| Degradação anual média (anos 2–30) | ≤ 0,4 % a.a. |
| Potência garantida no ano 30 | 87,4 % |
| Segurador da garantia | Munich RE |

## 7. CERTIFICAÇÕES

TÜV; CE; cETLus (Intertek); CQC; CEC (Clean Energy Council – Austrália); **INMETRO**; JPEA (Japão); ISO 9001; KIWA; selo Top Performer / Reliability Scorecard 2024.

> **RELEVANTE PARA O BRASIL:** o selo INMETRO aparece explicitamente no datasheet. Mesmo assim, verificar o **número de registro e o modelo exato** na Tabela INMETRO antes da homologação — o registro é por modelo/potência, não por marca.

---

## 8. CÁLCULOS DERIVADOS PARA DIMENSIONAMENTO

### 8.1 Voc corrigido pela temperatura
`Voc(T) = Voc_STC × [1 + β × (T − 25)]`, com β = −0,23 %/°C.

| T célula | Fator | Voc (710 W) | Voc (700 W) | Voc (685 W) |
|---|---|---|---|---|
| −10 °C | 1,0805 | 52,51 V | 52,08 V | 51,43 V |
| 0 °C | 1,0575 | 51,39 V | 50,97 V | 50,34 V |
| 5 °C | 1,0460 | 50,84 V | 50,42 V | 49,79 V |
| 10 °C | 1,0345 | 50,28 V | 49,86 V | 49,24 V |
| 25 °C | 1,0000 | 48,60 V | 48,20 V | 47,60 V |
| 70 °C | 0,8965 | 43,57 V | 43,21 V | 42,67 V |

### 8.2 Máximo de módulos em série (base: 710 W, pior caso)

| Tensão máx. do inversor/sistema | A 0 °C (51,39 V) | A 5 °C (50,84 V) |
|---|---|---|
| 1500 V | 29 módulos | 29 módulos |
| 1100 V | 21 módulos | 21 módulos |
| 1000 V | 19 módulos | 19 módulos |
| 600 V | 11 módulos | 11 módulos |

> Para o DF e entorno (mínimas históricas ≈ 5 a 10 °C), usar a coluna de 5 °C. Sempre validar com série histórica do INMET da localidade (NBR 16690).

### 8.3 Strings em paralelo sem proteção individual
`N ≤ 1 + Ifusível / (1,25 × Isc)` → `1 + 30 / (1,25 × 18,42)` = 2,30 → **máximo 2 strings em paralelo** sem fusível série. A partir de 3 strings, fusível de até 30 A por string (respeitando a nota ambígua do fabricante na seção 4).

### 8.4 Compatibilidade de corrente de MPPT
Imp = 17,41 A; Isc = 18,42 A; Isc de projeto (×1,25) = 23,03 A.
Módulo de **alta corrente e baixa tensão** (característica do wafer de 210 mm). Verificar a corrente máxima de curto-circuito admissível por MPPT do inversor — este é o gargalo típico, não a tensão.

### 8.5 Densidade e área

| Métrica | 710 W | 700 W | 685 W |
|---|---|---|---|
| Potência por m² | 228,6 W/m² | 225,4 W/m² | 220,5 W/m² |
| Área por kWp | 4,375 m² | 4,437 m² | 4,534 m² |
| Módulos p/ 10 kWp | 14 (9,94 kWp) | 14 (9,80 kWp) | 15 (10,28 kWp) |
| Módulos p/ 75 kWp | 106 (75,26 kWp) | 107 (74,90 kWp) | 110 (75,35 kWp) |

## 9. LOGÍSTICA / EMBALAGEM

| Item | Quantidade |
|---|---|
| Módulos por pallet | 33 |
| Módulos por contêiner 40' HC | 594 |

Peso por pallet ≈ 1.007 kg (33 × 30,5 kg, sem embalagem).

---

## 10. COMPARATIVO COM O TCL HSM-ND66-GK700~735

| Item | Hanersun HN21N-66H (710 W) | TCL HSM-ND66 (735 W) |
|---|---|---|
| Construção | Monofacial, backsheet branco | Bifacial vidro-vidro |
| Potência máx. | 710 W | 735 W (812 W BNPI) |
| Eficiência | 22,9 % | 23,7 % |
| Dimensões | 2384 × 1303 × 33 mm | 2384 × 1303 × 33 mm (idênticas) |
| **Peso** | **30,5 kg** | **38,2 kg** |
| Vidro | 3,2 mm frontal | 2,0 + 2,0 mm (dupla face) |
| Voc STC | 48,60 V | 49,80 V |
| Isc STC | 18,42 A | 18,68 A (19,61 A bifacial 10 %) |
| Coef. Voc | −0,23 %/°C | −0,24 %/°C |
| Coef. Pmax | −0,28 %/°C | −0,28 %/°C |
| Fusível série | 30 A | 35 A |
| Temp. operação | −40 a +85 °C | −40 a +70 °C |
| Carga frontal/posterior | 5400 / 2400 Pa | 5400 / 2400 Pa |
| INMETRO no datasheet | Sim (verificar registro) | Não mencionado |
| Área por kWp | 4,375 m² | 4,231 m² |

**Leitura prática:**
- Mesmo footprint, **7,7 kg a menos por módulo** — vantagem decisiva em telhado residencial/fibrocimento e em logística de içamento.
- O TCL entrega ~3,3 % mais kWp na mesma área (só relevante quando a área é o limitante).
- O ganho bifacial do TCL só se materializa com albedo e altura adequados — em telhado colado, os dois se equivalem na prática.
- Hanersun tem o caminho de homologação mais curto no Brasil (INMETRO declarado).

## 11. NOTAS DE APLICAÇÃO E RISCOS DE PROJETO

1. **Monofacial**: não especificar estrutura elevada/albedo esperando ganho traseiro — não existe aqui.
2. **Alta corrente (18,42 A)**: revisar seção de condutores CC, conectores e limites de MPPT. Cabo de fábrica 4,0 mm².
3. **Fusível 30 A** (menor que o TCL): limita mais o arranjo em paralelo.
4. **Nota do fabricante sobre fusíveis** (seção 4) é ambígua no original — não replicar em memorial descritivo sem esclarecimento.
5. **NMOT ausente**: registrar premissa adotada em qualquer simulação de geração (PVsyst / SolarEdge Designer).
6. **Tolerância 0/+3 %**: considerar no fator de oversizing DC/AC.
7. **Classe de fogo C**: verificar exigência da NBR 17193 e do CBMDF para a aplicação.
8. **Peso 30,5 kg e 2384 mm**: ainda exige manuseio por 2 pessoas e verificação de estrutura, embora bem mais leve que os vidro-vidro equivalentes.
