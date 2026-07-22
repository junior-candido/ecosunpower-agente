# GoodWe — Base Oficial do Treinamento "GoodWe Plus – Módulo 2" (Armazenamento C&I / BESS)

> **Fonte:** Treinamento oficial "GoodWe Plus – Módulo 2 — Armazenamento C&I" (GoodWe Technologies Co., Ltd.), compilado pela EcoSunPower — jul/2026.
> **Escopo:** Aplicações de BESS C&I (Peak Shaving, Time of Use, Backup, Time Shifting, Zero Export, Microrredes), matriz por segmento (supermercado/hotel/hospital/frigorífico/indústria/agro), portfólio (ET-LV, ET 12-30K, ET 50K, ET 50-100K, STS Boxes, baterias Lynx/BAT 25-56/BAT 60-112, ESA 125/261), regras transversais de projeto (SEC3000C, medidores, entradas de bateria), AC vs DC coupled, comutação UPS, dimensionamento (kWh+kW+perfil+aplicação) e atratividade regional.
>
> **REGRA (Eva):** responda SOMENTE com o que está neste documento — números, modelos, comutações e normas EXATAMENTE como escritos. Se o cliente perguntar algo que não consta aqui, diga que confirma o detalhe com o Responsável Técnico e retorna. NUNCA invente especificação. Atenção às regras transversais da seção 4 (SEC3000C obrigatório em paralelismo e no ESA; paralelismo de BATERIAS não é suportado; ET 50-100K só tem saída on-grid — backup depende da STS Box).
---

## 1. INTRODUÇÃO — O MERCADO DE ENERGIA ESTÁ MUDANDO

O armazenamento de energia deixou de ser tecnologia de futuro para se tornar ativo estratégico presente no mercado comercial e industrial (C&I) brasileiro. No contexto C&I, a bateria **não é apenas um sistema de backup**: é um instrumento capaz de reduzir custos, aumentar a disponibilidade de energia e gerar retorno financeiro mensurável para o cliente.

### 1.1 Fatores que impulsionam o crescimento do BESS C&I

1. **Expansão acelerada** — crescimento contínuo da adoção de sistemas de armazenamento, com interesse crescente de indústrias, comércios e utilities.
2. **Restrições de conexão** — limitações das concessionárias para novas conexões e aumentos de potência tornam o BESS alternativa para maximizar o uso da infraestrutura existente.
3. **Aumento dos custos** — tarifas em constante evolução, com impacto crescente do horário de ponta e da demanda contratada.
4. **Maior exigência de confiabilidade** — interrupções de energia geram perdas operacionais e financeiras; continuidade operacional tornou-se prioridade.
5. **Avanço regulatório** — evolução das normas e leilões de armazenamento criam ambiente favorável a investimentos.
6. **Novas oportunidades de negócio** — projetos de maior valor agregado, receita recorrente em engenharia e consultoria, e diferenciação em mercado competitivo.

---

## 2. APLICAÇÕES DE ARMAZENAMENTO C&I

### 2.1 Peak Shaving [Redução de Demanda]

**Princípio:** a bateria fornece energia durante os picos de consumo, reduzindo a demanda registrada no medidor, permitindo contratar menos demanda e evitando cobranças por ultrapassagem.

**Ciclo de operação:** carga normal (bateria carrega com energia da rede ou do sistema solar) → pico de consumo (bateria descarrega e abate o pico) → demanda controlada (mantida abaixo do limite contratado).

| Item | Descrição |
|---|---|
| Clientes típicos | Indústrias, shopping centers, hospitais, hotéis, centros logísticos, supermercados |
| Benefícios | Redução da fatura de energia; melhor aproveitamento da demanda contratada |
| Grandeza atacada | **Demanda (kW)** |

### 2.2 Time of Use — TOU [Arbitragem Tarifária]

**Princípio:** a bateria carrega fora do horário de ponta (tarifa mais barata) e descarrega quando a tarifa é mais cara, deslocando o consumo para os períodos de menor custo.

