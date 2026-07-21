# GoodWe — Base Oficial do Treinamento "GoodWe Plus – Módulo 1"

> **Fonte:** Treinamento oficial "GoodWe Plus – Módulo 1" (GoodWe Technologies Co., Ltd.), compilado pela EcoSunPower — jul/2026.
> **Escopo:** Institucional GoodWe, Microinversores MIS, Linhas Monofásica e Trifásica, Controle de Exportação, Medidores Inteligentes, Comunicação/Monitoramento, Sistemas Híbridos e Armazenamento, Dimensionamento, RSD 2.0, Carregadores Veiculares.
>
> **REGRA (Eva):** responda SOMENTE com o que está neste documento — números, modelos e normas EXATAMENTE como escritos. Se o cliente perguntar algo que não consta aqui, diga que confirma o detalhe com o Responsável Técnico e retorna. NUNCA invente especificação. Atenção às DISTINÇÕES da seção 14 (erros comuns).
---

## 1. INSTITUCIONAL GOODWE

**Slogan:** "WE, THE SMART ENERGY INNOVATOR". Fabricante global de soluções inteligentes para geração, armazenamento, gerenciamento e utilização de energia.

**Portfólio:** Soluções Monofásicas; Trifásicas C&I; Grandes Usinas; Armazenamento de Energia; Medidores Inteligentes e Monitoramento; Carregadores para Veículos Elétricos; Soluções BIPV.

### 1.1 Milestones
| Ano | Marco |
|---|---|
| 2010 | Fundação da GoodWe |
| 2014 | Lançamento do primeiro híbrido |
| 2015 | Inauguração da GoodWe Australia |
| 2016 | Premiação TÜV Alemanha "Qualidade Total" |
| 2018 | Sedes na Alemanha, México e **Brasil** |
| 2020/2021 | Sedes nos USA e Japão; abertura na Bolsa de Xangai |
| 2024 | Inauguração da fábrica no Vietnã |

**Reconhecimentos:** Reddot Design; Prêmio PV Magazine 2019 (inversores); Top Brand PV Inversores (EUPD Research) por 5 anos consecutivos; nº 1 Fornecedor de Inversores Híbridos (Wood Mackenzie); estabilidade financeira BloombergNEF; alta eficiência energética.

### 1.2 Tier 1
A GoodWe é **Tier 1 BloombergNEF** como fabricante de inversores de energia — compromisso com qualidade, confiabilidade e solidez financeira.

### 1.3 GoodWe em números
| Indicador | Valor |
|---|---|
| Funcionários | ~6.000 |
| Profissionais de P&D | 2.000+ |
| Produção anual de inversores | 35 GW |
| Produção anual de baterias | 5 GWh |
| Capacidade instalada acumulada | 100 GW |
| Receita global | 1,3 bi USD |

### 1.4 Presença global
- **11 Subsidiárias:** Austrália, Alemanha, Benelux, Reino Unido, Japão, Estados Unidos, Coreia do Sul, Espanha, Polônia, Singapura, Vietnã.
- **29 Filiais** (inclui Brasil, México, Índia, África do Sul, EAU etc.).
- **4 Centros de P&D:** Suzhou, Shenzhen, Wuhan, Nanjing.
- **3 Parques fabris:** Suzhou [China], Guangde [China], Haiphong [Vietnã].

---

## 2. MICROINVERSOR — LINHA MIS

### 2.1 Ficha técnica GW2000-MIS
| Parâmetro | Valor |
|---|---|
| Potência / rede | 2 kW, monofásico **220Vac** |
| MPPTs | **4** (1 módulo por MPPT — MLPE) |
| Imax por MPPT [Imp] | 16 A |
| Isc por MPPT | 25 A |
| Tensão CC máxima | **65 V** |
| Tensão de partida | 22 V |
| Proteção | **IP67** |
| Relé CA | Integrado |
| Wi-Fi | Integrado + intercomunicação **Wi-Fi Mesh** entre micros |
| Conexão ao roteador | Direta, pelo micro **Mestre** |
| Inversores por ramal | Até 4 (até 9,09 A por inversor) |
| Inclusos na caixa | Conector T + terminais CA + suportes espaçadores |
| Fixação | Estrutura de alumínio |
| Garantia | **12 anos** |
| Certificação | IEC 62109-1/2; INMETRO [140/2022 + 515/2023]; ANATEL |
| Comissionamento | Bluetooth + app SolarGO |
| Monitoramento | Portal SEMS+ (integrado com inversores e demais dispositivos) |

### 2.2 Vantagens (venda)
1. **Maior geração:** MPPT individual por módulo, maximiza produção mesmo com sombreamento parcial.
2. **Mais segurança:** baixa tensão CC (até 65 V) reduz risco de choque elétrico e incêndio.
3. **Monitoramento por módulo:** desempenho de cada painel em tempo real no SEMS+.
4. **Fácil expansão e flexibilidade:** sistemas que crescem ou telhados com múltiplas orientações.
5. **Redução de perdas por mismatch:** elimina perdas por diferenças entre módulos (inclinação, sujeira, envelhecimento).
6. **Instalação simplificada:** sem strings CC longas, sem dimensionar inversor central.

