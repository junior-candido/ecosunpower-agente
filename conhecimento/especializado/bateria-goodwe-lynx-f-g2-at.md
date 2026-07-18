---
tipo: ficha_tecnica_bateria
fabricante: GoodWe
linha: Lynx F G2
modelos: [LX F6.4-H-20, LX F9.6-H-20, LX F12.8-H-20, LX F16.0-H-20, LX F19.2-H-20, LX F22.4-H-20, LX F25.6-H-20, LX F28.8-H-20]
quimica: LFP (LiFePO4)
classe: alta tensão (128 a 576 V), modular empilhável
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Bateria GoodWe Lynx F G2 — 6,4 a 28,8 kWh (alta tensão)

## 1. ARQUITETURA

| Campo | Valor |
|---|---|
| Fabricante / linha | GoodWe — Lynx F G2 |
| Química | LFP (LiFePO4) |
| Arquitetura | **1 PCU (Unidade de Controle do BMS) + 2 a 9 módulos em série por torre** |
| Módulo de bateria | **LX F3.2-20 — 64 V, 3,2 kWh** |
| Posição da PCU | No topo da torre |
| Expansão | Até **8 torres em paralelo = 230,4 kWh** |
| Inversores compatíveis | GoodWe **BH / EH / BT / ET** |
| Versões do datasheet | V2.1 (20240527) e V2.2 (20250207) — a V2.2 explicita "Número de PCU: 1" e a posição da PCU |

## 2. TABELA DE CONFIGURAÇÕES

| Modelo | Energia útil | Módulos | Tensão nominal | Faixa de tensão | Potência nominal | Peso | Altura |
|---|---|---|---|---|---|---|---|
| LX F6.4-H-20 | 6,4 kWh | 2 | 128 V | 114,8 ~ 144,4 V | 4,48 kW | 86 kg | 559 mm |
| LX F9.6-H-20 | 9,6 kWh | 3 | 192 V | 172,2 ~ 216,6 V | 6,72 kW | 120 kg | 715 mm |
| LX F12.8-H-20 | 12,8 kWh | 4 | 256 V | 229,6 ~ 288,8 V | 8,96 kW | 154 kg | 871 mm |
| LX F16.0-H-20 | 16,0 kWh | 5 | 320 V | 287,0 ~ 361,0 V | 11,2 kW | 188 kg | 1027 mm |
| LX F19.2-H-20 | 19,2 kWh | 6 | 384 V | 344,4 ~ 433,2 V | 13,44 kW | 222 kg | 1183 mm |
| LX F22.4-H-20 | 22,4 kWh | 7 | 448 V | 401,8 ~ 505,4 V | 15,68 kW | 256 kg | 1339 mm |
| LX F25.6-H-20 | 25,6 kWh | 8 | 512 V | 459,2 ~ 577,6 V | 17,92 kW | 290 kg | 1495 mm |
| LX F28.8-H-20 | 28,8 kWh | 9 | 576 V | 516,6 ~ 649,8 V | 20,16 kW | 324 kg | 1651 mm |

Base (C × P) constante: **600 × 380 mm** para todas as configurações.

> **Regra de escala**: cada módulo adicional = +3,2 kWh, +64 V nominais, +2,24 kW, +34 kg, +156 mm de altura.

## 3. PARÂMETROS ELÉTRICOS COMUNS

| Parâmetro | Valor |
|---|---|
| Corrente nominal de carga / descarga | **35 A** (todas as configurações) |
| Comunicação | CAN |
| Temperatura de carga | 0 a +50 °C |
| Temperatura de descarga | −20 a +50 °C |
| Umidade relativa | 0 ~ 95 % |
| Altitude máxima | **3.000 m** |
| Grau de proteção | **IP55 — interior ou exterior** |
| Modo de instalação | **No solo** (não permite parede) |

Nota do fabricante: a corrente nominal e a potência sofrem derating em função de temperatura e SOC.

## 4. NORMAS

