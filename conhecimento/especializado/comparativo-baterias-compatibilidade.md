---
tipo: comparativo_baterias_e_compatibilidade
escopo: GoodWe Lynx U G3 / Lynx A G3 / Lynx F G2 / SOFAR SF-5KWH-L1 + inversores XS G3 e MIS + módulos TCL/Hanersun/Ronma/TSUN
idioma: pt-BR
uso: base de conhecimento para assistente de engenharia elétrica / fotovoltaica
---

# Comparativo — Baterias e compatibilidade de sistema

## PARTE 1 — BATERIAS DE BAIXA TENSÃO (51,2 V, ~5 kWh)

| Item | GoodWe Lynx U G3 | GoodWe Lynx A G3 | SOFAR SF-5KWH-L1 |
|---|---|---|---|
| Energia nominal | 5,12 kWh | 5,12 kWh | 5,12 kWh |
| Energia utilizável | 5,0 kWh | 5,0 kWh | **não declarada** |
| Tensão nominal | 51,2 V | 51,2 V | 51,2 V |
| Faixa de tensão | 43,2 ~ 58,24 V | 43,2 ~ 58,24 V | 44,8 ~ 57,6 V |
| Carga nominal / máx. | 60 A / **90 A** | 60 A / **90 A** | 50 A / **50 A** |
| Descarga nominal / máx. | 100 A / **100 A** | 100 A / **150 A** | 50 A / **100 A** |
| Potência de descarga | 4,95 kW | **7,2 kW (1,5C)** | ~5,1 kW |
| Pulso | < 200 A (30 s) | < 200 A (30 s) | não declarado |
| Ciclos | **6.000** (70 % SOH, 90 % DOD) | **> 6.000** (70 % EOL) | **não declarado** |
| Eficiência | ≥ 96 % | ≥ 96 % | não declarada |
| **Grau de proteção** | **IP65 (int. e ext.)** | IP20 (só interno) | IP20 (só interno) |
| Peso | 50 kg | 44 kg | 45 kg |
| Dimensões (mm) | 460 × 580 × 160 | 442 × 133 × 520 | 442 × 132 × 590 |
| Formato | Gabinete parede/piso | **Rack 19" (3U)** | Rack 19" (3U) |
| Máx. em paralelo | 30 (150 kWh) | 30 (150 kWh) | **16 (81 kWh)** |
| Aquecimento opcional | Sim | Não | Não |
| Supressão de incêndio | Opcional (aerossol) | Não | Não |
| Normas declaradas | VDE 2510-50, IEC 62619/62040/63056, N140 | IEC 62619/63056, N140 | **nenhuma** |
| Tempo de recarga (0→100 %) | ~1,1 h | ~1,1 h | **~2,0 h** |

### Decisão rápida

| Situação | Escolha | Motivo |
|---|---|---|
| Instalação em área externa ou de serviço aberta | **Lynx U G3** | único com IP65 |
| Backup com cargas de partida alta (ar-cond., bomba) | **Lynx A G3** | 150 A / 7,2 kW (1,5C) |
| Sala técnica, rack, espaço vertical limitado | **Lynx A G3 ou SOFAR** | 3U de altura contra 580 mm |
| Especificação exigente (norma, seguro, bombeiro) | **Lynx U G3** | maior lastro normativo declarado |
| Análise econômica / LCOE | **evitar SOFAR** até obter o nº de ciclos | sem esse dado não há cálculo possível |

## PARTE 2 — BAIXA TENSÃO vs ALTA TENSÃO

| Critério | Lynx U / A / SOFAR (BT) | Lynx F G2 (AT) |
|---|---|---|
| Tensão | 51,2 V | 128 a 576 V |
| Energia por unidade | 5 kWh | 6,4 a 28,8 kWh (torre) |
| Corrente de trabalho | 50 a 150 A | **35 A** |
| Seção de condutor CC | Grande | Pequena |
| Perda ôhmica | Alta | Baixa |
| Expansão máxima | 81 a 150 kWh | **230,4 kWh** (8 torres) |
| Instalação | Piso, parede ou rack | **Só no solo** |
| Grau de proteção | IP20 ou IP65 | IP55 |
| Segurança de manuseio | Baixa tensão | **Alta tensão — NR-10** |
| Inversores compatíveis | Híbridos GoodWe de BT | GoodWe **BH / EH / BT / ET** |

