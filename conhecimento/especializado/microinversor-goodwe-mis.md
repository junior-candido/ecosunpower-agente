---
tipo: ficha_tecnica_microinversor
fabricante: GoodWe
linha: MIS Series
modelos: [GW1600-MIS, GW1800-MIS, GW2000-MIS]
topologia: microinversor 4-em-1, monofásico, isolado galvanicamente (transformador HF)
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Microinversores GoodWe MIS Series (1,6 – 2,0 kW)

## 1. IDENTIFICAÇÃO

| Campo | Valor |
|---|---|
| Fabricante | GoodWe |
| Linha | MIS Series |
| Modelos | GW1600-MIS / GW1800-MIS / GW2000-MIS |
| Arquitetura | **4 em 1** — 4 módulos por microinversor, 4 MPPTs independentes |
| Fases | Monofásico (1 / N / PE) |
| Topologia | **Isolado galvanicamente** (transformador de alta frequência) |
| MPPT | Nível de módulo (module-level) |
| Versão do datasheet | GoodWe-Single page-20240112-EN-V2.1 |

## 2. ENTRADA CC

| Parâmetro | GW1600-MIS | GW1800-MIS | GW2000-MIS |
|---|---|---|---|
| Potência de módulo usual | 320 a 535+ W | 360 a 600+ W | 400 a 670+ W |
| Tensão máxima de entrada | 65 V | 65 V | 65 V |
| Faixa de operação MPPT | 16 ~ 60 V | 16 ~ 60 V | 16 ~ 60 V |
| Tensão de partida | 22 V | 22 V | 22 V |
| **Corrente máxima de entrada** | **4 × 16 A** | 4 × 16 A | 4 × 16 A |
| Corrente máxima de curto | 4 × 25 A | 4 × 25 A | 4 × 25 A |
| Nº de MPPTs | 4 | 4 | 4 |
| Entradas por MPPT | 1 | 1 | 1 |
| Conector CC | Staubli MC4 | | |

## 3. SAÍDA CA

| Parâmetro | GW1600-MIS | GW1800-MIS | GW2000-MIS |
|---|---|---|---|
| Potência contínua máxima | 1.600 VA | 1.800 VA | 2.000 VA |
| Tensão nominal | 220 / 230 / 240 V | | |
| Faixa de tensão de saída | 180 ~ 275 V | | |
| Frequência nominal | 50 / 60 Hz (faixa ±5 Hz) | | |
| Corrente máx. @ 220 V | 7,27 A | 8,18 A | 9,09 A |
| Corrente máx. @ 230 V | 6,96 A | 7,83 A | 8,70 A |
| Corrente máx. @ 240 V | 6,67 A | 7,50 A | 8,33 A |
| Fator de potência | ~1 (ajustável 0,8 cap. a 0,8 ind.) | | |
| THD | < 3 % | | |
| **Máx. unidades por ramal de 4 mm²** | **2** | 2 | 2 |
| **Máx. unidades por ramal de 6 mm²** | **4** | 4 | 4 |

## 4. EFICIÊNCIA

| Parâmetro | Valor |
|---|---|
| Eficiência máxima | 96,4 % |
| Eficiência nominal de MPPT | 99,8 % |
| Consumo noturno | 0,05 W |

## 5. DADOS GERAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de operação | −40 a +65 °C |
| Temperatura de derating | 45 °C |
| Temperatura de armazenamento | −40 a +85 °C |
| Resfriamento | Convecção natural |
| Peso | 6 kg |
| Dimensões (L × A × P) | 330,5 × 266,7 × 42,5 mm |
| Grau de proteção | IP67 |
| Comunicação | Wi-Fi e Bluetooth integrados, rede mesh Wi-Fi |
| Monitoramento | Plataforma SEMS, nível de módulo |
| **Garantia** | **12 anos padrão; 25 anos opcional** |

## 6. PROTEÇÕES

Detecção de resistência de isolamento FV; proteção de polaridade reversa CC; anti-ilhamento; sobrecorrente CA; curto-circuito CA; sobretensão CA; **DPS CA Tipo III**; relé de proteção CA integrado.

**Segurança inerente:** tensão CC máxima de 60 V no telhado — elimina o risco de arco CC de alta tensão. É o argumento técnico central do microinversor frente ao string em telhado.

## 7. CONFORMIDADE

EN/IEC 62109-1:2010, EN/IEC 62109-2:2011, UTE C15-712-1:2013, DIN VDE 0126-1-1:2013, família EN/IEC 61000-6-1/-6-2/-6-3/-6-4, EN/IEC 61000-2-2, AS/NZS 61000.6.3/6.4, BS EN.

