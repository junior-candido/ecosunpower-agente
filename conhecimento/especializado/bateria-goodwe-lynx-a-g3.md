---
tipo: ficha_tecnica_bateria
fabricante: GoodWe
linha: Lynx A G3
modelo: LX A5.0-30
quimica: LFP (LiFePO4)
classe: baixa tensão (51,2 V), formato rack 19"
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Bateria GoodWe Lynx A G3 — LX A5.0-30 (5 kWh, baixa tensão, rack 19")

## 1. IDENTIFICAÇÃO E ENERGIA

| Campo | Valor |
|---|---|
| Fabricante / linha | GoodWe — Lynx A G3 |
| Modelo | LX A5.0-30 |
| Química | LFP (LiFePO4) |
| Energia nominal | 5,12 kWh |
| **Energia utilizável** | **5,0 kWh** (100 % DOD, 0,2C, 25 °C, início de vida) |
| Formato | **Rack 19 polegadas** |
| Versão do datasheet | GoodWe-Single page-20250730-PT-V2.1 |

## 2. PARÂMETROS ELÉTRICOS

| Parâmetro | Valor |
|---|---|
| Faixa de tensão operacional | 43,20 ~ 58,24 V (nominal 51,2 V) |
| Corrente nominal de carga | 60 A |
| Corrente máxima contínua de carga | 90 A |
| Corrente nominal de descarga | 100 A |
| **Corrente máxima contínua de descarga** | **150 A** |
| Corrente máxima de descarga de pulso | < 200 A por 30 s |
| **Potência máxima de descarga contínua** | **7.200 W** |
| C-rate de descarga | **1,5C** |
| Eficiência de ciclo | ≥ 96 % |
| Comunicação | CAN |

> **Diferencial da linha A**: 150 A / 7,2 kW de descarga contínua contra 100 A / 4,95 kW da linha U — **45 % mais potência de descarga** com a mesma energia armazenada.

## 3. CICLO DE VIDA

| Parâmetro | Valor |
|---|---|
| Ciclos | > 6.000 (70 % EOL) |

## 4. CONDIÇÕES AMBIENTAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de carga | 0 < T ≤ 55 °C |
| Temperatura de descarga | −20 < T ≤ 55 °C |
| Altitude máxima | 4.000 m |

## 5. MECÂNICA E INSTALAÇÃO

| Parâmetro | Valor |
|---|---|
| Peso | **44 kg** |
| Dimensões sem suporte (L × A × P) | 442 × 133 × 520 mm |
| Dimensões com suporte | 483 × 133 × 559 mm |
| **Grau de proteção** | **IP20 — SOMENTE AMBIENTE INTERNO PROTEGIDO** |
| Métodos de montagem | Rack padrão 19", montado no piso, montado na parede, em gabinete |
| Escalabilidade | Máx. 30 em paralelo = **150 kWh** (tensão de passo / caixa combinadora / barramento) |
| Aplicações | On-grid / On-grid + backup / off-grid |

## 6. NORMAS

| Área | Normas |
|---|---|
| Segurança | IEC 62619, IEC 63056, N140 |
| EMC | EN IEC 61000-6-1 / -6-2 / -6-3 / -6-4 |
| Transporte | UN 38.3, ADR |
| Ambiental | RoHS |

> **Sem VDE 2510-50 e sem IEC 62040** (que a linha U declara). Diferença documental a considerar em especificação exigente.

---

## 7. DIMENSIONAMENTO — REGRAS DERIVADAS

### 7.1 Banco por número de unidades

| Unidades | Energia útil | Pot. máx. de descarga | Peso total | Altura em rack |
|---|---|---|---|---|
| 1 | 5 kWh | 7,2 kW | 44 kg | 3U (~133 mm) |
| 2 | 10 kWh | 14,4 kW | 88 kg | ~266 mm |
| 3 | 15 kWh | 21,6 kW | 132 kg | ~399 mm |
| 4 | 20 kWh | 28,8 kW | 176 kg | ~532 mm |
| 30 | 150 kWh | 216 kW | 1.320 kg | — |

> A potência real é limitada pelo inversor híbrido, não pela bateria.

### 7.2 Autonomia estimada (5 kWh úteis, uma unidade)

| Carga contínua | Autonomia aproximada |
|---|---|
| 500 W | ~9,6 h |
| 1.000 W | ~4,8 h |
| 2.000 W | ~2,4 h |
| 7.200 W (máximo) | ~40 min |

### 7.3 Tempo de carga

| Corrente | Potência | Tempo (0→100 %) |
|---|---|---|
| 60 A (nominal) | ~3,07 kW | ~1,7 h |
| 90 A (máxima) | ~4,6 kW | ~1,1 h |

Carga idêntica à linha U — **a diferença entre as duas linhas está só na descarga**.

## 8. NOTAS DE APLICAÇÃO

1. **IP20 é a restrição central**: instalação exclusivamente em ambiente interno seco e protegido. Não vai em área de serviço aberta, garagem sem fechamento ou abrigo externo. Se o local exigir instalação externa, especificar a **linha U (IP65)**.
2. **1,5C de descarga**: melhor escolha quando o backup precisa atender cargas de partida elevada (ar-condicionado, bomba d'água, portão, compressor) com poucas unidades.
3. **Formato rack 19" e 3U de altura**: integra bem em quadro/gabinete de telecom e em salas técnicas; empilhável e compacto (133 mm de altura contra 580 mm da linha U).
4. **44 kg**: 6 kg mais leve que a linha U, mas ainda exige fixação estruturada em parede ou trilho de rack dimensionado.
5. **Escalabilidade em paralelo exige tensão de passo / caixa combinadora / barramento** — prever o custo desse acessório no orçamento de bancos com mais de 2 unidades.
6. **Faixa térmica de carga inicia em 0 °C**: sem preocupação em Brasília, mas a bateria não aceita carga abaixo de 0 °C.
7. Confirmar a compatibilidade com o modelo específico de inversor híbrido GoodWe de baixa tensão antes de fechar o kit.