### 2.3 Aplicações típicas
Sombreamento parcial (árvores, chaminés, caixas d'água, platibandas); múltiplas orientações/inclinações; residências e comércios; expansão futura; locais com alta exigência de segurança (escolas, hospitais, telhados metálicos, circulação de pessoas).

### 2.4 Diferenciais de segurança/robustez
- **RSD integrado:** tensão CC < 65 V + desligamento individual dos módulos → segurança para instaladores e equipes de emergência.
- **AFCI:** DISPENSADO devido aos baixos níveis de tensão e corrente de entrada, em conformidade com a Portaria INMETRO 515/2023.
- **Altas temperaturas:** resina epóxi (potting) para proteção, dissipação térmica e vida útil; beta testes feitos no Brasil.
- **Controle na palma da mão:** monitoramento por módulo → diagnóstico rápido, manutenção eficiente.

### 2.5 Wi-Fi Mesh (monitoramento MIS)
- **SEM datalogger, DTU ou Gateway:** micro Mestre conecta direto ao roteador via Wi-Fi.
- **SEM repetidores de sinal:** cada micro atua como repetidor na malha Mesh.
- **Maior estabilidade e alcance:** comunicação entre os próprios inversores; melhor que Wi-Fi convencional.
- **Menor uso da rede: apenas 1 endereço IP ocupado.**
- Funcionamento: micros se comunicam entre si; **um é definido automaticamente como mestre**; apenas o mestre se conecta ao roteador. Comissionamento: Bluetooth + SolarGO. Monitoramento remoto: SEMS+.
- **Limitação de exportação (função adicional): exige Datalogger + Smart Meter** (não é nativa do micro sozinho).

### 2.6 Grid Zero com microinversores (MIS)
Combinação: **Medidor Inteligente (GMK110 ou GMK330) + Ezlogger 3000R**.

**Ezlogger 3000R:**
- Comunicação **Wi-Fi com os microinversores** (até **10 micros por Ezlogger 3000R**);
- Wi-Fi ou LAN com o roteador; envia dados direto ao servidor;
- Comunicação **RS-485 com o medidor**; distância máxima: **30 m**;
- Certificação ANATEL; configuração via app SolarGo;
- **NÃO suporta estações climáticas**;
- Comunicação direta com o monitoramento: continua lendo/enviando dados ao portal mesmo com inversores desligados ou inexistentes.

**Medidores no contexto MIS:**
- **GMK110:** redes **monofásicas 220Vac** — 1 TC de 120 A incluso;
- **GMK330:** redes **bifásicas 127Vac** — 3 TCs de 120 A inclusos;
- Funções: limitação de exportação + monitoramento de consumo de cargas 24 h.

---

## 3. LINHA MONOFÁSICA (STRING)

### 3.1 Modelos — garantia 10 anos
| Família | MPPTs | Modelos | Potências |
|---|---|---|---|
| **XS G3** | 1 | GW3300-XS-30 | 3,3 kW |
| **DNS G4** | 2 | GW5K-DNS-G40; GW6K-DNS-G40 | 5 e 6 kW |
| **MS G4** | 2* e 3 | GW7.5K-MS-G41*; GW8K-MS-G40*; GW7.5-MS-G40; GW8.5-MS-G40; GW10K-MS-G40 | 7,5 / 8 / 8,5 / 10 kW |

### 3.2 Especificações comuns
| Parâmetro | XS G3 | DNS G4 | MS G4 |
|---|---|---|---|
| Imax por MPPT [Imp] | 16 A | 20 A | 20 A |
| Entradas por MPPT | 1 | 1 | 1 |
| Tensão CC máxima | 600 V | 600 V | 600 V |
| Oversizing CC máx. | 100% | 100% | 100% |
| AFCI | Integrado | Integrado | Integrado |
| DPS CC Tipo II | Integrado | Integrado | Integrado |
| Chave CC + Wi-Fi | Inclusos | Inclusos | Inclusos |
| Transmissor RSD | — | Opcional | Opcional |

- Compatibilidade: módulos FV de 182 e 210 mm; comunicação via módulos Wi-Fi, LAN, 4G e smartlogger Ezlogger Pro; medidores GMK110, GMK330, GM330.
- Certificação: INMETRO [140/2022 + 515/2023] nas três famílias.
- Configuração: local via display ou app SolarGO [Wi-Fi]; remota via app SEMS.
- Observações: chave CC e módulo Wi-Fi INCLUSOS no preço; **AFCI obrigatório desde dez/2024**; transmissor RSD interno ao inversor opcional (receptores usados junto aos módulos FV).

### 3.3 Selos de venda da Linha Monofásica
- **Display de alta qualidade** (operação intuitiva para o cliente final);
- **Design moderno e SEM VENTOINHA** — operação totalmente silenciosa **< 25 dB**, ideal para residências, menor manutenção;
- **Baixíssimo ruído:** instalável próximo a quartos, escritórios e áreas internas;
- **DPS CC Tipo II INTEGRADO:** proteção contra surtos + REDUÇÃO de custos com string box;
- **Proteção IP66:** resistente a chuva, poeira e ambientes severos — instalação externa com alta confiabilidade.
- Resumo: DESIGN PREMIUM • SEGURANÇA • ECONOMIA • CONFIABILIDADE.

### 3.4 Shadow Scan (Rastreador de Sombra)
- **Função INTEGRADA em todos os inversores atuais até 125 kW [EXCETO linha ETC/BTC]**.
- Objetivo: otimizar strings **parcialmente sombreadas**, onde existe mais de um ponto de máxima potência (curva P×V com múltiplos máximos locais).
- **Sem a função:** MPPT convencional rastreia só a parte final da curva e trava no primeiro ponto encontrado no rastreio periódico → pode não extrair o melhor desempenho.
- **Com a função:** o MPPT **rastreia a curva POR INTEIRO e com maior frequência**, encontrando o melhor ponto dentre todos os possíveis → máximo desempenho dos módulos.
- Ativação via display ou app SolarGO; **vem DESATIVADA por padrão**; sem certificação aplicável (N/A).
- NÃO confundir com: traçado de curva I-V para diagnóstico de falhas (não é isso) nem com AFCI.

---

## 4. CONTROLE DE EXPORTAÇÃO — CONCEITOS (POR QUE USAR MEDIDOR INTELIGENTE?)

1. **Controle de Exportação (Zero Export / Grid Zero)** — aplicação MAIS COMUM no Brasil. Quando usar: concessionária limita/proíbe injeção; cliente quer autoconsumo sem exportar; exigências da distribuidora. Exemplos: residências com restrição de acesso à rede, pequenos comércios, áreas rurais.
2. **Limitação de Exportação (Export Limit)** — muito usada em novas conexões. Quando usar: concessionária permite exportação PARCIAL; necessidade de limitar potência injetada. Exemplo: concessionária autoriza 5 kW de injeção, sistema gera 8 kW → exportação limitada aos 5 kW permitidos.
3. **Monitoramento do Consumo da Unidade** — o medidor mede geração E consumo. Benefícios: consumo em tempo real, fluxo de energia (rede × geração × carga), relatórios mais completos no SEMS.

> **Resumo oficial:** "Sempre que o projeto exigir controle de energia na rede ou monitoramento do consumo da instalação, o Medidor Inteligente DEIXA DE SER UM ACESSÓRIO e passa a ser um COMPONENTE ESSENCIAL da solução."

### 4.1 Limitação de exportação — Linha Monofásica (1 inversor)
Linhas **MS e DNS G4** possuem **medidor inteligente integrado ao inversor**: TC no ponto de conexão (após cargas, antes do medidor do padrão), leitura direta pelo inversor, monitoramento via SEMS+.

### 4.2 Paralelo Grid Zero — DNS G4 e MS G4 (múltiplos inversores)
> **Nota oficial:** "Limitação de Exportação de Potência suportada via **Ezlink3000 + GM330** para até **10 inversores em paralelo** entre inversores da linha G4 [DNS e MS G4] **até mesmo de diferentes potências**."
- Comunicação entre inversores e com o GM330: **RS-485** (cabeada — NÃO é Wi-Fi Mesh);
- Ezlink 3000 no inversor que coordena; conexão com roteador → SEMS+;
- GM330 + TC no ponto de conexão (o Ezlink NÃO substitui o medidor — funções distintas e complementares).

---

## 5. MEDIDORES INTELIGENTES — VISÃO COMPLETA

### 5.1 Tabela mestre
| Medidor | Rede/Aplicação | Nº de inversores | TCs | Observações |
|---|---|---|---|---|
| **GMK110** | Monofásicos (220Vac) | Apenas **1** | **Inclusos** (versões TC 120 ou 200 A; no kit MIS: 1× 120 A) | Vem junto com inversores MS/DNS; comunicação via inversor (sem roteador); não precisa adicionar no SEMS+ |
| **GMK330** | No contexto MIS: redes **bifásicas 127Vac**; trifásico até 120 kW e paralelismo | Apenas **1** | **Inclusos** (3× 120 A) | Configuração via SolarGo |
| **GM330** | Trifásicos 220–400 V + função de paralelismo | Apenas **1** | **NÃO inclusos** — usar TCs de terceiros até 5000 A [razão /5] | Compatível apenas com inversores GoodWe; sem certificação necessária |
| **SEC1000** | C&I | **Um ou MÚLTIPLOS** (trifásicos até 120 kW) | **NÃO inclusos** | Limitação de exportação; monitoramento de consumo 24 h com comunicação ao SEMS INDEPENDENTE do inversor; **controle dinâmico de fator de potência dos inversores**; conexão com roteador: LAN |
| **SEC3000** | C&I / usinas | Até **60 inversores [APENAS on-grid]** | **NÃO inclusos** | Configuração via interface WEB e SolarGO; IP65 [uso externo]; LAN; integra Ezlogger 3000C + GM330 |
| **SEC3000C** | C&I / usinas | Até **70 inversores [60 on-grid + 10 híbridos]** — suporta on-grid e híbridos em paralelo | **NÃO inclusos** | Demais características iguais ao SEC3000 |

### 5.2 Compatibilidade de medidores por linha de inversor
- Monofásicos (XS/DNS/MS): GMK110, GMK330, GM330.
- Trifásicos 380 V (SDT/SMT/GT): GM[K]330, SEC3000 [SDT 8-50K, SMT, GT], SEC1000 [SDT 8-40K, SMT, GT].
- Trifásicos 220 V (LV): GM[K]330, SEC3000 [SDT 12-30K, LV-SMT, LV-GT], SEC1000 [SDT 12-23KL, LV-GT].
- GT 150K: GM330, EzLink3000, EzLogger3000C e SEC3000.

---

## 6. LINHA TRIFÁSICA

### 6.1 Trifásicos 220Vac (LV — Low Voltage) — garantia 10 anos
> **Conceito-chave:** LV conecta DIRETO em redes trifásicas **220Vac fase-fase**, dispensando transformador 380→220 V. É onde a linha LV entrega o MAIOR RENDIMENTO.

| Família | MPPTs | Modelos | Potências |
|---|---|---|---|
| **LV-SDT G3** | 2–4 | GW12KLV-SDT-C31*; GW17KLV-SDT-C30*; GW23KLV-SDT-BR30**; GW30KLV-SDT-C30*** | 12, 17, 23, 30 kW |
| **LV-SMT G2** | 4–6 | GW37.5K-SMT-L-G20; GW50K-SMT-L-G10* | 37,5 (LV-SMT 35 kW listado em Modelos) e 50 kW |
| **LV-GT** | 8–10 | GW75K-GT-LV-G10*; GW100K-GT-L-G10 | 75 e 100 kW |

Specs LV: SDT G3 — 42/22 A Imax/MPPT, 2/1 entradas, 800 Vcc máx., oversizing 80*/100%, RSD integrado no 30K (opcional 12~23K). SMT G2 — 42 A/MPPT, 2 entradas, **900 Vcc** máx., oversizing 80/100*%, recuperação PID opcional. GT — 42 A/MPPT, 2 entradas, 800 Vcc, oversizing 50/100*%, recuperação PID opcional. Todos: AFCI + DPS CC II integrados, chave CC + Wi-Fi. Display opcional GW35KLS-MT. Para módulos com corrente > 15 A Imp: usar apenas 1 das 2 entradas de string por MPPT. LV-GT 75 kW: DPS Tipo I [opcional]. AFCI obrigatório a partir de mai/2025 [até 75 kW].

**Desvantagens do transformador (que o LV elimina), sistema até 75 kW — microgeração:**
- Menor segurança e confiabilidade; se falha, TODO o sistema FV para;
- Maior tempo e custo de instalação e manutenção; espaço extra;
- **Até 8% em perdas** → menor rendimento final.

### 6.2 Trifásicos 380Vac — garantia 10 anos
| Família | MPPTs | Modelos | Potências |
|---|---|---|---|
| **SDT G3** | 2–4 | GW8000-SDT-30*; GW12K/15K-SDT-30*; GW20K-SDT-31*; GW25K-SDT-P31*; GW30K-SDT-C30*; GW37K5-SDT-C30**; GW50K-SDT-C30 | 8 a 50 kW |
| **SMT** | 6 | GW60KS-MT | 60 kW (linha SMT: 50 e 60 kW) |
| **SMT (G2)** | 4–6 | GW60K-SMT-G20*; GW75K-SMT | 60 e 75 kW |
| **GT** | 8–10 | GW100K-GT*; GW110K-GT; GW125K-GT | 100 a 125 kW |

Specs 380 V: tensão CC máxima **1100 V** em todas. SDT G3 — 42/22 A/MPPT, oversizing 80%, RSD integrado 50K (opcional 8~37,5K). GW60KS-MT — **30 A/MPPT**, oversizing 50%. SMT G2 — 42 A/MPPT, oversizing 80%, PID opcional, RSD integrado no 60K. GT — 42 A/MPPT, oversizing 50%, PID opcional. Todos: AFCI + DPS CC II, chave CC + Wi-Fi. Certificação: SDT G3/SMT/SMT G2 INMETRO [140/2022 + 515/2023]; **GT: IEC**. Display opcional para GW50KS-MT e GW60KS-MT. AFCI obrigatório a partir de mai/2025 [até 75 kW].

### 6.3 GT 150K (GW150K-GT-G10) — Trifásico 380Vac
10 MPPTs; 42 A/MPPT; 2 entradas/MPPT; 1100 Vcc máx.; **oversizing CC máx.: 150%**; AFCI; DPS CC II + chave CC + Wi-Fi integrados; **Proteção C5**; **ventoinhas autolimpantes [reversão de rotação]**; **detecção de temperatura nos terminais CC e CA**; Smart DC Switch [opcional]; display LCD [opcional]; **transmissor RSD integrado**. Certificação: IEC. Paralelismo em limitação de exportação: até **10 unidades** com GM330 + EzLink3000; até **60 unidades** com GM330 + EzLogger3000C.

### 6.4 Selos de venda da Linha Trifásica
- **Baixo ruído (< 50 dB)** — até 15 dB abaixo da média do mercado;
- **Compatível com módulos de alta potência:** até **42 A por MPPT (30 A no SMT 60 kW)**;
- **Conexão SEM NEUTRO (3F/PE):** redução de **até 25% no custo de cabeamento CA**;
- **DPS CC Tipo II integrado:** DISPENSA string box CC em diversas aplicações, **reduzindo o CAPEX**;
- **Maior geração:** baixa tensão de partida + Shadow Scan;
- **Ventoinhas industriais IP68** — confiabilidade, desempenho térmico, fácil manutenção;
- **Proteção IP66** do equipamento (poeira e jatos de água, ambientes externos).
- Resumo: MAIS GERAÇÃO • MENOR CAPEX • ROBUSTEZ • CONFIABILIDADE.

### 6.5 Grid Zero trifásico
- 1 inversor: GM330 + 3 TCs (CT1/CT2/CT3 nas fases L1/L2/L3) + RS-485 com o inversor; SEMS+ via roteador.
- Múltiplos inversores (SEC1000): inversores em daisy-chain RS-485 → SEC1000; SEC1000 com alimentação CA, TCs no padrão, LAN ao roteador → SEMS+. Funções: Grid Zero + consumo 24 h + controle dinâmico de FP.

---

## 7. COMUNICAÇÃO E MONITORAMENTO

### 7.1 Módulos individuais (1 inversor)
**Módulo Wi-Fi**, **Módulo LAN**, **Módulo 4G** — todos ANATEL. "Acompanhe seu sistema de onde estiver, a qualquer hora" (SEMS Portal / app).

### 7.2 Ezlink (paralelismo)
Para paralelismo de inversores: comunicação estável e confiável, fácil instalação/configuração, ideal para múltiplos inversores. (Ezlink 3000 no contexto G4/híbridos; conecta ao roteador por Wi-Fi.)

### 7.3 Ezlogger 3000R × Ezlogger 3000C
| Item | **Ezlogger 3000R** | **Ezlogger 3000C** |
|---|---|---|
| Público | Microinversores MIS | Inversores on-grid até 350 kW com porta RS-485 |
| Nº de equipamentos | Até **10 micros** | Até **100 inversores** (Daisy Chain de até 20 por porta COM) |
| Comunicação com equipamentos | **Wi-Fi** | **RS-485**, distância máx. **1000 m** |
| Com o medidor | RS-485 (30 m máx.) | Integra GM330 |
| Com roteador | Wi-Fi ou LAN | Wi-Fi ou LAN [Ethernet], máx. 100 m |
| Estação meteorológica | **NÃO suporta** | **Suporta** (Modbus RTU) |
| SCADA | — | **Suporta** (IEC 60870-5-104), SEMS e SCADA SIMULTANEAMENTE |
| Configuração | App SolarGo | **Interface WEB — dispensa software** |
| Extras | Envia dados ao portal mesmo com inversores desligados/inexistentes | Múltiplas portas TCP/IP; USB para leitura de dados e atualização; múltiplos protocolos |
| Certificação | ANATEL | ANATEL |
| Porta RS-485 nos inversores | — | Opcional em on-grid de 3 kW; integrada de 4 a 350 kW |

---

## 8. SISTEMAS HÍBRIDOS E ARMAZENAMENTO

### 8.1 Funcionamento
**Cenário ON-GRID (com referência de rede CA) — ordem de prioridade:**
1. **Alimentar as cargas** (convencionais E prioritárias) [com energia FV, da bateria ou da rede];
2. **Carregar a bateria**;
3. Havendo ainda excedente FV: **exportar para a rede** (ou operar em grid-zero).
- Configurável: permissão/proibição de carregar a bateria pela rede; e de descarregar a bateria para a rede.

**Cenário OFF-GRID (falta de rede CA):**
- **APENAS as cargas prioritárias** (conectadas na saída CA prioritária) são alimentadas, via FV ou bateria;
- **Proteção de anti-ilhamento atua na saída on-grid convencional** (cargas convencionais ficam SEM energia);
- Usuário pode definir percentual máximo de descarga da bateria;
- **Comutação: < 10 ms** (referência geral; ver 8.4 para valores por inversor).

Compatibilidade (funcionamento): híbridos mono e trifásicos linhas ES G2, ET Plus+ e ET 15-30K; baterias LV e HV Lynx Home U e Lynx Home F Plus+. Configuração: bateria↔inversor via RS-485 (cabo 3 m fornecido, máx. 5 m); **medidor inteligente fornecido com o inversor**; backup box NÃO necessária; cargas prioritárias em circuito individual na saída prioritária; comissionamento via SolarGO.

Observações críticas: cargas prioritárias NÃO devem exceder a potência nominal do inversor e/ou potência pico FV; autonomia da bateria dimensionada pela potência pico de consumo das prioritárias × tempo esperado sem rede.

### 8.2 Modos de Operação (seleção via app SolarGO)
| Modo | Comportamento |
|---|---|
| **Geral** | Prioridade para as cargas; excedente carrega bateria ou exporta para a rede |
| **Econômico (TOU)** | Bateria carrega/descarrega em **horários determinados** (e dias da semana) — carrega fora de ponta (tarifa barata), descarrega na ponta/intermediário (tarifa cara) |
| **Peak-shaving** | Bateria entra em ação **apenas quando necessário para evitar ultrapassagem da DEMANDA CONTRATADA**; disponível para mono e trifásicos |
| **Back-up** | Bateria descarrega **somente quando houver falta de rede CA** |
| (Off-grid) | Modo adicional para cenários 100% off-grid |

**TOU × Tarifa Branca (Grupo B):** tarifa com 3 patamares em dias úteis (fora ponta < convencional; intermediário e ponta > convencional); sábados/domingos/feriados: fora ponta o dia todo. Híbridos podem armazenar na tarifa barata e descarregar na cara, indicando horários e dias.

### 8.3 Solução Híbrida Monofásica UPS — ES G2 + Baterias LV (garantia 10 anos)
**Inversor ES G2 (híbrido):**
| Modelo | Rede |
|---|---|
| GW3500L-ES-BR20 | 127 Vca |
| GW3600-ES-BR20 | 220 Vca |
| GW6000-ES-BR20 | 220 Vca |
- 2 MPPTs; 16 A Imp/MPPT; 1 entrada/MPPT; oversizing CC máx. **80%**; AFCI; chave CC + Wi-Fi; DPS CC Tipo II; baterias Lithium LV [48–60 V]; **comutação em 10 ms**; **acompanha medidor inteligente**.
- Compatível com baterias GoodWe, UCB, BYD, Dyness, Pylon, Alpha-ESS, Soluna, Sunwoda e outras [lista no site]. Certificação: híbrido INMETRO [140/2022 + 515/2023].

**Baterias (ambas: Baixa Tensão 51.2 Vcc; LiFePO4 com BMS integrado; até 150 kWh = 30× 5 kWh; garantia 10 anos; vida útil estimada 10 anos; INMETRO 140/2022 + 515/2023):**
| Item | **Lynx A G3 (LX A5.0-30)** | **Lynx U G3 (LX U5.0-30)** |
|---|---|---|
| C-rate | **1.5C → 7,5 kW** por unidade¹ | **1C → 5 kW** por unidade |
| DoD | 100% DOD [descarga] | 100% DoD [descarga] |
| Proteção | **IP20 [uso INTERNO]** | **IP65 [permite uso EXTERNO]** |
| Extras | Kit de cabos curtos [+/-] 0,1 m/25 mm² incluso | **Disjuntor CC integrado** + **dispositivo de supressão de incêndio** |
| Uso | Apenas com inversores GoodWe | Apenas com inversores GoodWe |
- ¹ Capacidade 1.5C de descarga entre SOC de 30 a 95%. Opcional kit de cabos longos [Lynx U e A G3]: 2 m +/- 35 mm², 3 m aterramento, 2 m comunicação BMS.

**Vantagem C-rate (cenário sem rede, híbrido split-phase 7,5 kW alimentando 7,5 kW de cargas prioritárias):**
- Lynx A G3 (1.5C): **1 bateria** basta (5 kWh × 1.5C = 7,5 kW);
- Lynx U G3 (1C): **2 baterias** (2 × 5 kWh × 1C = 10 kW);
- Bateria convencional (0.5C): **3 baterias** (3 × 5 kWh × 0.5C = 7,5 kW).

### 8.4 Paralelismo Híbrido Monofásico LV (ES G2 apenas)
- Daisy chain **RS-485** entre inversores; mestre usa módulo especial **Ezlink** (conecta ao roteador por Wi-Fi); **máximo 3 inversores por fase**; **até 30 baterias por sistema**; comissionamento SolarGO.
- **Módulo Ezlink é OPCIONAL de compra: deve ser ADICIONADO AO PEDIDO.**
- **Linha BCB (busbar GoodWe) opcional:** barramentos para associação de múltiplas baterias em paralelo (6, 12 ou 15 Lynx A G3; 15 Lynx U G3); adicionada na compra.
- Exemplo do slide: 3× GW6000-ES-20 = **18 kW**; 1× medidor GM1000 [fornecido com o inversor]; 30× Lynx A G3 = **153,6 kWh**; 1× Smartlogger EzLink.
- Certificações: GW3600/6000/3500L-ES-BR20 híbridos INMETRO 140/2022; bateria: INMETRO compulsório para lítio a partir de 2024; Ezlink: ANATEL.

### 8.5 Solução Híbrida Bifásica [Split-Phase] UPS — ES-LD (garantia 10 anos)
| Modelo | Rede |
|---|---|
| GW5K-ES-LD-G10 | 127/220 Vca |
| GW7.5K-ES-LD-G10* | 127/220 Vca |
| GW10K-ES-LD-G10* | 127/220 Vca |
- 2 MPPTs; 20/40* A Imp/MPPT; 1/2* entrada(s)/MPPT; oversizing CC máx. **100%**; AFCI; chave CC + Wi-Fi + DPS CC Tipo II integrados; **entrada para GERADOR DIESEL ou inversor on-grid (porta GEN)**; baterias Lithium LV [48–60 V]; **COMUTAÇÃO EM 4 ms**; compatível com Lynx U G3 e Lynx A G3 (e BAT 14 kWh); transmissor RSD opcional; medidor inteligente fornecido com o inversor; backup box não necessária.
- *Bifásico 7,5 kW: 2 MPPTs — um com 2 entradas [20 A Imp cada] e outro com 1 entrada.

**ES-LS/ES-LD — Compatibilidade de rede:** Monofásico 220 Vca ou 127 Vca* | Bifásico [120º] 127/220 Vca — **compatibilidade NATIVA com o padrão brasileiro de distribuição bifásico 127/220 Vac, 120º de defasagem** | Split-Phase [180º] 120/240 Vca. *Operando como monofásico 127 Vac, a potência disponível = **50% da nominal**.

### 8.6 Comutação UPS por inversor (memorizar!)
| Inversor | Tempo de comutação |
|---|---|
| **ES G2** (monofásico) | **10 ms** [UPS, sem desligamento das cargas] |
| **ES-LD** (bifásico/split-phase) | **4 ms** |

### 8.7 Aplicações dos híbridos
**Back-up:** com rede → saída on-grid alimenta convencionais + prioritárias; na falta → anti-ilhamento derruba a saída on-grid, e SÓ a saída de back-up (prioritárias) segue via FV/bateria.
**Retrofit:** híbrido em paralelo com FV on-grid EXISTENTE, **independente de marca** [string, micro etc.] ou até SEM inversor; **não precisa usar os módulos FV no híbrido**; medidor inteligente + **2 TCs** (TC#1: fluxo exportado à rede; TC#2: geração do on-grid); pode carregar a bateria com energia do on-grid; na falta de rede o on-grid desconecta e o híbrido segue alimentando as prioritárias.
**Aproveitamento do oversizing:** no on-grid comum, energia acima da potência nominal CA é DESPERDIÇADA no pico; nos híbridos GoodWe, o excedente FV **carrega a bateria** (ex.: 10 kWp módulos, 6 kW saída nominal → 4 kW excedentes → bateria; cargas prioritárias 3 kVA).
**Backup SEM bateria:** híbrido aciona a saída de backup mesmo sem bateria acoplada, **mediante disponibilidade de energia solar**; cliente investe menos agora e tende a adquirir bateria depois.
**Microrredes (porta GEN — ES-LD):** o ES-LD atua como **formador de rede** na porta GEN — referência de tensão para manter funcionando outro inversor on-grid OU um gerador a diesel em cenários off-grid/backup; ideal para expansão e maximização do autoconsumo.
**Recarga inteligente de VE:** com as estações de recarga GoodWe, o inversor controla a recarga em modos diferentes — ex.: carregar o carro SOMENTE com energia FV ou baterias (carregadas pelo FV); vantagem: autonomia da rede, menos encargos, **maior autoconsumo de solar**.

### 8.8 Por que vender armazenamento (argumentário)
Backup para cargas essenciais; maior economia (excedente solar consumido à noite); gestão inteligente (monitoramento em tempo real, controle automático geração×bateria×cargas×rede); maior aproveitamento do solar (autoconsumo, menos desperdício); preparado para o futuro (tarifas horárias, mudanças regulatórias, menos dependência de reajustes); segurança e sustentabilidade. Soluções ideais: residências, pequenos comércios, escritórios, consultórios, áreas rurais de pequeno porte. **Mensagem-chave:** sistemas de armazenamento residencial oferecem energia mesmo durante interrupções, aumentam o aproveitamento FV e proporcionam economia, autonomia e tranquilidade. "Proteja seu investimento: a tarifa só aumenta ao longo do tempo."

**Prospecção Back-up — Residencial:** computadores/TVs; geladeira; roteador Wi-Fi; CFTV; interfone; portão elétrico.
**Prospecção Back-up — C&I:** sorveterias (refrigeração); data centers; postos de saúde; psicultura (perda de produção); clínicas veterinárias; mercados (caixa, iluminação); laticínios; espaços de eventos; escritórios/comércios/consultórios; estúdios de gravação (podcast, rádios).

---

## 9. ORÇAMENTO E DIMENSIONAMENTO DE ARMAZENAMENTO

### 9.1 As 7 informações para orçamento (levantadas JUNTO AO CLIENTE)
1. Definição das **cargas críticas** com o cliente final;
2. Anotar/pesquisar o **consumo em Watts (W)** de cada carga;
3. Questionar o **tempo de autonomia** para cada carga;
4. Verificar existência de **motores ou cargas indutivas**;
5. Verificar quais cargas serão acionadas **simultaneamente**;
6. Confirmar a **tensão de operação** da residência;
7. Verificar a **situação do quadro elétrico** (necessidade de adequação para o híbrido?).
> Potência nominal do inversor/baterias NÃO é dado do cliente — é dado de DATASHEET (resultado do dimensionamento).

### 9.2 As 5 premissas do dimensionamento
1. **Potência total e SIMULTANEIDADE das cargas prioritárias**;
2. **Respeitar o limite de potência do INVERSOR**;
3. **Respeitar o limite de potência da BATERIA**;
4. **Tempo de autonomia e consumo das cargas prioritárias**;
5. **Respeitar a energia utilizável e o DoD da bateria**.

### 9.3 Estudo de caso — Aquicultura (exemplo prático completo)
Produtor de camarão com quedas frequentes de energia; poucas horas sem oxigenação = mortalidade total do plantel. Autonomia desejada: **5 horas**.

**Levantamento (2022 W):** Motor 1 CV soft-starter 736 W; 15× lâmpada LED = 150 W; controle/monitoramento 200 W; CFTV 100 W; 2× aeradores chafariz (1/2 CV) = 736 W; alimentação 100 W.

**Premissa 1 — Potência de projeto:** cargas indutivas com FP 0,8 → Pcargas = W/FP → 2390 W. Perdas de 20%:
`P_projeto = P_cargas + [P_cargas × Perdas] = 2390 + (2390 × 0,20) = 2868 W ≈ 2,87 kW`
Medidor inteligente (Home Kit) identificou potência máxima REAL = **2,29 kW** (cargas não simultâneas) → **simultaneidade = 2,29 ÷ 2,87 = 80%**.

**Premissa 2 — Inversor:** ES G2 (GW3600-ES-BR20) — potência máxima da saída de back-up = **3,68 kW** (máximo instantâneo, evita sobrecarga). 2,29 kW < 3,68 kW → atende. ✔

**Premissa 3 — Bateria:** Lynx U G3 — potência máxima contínua de carga/descarga = **4,95 kW** por unidade > 2,29 kW → 1 bateria atende a POTÊNCIA. ✔

**Premissa 4 — Energia:** potência × 5 h + **20% de perdas** por carga → **energia útil total = 12,13 kWh** (tabela: motor 4,416 + LED 0,900 + controle 1,200 + CFTV 0,600 + aeradores 4,416 + alimentação 0,600).

**Premissa 5 — DoD:** Lynx U G3 — energia nominal 5,12 kWh; energia utilizável 5 kWh; **DoD recomendado 90%** → 4,5 kWh útil por bateria. Demanda 12,13 kWh → **3× Lynx U G3 em paralelo = 15 kWh [100% DoD] ≈ 5,5 h de autonomia a 90% de DoD**. ✔

### 9.4 Conceitos-chave
- **DoD [Depth of Discharge]:** porcentagem MÁXIMA que a bateria pode ser DESCARREGADA [energia utilizável]; não se descarrega 100% para preservar as características físico-químicas. Lynx U G3: 90% recomendado.
- **C-rate:** taxa de POTÊNCIA de descarga (kW = kWh × C). NÃO confundir com DoD.
- **Simultaneidade:** razão entre potência máxima REAL medida e potência de projeto calculada.

### 9.5 Estudos de caso complementares
| Caso | Cargas | Inversor | Bateria | Autonomia | Observações |
|---|---|---|---|---|---|
| **Residencial** | 2000 W (iluminação 500, internet 50, TV 200, videogame 300, tomadas 700, portão 250) | GW6000-ES-BR20 | 1× Lynx Home U — 5,4 kWh | 2,5 h | — |
| **Mercado** | 1560 W (5 PCs 1250, TV 150, 10 lâmpadas 100, balança 50, CFTV 100) | GW36000-ES-BR20 [sic no slide] | 2× Lynx Home U — 10,8 kWh | 4 h | **Simultaneidade 60%** e **perdas gerais 10%** |
| **Confecção (RETROFIT)** | 1800 W (8 máquinas de costura 1200, TV 200, 20 luminárias LED 400) | GW6000-ES-20 | 2× Lynx Home U (LX U5.4-L) — 10,8 kWh | 6 h | Retrofit de FV on-grid existente p/ backup |

### 9.6 Ferramenta de Dimensionamento
**Planilha GRATUITA** de dimensionamento de sistemas de armazenamento **disponível para parceiros**: entradas (tipo de rede, simultaneidade %, perdas %, DoD %, dias de operação do backup, autonomia desejada, lista de cargas) → resultados (potência FV mínima, potência total/pico do sistema, autonomia máxima, capacidade de armazenamento, quantidade de inversores e baterias).

---

## 10. RSD 2.0 — DISPOSITIVO DE DESLIGAMENTO RÁPIDO [RAPID SHUTDOWN]

### 10.1 O que é
Dispositivo de segurança que **reduz a tensão dos módulos FV para ≤ 80 Vcc**, permitindo atuação segura de equipes de emergência em caso de incêndio ou manutenção. Segurança para instaladores, usuários e equipes de emergência (bombeiros).

**Objetivo:** reduzir a tensão dos módulos FV para um nível seguro (≤ 80 Vcc) ANTES da atuação das equipes de emergência.
> RSD ≠ AFCI. RSD reduz TENSÃO em emergência; AFCI detecta ARCOS elétricos. Dispositivos distintos.

### 10.2 Como funciona
- Sinal **PLC constante** via cabos CC da string entre transmissor (integrado ou externo) e receptores (1 por módulo ou 1 para 2 módulos);
- Na **interrupção do sinal por 5 a 7 segundos**, os receptores desconectam os módulos FV **individualmente** e automaticamente;
- Desconexão também de forma manual (chave de desligamento rápido) ou pelo desligamento da alimentação CA.

### 10.3 NBR 17193:2025
O desligamento rápido deve operar por **ÚNICA AÇÃO DE COMANDO**, realizada por:
- Atuação MANUAL por interruptor de emergência prontamente acessível ("chave de desligamento rápido"); **OU**
- Atuação AUTOMÁTICA no desligamento do circuito CA geral da edificação.
> "A GoodWe atende aos requisitos da NBR 17193:2025 por meio da solução RSD 2.0."

### 10.4 Transmissores
| Modelo | Alimentação CA |
|---|---|
| **GTP-F2L-20** | 84 ~ 264 Vca |
| **GTP-F2M-20** | 180 ~ 550 Vca |
- **2 núcleos de 150 A cada [total 300 A]**; em média até **20 strings [10 por núcleo]**; tensão CC máx. das strings: **1500 Vcc**; **IP65**; comunicação PLC com receptores; protocolo SunSpec; dimensões 253×328×179 mm; **garantia 10 anos**.
- Instalação: alimentação em F+N ou F+F conforme faixa do modelo; comprimento máx. da string: **500 m**; respeitar corrente máx. por núcleo e ajustar nº de strings com cabos > 6 mm².

### 10.5 Receptores
| Modelo | Entradas |
|---|---|
| **GR-B1F-20** | 1 módulo |
| **GR-B2F-20** | Até 2 módulos (pode usar com 1) |
- Faixa de tensão CC por módulo: **8 ~ 80 Vcc**; **22 A Imax por módulo [Imp]**; string até 1500 Vcc; **IP68**; PLC com transmissor; SunSpec; atuação automática ou manual [botão de emergência]; **garantia 25 anos**; conectores CC customizáveis (MC4 padrão); cabos de entrada 0,2 m ou 1,2 m; possível COMBINAR GR-B1F-20 e GR-B2F-20 na mesma string.
- **Confiabilidade:** falha de um receptor → entra em modo **by-pass**, mantendo a string operando e minimizando perdas.
- Compatibilidade: transmissores GoodWe com todos os receptores GoodWe; dispositivos de terceiros com protocolo SunSpec.

### 10.6 RSD interno (DNS G4 e MS G4) — vantagem
Transmissor RSD **interno ao inversor [opcional]**: dispensa transmissor externo e reduz tempo de instalação.
Exemplo: DNS/MS G4 + receptores GR-B2F-20 (2 módulos) — 3 strings × 10 módulos 585 W [14 A Imp]: **GW10K-MS-30 ×1, módulos 585 W ×30, receptor GR-B1F-20 ×15, transmissor GTP-F2L-20 ~~×1~~ (RISCADO — desnecessário)**.

### 10.7 Aplicações com transmissor externo
| Projeto | Inversor | Strings | Receptores | Transmissor |
|---|---|---|---|---|
| Residencial/comercial | GW10K-MS-G40 monofásico | 3× 10 módulos 585 W [~14 A] | GR-B1F-20 ×**30** (1/módulo) | GTP-F2L-20 ×1 (**1 núcleo usado, até 150 A** em strings) |
| C&I | GW75K-SMT trifásico 380 V | 12× 18 módulos 585 W [~14 A] | GR-B2F-20 ×**108** (216 módulos ÷ 2) | GTP-F2M-20 ×1 (**2 núcleos, até 300 A**) |
- Chave/botão de emergência: opcional* nos dois arranjos.

---

## 11. CARREGADORES VEICULARES RESIDENCIAIS — LINHA HCA GERAÇÃO 2

| Modelo | Rede | Corrente |
|---|---|---|
| **GW7K-HCA-20** | Monofásico 220 Vac | 32 A |
| **GW11K-HCA-20** | Trifásico 380 Vac | 16 A |
| **GW22K-HCA-20** | Trifásico 380 Vac | 32 A |

- RFID [2 cartões inclusos, suporta até 10]; DPS CA Tipo II integrado; carga individual por fase [switch automático]; RS-485 + LAN + Wi-Fi + Bluetooth integrados; pedestal opcional; **IP66**; cabo de carregamento de **6 m incluso**; conector **IEC 62196-2 Tipo II [Mennekes]** (padrão europeu).
- Certificações: **IEC 61851-1, IEC 62955; ANATEL. NÃO requer INMETRO.**
- Protocolo de comunicação GoodWe; **protocolo OCPP NÃO suportado**.
- Instalação: parede ou pedestal; conexão direta ao quadro CA local; **DR Tipo A opcional [30 mA, externo]**; comissionamento SolarGO; monitoramento integrado no SEMS.
- **Garantia: 2 anos.**

---

## 12. CONTATOS / CANAIS
- LinkedIn: **@goodwebr** | YouTube: **@GoodWeSolarAcademy** | E-mail: **goodweplus.br@goodwe.com**

---

## 13. QUADROS-RESUMO PARA MEMORIZAÇÃO RÁPIDA

### 13.1 Graus de proteção (IP) no material
| Equipamento | IP |
|---|---|
| Microinversor MIS | **IP67** |
| Inversores Linha Monofásica (XS/DNS/MS) | **IP66** |
| Inversores Linha Trifásica (equipamento) | **IP66** |
| Ventoinhas industriais da Linha Trifásica | **IP68** |
| Carregador HCA | **IP66** |
| Bateria Lynx A G3 | **IP20** (interno) |
| Bateria Lynx U G3 | **IP65** (externo) |
| SEC3000/3000C | **IP65** (externo) |
| Transmissor RSD (GTP) | **IP65** |
| Receptor RSD (GR) | **IP68** |

### 13.2 Garantias
| Produto | Garantia |
|---|---|
| Microinversor MIS | 12 anos |
| Inversores string mono e trifásicos | 10 anos |
| Híbridos ES G2 / ES-LD | 10 anos |
| Baterias Lynx A/U G3 | 10 anos (vida útil estimada 10 anos) |
| Transmissor RSD | 10 anos |
| Receptor RSD | 25 anos |
| Carregador HCA | 2 anos |

### 13.3 Tensões CC máximas
| Linha | Vcc máx. |
|---|---|
| MIS | 65 V |
| Mono XS/DNS/MS | 600 V |
| Trifásicos LV (SDT/GT) | 800 V |
| LV-SMT G2 | 900 V |
| Trifásicos 380 V (todas) | 1100 V |
| Strings RSD 2.0 | 1500 V |

### 13.4 Números fáceis de confundir
| Grandeza | Valor | Pertence a |
|---|---|---|
| 10 micros | por Ezlogger 3000R | MIS Grid Zero |
| 10 inversores | Ezlink3000 + GM330 | Paralelo G4 e GT150K+EzLink |
| 60 inversores | SEC3000 (só on-grid) / GT150K + EzLogger3000C | C&I |
| 70 inversores | SEC3000C (60 on-grid + 10 híbridos) | C&I |
| 100 inversores | Ezlogger 3000C (20/porta COM) | Monitoramento RS-485 |
| 1000 m | RS-485 Ezlogger 3000C ↔ inversores | Monitoramento |
| 100 m | Ezlogger 3000C ↔ roteador | Monitoramento |
| 30 m | Ezlogger 3000R ↔ medidor | MIS |
| 500 m | Comprimento máx. de string | RSD 2.0 |
| 3 inversores/fase; 30 baterias | Paralelismo ES G2 | Híbridos |

---

## 14. TABELA DE PEGADINHAS RECORRENTES

| # | Pegadinha | Como não errar |
|---|---|---|
| 1 | **IP65 × IP66 × IP67 × IP68** | Inversores (mono e tri) = IP66; MIS = IP67; ventoinhas tri e receptor RSD = IP68; Lynx U, SEC3000 e transmissor RSD = IP65; Lynx A = IP20 |
| 2 | **10 ms × 4 ms** | ES G2 = 10 ms; **ES-LD = 4 ms** |
| 3 | **1.5C × 1C × 0.5C** | Lynx **A** G3 = 1.5C (7,5 kW); Lynx **U** G3 = 1C (5 kW); convencional = 0.5C |
| 4 | **TCs inclusos?** | GMK110 ✔; GMK330 ✔; **GM330 ✘; SEC1000 ✘; SEC3000/C ✘** |
| 5 | **60 × 70 × 100 inversores** | SEC3000 = 60 (só on-grid); SEC3000C = 70 (60+10 híbridos); Ezlogger 3000C = 100 |
| 6 | **Ezlogger 3000R × 3000C** | R = micros/Wi-Fi/10 unid./sem estação climática; C = RS-485/100 unid./1000 m/estação + SCADA/interface WEB |
| 7 | **RSD × AFCI** | RSD = reduz TENSÃO (≤ 80 Vcc, emergência); AFCI = detecta ARCO elétrico |
| 8 | **TOU × Peak-shaving × Back-up** | TOU = HORÁRIOS/tarifa; Peak-shaving = DEMANDA CONTRATADA; Back-up = só na FALTA de rede |
| 9 | **Dado do cliente × dado de datasheet** | Cliente: cargas, Watts, autonomia, indutivas, simultaneidade, tensão, quadro. Datasheet: potência do inversor, potência/energia/DoD da bateria |
| 10 | **Carrega/descarrega — sentido no TOU** | Carrega FORA de ponta (barato) → descarrega NA ponta (caro). Nunca o inverso |
| 11 | **Medidor integrado × fornecido** | Integrado ao inversor: MS/DNS G4 (on-grid). Híbridos ES G2/ES-LD: medidor EXTERNO fornecido junto |
| 12 | **Wi-Fi Mesh** | Exclusivo dos MICROS. Paralelismo string/híbrido = RS-485 cabeado |
| 13 | **DoD × C-rate** | DoD = % de ENERGIA descarregável; C-rate = POTÊNCIA de descarga |
| 14 | **Ezlink substitui medidor?** | NUNCA. Ezlink = comunicação/coordenação; GM = medição no ponto de conexão |
| 15 | **AFCI no MIS** | O MIS DISPENSA AFCI (baixa tensão/corrente, Portaria INMETRO 515/2023) — não é que "possui AFCI" |
| 16 | **Oversizing por linha** | Mono XS/DNS/MS = 100%; ES G2 = 80%; ES-LD = 100%; GT 150K = 150%; tri 380 V = 50–80% conforme família |
| 17 | **OCPP no carregador HCA** | **NÃO suportado** (protocolo GoodWe); HCA não requer INMETRO (IEC + ANATEL) |
| 18 | **127 Vac no ES-LD/LS** | Operando monofásico em 127 Vac → potência disponível = **50% da nominal** |
| 19 | **Shadow Scan padrão de fábrica** | Vem **DESATIVADA**; ativar via display/SolarGO; exceto ETC/BTC |
| 20 | **"Todas as linhas até 125 kW"** | Shadow Scan: sim, EXCETO ETC/BTC. AFCI obrigatório: dez/2024 (mono) e mai/2025 até 75 kW (tri) |

---
*Fim da base de conhecimento — GoodWe Plus Módulo 1.*