**Ponto de virada**: acima de ~10 kWh a alta tensão compensa pela redução de corrente e de cabeamento. Abaixo disso, a baixa tensão é mais simples e mais barata.

---

## PARTE 3 — ⚠ MATRIZ DE COMPATIBILIDADE MÓDULO × INVERSOR

Ambos os inversores analisados (**XS G3** e **MIS**) têm **limite de 16 A por MPPT**.

| Módulo | Imp (STC) | Isc (STC) | XS G3 (16 A) | MIS (16 A) |
|---|---|---|---|---|
| TCL 735 W | 17,65 A | 18,68 A | ❌ | ❌ |
| Hanersun 710 W | 17,41 A | 18,42 A | ❌ | ❌ |
| Ronma 630 W | 15,01 A | 15,94 A | ✅ | ✅ |
| TSUN 600 W | 13,50 A | 14,19 A | ✅ | ✅ |

**Conclusão central de todo o conjunto analisado:** os módulos de **wafer 210 mm** (TCL e Hanersun, 700 W+) têm corrente de máxima potência **acima do limite de 16 A por MPPT** desses dois inversores. A Isc permanece dentro dos 25 A admissíveis — não há risco de dano — mas o inversor **limita a corrente e ceifa geração nos picos de irradiância**. Não é a combinação recomendada.

Para XS G3 e MIS, priorizar módulos de wafer 182 mm ou qualquer módulo com **Imp ≤ 15 A**.

### 3.1 Limite de tensão

| Inversor | Vmáx entrada | TCL 735 | Hanersun 710 | Ronma 630 | TSUN 600 |
|---|---|---|---|---|---|
| XS G3 (string) | 600 V | 11 em série | 11 | 11 | 10 |
| MIS (micro) | 65 V/entrada | 1 por MPPT ✅ | ✅ | ✅ | ⚠ menor margem |

Voc corrigido para 5 °C (mínima típica do DF).

### 3.2 Arranjos recomendados

| Inversor | Módulo recomendado | Configuração | Pot. CC | Pot. CA |
|---|---|---|---|---|
| GW3300-XS-30 | Ronma 630 W | 1 string × 10 | 6,30 kWp | 3,3 kW |
| GW3300-XS-30 | TSUN 600 W | 1 string × 10 | 6,00 kWp | 3,3 kW |
| GW2000-MIS | Ronma 630 W | 4 módulos | 2,52 kWp | 2,0 kVA |
| GW2000-MIS | TSUN 600 W | 4 módulos | 2,40 kWp | 2,0 kVA |

### 3.3 Escolha entre string e microinversor

| Condição | Escolha |
|---|---|
| Telhado de uma água, sem sombreamento | **XS G3** (mais barato, 97,6 % de eficiência) |
| Duas ou mais águas / orientações | **MIS** (o XS G3 tem 1 MPPT e 1 string apenas) |
| Sombreamento parcial | **MIS** (MPPT por módulo) |
| Exigência de segurança CC / rapid shutdown | **MIS** (máx. 60 V no telhado) |
| Prioridade de eficiência e custo | **XS G3** (97,6 % contra 96,4 %) |
| Monitoramento por módulo | **MIS** |

---

## PARTE 4 — PENDÊNCIAS A RESOLVER ANTES DE ESPECIFICAR

1. **Registro INMETRO** de cada inversor e bateria (nenhum dos dois datasheets de inversor menciona).
2. **Energia utilizável e número de ciclos da SOFAR** — sem isso não há análise econômica.
3. **Lista de compatibilidade inversor híbrido × bateria** — nenhuma das fichas de bateria traz a lista completa; a corrente máxima real de carga/descarga depende do modelo de inversor (nota expressa do fabricante GoodWe).
4. **Certificação de segurança da SOFAR** (IEC 62619 / 63056 / UN 38.3) — não declarada.
5. **Local de instalação da bateria** define a linha antes de qualquer outro critério: externo → obrigatoriamente IP65 (Lynx U).
6. **Verificação estrutural** em bancos grandes de alta tensão (até 2,6 t em 8 torres).