| Item | Descrição |
|---|---|
| Clientes típicos | Indústrias, comércios, condomínios comerciais, grandes consumidores do Grupo A |
| Benefícios | Economia com tarifas horárias; maior controle da fatura |
| Grandeza atacada | **Preço da energia por posto tarifário (R$/kWh)** |

### 2.3 Back-up [Segurança Energética]

**Princípio:** durante a queda de energia da concessionária, o sistema de baterias entra em ação em milissegundos e mantém as cargas críticas funcionando, com transição automática e sem interrupção (nível UPS).

| Item | Descrição |
|---|---|
| Clientes típicos | Hospitais, clínicas, data centers, telecom, bancos, indústrias |
| Benefícios | Continuidade operacional; evita perdas financeiras |
| Atributos | Comutação automática em milissegundos; autonomia flexível; monitoramento inteligente |

### 2.4 Maximização de Autoconsumo [Time Shifting]

**Princípio:** armazena o excedente de geração solar do meio do dia para utilização à noite ou em horários de maior consumo/ponta.

**Ciclo diário:** manhã (geração solar atende ao consumo) → tarde (excedente solar carrega as baterias) → noite/ponta (bateria fornece energia para o consumo).

| Item | Descrição |
|---|---|
| Clientes típicos | Empresas com grandes sistemas FV, condomínios comerciais/residenciais, centros de distribuição |
| Benefícios | Maior aproveitamento da energia gerada; menor dependência da rede |

### 2.5 Limitação de Exportação [Export Limit / Zero Export]

**Princípio:** quando a concessionária limita a injeção de energia na rede, o excedente que seria cortado é armazenado em vez de desperdiçado, para consumo local posterior.

| Item | Descrição |
|---|---|
| Clientes típicos | Empresas com restrições de acesso; grandes usinas em geração distribuída |
| Benefícios | Aproveita energia que seria cortada; maximiza o retorno do sistema FV |

### 2.6 Microrredes

**Princípio:** o armazenamento coordena geração fotovoltaica, geradores e cargas críticas por meio de um sistema de controle central, operando inclusive em modo ilha (sem rede).

| Item | Descrição |
|---|---|
| Clientes típicos | Mineração, agronegócio, indústrias isoladas, campi industriais |
| Benefícios | Maior autonomia; operação otimizada; despacho inteligente entre fontes; redução do consumo de combustível |

### 2.7 Matriz de aplicações por segmento

| Segmento | Problema típico | Aplicação indicada |
|---|---|---|
| Supermercados | Câmaras frias não podem parar; picos com refrigeração + iluminação | Peak Shaving + Backup |
| Hotéis | Ocupação variável; AC/elevadores puxam pico na ponta | Peak Shaving + Time of Use |
| Hospitais | Zero tolerância a interrupção; equipamentos sensíveis | Backup + Qualidade de Energia |
| Clínicas | Diagnóstico sensível; queda custa caro | Backup + Qualidade de Energia |
| Frigoríficos | Carga térmica constante; perda de produto sem energia | Backup + Peak Shaving |
| Postos de combustível | Bombas 100% dependentes de energia; gerador diesel caro | Backup + Peak Shaving |
| Shoppings | Demanda contratada alta (AC central, elevadores, lojas) | Peak Shaving + Time of Use |
| Indústrias | Processo contínuo, alta demanda, muitas já têm FV | Peak Shaving + Time Shifting + Zero Export |
| Data centers | Missão crítica, zero downtime aceitável | Backup + Qualidade de Energia |
| Irrigação | Bombeamento em horário caro; rural com GD | Time Shifting + Time of Use |
| Mineração | Operação isolada, dependente de diesel | Microrredes |

### 2.8 Segmentos críticos do agronegócio