> **SEM INMETRO listado no datasheet.** Verificação obrigatória do registro antes de projeto de homologação no Brasil.

---

## 8. DIMENSIONAMENTO — REGRAS DERIVADAS

### 8.1 ⚠ RESTRIÇÃO DE TENSÃO — 65 V por entrada

Voc do módulo corrigido para a mínima temperatura. Margem crítica em clima frio.

| Módulo | Voc STC | Voc a 5 °C | Voc a −10 °C | Margem vs 65 V |
|---|---|---|---|---|
| TCL 735 W | 49,80 V | 52,19 V | 53,98 V | ✅ folga de 17 % |
| Hanersun 710 W | 48,60 V | 50,84 V | 52,51 V | ✅ folga de 19 % |
| Ronma 630 W | 50,30 V | 52,82 V | 54,70 V | ✅ folga de 16 % |
| TSUN 600 W | 53,30 V | 55,97 V | 57,96 V | ⚠ folga de 11 % |

Todos passam para o clima do DF. O TSUN é o de menor margem — atenção se o mesmo projeto for replicado em região serrana ou no Sul.

### 8.2 ⚠ RESTRIÇÃO DE CORRENTE — 16 A por MPPT

| Módulo | Imp | Isc | Compatível? |
|---|---|---|---|
| TCL 735 W | **17,65 A** | 18,68 A (19,61 bifacial) | ❌ Imp acima de 16 A |
| Hanersun 710 W | **17,41 A** | 18,42 A | ❌ Imp acima de 16 A |
| Ronma 630 W | 15,01 A | 15,94 A (17,53 bifacial) | ✅ |
| TSUN 600 W | 13,50 A | 14,19 A | ✅ |

**Mesma conclusão do XS G3**: os módulos de wafer 210 mm ultrapassam o limite de 16 A por entrada. O datasheet do GW2000-MIS declara "400 a 670+ W", mas a potência não é o critério — a **corrente** é. Módulos de 700 W+ com Imp de 17,4–17,7 A operam com limitação de corrente.

### 8.3 Dimensionamento de potência (relação CC/CA)

| Modelo | Pot. CA | 4 × Ronma 630 W | 4 × TSUN 600 W |
|---|---|---|---|
| GW1600-MIS | 1.600 VA | 2.520 W → 158 % | 2.400 W → 150 % |
| GW1800-MIS | 1.800 VA | 2.520 W → 140 % | 2.400 W → 133 % |
| GW2000-MIS | 2.000 VA | 2.520 W → 126 % | 2.400 W → 120 % |

Para módulos de 600–630 W, o **GW2000-MIS** é o par natural (relação CC/CA de 120–126 %).

### 8.4 Dimensionamento do ramal CA (crítico e frequentemente errado)

| Seção do ramal | Máx. microinversores | Potência CA total |
|---|---|---|
| 4 mm² | 2 unidades | até 4.000 VA (com GW2000) |
| 6 mm² | 4 unidades | até 8.000 VA (com GW2000) |

Cada GW2000-MIS puxa até 9,09 A a 220 V. Quatro unidades em um ramal de 6 mm² = **36,4 A** — dimensionar disjuntor, condutor e proteção conforme NBR 5410 (queda de tensão inclusive, pois o ramal costuma ser longo no telhado).

### 8.5 Exemplo de arranjo residencial

| Sistema | Módulos | Microinversores | Pot. CC | Pot. CA |
|---|---|---|---|---|
| 8 × Ronma 630 W | 8 | 2 × GW2000-MIS | 5,04 kWp | 4,0 kVA |
| 12 × Ronma 630 W | 12 | 3 × GW2000-MIS | 7,56 kWp | 6,0 kVA |
| 16 × TSUN 600 W | 16 | 4 × GW2000-MIS | 9,60 kWp | 8,0 kVA |

## 9. NOTAS DE APLICAÇÃO

1. **Múltiplas orientações**: 4 MPPTs independentes resolvem telhado com águas diferentes e sombreamento parcial — vantagem central sobre o string de 1 MPPT.
2. **Segurança CC (60 V máx.)**: argumento forte para telhado residencial e para atender requisitos de rapid shutdown / NBR 17193.
3. **Garantia de 12 anos padrão**: extensão para 25 anos é opcional e paga. Declarar na proposta comercial.
4. **Isolado galvanicamente**: permite arranjos e aterramentos que o inversor não isolado não permite.
5. **Derating a partir de 45 °C** e alerta do fabricante sobre ventilação: não instalar embaixo do módulo em telhado sem folga de ar.
6. **6 kg por unidade no telhado**: somar à carga estrutural junto com os módulos.
7. **Sem INMETRO no datasheet**: resolver antes da compra.
