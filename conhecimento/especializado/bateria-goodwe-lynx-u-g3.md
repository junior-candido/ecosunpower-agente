---
tipo: ficha_tecnica_bateria
fabricante: GoodWe
linha: Lynx U G3
modelo: LXU 5.0-30
quimica: LFP (LiFePO4)
classe: baixa tensão (51,2 V)
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Bateria GoodWe Lynx U G3 — LXU 5.0-30 (5 kWh, baixa tensão)

## 1. IDENTIFICAÇÃO E ENERGIA

| Campo | Valor |
|---|---|
| Fabricante / linha | GoodWe — Lynx U G3 (3ª geração) |
| Modelo | LXU 5.0-30 |
| Química | LFP (LiFePO4) |
| Energia nominal | 5,12 kWh |
| **Energia utilizável** | **5,0 kWh** (100 % DOD, 0,2C, 25 °C, início de vida) |
| BMS | **Integrado em cada unidade** — dispensa PCU/unidade de controle externa |
| Versão do datasheet | GoodWe-Single page-20250207-PT-V2.1 |

## 2. PARÂMETROS ELÉTRICOS

| Parâmetro | Valor |
|---|---|
| Tensão nominal | 51,2 V |
| Faixa de tensão | 43,2 ~ 58,24 V |
| Corrente nominal de carga | 60 A |
| **Corrente máxima contínua de carga** | **90 A** |
| Corrente nominal de descarga | 100 A |
| **Corrente máxima contínua de descarga** | **100 A** (C-rate de 1C) |
| Corrente de descarga por pulso | < 200 A por 30 s |
| **Potência máxima contínua carga/descarga** | **4,95 kW** |
| Eficiência de carga/descarga | ≥ 96 % |
| Comunicação | CAN |

## 3. CICLO DE VIDA

| Parâmetro | Valor |
|---|---|
| Ciclos | **6.000** @ 25 ± 2 °C, 0,5C, 70 % SOH, 90 % DOD |
| Energia acumulada estimada | ≈ 27,6 MWh (6.000 × 5 kWh × 0,92 de média) |

## 4. CONDIÇÕES AMBIENTAIS

| Parâmetro | Valor |
|---|---|
| Temperatura de carga (TChg) | 0 < T ≤ 55 °C |
| Temperatura de descarga (TDsch) | −20 < T ≤ 55 °C |
| **Temperatura ambiente** | 0 < T ≤ 40 °C (**recomendado 10 a 30 °C**) |
| Temperatura ambiente com aquecimento opcional | −20 < T ≤ 40 °C |
| Umidade relativa | 5 ~ 95 % |
| Altitude máxima | 4.000 m |
| Armazenamento sem manutenção | 12 meses |

## 5. MECÂNICA E INSTALAÇÃO

| Parâmetro | Valor |
|---|---|
| Peso | **50 kg** |
| Dimensões (C × A × P) | 460 × 580 × 160 mm |
| **Grau de proteção** | **IP65 — interno E externo** |
| Modo de instalação | Piso ou parede |
| Escalabilidade | **30P** — até 30 unidades em paralelo = **150 kWh** |
| Aquecimento | Opcional |
| **Supressão de incêndio** | **Opcional, por aerossol** |
| Aplicações | On-grid / On-grid + backup / off-grid |

## 6. NORMAS

| Área | Normas |
|---|---|
| Segurança | VDE 2510-50, IEC 62619, IEC 62040, N140, IEC 63056 |
| EMC | EN IEC 61000-6-1 / -6-2 / -6-3 / -6-4 |
| Transporte | UN 38.3, ADR |
| Ambiental | RoHS |

---

## 7. DIMENSIONAMENTO — REGRAS DERIVADAS

### 7.1 Banco por número de unidades

| Unidades | Energia útil | Pot. máx. contínua | Peso total |
|---|---|---|---|
| 1 | 5 kWh | 4,95 kW | 50 kg |
| 2 | 10 kWh | 9,9 kW | 100 kg |
| 3 | 15 kWh | 14,85 kW | 150 kg |
| 4 | 20 kWh | 19,8 kW | 200 kg |
| 30 | 150 kWh | 148,5 kW | 1.500 kg |

> A potência escala com o número de unidades em paralelo, mas o **limite real é o inversor híbrido**, não a bateria. Verificar sempre a corrente máxima de carga/descarga admitida pelo modelo de inversor (nota *3 do fabricante).

### 7.2 Autonomia estimada (5 kWh úteis, uma unidade)

| Carga contínua | Autonomia aproximada |
|---|---|
| 500 W (geladeira + luzes + tomadas) | ~9,6 h |
| 1.000 W | ~4,8 h |
| 2.000 W | ~2,4 h |
| 4.950 W (máximo) | ~1,0 h |

Considerando 96 % de eficiência de ciclo e desprezando o consumo próprio do inversor.

### 7.3 Tempo de carga

| Corrente | Potência | Tempo (0→100 %) |
|---|---|---|
| 60 A (nominal) | ~3,07 kW | ~1,7 h |
| 90 A (máxima) | ~4,6 kW | ~1,1 h |

## 8. NOTAS DE APLICAÇÃO

1. **IP65 + instalação externa**: principal diferencial da linha U. Permite área de serviço, garagem aberta, abrigo externo — sem exigir ambiente climatizado.
2. **50 kg em parede**: verificar a alvenaria e o chumbamento. Em drywall ou parede de tijolo furado sem reforço, usar instalação no piso.
3. **Faixa recomendada de 10 a 30 °C**: em Brasília é atendida na maior parte do ano, mas em abrigo externo sob sol direto a temperatura interna pode ultrapassar 40 °C. **Prever sombreamento e ventilação** — acima da faixa o BMS reduz corrente ou bloqueia a carga.
4. **BMS integrado, sem PCU**: reduz custo e complexidade frente às arquiteturas modulares de alta tensão.
5. **Supressão de incêndio por aerossol é OPCIONAL** — avaliar exigência do CBMDF conforme o local de instalação e o porte do banco.
6. **1C de descarga (4,95 kW)**: para partida de motores (bomba, ar-condicionado, portão), verificar o pico de 200 A / 30 s e a capacidade de surge do inversor.
7. Compatível com inversores híbridos GoodWe de baixa tensão. **Confirmar a lista de compatibilidade do modelo específico** antes de fechar o kit.