**Laticínios** — o processamento depende de etapas críticas: refrigeração, padronização, pasteurização, homogeneização, fermentação e envase automatizado. Qualquer interrupção compromete qualidade e segurança dos produtos. Sistemas híbridos com baterias garantem operação contínua, protegendo perecíveis e evitando perdas econômicas. Maiores produtores de leite (IBGE, 2023): MG, PR, RS, SC, GO.

**Aviários** — a operação depende de ventilação, climatização, bombas de água, alimentação automática e controle ambiental. Falha de energia compromete temperatura e oxigenação em poucos minutos, podendo causar estresse térmico e mortalidade das aves. O BESS funciona como **seguro energético** do lote, da produtividade e do capital investido. Maiores rebanhos de galináceos (IBGE, 2024): SP, PR, MG, RS, SC.

### 2.9 Solar com Armazenamento vs. Gerador a Diesel

Duas soluções, um objetivo comum: garantir energia. O gerador é solução **para falta de energia**; o armazenamento é solução para **gestão inteligente da energia** — enquanto o gerador permanece parado aguardando emergência, o BESS gera valor diariamente.

| Critério | Solar + Armazenamento | Gerador a Diesel |
|---|---|---|
| Transferência | Ultrarrápida automática (<0,01 s) | Demorada e manual (>5 min) |
| Ruído | Baixíssimo, imperceptível | Extremamente desconfortável, exige local específico |
| Monitoramento | Remoto por aplicativo | Requer dispositivos externos |
| Integração com solar | Recarrega pelas placas automaticamente | Abastecimento manual |
| Estética | Design moderno e neutro | Péssima aparência, local dedicado |
| Custo operacional | Inexistente | Manutenção de rotina obrigatória |
| Resíduos | Nenhum durante operação | Fumaça poluente e mau odor |

---

## 3. PORTFÓLIO GOODWE PARA ARMAZENAMENTO C&I

### 3.1 Solução Híbrida Trifásica com bateria de Baixa Tensão — ET-LV

| Parâmetro | Especificação |
|---|---|
| Modelos | GW12K-ET-L-G10, GW15K-ET-L-G10, GW20K-ET-L-G10 [380 Vca]; GW12K-ET-LL-G10 [220 Vca] |
| MPPTs | 2 a 4 |
| Proteções integradas | AFCI, chave CC, DPS CC Tipo II, Wi-Fi |
| Baterias | Lithium LV [48–60 V] |
| **Comutação UPS** | **04 ms** [sem desligamento das cargas] |
| Entrada GEN | Para gerador diesel ou inversor on-grid |
| Paralelismo | **Até 10 unidades em backup** |
| Certificação | INMETRO [140/2022 + 515/2023] |

**Baterias compatíveis (51,2 Vcc, LiFePO4, BMS integrado, 100% DoD, até 150 kWh = 30 × 5 kWh):**

| Bateria | Descarga | Grau de proteção | Diferenciais |
|---|---|---|---|
| Lynx A G3 [LX A5.0-30] | 1,5C | IP20 [uso interno] | Kit de cabos curtos incluso |
| Lynx U G3 [LX U5.0-30] | 1C | IP65 [permite uso externo] | Disjuntor CC integrado; supressor de incêndios |

Configuração: comunicação bateria–inversor via RS-485; medidor inteligente fornecido com o inversor; backup box não necessária.

### 3.2 Solução Híbrida Trifásica 380 Vac UPS — ET 12-30K [bateria HV]

| Parâmetro | Especificação |
|---|---|
| Modelos | GW12KL-ET, GW18KL-ET [220 Vca]; GW20K-ET, GW30K-ET [380 Vca] |
| MPPTs | 2 e 3 (30 A Imax por MPPT; 2 entradas por MPPT) |
| Tensão CC máx. | 800–1000 V; oversizing CC até 50%/100% |
| Baterias | Lithium HV [200–800 Vcc] |
| **Comutação UPS** | **< 10 ms** [sem desligamento das cargas] |
| Certificação | INMETRO [140/2022 + 515/2023] |