| Área | Normas |
|---|---|
| Segurança | IEC 62619, IEC 62040-1, IEC 63056, VDE 2510, CE, CEC |
| EMC | CE, RCM |
| Transporte | UN 38.3 |

---

## 5. DIMENSIONAMENTO — REGRAS DERIVADAS

### 5.1 Autonomia por configuração (carga contínua de 1.000 W)

| Modelo | Energia útil | Autonomia @1 kW | Autonomia @2 kW |
|---|---|---|---|
| LX F6.4 | 6,4 kWh | ~6,1 h | ~3,1 h |
| LX F12.8 | 12,8 kWh | ~12,3 h | ~6,1 h |
| LX F19.2 | 19,2 kWh | ~18,4 h | ~9,2 h |
| LX F28.8 | 28,8 kWh | ~27,6 h | ~13,8 h |

Considerando ~96 % de eficiência e desprezando o consumo próprio do inversor.

### 5.2 Expansão em paralelo (8 torres)

| Torre unitária | Total 8 torres | Peso total |
|---|---|---|
| 6,4 kWh | 51,2 kWh | 688 kg |
| 12,8 kWh | 102,4 kWh | 1.232 kg |
| 19,2 kWh | 153,6 kWh | 1.776 kg |
| 28,8 kWh | **230,4 kWh** | **2.592 kg** |

**⚠ CARGA ESTRUTURAL**: 8 torres de 28,8 kWh somam 2,6 toneladas em 8 bases de 600 × 380 mm. Exige laje ou piso dimensionado — verificação estrutural obrigatória, não opcional.

### 5.3 Compatibilidade de tensão com o inversor
A faixa de tensão da torre precisa estar dentro da janela de bateria do inversor híbrido. A configuração de 9 módulos chega a **649,8 V** no topo da faixa — verificar o limite do modelo BH/EH/BT/ET escolhido antes de fechar o número de módulos.

## 6. ALTA TENSÃO vs BAIXA TENSÃO — QUANDO USAR ESTA LINHA

| Critério | Lynx F G2 (AT) | Lynx U / A G3 (BT) |
|---|---|---|
| Tensão | 128 a 576 V | 51,2 V |
| Corrente para a mesma potência | Baixa (35 A) | Alta (90–150 A) |
| Seção de cabo CC | Menor | Muito maior |
| Perda ôhmica | Menor | Maior |
| Energia por unidade | 6,4 a 28,8 kWh | 5 kWh |
| Instalação | Só no solo | Piso, parede ou rack |
| Peso mínimo de entrada | 86 kg | 44–50 kg |
| Segurança de manuseio | Alta tensão — exige procedimento | Baixa tensão (extra-baixa não é) |

**Regra prática**: acima de ~10 kWh, a alta tensão passa a compensar pela redução drástica de corrente e de seção de condutor. Abaixo disso, a baixa tensão é mais simples e mais barata de instalar.

## 7. NOTAS DE APLICAÇÃO

1. **Instalação exclusivamente no solo**: não há opção de parede. Reservar área útil de 600 × 380 mm por torre, mais folga lateral e frontal para manutenção.
2. **PCU obrigatória**: cada torre precisa de 1 PCU. Torre mínima = PCU + 2 módulos (6,4 kWh). Não existe configuração de 1 módulo.
3. **IP55 interior/exterior**: aceita instalação externa abrigada; ainda assim, proteger de sol direto e chuva batida.
4. **Altitude de 3.000 m** (menor que a das linhas de baixa tensão, de 4.000 m) — irrelevante para Brasília (~1.100 m).
5. **35 A constantes**: a potência cresce com a tensão, não com a corrente. Isso mantém o cabeamento CC enxuto mesmo em bancos grandes.
6. **Manuseio de alta tensão CC**: procedimentos de segurança, EPI e sinalização conforme NR-10. Não é o mesmo trabalho de uma bateria de 51,2 V.
7. **Compatibilidade com inversor**: restrita às linhas BH / EH / BT / ET da GoodWe. Confirmar modelo e firmware.
8. **Derating por temperatura e SOC**: a potência nominal da tabela é o teto teórico — a entrega real varia.
