---
tipo: ficha_tecnica_inversor_string
fabricante: GoodWe
linha: XS G3
modelos: [GW3300-XS-30, GW3300-XS-B30]
topologia: string monofásico, 1 MPPT, não isolado
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Inversor GoodWe XS G3 — GW3300-XS (3,3 kW)

## 1. IDENTIFICAÇÃO

| Campo | Valor |
|---|---|
| Fabricante | GoodWe |
| Linha | XS G3 |
| Modelos | GW3300-XS-30 / GW3300-XS-B30 |
| Potência nominal CA | 3.300 W |
| Fases | Monofásico (L / N / PE) |
| MPPTs | 1 |
| Strings por MPPT | 1 |
| Topologia | Não isolado (transformerless) |
| Versão do datasheet | GoodWe-Single page-20240527-PT-V2.1 |

## 2. ENTRADA CC

| Parâmetro | Valor |
|---|---|
| Potência máxima de entrada | 6.600 W (**overload CC de 200 %**) |
| Tensão máxima de entrada | **600 V** |
| Faixa de operação MPPT | 40 ~ 550 V |
| Tensão de partida | 50 V |
| Tensão nominal de entrada | 360 V |
| **Corrente máxima de entrada por MPPT** | **16 A** |
| Corrente máxima de curto por MPPT | 25 A |
| Conector CC | MC4 (4 ~ 6 mm²) |

## 3. SAÍDA CA

| Parâmetro | Valor |
|---|---|
| Potência nominal / máxima ativa | 3.300 W |
| Potência aparente nominal / máxima | 3.300 VA |
| Potência nominal e máxima a 40 °C | 3.300 W (sem derating a 40 °C) |
| Tensão nominal | 220 / 230 / 240 V |
| Faixa de tensão de saída | 154 ~ 288 V (conforme padrão local) |
| Frequência | 50 / 60 Hz — faixa 45~55 / 57~63 Hz |
| Corrente máxima de saída | 15,0 A |
| Fator de potência | ~1 (ajustável 0,8 capacitivo a 0,8 indutivo) |
| THD | < 3 % |
| Conector CA | Plug and Play |

## 4. EFICIÊNCIA

| Parâmetro | Valor |
|---|---|
| Eficiência máxima | 97,6 % |
| Eficiência europeia | 97,1 % |
| Consumo noturno próprio | < 3 W |

## 5. PROTEÇÕES

**Integradas:** monitoramento de corrente de string FV; detecção de resistência de isolamento FV; monitoramento de corrente residual; proteção contra polaridade reversa CC; anti-ilhamento; sobrecorrente de saída; curto-circuito de saída; sobretensão de saída; **chave seccionadora CC integrada**; partida noturna por energia CA.

| Proteção de surto | Padrão | Opcional |
|---|---|---|
| DPS CC | Tipo III | Tipo II |
| DPS CA | Tipo III | Tipo II |

**Opcionais:** AFCI (proteção contra arco elétrico), desligamento remoto.

> **ATENÇÃO NBR 17193 / segurança contra incêndio**: o AFCI é **opcional** neste modelo, não vem de série. Se o projeto exigir detecção de arco, especificar explicitamente e verificar disponibilidade do acessório.

## 6. DADOS GERAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de operação | −25 a +60 °C |
| Umidade relativa | 0 ~ 100 % |
| Altitude máxima | 4.000 m |
| Resfriamento | Convecção natural (sem ventoinha) |
| Grau de proteção | IP66 |
| Peso | 4,6 kg |
| Dimensões (L × A × P) | 306 × 218 × 119 mm |
| Ruído | < 20 dB |
| Interface | LED, LCD (opcional), WLAN + APP |
| Comunicação | RS485, WiFi, LAN ou 4G ou Bluetooth (opcional) |
| Protocolos | Modbus-RTU (compatível SunSpec), Modbus TCP (opcional) |

---

## 7. DIMENSIONAMENTO — REGRAS DERIVADAS

### 7.1 Limite de módulos por string (única string do equipamento)

Tensão máxima 600 V; Voc corrigido a 5 °C (mínima típica do DF).

| Módulo | Voc a 5 °C | Máx. em série (600 V) |
|---|---|---|
| TCL 735 W | 52,19 V | 11 |
| Hanersun 710 W | 50,84 V | 11 |
| Ronma 630 W | 52,82 V | 11 |
| TSUN 600 W | 55,97 V | 10 |

### 7.2 Limite real: potência CC
Máximo de 6.600 W de entrada. Combinando com o limite de tensão:

| Módulo | Máx. por tensão | Máx. por potência (6.600 W) | **Limite prático** |
|---|---|---|---|
| TCL 735 W | 11 | 8 (5.880 W) / 9 = 6.615 W (no limite) | **8 a 9** |
| Hanersun 710 W | 11 | 9 (6.390 W) | **9** |
| Ronma 630 W | 11 | 10 (6.300 W) | **10** |
| TSUN 600 W | 10 | 11 → limitado pela tensão | **10** |

### 7.3 ⚠ RESTRIÇÃO CRÍTICA DE CORRENTE — 16 A por MPPT

| Módulo | Imp (STC) | Isc (STC) | Compatível? |
|---|---|---|---|
| TCL 735 W | **17,65 A** | 18,68 A | ❌ Imp acima de 16 A |
| Hanersun 710 W | **17,41 A** | 18,42 A | ❌ Imp acima de 16 A |
| Ronma 630 W | 15,01 A | 15,94 A | ✅ (folga de ~6 %) |
| TSUN 600 W | 13,50 A | 14,19 A | ✅ (folga confortável) |

**Leitura:** os módulos de wafer 210 mm (TCL e Hanersun) têm corrente de máxima potência ACIMA do limite de 16 A do MPPT. O inversor não queima — a Isc (18–19 A) está dentro dos 25 A admissíveis — mas **limita a corrente e ceifa energia nos picos de irradiância**. Não é a combinação recomendada. Para este inversor, priorizar módulos de wafer 182 ou de corrente ≤ 15 A.

### 7.4 Faixa de operação
Tensão de partida 50 V e MPPT a partir de 40 V permitem operação com poucos módulos, mas o ponto de máxima potência precisa ficar dentro de 40–550 V em toda a faixa térmica. Para strings de 9–11 módulos dos catálogos acima, o Vmp fica entre ~370 V (70 °C) e ~490 V (5 °C) — dentro da janela.

## 8. NOTAS DE APLICAÇÃO

1. **1 MPPT e 1 string apenas**: não permite duas orientações de telhado. Em água dupla, usar outro modelo ou microinversores.
2. **Sem ventoinha, IP66, 4,6 kg**: instalação simples, silenciosa, adequada a área externa e a ambiente residencial interno.
3. **Sem derating a 40 °C**: mantém 3.300 W — bom para o clima do DF.
4. **Oversizing de 200 %**: permite sobredimensionar bastante o arranjo CC, mas o limite de 16 A por MPPT é o gargalo real, não a potência.
5. **DPS Tipo III de série**: para instalação com risco de descarga atmosférica (comum no Planalto Central), avaliar o DPS Tipo II opcional ou DPS externo conforme NBR 5410.
6. **Homologação**: verificar registro INMETRO do modelo e cadastro na distribuidora antes do projeto.