**Opção 1 — Lynx Home F G2 [180–580 Vcc]:** torres de 3 a 9 módulos de **3,2 kWh** + PCU-F52 (BMS), de 9,6 a 28,8 kWh por torre; **até 8 torres em paralelo por entrada**; LiFePO4; 100% DoD; **IP55**; garantia de 10 anos; capacidade total de **até 460 kWh**.

**Entradas de bateria — regra fundamental:**
- **GW20K-ET: 1 entrada** → até 230 kWh [8 torres]; máx. 4 inversores em paralelo = 920 kWh.
- **GW30K-ET: 2 entradas** → até 460 kWh [16 torres]; máx. 4 inversores em paralelo = 1,84 MWh.

**Opção 2 — BAT 25-56 [229–635 Vcc]:** gabinetes com 5 a 11 módulos de **5,1 kWh** + PCU (25,6 a 56,3 kWh por gabinete); até 6 gabinetes em paralelo [337,8 kWh]; descarga **1,1C**; IP20; supressão de incêndio por aerossol; suportes e cabos de empilhamento inclusos.

### 3.3 ET 50K — GW50K-ET-10

| Parâmetro | Especificação |
|---|---|
| MPPTs | 4 (até 42 A por MPPT; 2 entradas por MPPT) |
| Tensão CC máx. | 1000 V; oversizing 50% |
| Baterias | Lithium HV [200–800 Vcc] |
| **Comutação** | **< 10 ms** |
| **Arquitetura** | **Apenas 1 saída CA [on-grid] — a saída de backup fica na STS Box** |
| STS | STS Box com entrada de geradores a diesel; pronta para microrredes; partida/parada de geradores |
| Opcional | Transmissor RSD |
| Certificação | INMETRO [140/2022 + 515/2023] |

**Modos de aplicação:**

1. **Apenas On-grid (sem STS Box)** — Peak Shaving e Load Shifting. A bateria carrega dos módulos FV ou da rede [horário programável] e descarrega para as cargas: compensação de ponta e controle de demanda. **Não há necessidade da STS Box.**
2. **Modo híbrido (com STS Box)** — cargas prioritárias conectadas na STS. Em queda da concessionária, a STS comuta automaticamente em menos de 10 ms [UPS].
3. **Modo híbrido com gerador [até 200 A]** — gerador diesel e cargas conectados à STS; o inversor controla via contato seco. O gerador pode alimentar cargas de backup, carregar a bateria e manter o inversor operando sem rede [cenário de microrrede].
4. **Paralelismo híbrido** — até **10 inversores** (mestre + escravos), cada um com sua STS Box, alimentando cargas prioritárias de **até 500 kW**.

### 3.4 ET 50-100K — Solução Híbrida Trifásica C&I

| Parâmetro | Especificação |
|---|---|
| Modelos | GW50K-LV-ET-10 [220 Vca]; GW75K-ET-10, GW100K-ET-10 [380 Vca] |
| MPPTs | 8 (até 42 A; 2 entradas por MPPT) |
| Oversizing CC | Até 100% |
| Entradas de bateria | 2 [Lithium HV 300–800 Vcc] |
| **Comutação** | **< 10 ms [< 20 ms em paralelismo]** |
| Arquitetura | 1 saída CA [on-grid]; backup na STS Box |
| Certificação | GW50K-LV-ET-10 e GW75K-ET-10: INMETRO; **GW100K-ET-10: IEC**; STS Box: IEC |

**Paralelismo:** até **6 inversores em uma STS Box 700 kW**, alimentando cargas prioritárias de até **600 kW**.

### 3.5 STS Boxes — Chaves de Transferência CA

| Modelo | Aplicação | Potência | Comutação UPS | IP |
|---|---|---|---|---|
| **STS 125K** [GW125K-STS-G10] | 1 único inversor [210 A] | 125 kW [75 kW @ 220 Vca] | **< 4 ms** | IP54 |
| **STS 350K** [GW350K-STS-G10] | Até 3 inversores [535 A] | 350 kW [200 kW @ 220 Vca] | **< 20 ms** | IP54 |
| **STS 700K** [GW700K-STS-G10] | Até 6 inversores [1062 A] | 700 kW [400 kW @ 220 Vca] | **< 20 ms** | IP54 |

Todas com: comutação em nível de UPS, operação off-grid, saída de backup e **porta inteligente para microrrede** (gerador diesel ou inversores on-grid). Compatíveis com GW50K-LV-ET-10, GW75K-ET-10 e GW100K-ET-10.

### 3.6 Baterias C&I de Alta Tensão

| Parâmetro | **BAT 25-56 (indoor)** | **BAT 60-112 (outdoor)** |
|---|---|---|
| Tensão | 460–635 Vcc | 460–635 Vcc |
| Módulos | 10 ou 11 × **5,1 kWh** | 06, 10 ou 11 × **10,2 kWh** |
| Capacidade por gabinete | Até 56,3 kWh | Até 112,6 kWh [61,4 / 102,4 / 112,6] |
| Paralelismo | **Até 6 gabinetes [337,8 kWh]** | **Até 4 gabinetes [450 kWh]** |
| Descarga | 1,1C | 1,1C |
| Grau de proteção | **IP20 [uso interno]** | **IP55 [uso externo]** |
| Refrigeração | — | Ar-condicionado integrado |
| Segurança | Supressão de incêndio [aerossol] | Supressão de incêndio [aerossol]; proteção anticorrosão Classe C5 opcional |
| Química | LiFePO4, 100% DoD | LiFePO4, 100% DoD |
| Compatibilidade | Inversores GoodWe ET 12-30K, ET 40-50K e ET 50-100K | Inversores GoodWe ET 12-30K, ET 40-50K e ET 50-100K |

**Regra de entradas (vale para as duas famílias):**
- GW12KL-ET, GW20K-ET e ET 50K → **1 entrada** de bateria (até 337,8 kWh [6 torres BAT 25-56] ou 450 kWh [4 gabinetes BAT 60-112] por inversor);
- GW18KL-ET, GW30K-ET e ET 50-100K → **2 entradas** (até 675,6 kWh [12 torres] ou 900 kWh [8 gabinetes] por inversor).

**Aplicação outdoor integrada:** baterias BAT 60-112 (IP55) aceitam inversores ET 40-50K e ET 50-100K (**IP66**) fixados na própria bateria — com ou sem inversor acoplado.

### 3.7 BESS C&I All-in-One — ESA 125/261

PCS de **125 kW** + **261 kWh** de baterias em um único gabinete [GW125/261-ESA-LCN-G11, 832 Vcc].

| Parâmetro | Especificação |
|---|---|
| Potência PCS | 125 kW / 380 Vca |
| Armazenamento | 261 kWh — 5 módulos de 52,25 kWh |
| Células | LiFePO4 de **314 Ah**; 100% DoD |
| Descarga | **0,5C** |
| Paralelismo | **Até 20 gabinetes = 2,50 MW / 5,22 MWh** |
| Grau de proteção | IP54 [uso externo] |
| Refrigeração | **Líquida para baterias** [ventiladores para o PCS] |
| Anticorrosão | Classe C5 opcional |
| Certificação | IEC |

**Sistema de resfriamento líquido:** capacidade de refrigeração **5 kW** e de aquecimento **2 kW**; fluido = **solução aquosa de etileno glicol a 50% [50% água]**; células operando entre 25 °C e 35 °C; diferencial de temperatura entre células verificado **≤ ±3 °C**. Vantagens: maior dissipação de calor, homogeneidade térmica, estabilidade, durabilidade das células e eficiência.

**Segurança — proteção contra incêndio ativa e passiva de 6 níveis:**
1. Supressão de incêndio em nível de pack com aerossol;
2. Controle de incêndio em nível de rack com acionamento duplo [fumaça e calor];
3. Rack resistente ao fogo por 2 horas;
4. Saídas de escape traseira e superior [evitam ruptura do gabinete sob alta pressão];
5. Reserva de água para refrigeração de emergência;
6. Diferença máxima de temperatura entre células < 3 °C.

**Componentes externos:** LEDs indicadores [Run/Warning/Fault], botão de emergência, válvula de alívio de pressão, conexão para combate a incêndio, disjuntor auxiliar. Internamente: 5 packs com aerossol em nível de pack, sensores de fumaça e temperatura, desumidificador, sistema de resfriamento líquido e PCS.

**Backup para BESS — STS 500K [GW500K-STS-PCS-G10]:** até **4 unidades ESA 125/261 em paralelo [500 kW]** na saída de backup de **550 kVA**; entrada/saída de rede CA de 630 kVA; porta inteligente para microrrede [gerador diesel ou inversores on-grid]; IP54; comutação nível UPS **< 20 ms**.

**Integração on-grid:** paralelo de até 20 gabinetes ESA com **40 inversores on-grid das linhas GT/SMT/SDT G3** sob o SEC3000C.

### 3.8 Solução de Dupla Conversão

**Qualidade de energia [estabilidade de tensão] SEM comutação.** A carga permanece conectada ao lado off-grid, alimentada continuamente pelos inversores ET; o lado on-grid realiza o carregamento das baterias a partir da rede/transformador sob gestão do SEC3000C. Como a carga nunca depende diretamente da rede, não existe evento de transferência — indicada para cargas sensíveis a variações de tensão.

---

## 4. REGRAS TRANSVERSAIS DE PROJETO (VÁLIDAS PARA TODA A LINHA)

1. **Paralelismo de inversores exige SEC3000C via RS-485** — adquirido separadamente; comunicação entre inversores em daisy chain via RS-485.
2. **Paralelismo de baterias NÃO é suportado** — obrigatório um banco de baterias por inversor.
3. **Medidor inteligente [GM330 ou GM3000] adquirido separadamente** nas linhas ET 50K e superiores (no ET-LV e ET 12-30K o medidor acompanha o inversor).
4. **Comissionamento e configuração via aplicativo SolarGO**; monitoramento remoto via SEMS+.
5. **ESA 125/261: SEC3000C obrigatório para qualquer quantidade de racks — mesmo com 1 único gabinete.** Sem SEC3000C, é mandatório EMS externo. Um GM330 adicional pode ser incluído para melhorar a precisão de leitura.
6. **Inversores ET 50-100K possuem apenas 1 saída CA [on-grid]** — toda função de backup depende da STS Box.
7. Baterias C&I HV (BAT) são **compatíveis somente com inversores GoodWe**.

---

## 5. TOPOLOGIA: ACOPLAMENTO CA vs. CC

| Critério | **Acoplamento CA (AC Coupled)** | **Acoplamento CC (DC Coupled)** |
|---|---|---|
| Exemplo GoodWe | GW100K-GT + ESA 125 kW/261 kWh | ET 100 kW + 2 × BAT 112 kWh |
| Vantagem 1 | Sistemas que **já possuem FV** (retrofit) | **Sistemas novos** sem FV existente |
| Vantagem 2 | Custo-benefício R$/kWh | Mais eficiência de geração |
| Vantagem 3 | Locais que não podem receber FV | Mais eficiência no carregamento das baterias |

Critério prático: cliente com usina FV on-grid em operação → AC coupled preserva o investimento; projeto greenfield → DC coupled elimina conversões intermediárias.

---

## 6. DIMENSIONAMENTO: ERROS COMUNS E METODOLOGIA

### 6.1 Erros que comprometem o BESS

| Erro | Consequência |
|---|---|
| Dimensionar apenas por kWh | Autonomia inadequada |
| Ignorar potência (kW) | PCS subdimensionado |
| Desconsiderar cargas indutivas | Falha na partida de motores |
| Não definir a aplicação | ROI abaixo do esperado |
| Não prever expansão | Reinvestimentos futuros |

> **Energia (kWh) + Potência (kW) + Perfil das Cargas + Aplicação = Dimensionamento correto de um BESS.**

### 6.2 Levantamento junto ao cliente (abordagem consultiva)

O especialista em análise do uso inteligente de energia deve compreender: **(A)** as necessidades do cliente, **(B)** o perfil de consumo e **(C)** o momento da empresa — para então apresentar solução com segurança energética, menos gastos e maior lucro operacional.

Perguntas-chave:
1. Qual o impacto estratégico da ausência de energia no processo produtivo?
2. Quais os prejuízos de uma linha de produção parada por uma hora? De uma câmara fria desligada?
3. Qual o impacto das altas tarifas de hora-ponta?
4. Quanto se gasta com multas por ultrapassagem da demanda contratada?
5. Qual o gasto mensal/anual com energia [hidro, diesel, térmica]?
6. Já quis expandir a produção mas precisaria de reforma na rede da concessionária?

### 6.3 Atratividade regional para BESS no Brasil

O potencial econômico do BESS correlaciona-se diretamente com o custo da ponta (TUSD + TE + impostos) de cada concessionária. Destaques do mapa de atratividade (R$/MWh na ponta com impostos): Neoenergia Coelba (4.194), Equatorial PA (4.001), Equatorial MA (3.927), Energisa Minas Rio (3.578), Energisa TO (3.330), Neoenergia Cosern (3.159), Neoenergia Elektro (3.141), Equatorial AL (2.993), CEMIG-D (2.987), Energisa MS (2.911), Enel CE (2.162). Potencial classificado como muito alto em PA, BA e MG; alto em MA, CE, PI, TO e GO — região de atuação direta da EcoSunPower no entorno do DF.

---

## 7. TABELA-RESUMO DE COMUTAÇÃO (REFERÊNCIA RÁPIDA)

| Equipamento | Comutação UPS |
|---|---|
| ET-LV [bateria LV] | **04 ms** |
| ET 12-30K [bateria HV] | < 10 ms |
| ET 50K | < 10 ms |
| ET 50-100K | < 10 ms [< 20 ms em paralelismo] |
| STS 125K [1 inversor] | < 4 ms |
| STS 350/700K [3/6 inversores] | < 20 ms |
| STS 500K [BESS ESA] | < 20 ms |

Todas as comutações em nível UPS — **sem desligamento das cargas prioritárias**.

---

## 8. CONCLUSÃO

O portfólio GoodWe de armazenamento C&I cobre de forma contínua a faixa de 12 kW a 2,5 MW: soluções híbridas residencial-comercial com bateria LV (ET-LV + Lynx), trifásicas HV escaláveis (ET 12-30K com Lynx Home F G2 ou BAT 25-56), potências comerciais com backup via STS Box (ET 50K e ET 50-100K com BAT 60-112) e o BESS All-in-One ESA 125/261 para grandes instalações — com refrigeração líquida, seis níveis de proteção contra incêndio e paralelismo até 5,22 MWh.

A decisão técnica correta parte da **aplicação** (peak shaving, TOU, backup, time shifting, zero export ou microrrede), passa pelo **perfil de cargas** (kW, kWh, cargas indutivas, expansão futura) e se materializa na topologia adequada (AC ou DC coupled) com os acessórios obrigatórios corretamente especificados (SEC3000C, GM330, STS Box). No mercado C&I, a bateria é ativo estratégico de gestão de energia — e o integrador que domina esses critérios entrega segurança energética, redução de custos e retorno financeiro mensurável ao cliente.

---

*Documento elaborado com base no material oficial GoodWe Plus — Módulo 2 [GoodWe Technologies Co., Ltd.]. Especificações sujeitas a atualização pelo fabricante; consultar datasheets vigentes e lista de compatibilidade de baterias no site oficial antes da especificação final de projeto.*
