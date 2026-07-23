---
titulo: "GoodWe Plus — Módulo 3: Instalação, Comissionamento, Manutenção e Garantia"
fonte: "GoodWe Technologies Co., Ltd. — Programa GoodWe Plus, Módulo 3 (material de treinamento)"
tipo: "Base de conhecimento técnico consolidada"
finalidade: "Treinamento de I.A. / estudo para avaliação / insumo editorial para artigo técnico"
escopo: "Inversores string on-grid, microinversores linha MIS, inversores híbridos, medidor inteligente, SEMS+/SolarGo"
mercado: "Brasil (BT/MT — micro e minigeração distribuída)"
elaborado_por: "EcoSunPower Energia Solar LTDA — Junior Rodrigues (CFT 9894045-7153)"
versao: "1.0"
data_consolidacao: "2026-07-22"
observacao: "Conteúdo técnico reescrito e reorganizado a partir do material de treinamento. Itens marcados com [FORA DO MATERIAL] não constam no PDF do Módulo 3 e precisam de confirmação em fonte oficial antes de uso."
---

# GoodWe Plus — Módulo 3

## Instalação, Comissionamento, Manutenção e Garantia de Sistemas Fotovoltaicos

> **Tese central do módulo:** a maior parte das falhas de campo em sistemas fotovoltaicos não vem do equipamento, e sim da **execução**. Conector mal crimpado, torque não conferido, entrada CC sem tampa, quadro sem ventilação e comissionamento não documentado respondem por uma fração desproporcional dos chamados de garantia. O módulo é, na prática, um manual de disciplina de instalação ancorado em normas ABNT.

---

# ÍNDICE

1. [Referências Normativas](#1-referências-normativas)
2. [Requisitos de Projeto — NBR 16690](#2-requisitos-de-projeto--nbr-16690)
3. [Logística, Armazenamento e Requisitos de Instalação](#3-logística-armazenamento-e-requisitos-de-instalação)
4. [Lado CC — Cabos, Conectores e Falhas de Isolação](#4-lado-cc--cabos-conectores-e-falhas-de-isolação)
5. [Lado CA — Conexão, Torque, Quadros e Ventilação](#5-lado-ca--conexão-torque-quadros-e-ventilação)
6. [Comissionamento — NBR 16274](#6-comissionamento--nbr-16274)
7. [Conexão à Rede e Parametrização (Safety Code)](#7-conexão-à-rede-e-parametrização-safety-code)
8. [Microinversores — Linha MIS](#8-microinversores--linha-mis)
9. [Inversores Híbridos — Instalação e Comissionamento](#9-inversores-híbridos--instalação-e-comissionamento)
10. [Boas Práticas e Manutenção Preventiva](#10-boas-práticas-e-manutenção-preventiva)
11. [Garantia, Data de Fabricação e RMA](#11-garantia-data-de-fabricação-e-rma)
12. [Monitoramento — SolarGo × SEMS+](#12-monitoramento--solargo--sems)
15. [Tabela-Resumo de Números Críticos](#15-tabela-resumo-de-números-críticos)

---

# 1. REFERÊNCIAS NORMATIVAS

O módulo estabelece sete normas como base técnica obrigatória para instalação e comissionamento de sistemas fotovoltaicos no Brasil.

| Norma | Título / Objeto | Aplicação prática no projeto FV |
|---|---|---|
| **ABNT NBR 16690** | Instalações elétricas de arranjos fotovoltaicos — Requisitos de projeto | Norma-mãe do lado CC. Baseada na IEC/TS 62548 Ed. 1.0. Publicada em 03/10/2019, 1ª edição, 65 páginas, Comitê ABNT/CB-003 Eletricidade. Define condutores, proteção, manobra e aterramento do arranjo |
| **ABNT NBR 5410** | Instalações elétricas de baixa tensão | 2ª edição de 30/09/2004, válida a partir de 31/03/2005, versão corrigida 17/03/2008, 209 páginas. Base para DPS, eletrodo/condutor de aterramento, condutor de proteção e ensaios de isolamento CA |
| **ABNT NBR 5419** | Proteção contra descargas atmosféricas (SPDA) | Exige que todos os condutores de potência e sinal sejam ligados direta ou indiretamente à equipotencialização; condutores vivos só se conectam via DPS |
| **ABNT NBR 6123** | Forças devidas ao vento em edificações | Dimensionamento estrutural das fixações, trilhos e mesas do arranjo |
| **ABNT NBR 16274** | Sistemas FV conectados à rede — Requisitos mínimos para documentação, ensaios de comissionamento, inspeção e avaliação de desempenho | 1ª edição de 06/03/2014, válida a partir de 06/04/2014, 52 páginas. Torna a **inspeção e o relatório de comissionamento obrigatórios** |
| **ABNT NBR 16612** | Cabos de potência para sistemas fotovoltaicos, não halogenados, isolados, com cobertura, para tensão de até 1,8 kV CC entre condutores — Requisitos de desempenho | Define o que é, de fato, "cabo solar". Veda o uso de cabo de instalação predial no lado CC |
| **ABNT NBR IEC 60529** | Graus de proteção providos por invólucros (Códigos IP) | Especificação de string box, quadros, caixas de junção e do próprio invólucro do inversor |

> ⚠️ **Pegadinha recorrente de prova:** a **NBR 14039 (instalações elétricas de média tensão)** *não* faz parte da lista de referências deste módulo. Ela é norma real e relevante em usinas de MT, mas não está entre as sete citadas.

### 1.1 Como usar cada norma na prática

- **NBR 16690** → responde "como projeto o lado CC".
- **NBR 5410** → responde "como aterro, protejo e ensaio a instalação".
- **NBR 16274** → responde "o que preciso medir, registrar e entregar".
- **NBR 5419** → responde "como equipotencializo e onde entra o DPS".
- **NBR 16612** → responde "qual cabo posso comprar".
- **NBR 6123** → responde "a estrutura aguenta o vento do local".
- **NBR IEC 60529** → responde "qual grau de proteção do invólucro".

---

# 2. REQUISITOS DE PROJETO — NBR 16690

A NBR 16690 organiza os requisitos de projeto do arranjo fotovoltaico em quatro frentes:

1. **Condutores**
2. **Dispositivo de proteção elétrica**
3. **Dispositivo de manobra (seccionamento)**
4. **Aterramento e equipotencialização do arranjo fotovoltaico**

## 2.1 Segregação entre linhas CC e CA

**Regra:** deve ser providenciada segregação entre linhas em corrente contínua e em corrente alternada, obedecendo aos **mesmos requisitos da segregação aplicada a diferentes níveis de tensão**.

**Identificação:** os diferentes tipos de circuito devem ser **claramente identificados** — por etiquetas ou por condutores de cores distintas.

**Por que isso importa (argumento técnico para artigo):**
- Falha de isolação em um cabo CC dentro do mesmo eletroduto de um circuito CA pode gerar caminho de falta cruzado.
- Corrente contínua não tem passagem por zero: um arco CC não se autoextingue como o CA, tornando o contato acidental muito mais destrutivo.
- Manutenção futura: um técnico que abre um eletroduto misto sem identificação tem alta chance de manobra errada.

## 2.2 DPS — Dispositivos de Proteção contra Surtos

| Requisito | Especificação |
|---|---|
| Norma de referência | ABNT NBR 5410:2004 |
| Função | Detectar e desviar sobretensões transitórias na rede elétrica |
| Lados protegidos | **CA e CC** |
| **Distância máxima ao inversor** | **10 metros** (não pode estar a mais de 10 m) |
| Proteção no lado CC | DPS deve proteger **os dois polos** do sistema |
| Base da exigência CC | NBR 5419 — todos os condutores de potência e sinal ligados direta ou indiretamente à equipotencialização; condutores vivos conectados **somente através de DPS** |

> 🔑 **Ponto de prova:** a resposta correta combina *sempre* as duas condições — **até 10 m** E **ambos os lados (CA e CC)**. Alternativas que citam só um lado, ou que dispensam limite de distância, estão erradas.

**Racional dos 10 metros:** acima dessa distância, a indutância própria do condutor entre o DPS e o equipamento protegido gera queda de tensão adicional (V = L·di/dt) durante o surto, elevando a tensão residual que chega ao inversor acima do nível de proteção efetivo (Up). Na prática, o DPS "perde eficácia" com o comprimento do cabo.

## 2.3 Aterramento — eletrodo e condutores

### Eletrodo de aterramento (NBR 5410:2004, item 6.4.1.1)

São aceitos como eletrodo:

- **Armaduras metálicas do concreto das fundações**, desde que devidamente interligadas e com continuidade elétrica comprovada;
- **Fitas, barras ou cabos metálicos imersos no concreto das fundações**, especialmente previstos para essa função;
- **Malhas metálicas enterradas** cobrindo a área da edificação, podendo ser complementadas por hastes verticais ou cabos dispostos radialmente.

### Condutores de aterramento (NBR 5410:2004, item 6.4.1.2)

O condutor de aterramento precisa ser **robusto, contínuo e bem dimensionado** — é ele que garante a ligação segura entre o sistema elétrico e o solo.

### Equipotencialização

Deve ser promovida a equipotencialização de **todas as estruturas e equipamentos**: caixas de ligação, inversores, transformadores, trilhos, mesas, etc.

### Condutores de proteção (PE)

- Aplicam-se os requisitos da **NBR 5410:2004, item 6.4.3**, com exceção do 6.4.3.4.
- **Seção mínima: 6 mm² de cobre** (ou equivalente).

### Tabela de seção do condutor de proteção (NBR 5410, 6.4.3.1.3)

| Seção dos condutores de fase — S (mm²) | Seção mínima do condutor de proteção correspondente (mm²) |
|---|---|
| S ≤ 16 | **S** (mesma seção da fase) |
| 16 < S ≤ 35 | **16** |
| S > 35 | **S/2** |

**Exemplos de aplicação:**
- Fase 10 mm² → PE 10 mm²
- Fase 25 mm² → PE 16 mm²
- Fase 70 mm² → PE 35 mm²
- Fase 6 mm² → PE 6 mm² (também atende o mínimo de 6 mm² do arranjo FV)

> ⚠️ Atenção à interação das duas regras: mesmo que a tabela permita seção menor, o arranjo fotovoltaico exige **piso de 6 mm²**. Fase de 2,5 mm² → PE ainda assim 6 mm² no contexto FV.

---

# 3. LOGÍSTICA, ARMAZENAMENTO E REQUISITOS DE INSTALAÇÃO

## 3.1 Condições de armazenamento

| Requisito | Detalhe |
|---|---|
| Umidade | Local **seco** |
| Insolação | Local **abrigado de luz solar direta** |
| Empilhamento | Respeitar o **empilhamento máximo** indicado |
| Embalagem | Manter o produto na **embalagem original** |
| Documentação | Respeitar as orientações do **manual** |
| Caixa | Respeitar as orientações impressas na **caixa original** |

## 3.2 Como movimentar o inversor

- Recomenda-se **mais de um operador** ou uso de ferramentas específicas (empilhadeira);
- **NÃO** segure pelos terminais da parte inferior do inversor;
- Mantenha o **equilíbrio** durante o transporte manual;
- Apoie o inversor sobre **espuma ou papelão** para evitar riscos e arranhões;
- **NÃO** deixe o inversor fora da embalagem original enquanto não estiver em uso;
- **NÃO** descarte a caixa até o fim da instalação — todos os acessórios necessários estão nela, e o descarte precoce é causa comum de perda de componentes.

## 3.3 Ambiente de instalação

| Item | Especificação |
|---|---|
| Consulta prévia | **Sempre** consultar o manual do usuário antes de iniciar |
| Ambiente | Interno **ou** externo |
| Faixa de temperatura ambiente ideal | **-30 °C a +50 °C** |
| Estrutura | O local deve suportar o **peso** do inversor |
| Ventilação | Boas condições de **ventilação e dissipação de calor** |
| Exposição | **Evitar** exposição direta a luz solar, chuva ou neve |

### 3.3.1 Instalação em local inadequado — consequências

Instalação sob o arranjo, próxima ao solo ou em local confinado provoca:

- **Operação e manutenção difíceis** (sem acesso para conferência e substituição de componentes);
- **Comprometimento da troca dos conectores CC**;
- Ambiente com **alta umidade**.

> 🔑 **Frase-chave do módulo:** **"Alta Umidade = Baixa Isolação!"**
> A umidade degrada a resistência de isolamento do sistema CC, gerando alarmes de *Isolation Fail* recorrentes — que é justamente o alarme mais visto nos logs de manutenção preventiva apresentados no módulo.

## 3.4 Distâncias mínimas de instalação

**Regra geral: SEMPRE CONSULTAR O MANUAL DO INVERSOR.** Os valores variam por modelo/porte.

### Exemplo — inversor residencial/comercial (referência do módulo)

| Direção | Distância mínima |
|---|---|
| Para cima | **300 mm** |
| Para baixo | **500 mm** |
| Para a frente | **300 mm** |
| Nos dois lados (laterais) | **200 mm** |

### Exemplo — dois inversores lado a lado (referência do módulo)

| Situação | Distância |
|---|---|
| Parede → inversor (lateral) | **1000 mm** |
| Entre dois inversores | **1200 mm** |
| Acima do inversor | **200 mm** |
| Abaixo do inversor | **500 mm** |

### Exemplo — inversores de grande porte (string utility)

| Situação | Distância |
|---|---|
| Parede → inversor | **≥ 1000 mm** |
| Entre inversores | **≥ 1000 mm** / ≥ 600 mm conforme arranjo |
| Traseira / recuo | **≥ 50 mm** e **≥ 600 mm** conforme o caso |

**Erros mostrados no material:** inversor encostado na parede lateral, cobertura improvisada mal fixada, e equipamento instalado em nicho sem espaço para dissipação.

---

# 4. LADO CC — CABOS, CONECTORES E FALHAS DE ISOLAÇÃO

## 4.1 Ferramentas para instalação fotovoltaica

| # | Ferramenta | Utilidade |
|---|---|---|
| 1 | **Decapador** | Decapar o fio sem ferir os filamentos de cobre |
| 2 | **Crimpador MC4** | Crimpar a fiação do lado CC |
| 3 | **Chave MC4** | Apertar os conectores |
| 4 | **Multímetro** | Medições em geral (polaridade, tensão de string) |

## 4.2 Cabo FV CC — especificação

| Requisito | Especificação |
|---|---|
| Tipo | Cabo **específico para aplicação fotovoltaica** (NBR 16612) |
| Seção | **4 mm² ou 6 mm²** |
| Cor — polo positivo | **FV + Vermelho** |
| Cor — polo negativo | **FV – Preto** |
| Identificação | Positivo e negativo de uma **mesma string** devem ser identificados e marcados (ex.: NB3-PV4+, NB3-PV4−) |
| Comprimento | Não deixar cabos muito curtos — prever margem para manutenção (ex.: troca de conector) |

> 🔑 **Ponto de prova:** a resposta correta exige **as duas condições simultaneamente** — cabo *específico FV* **E** seção *4 ou 6 mm²*. Alternativas com "cabo flexível residencial" ou "cabo FV independentemente da seção" estão erradas.

**Por que não usar cabo residencial (argumento para artigo):**
- Cabo FV é dimensionado para **1,8 kV CC**, resistência a UV, ozônio, intempérie e faixa térmica ampliada;
- É **não halogenado** (LSZH) — em incêndio não libera gases corrosivos/tóxicos;
- Tem cobertura dupla (isolação + cobertura) e estanhamento dos filamentos em muitas construções;
- Cabo predial exposto degrada em poucos anos sob UV, gerando exatamente as falhas de isolação que o módulo destaca.

## 4.3 Conectores CC

**Regras:**
- Utilizar os **conectores CC enviados dentro da caixa do inversor**, para evitar problemas de conexão;
- **NÃO usar conectores de marcas diferentes** — o material contrapõe explicitamente **MC4** e **Amphenol H4**.

**Motivo técnico (crítico para artigo):** conectores de fabricantes distintos, mesmo "aparentemente compatíveis", diferem em geometria de contato, pressão de mola, material de contato e sistema de vedação. O acoplamento cruzado (*cross-mating*) gera **resistência de contato elevada** → aquecimento → degradação da vedação → entrada de umidade → arco elétrico. É uma das causas clássicas de incêndio em telhado.

### 4.3.1 Checklist de conexão CC — Certo × Errado

| ✅ CORRETO | ❌ ERRADO |
|---|---|
| Uso de **multímetro** para conferir polaridade e tensão | Conector **mal apertado** |
| **Vedadores** (tampas) nas entradas não utilizadas | **Má conexão** (conector queimado/carbonizado) |
| Crimpagem correta do terminal | **Comprimento insuficiente** de cabo |
| Cabo apoiado e fixado | **Condutor quebrado** |
| Conectores suspensos e protegidos | **Crimpagem errada** |
| — | **Conectores suspensos** no solo/vegetação |

### 4.3.2 Verificações obrigatórias

- Usar multímetro para testar **polaridade** e **tensão da string**, observando:
  - a **tensão máxima CC do inversor**;
  - a **diferença de tensão entre strings** (mismatch);
- Verificar se as **entradas vazias do inversor estão vedadas** com a tampa azul, para evitar:
  - possíveis **arcos elétricos**;
  - **entrada de umidade**.

## 4.4 Roteamento de cabos CC

Erros mostrados no material:
- Cabo passando por **borda metálica sem proteção** (aresta viva corta a isolação);
- Cabos apoiados diretamente sobre **estrutura enferrujada**;
- Cabos entrando em **eletroduto/conduíte sem bucha** de proteção;
- Cabos em contato direto com **telha/laje**, com trecho arrastando.

Estes são precisamente os pontos que evoluem para falha de isolação após 1 a 3 anos de operação.

## 4.5 Falhas de isolação

O módulo apresenta o comportamento típico:
- Curva de **decaimento exponencial de tensão** em relação a +Vs / −Vs em torno da Voc;
- Ensaio de módulo com multímetro entre polo e terra revelando tensão anormal (ex.: 220,8 V);
- Medição em campo com alicate/multímetro apontando valor incompatível com o esperado (ex.: 78,5).

**Causas mais comuns:**
1. Umidade em conector ou caixa de junção;
2. Isolação ferida por aresta metálica;
3. Cabo em contato permanente com água acumulada;
4. Entrada CC do inversor sem tampa;
5. Degradação por UV de cabo não FV.

---

# 5. LADO CA — CONEXÃO, TORQUE, QUADROS E VENTILAÇÃO

## 5.1 Procedimento de instalação CA

1. **O inversor deve estar desligado nos lados CA e CC** — desligue o disjuntor CA e desconecte os terminais CC;
2. Escolha os cabos CA adequados: **3L/PE** ou **3L/N/PE**;
3. Observe sempre a **bitola máxima** que cada inversor suporta;
4. Certifique-se de **não inverter os cabos** e **respeitar a ordem das fases**;
5. Para **cabo de alumínio**, utilizar **conector bimetálico com pontas de cobre**.

> 🔑 **Ponto de prova (alumínio):** conexão direta Al→Cu forma par galvânico; com umidade, ocorre corrosão eletroquímica na junta, aumento de resistência, aquecimento e falha. O **conector bimetálico** (corpo de alumínio + pá de cobre, com barreira de difusão) elimina o contato direto entre metais dissimilares. Fita isolante não resolve nada.

## 5.2 Torques de aperto (referência do módulo)

| Elemento | Torque |
|---|---|
| Parafuso **M12** (barramento/terminal de potência) | **25 a 30 N·m** |
| Parafuso **M8** (terminal) | **7 a 9 N·m** |
| Parafusos da **tampa** (cover) | **2,5 a 3 N·m** |

**Regra de ouro:** *garantir o torque nas conexões.* Aperto "no braço" gera conexão frouxa (aquecimento por resistência de contato) ou rosca espanada (falha mecânica). Torquímetro é ferramenta de comissionamento, não luxo.

## 5.3 Conexão CA — utilizar terminais

- Utilizar **terminais** (olhal/tubular) adequados à bitola;
- Identificar as fases (L1, L2, L3, N) conforme a serigrafia do barramento;
- Para alumínio, terminal **bimetálico**.

### Conexões incorretas CA — o que o material mostra

- Terminal **carbonizado** por mau contato;
- Cabo **sem terminal**, apenas com filamentos torcidos no borne;
- Cabos **cruzando** o barramento por caminho inadequado;
- **Fita isolante** improvisando fixação/isolação;
- Isolação **derretida** ao redor do borne.

Todas essas falhas têm a mesma raiz: **resistência de contato elevada → efeito Joule → degradação progressiva**.

## 5.4 Ao fechar o inversor

| Verificação | Detalhe |
|---|---|
| Limpeza interna | **Não deixe nada dentro** do inversor (parafusos, ferramentas, resíduos) |
| Tampa | Deve ser **apertada corretamente** |
| Vedação | **Vedar a tampa CA** com material **anti-chamas** |
| Proteção mecânica | Os cabos CA devem ser **protegidos por eletrodutos** |
| Prensa-cabo | **Apertar bem** o prensa-cabo do lado CA |

> ⚠️ O módulo mostra o caso extremo de **ninho de marimbondo/vespas** formado dentro da caixa de conexão CA de um inversor mal vedado. Vedação não é acabamento — é proteção contra fauna, umidade e propagação de chama.

## 5.5 Aterramento no inversor

- O **cabo terra dentro do inversor** deve estar conectado;
- A **carcaça do inversor deve ser aterrada**, com **cabo de cobre de mesma bitola do PE interno**.

Ou seja: **dois pontos de aterramento** — o PE do circuito CA (interno) e o ponto de aterramento externo da carcaça.

## 5.6 Quadro CA

| Boa prática | Justificativa |
|---|---|
| **Usar terminal** | Contato pleno, sem filamento solto |
| **Apertar bem as conexões** | Evita resistência de contato |
| **Não deixar componentes internos muito juntos** | Gestão de **temperatura** — DPS e disjuntores dissipam calor |
| **Limpeza e manutenção em dia** | Poeira e umidade reduzem isolação e trilham superfícies |

## 5.7 String Box

Mesmas quatro regras do quadro CA: **terminal, aperto, espaçamento térmico e manutenção**.

Erros mostrados: disjuntores CC dispostos sem espaçamento, cabo decapado em excesso com filamentos expostos junto ao DPS, e conexão frouxa em borne de DPS CC.

## 5.8 Ventoinhas

- Presentes nos inversores de maior porte, geralmente em **módulo removível** lateral/inferior;
- Fixação por parafusos nas extremidades — módulo destacável para manutenção;
- **Manutenção:** limpeza periódica. O material apresenta comparativo **ANTES × DEPOIS**, com ventoinhas totalmente obstruídas por poeira e vegetação sendo recuperadas após limpeza.

**Impacto de ventoinha suja:** derating térmico → o inversor reduz potência para se proteger → perda de geração silenciosa, que só aparece em análise de PR (Performance Ratio).

---

# 6. COMISSIONAMENTO — NBR 16274

## 6.1 Obrigatoriedade

> **A inspeção e o relatório de comissionamento são OBRIGATÓRIOS para qualquer sistema fotovoltaico.**

- Base normativa: **ABNT NBR 16274** (documentação, ensaios, inspeção e avaliação de desempenho) e **ABNT NBR 5410** (ensaios de instalação BT);
- Os **ensaios de categoria II** são indicados **apenas para usinas de grande porte ou de maior complexidade**.

## 6.2 Etapas do comissionamento

| Etapa | Escopo |
|---|---|
| **1. Inspeção visual** | Aplicável a toda a instalação e seus componentes |
| **2. Testes funcionais** | Verificação dos dispositivos de proteção e seccionamento |
| **3. Testes mecânicos** | Teste de tração nos conectores MC4; torqueamento das conexões mecânicas e elétricas |
| **4. Ensaios e medições elétricas** | Medições no sistema CC, CA e aterramento para verificação de conformidade |

### 6.2.1 Inspeção visual — o que verificar

- Verificação da instalação e seus componentes **quanto ao projeto executado** (as-built × projeto);
- **Integridade** dos componentes;
- **Etiquetagem e sinalização**;
- Verificação quanto ao **manual de instruções** dos equipamentos (distâncias, posição, acessórios).

### 6.2.2 Testes funcionais e mecânicos

- Verificação do **seccionamento** e do funcionamento dos dispositivos de proteção;
- **Teste de tração** nas conexões MC4 (conector que se solta sob leve tração está mal crimpado ou mal travado);
- **Torqueamento** das conexões CA.

## 6.3 Ensaios elétricos — Polaridade, Voc e Isc

**O que fazer:**
- **Medir e registrar TODAS as strings**;
- Verificar **mismatch de tensão** entre strings de uma **mesma MPPT**;
- Selecionar corretamente o **dispositivo de curto-circuito** (risco de arco elétrico ao medir Isc);
- Se possível, comparar com **valores esperados** — porém é necessário **monitorar temperatura e irradiação** no momento da medição.

### Modelo de planilha de registro (formato do módulo)

| String | Qtd. de módulos | Polaridade | Voc (V) | Isc (A) | MPPT | Entrada |
|---|---|---|---|---|---|---|
| 1 | 16 | Ok | 751 | 9,2 | 1 | 1 |
| 2 | 16 | Ok | 752 | 9,3 | 1 | 2 |
| 3 | 17 | Ok | 798 | 9,1 | 2 | 3 |
| 4 | 17 | Ok | 802 | 9,2 | 2 | 4 |
| 5 | 17 | Ok | 799 | 9,0 | 3 | 5 |
| 6 | 17 | Ok | 801 | 9,0 | 3 | 6 |

> 💡 **Leitura do exemplo:** strings com quantidades diferentes de módulos (16 e 17) foram alocadas em **MPPTs distintas** — 16+16 na MPPT 1 e 17+17 nas MPPTs 2 e 3. Esse é exatamente o cuidado com mismatch. Misturar 16 e 17 módulos na mesma MPPT geraria perda por descasamento de tensão.

## 6.4 Ensaio de resistência de isolamento CC

| Item | Especificação |
|---|---|
| Instrumento | **Megôhmetro** ou equipamento próprio para sistemas fotovoltaicos |
| Objeto | Avaliação do isolamento dos condutores do sistema CC **para a terra** |
| Métodos | **Dois métodos de ensaio** |
| Análise | Analisar **desvio do valor médio** — e não apenas a média que a normativa exige |
| Repetição | O ensaio deve ser repetido **para cada arranjo fotovoltaico**, no mínimo. Também é possível ensaiar séries fotovoltaicas individuais, se necessário |

### Métodos

- **Método de ensaio 1:** ensaio entre o **negativo** do arranjo e a terra, seguido de ensaio entre o **positivo** e a terra (ensaios separados);
- **Método de ensaio 2:** ensaio entre a **terra** e o **curto-circuito do positivo e do negativo** do arranjo.

### Tabela 1 — Valores mínimos de resistência de isolamento

| Método | Tensão do sistema (Voc STC × 1,25) | Tensão de ensaio | Resistência de isolamento mínima |
|---|---|---|---|
| **Método 1** (ensaios separados no + e no −) | < 120 V | 250 V | **0,5 MΩ** |
| | 120 – 500 V | 500 V | **1 MΩ** |
| | > 500 V | 1 000 V | **1 MΩ** |
| **Método 2** (+ e − em curto-circuito) | < 120 V | 250 V | **0,5 MΩ** |
| | 120 – 500 V | 500 V | **1 MΩ** |
| | > 500 V | 1 000 V | **1 MΩ** |

**NOTA da norma:** ensaios separados em um cabo negativo de um arranjo isolado podem resultar em uma tensão final maior (devido à tensão de ensaio adicionada à tensão do sistema). Isso precisa ser levado em consideração durante a execução do ensaio, mas **não afeta os critérios de aprovação/reprovação**.

> ⚠️ **Segurança:** utilizar **equipamento apropriado para o curto-circuito** (chave de curto FV / caixa de teste). Curto improvisado em string energizada = arco elétrico CC.

## 6.5 Ensaio de resistência de isolamento e tensão CA

| Item | Especificação |
|---|---|
| Objetivo | Verificação da **integridade dos condutores CA** |
| Pré-condição | Condutores **desconectados do inversor e do dispositivo de proteção CA** |
| Método | Medição entre **condutores vivos, tomados dois a dois**, e entre **cada condutor e a terra** |
| Registro | **Registrar os valores obtidos** |

### Tabela 60 (NBR 5410) — Valores mínimos de resistência de isolamento

| Tensão nominal do circuito | Tensão de ensaio (V CC) | Resistência de isolamento (MΩ) |
|---|---|---|
| SELV e extrabaixa tensão funcional, quando alimentado por transformador de segurança (5.1.2.5.3.2) e atendendo 5.1.2.5.4 | **250** | **≥ 0,25** |
| Até 500 V, inclusive, exceto o caso acima | **500** | **≥ 0,5** |
| Acima de 500 V | **1 000** | **≥ 1,0** |

### Exemplo de registro (formato do módulo)

| Identificação | Vca (V) | Riso (MΩ) |
|---|---|---|
| L1-L2 | 823 | > 2000 |
| L1-L3 | 827 | > 2000 |
| L2-L3 | 824 | > 2000 |
| L1-T | 476 | > 2000 |
| L2-T | 476 | > 2000 |
| L3-T | 477 | > 2000 |

## 6.6 Resistência dos condutores de proteção (continuidade)

| Item | Especificação |
|---|---|
| Objetivo | Verificação da **continuidade e integridade** dos condutores de proteção de cada ponto da instalação |
| Corrente de ensaio | O equipamento deve injetar corrente de **200 mA** |
| Alternativa | Em último caso, utilizar o **multímetro** como alternativa |
| Critério | **Comparação com os demais resultados** — depende da distância e da seção do condutor |

### Modelo de registro (formato do módulo)

| Ponto 1 | Ponto 2 | Resistência (Ω) | Resultado |
|---|---|---|---|
| PE Externo inversor | BEP QGBT | — | Ok / Não Ok |
| PE Interno inversor | BEP QGBT | — | Ok / Não Ok |
| DPS CA | BEP QGBT | — | Ok / Não Ok |
| BEP QGBT | Haste 1 | — | Ok / Não Ok |
| Haste 1 | Haste 2 | — | Ok / Não Ok |
| Haste 2 | Haste 3 | — | Ok / Não Ok |
| Haste 3 | Haste 4 | — | Ok / Não Ok |

*Exemplo de leitura real apresentado: R = 0,74 Ω, Itest = 211 mA, STD 2,00 Ω → OK.*

**Legenda do ensaio no arranjo:**
- **E** = cabo verde | **C** = cabo azul
- Pontos de referência: (1) módulo/string FV; (2) principal referência de aterramento da planta; (3) estrutura metálica aterrada do sistema.

## 6.7 Medição de resistência da malha de aterramento

| Item | Especificação |
|---|---|
| Limitação | **Não aplicável** para malhas com grandes dimensões ou locais de difícil cravagem das estacas |
| Requisito | Necessário permanecer **fora da zona de influência** |
| Valor de referência | **Não existe valor mínimo normativo**, mas pode ser utilizado **10 Ω** como referência |

### Fórmulas (método da queda de potencial / 62%)

```
Critério = ((S2 − S1) / S) × 100 ≤ 10%

Rv = (S2 + S + S1) / 3
```

Onde:
- **d** = maior dimensão da malha de aterramento;
- **S** = posição da sonda (eletrodo de potencial);
- **S1** = posição a **−5%·d** de S;
- **S2** = posição a **+5%·d** de S;
- **Rv** = valor verdadeiro do aterramento (média das três leituras);
- **H** = eletrodo de corrente.

**Conceitos gráficos do ensaio:**
- **Zona de influência do aterramento sob medição** (próxima à malha);
- **Zona de patamar de potencial** (região válida de leitura — o "platô" da curva R × distância);
- **Zona de influência do eletrodo auxiliar de corrente** (próxima ao eletrodo H).

A medição só é válida quando a sonda está no **patamar**; leituras nas zonas de influência produzem valores falsos.

### Bornes do terrômetro

| Borne | Função |
|---|---|
| **E** | Malha de aterramento sob medição |
| **S** | Sonda / eletrodo auxiliar de potencial |
| **H** | Eletrodo auxiliar de corrente |
| **I** | Corrente de ensaio |

---

# 7. CONEXÃO À REDE E PARAMETRIZAÇÃO (SAFETY CODE)

## 7.1 Antes de conectar o sistema FV à rede

> Certifique-se de que realizou corretamente **todas as etapas do comissionamento**.

## 7.2 Sequência de energização

| Ordem | Ação |
|---|---|
| **1º** | Ligue primeiro o **lado CC** |
| **2º** | **Selecione o código de país correto** (Safety Code) |
| **3º** | Ligue o **disjuntor CA** e, em seguida, certifique-se de que o inversor se conectou à rede com sucesso após a **autoverificação** |

> 🔑 A sequência de **ligar** (CC → parametrizar → CA) é o **inverso** da sequência de **desligar** (CA → CC). Isso cai em prova com frequência.

## 7.3 Safety Code — configuração de país de segurança

Ao ligar o inversor pela primeira vez é **necessário configurá-lo** via aplicativo **SolarGo** ou **SEMS+**. Será solicitada a configuração do país de segurança. **A opção selecionada define os parâmetros de tensão e frequência de trabalho do inversor.**

### Tabela — Padrões de rede disponíveis por modelo (Brasil)

| Opção | Modelos aplicáveis | Faixa de tensão CA por fase | Observação |
|---|---|---|---|
| **Brazil / Brazil 220Vca** | XS, NS, DNS, MS, SDT, SMT, MT, GT, HT, UT, ES G2, ET | **176 – 242 V** | Para inversores **monofásicos 220 V** e **trifásicos 380 V** |
| **60Hz Default** | XS, NS, DNS, MS, SDT, SMT, MT, GT, HT, UT, ES G2, ET | **180 – 270 V** | idem |
| **Brazil LV / Brazil 127Vca** | LVDT, LVSDT, LVSMT, LVMT, LVHT, LVGT, LVES G2, LVET | **102 – 140 V** | Apenas para inversores **LV (Low Voltage)** trifásicos 220 V ou **ES G2 127 V** |
| **60Hz LV Default** | LVDT, LVSDT, LVSMT, LVMT, LVHT, LVGT, LVES G2 | **96 – 166,3 V** | idem |

### Opções de rede para o Brasil no menu do app

- Brazil **127 Vac**
- Brazil **208 Vac**
- Brazil **220 Vac**
- Brazil **230 Vac**
- Brazil **240 Vac**
- Brazil **254 Vac**
- **Brazil ONS** — para rede de distribuição/transmissão **> 69 kV**

> ✅ **Verdadeiro:** o Safety Code deve corresponder à rede elétrica local (país/tensão do ponto de instalação). Código incompatível gera desligamentos por sub/sobretensão indevidos ou, pior, operação fora dos limites de proteção exigidos pela distribuidora.

## 7.4 Parâmetros associados ao Safety Code

Ao selecionar o código, o app exibe os parâmetros correspondentes:

- **Grid Rated Voltage** (tensão nominal de rede)
- **Anti-Islanding** (ON/OFF)
- **Anti-islanding Trip Time** (ex.: < 2 s)
- **Voltage Protection Parameters:**
  - Over-voltage Stage 1 Trigger Value / Trip Time
  - UV Stage 1 Trip Value / Trip Time
  - Over-voltage Stage 2 Trigger Value / Trip Time
  - UV Stage 2 Trip Value
  - Over-voltage Stage 3 Trigger Value

## 7.5 Navegação no app SolarGo (inversores string)

**Acesso:** Lista de dispositivos → aba **WLAN** (rede `Solar-WiFiXXXXXXXX`) ou aba **Bluetooth** (`WLA-EXXXXXXXXXXXX`) → login como **Instalador** com senha **1234**.

**Caminho de parametrização:**
```
Home → Settings → Basic Settings → Grid Code (Safety Code)
```

Também disponíveis em **Basic Settings**: Time, Shadow Scan, **SPD**, Router Connection.

**Sobre o parâmetro SPD:**
- **ON** — quando o módulo de proteção contra raios estiver anormal, um alarme será disparado;
- **OFF** — quando o módulo estiver anormal, nenhum alarme será disparado.

**Menu Settings completo:** Communication Settings, Basic Settings, Advanced Settings, Load Control, Device Startup, Device Information, Change Login Password.

## 7.6 Conexão sem cabo neutro (Grid Type)

Os **inversores trifásicos**, exceto os **trifásicos híbridos**, suportam ligação à rede CA **com ou sem** conexão do cabo neutro. Por isso, também deve ser configurada a opção de rede (**Grid Type**).

**Caminho:**
```
Home → Settings → Basic Settings → Grid Connection Type
```

| Opção | Significado | Aplicação |
|---|---|---|
| **3W/PE** | Três fios + condutor de proteção (PE) | Sistemas com conexão **delta (Δ)** |
| **3W/N/PE** | Três fios + neutro (N) + condutor de proteção (PE) | Sistemas com conexão **estrela (Y)** |

> 💡 Relevante no Brasil: redes 220/127 V (estrela com neutro) x 380/220 V (estrela) x sistemas 220 V triângulo sem neutro. A parametrização errada aqui gera falha de partida ou leitura incorreta de tensão.

---

# 8. MICROINVERSORES — LINHA MIS

## 8.1 Flexibilidade — os dois diferenciais

### Quantidade ímpar de módulos
Microinversores convencionais não permitem uso com **canais vazios** ou com **quantidades ímpares** de módulos. A linha MIS traz flexibilidade para **uso com quantidade ímpar de módulos**, quando necessário.

### Upgrade fácil do sistema FV
É possível ampliar o sistema **sem a preocupação de manter o mesmo fabricante e/ou modelo de módulo**, conectando **diferentes tipos de módulos no mesmo microinversor** (exemplos do material: 200 W, 340 W, 550 W e 600 W no mesmo equipamento).

**Racional técnico:** cada entrada tem MPPT independente, então módulos de potências e curvas I-V diferentes operam cada um em seu próprio ponto de máxima potência, sem penalizar os demais. Isso é impossível em string com módulos heterogêneos em série.

## 8.2 Componentes do microinversor MIS

| # | Componente |
|---|---|
| 1 | **Antena Wi-Fi e Bluetooth** |
| 2 | **Alça** para transporte e instalação |
| 3 | **Ponto de aterramento** (carcaça) |
| 4 | **Conexão CA** |
| 5 | **Dissipador de calor** |
| 6 | **LED indicativo** |
| 7 | **Entradas CC** (dois conjuntos, um de cada lado) |

## 8.3 Acessórios — Conector Tipo II

### Inclusos na caixa do microinversor
Todos os acessórios necessários para a instalação e o **paralelismo** dos microinversores já vêm na caixa:

- Microinversor
- **Chave do conector T**
- Manuais
- **Conector T**
- **8x terminais tubulares**
- **Chave de abertura do conector T**
- **Plug de vedação**
- **Fixador estrutural**

### Opcionais (adquiridos à parte)
Para agilizar a instalação ou realizar limitação de exportação (**grid zero**):

- **Ezlogger 3000R**
- **Medidor monofásico**
- **Medidor trifásico**
- **Extensão CC**
- **Extensão CA**

## 8.4 Conectores CC

| Característica | Especificação |
|---|---|
| MPPTs | **4 MPPTs individuais** — PV1, PV2, PV3, PV4 |
| Módulos por MPPT | **1 módulo**, até **65 Vcc** |
| Entradas FV | Cabos flexíveis de **10 cm** com conectores **MC4** |
| Disposição | **Positivas nas extremidades** ("de fora") e **negativas no meio** |
| Distribuição | 2 MPPTs de cada lado (PV1/PV2 de um lado; PV3/PV4 do outro) |

> 🔑 **Regra mnemônica:** "**os positivos sempre nas entradas de fora**". Inverter isso é erro de instalação comum e gera falha imediata de polaridade.

## 8.5 Cabeamento CA

### Cabo CA

| Requisito | Especificação |
|---|---|
| Material/seção | Cabo CA de **cobre de pelo menos 6 mm²** |
| Tipo recomendado | **Cabo PP 3 vias** — previne entrada de água nos conectores CA |
| Dimensionamento | Deve considerar as **normas aplicáveis** (queda de tensão, capacidade de condução) |
| Decapagem (Tipo I) | Cabo Ø 12–13,5 mm; decapagem 8–12 mm; comprimento útil 24–30 mm; terminal 6 mm² |
| Decapagem (Tipo II) | Cabo Ø 10,8–12,9 mm; decapagem 10–14 mm; comprimento útil 32–38 mm; cobre 4–6 mm² |

### Microinversores por tronco

| Regra | Valor |
|---|---|
| Corrente máxima por tronco | **40 A** |
| Microinversores de **2 kW** por tronco CA | até **4** |
| Microinversores de **1,6 kW** por tronco CA | até **5** |

### Máximo por ramo (branch) — por modelo

| GW1600-MIS | GW1800-MIS | GW2000-MIS |
|---|---|---|
| **5** | **4** | **4** |

### Disjuntor CA — tabela por modelo e quantidade

| Modelo | 1 inversor | 2 inversores | 3 inversores | 4 inversores | 5 inversores |
|---|---|---|---|---|---|
| **GW1600-MIS** | 10 A | 25 A | 32 A | 40 A | 50 A |
| **GW1800-MIS** | 16 A | 25 A | 32 A | 40 A | — |
| **GW2000-MIS** | 16 A | 25 A | 32 A | 50 A | — |

> **Regra geral de dimensionamento:** observar o manual do usuário; por via de regra considerar **1,25 × a corrente nominal do arranjo**.

## 8.6 Conector T — Tipo I

### Conector T
- O conector T e os conectores são fornecidos na **embalagem do microinversor**;
- Prepare a fiação mantendo **1 conector T no local de cada microinversor**.

### Conector CA
1. **Crimpe** os cabos nos terminais fornecidos;
2. **Monte** os terminais dentro do conector CA;
3. **Finalize** o conector CA observando a **sequência de montagem** para prevenir entrada de água;
4. Pinagem: **N / L / PE**.

### Finalização
- No **último conector T**, instale a **tampa de vedação** fornecida.

## 8.7 Conector T — Tipo II

**Sequência de instalação:**

1. **Preparação do cabo:** decapagem conforme cotas (10–14 mm / 32–38 mm), cobre 4–6 mm², cabo Ø 10,8–12,9 mm;
2. **Abertura:** utilize a **chave inclusa** na caixa de acessórios para abrir o conector T;
3. **Conexão e fechamento:**
   - Conecte os cabos CA dentro do conector T adequadamente (L, N, PE);
   - Feche o conector T observando a **sequência de montagem dos prensa-cabos** para prevenir entrada de água;
   - Torque dos parafusos internos: **M4 → 0,7 a 0,9 N·m**;
   - No **último conector T**, instale a **borracha de vedação** fornecida.

## 8.8 Topologia de instalação (Tipo II)

```
Módulos FV ──(MC4)── Microinversor 1 ──┐
Módulos FV ──(MC4)── Microinversor 2 ──┤── Tronco CA (conectores T) ── Disjuntor CA ── Rede
Módulos FV ──(MC4)── Microinversor n ──┘
```

**Características:**
- **Plug & Play**;
- Todos os acessórios inclusos;
- Fixação diretamente na estrutura;
- **Até 4 inversores por tronco** (Tipo II);
- Conector T fornecido na caixa de acessórios, com terminais e prensa-cabos inclusos;
- Extensores CA e CC opcionais;
- 4 MPPTs, sendo 2 de cada lado.

## 8.9 Suporte e fixação

### Fixação no trilho

| Item | Especificação |
|---|---|
| Parafusos | **Cabeça de martelo**, fixados diretamente no **trilho de alumínio** da estrutura |
| Distância entre parafusos | **157 mm** |
| Torque | **M8 → 8,5 a 9,5 N·m** |
| Sequência | (1) fixar parafusos no trilho → (2) posicionar o micro sob o trilho → (3) elevar a alça até o trilho → (4) travar nos parafusos |

### Distância mínima ao telhado

| Cota | Valor |
|---|---|
| Moldura do módulo → microinversor | **16 a 30 mm** |
| Microinversor → telha | **≥ 45 mm** |

> Caso a distância entre o telhado e o microinversor seja **menor que 45 mm**, utilize os **espaçadores fornecidos** para fixação.

### Inclinação e posicionamento
- Observar a **inclinação correta** para a instalação;
- O MIS **pode ser instalado de ambos os lados** do trilho;
- Instalações com o equipamento em posição inclinada inadequada ou pendurado são **incorretas**.

### Montagem — resumo

**Local de instalação:**
- Instalar o inversor **no trilho dos módulos**;
- Caso necessário, utilizar os **espaçadores** fornecidos para manter alinhamento e distância mínima dos módulos.

**Fixação:**
- Fixar os parafusos no trilho;
- De acordo com o modelo de trilho, é possível instalação diretamente no **sulco inferior**.

**Espaçadores:** cada microinversor inclui **um par de suportes de fixação espaçadores** e **um par de parafusos e porcas** dentro da caixa de acessórios.

## 8.10 Aterramento do MIS

| Requisito | Detalhe |
|---|---|
| Pontos | Utilizar **tanto o aterramento do cabo quanto o da carcaça** |
| Equipotencialização | Assegurar que os pontos de aterramento estejam **equipotencializados em todos os microinversores** |
| Bitola | Recomenda-se **pelo menos 6 mm²** |
| Torque | **M4 → 1,6 N·m** |
| Proteção anticorrosiva | Para evitar corrosão a longo prazo, recomenda-se **aplicar tinta sobre o terminal após instalado** |

## 8.11 LED Indicador

| Status do LED | Significado |
|---|---|
| **Verde piscando lento** | Equipamento em **standby** |
| **Verde piscando rápido** | Equipamento em **checagem** |
| **Verde fixo** | **Funcionamento normal** com os **4 MPPTs operantes** |
| **Piscando verde e vermelho** | Equipamento operando com **pelo menos 1 MPPT**. A **posição de cada piscada representa o estado de cada MPPT** (ex.: 1ª piscada vermelha = MPPT 1 em falha; MPPTs 2, 3 e 4 normais) |
| **Vermelho piscando rápido** | **Falta de energia da rede** |
| **Vermelho piscando 2 vezes** | **Erro na energia da rede** |
| **Vermelho fixo** | **Falha no inversor** |
| **Verde e vermelho alternados** | **Atualizando firmware** |

**Localização:** o indicador de status fica na **parte lateral direita** do inversor.

> 💡 **Diagnóstico de campo sem app:** o padrão "verde+vermelho posicional" permite identificar *qual* MPPT falhou apenas olhando o LED — recurso raro entre microinversores.

## 8.12 Etiquetas, SN e Checkcode

O MIS conta com **3 etiquetas**:

1. **Etiqueta principal** — fixada na parte frontal. Contém o **SN (número de série)** e o **Checkcode**, ambos necessários para cadastro no **SEMS**;
2 e 3. **Duas etiquetas removíveis** — na parte lateral, para serem destacadas e coladas na **tabela de layout** (inclusa no manual), facilitando o controle da disposição dos MIS no telhado e o monitoramento posterior. O **Checkcode também pode ser obtido através do QR das etiquetas laterais**.

### Tabela de layout (mapa de telhado)

| | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 | Column 6 | Column 7 |
|---|---|---|---|---|---|---|---|
| **Row 1** | etiqueta | etiqueta | | | | | |
| **Row 2** | etiqueta | | | | | | |
| **Row 3** | etiqueta | | | | | | |
| **Row 4** | ... | | | | | | |
| **Row 5–10** | | | | | | | |

Campos do cabeçalho: *User information*, *Panel model*, *Inverter model*, *Sheet*, *N* (norte / orientação).

> 🔑 **Ponto de prova:** para cadastrar o inversor no SEMS+ são necessários **SN + Checkcode**. Não basta o Checkcode isolado, nem apenas modelo/SN.

## 8.13 Configuração via Bluetooth (SolarGo) — passo a passo MIS

| Etapa | Ação |
|---|---|
| **1] Acesso ao microinversor** | O acesso é feito por **Bluetooth**, que deve estar habilitado antes de abrir o app SolarGo. O nome do dispositivo no app será sempre **"WNN-BLE" + os últimos 8 caracteres do número de série** |
| **2] Login como instalador** | Ao selecionar o inversor, abre-se a caixa de login. Fazer login como **Instalador** com a senha **1234** |
| **3] Menu inicial (Home)** | Overview da operação: ETotal, EDay, Safety Power Grid Code, Safety Code, AC Current, AC Voltage, AC Power, AC Frequency |
| **4] Menu Settings** | Acesso às configurações. As de rede estão em **"Basic Settings"** |
| **5] Basic Settings** | Contém **Safety Code**, **Power Scheduling** (opções de exportação de energia) e **Log Export** |
| **6] Safety Code** | Ao acessar o ajuste de parâmetros de rede, quando solicitado, inserir a senha **"goodwe2010"** |
| **7] Seleção de rede** | Selecionar o **continente** (America) → abrir o **país** (Brazil) → escolher a **tensão de rede** apropriada ao local → **Save** → voltar à tela inicial |

> ⚠️ **Distinção crítica (cai em prova):**
> - **1234** = senha de **login como instalador** no SolarGo (acesso ao equipamento).
> - **goodwe2010** = senha para **alterar parâmetros de rede** (Safety Code) e para o **login de instalador nos inversores híbridos**.

---

# 9. INVERSORES HÍBRIDOS — INSTALAÇÃO E COMISSIONAMENTO

## 9.1 Procedimento de instalação — sequência

| # | Etapa | Detalhe |
|---|---|---|
| **1** | **Conexão CC das strings FV** | Com os conectores enviados na caixa do inversor e cabos de **4 ou 6 mm²** — **vermelho = positivo [+]**, **preto = negativo [−]** |
| **2** | **Conexão CC da bateria** | Utilizar os **terminais enviados junto ao inversor**. Cabos: vermelho = positivo [+], preto = negativo [−] |
| **3** | **Conexão de comunicação** | Duas entradas: a primeira é a comunicação com a **bateria (BMS)**; a segunda é a comunicação com o **medidor inteligente** |
| **4** | **Conexão CA** | Utilizar os conectores CA do inversor e cabos adequados |
| **5** | **Conexão do aterramento** | Na **carcaça** |
| **6** | **Medidor inteligente** | Instalação e conexão |

### Terminais do inversor híbrido (identificação da base)

| Terminal | Função |
|---|---|
| **BAT** | Terminal de entrada CC da bateria |
| **BMS / MEDIDOR** | Portas de comunicação |
| **COM1** | Porta de comunicação |
| **PV1 / PV2** | Terminal de entrada CC fotovoltaico |
| **Interruptor CC (DC Switch)** | Chave seccionadora CC |
| **BACK-UP** | Terminal de saída CA de backup |
| **ON-GRID** | Terminal de saída CA on-grid |

## 9.2 Conexão das baterias

| Item | Especificação |
|---|---|
| Tipo de conexão | **Borne único**, com terminal do tipo **olhal** |
| Fornecimento | O terminal é **enviado junto com o inversor** |
| Bitola de cabo | **25 a 35 mm²** (o material também indica a faixa 20 mm² a 35 mm² na imagem de cabos) |
| Proteção | O inversor possui **proteção física** instalada sobre o borne, para proteção dos usuários e do equipamento |
| Torque | **M8 → 7 a 9 N·m** |
| Polaridade | A bateria possui terminais com polaridade — é **essencial** garantir a conexão correta de positivo e negativo |

### Do lado da bateria

- As fabricantes de baterias enviam **terminais plug and play** para conexão dos cabos nas entradas;
- É **necessário utilizar disjuntor** na instalação do circuito;
- **Algumas marcas já integram o disjuntor à bateria**, para comodidade do usuário.

## 9.3 BMS — Battery Management System

**O que é:** baterias de lítio possuem um sistema de gerenciamento conhecido como **BMS (Battery Management System)**, pois são formadas por **células de íons únicas (não idênticas) e delicadas** que devem ser cuidadosamente monitoradas para **evitar sobrecarga e sobreaquecimento**.

**Função da porta BMS no inversor:**

> O sistema BMS da bateria deve ser conectado à **porta BMS do inversor**, para que este receba dados de **temperatura, carga da bateria, tensão e corrente de carga/descarga**.

| Item | Especificação |
|---|---|
| Meio físico | **Cabo LAN** entre os dois equipamentos |
| Fornecimento | Os inversores GoodWe **já possuem o cabo** para essa conexão |
| Comunicações no lado da bateria | **Duas comunicações** (uma para o inversor, outra para paralelismo/expansão) |

> 🔑 **Ponto de prova:** a porta BMS comunica **inversor ↔ bateria** — não com o medidor, não entre inversores em paralelo.

## 9.4 Medidor inteligente (Smart Meter)

| Característica | Detalhe |
|---|---|
| Fornecimento | **Fornecido junto com o inversor**, acompanha os **TCs já conectados** — **1 TC para monofásico, 3 TCs para trifásico** |
| Cabo de comunicação | Já vem **crimpado e pronto** para conexão **Plug & Play** |
| Posição do TC | Deve ser conectado o **mais próximo possível do padrão de entrada** |
| Referência de tensão | No medidor **também devem ser conectados os cabos CA**, para obter **referência de tensão** |
| Protocolo | **RS-485** entre medidor e inversor |
| Proteção | **Fusível 0,5 A** no circuito de tensão do medidor |
| Sentido do TC | Orientação **K → L**, no sentido **Casa → Rede elétrica** |

### Diagrama de fiação (topologia)

```
                                    ┌──── TC (K→L) ────┐
Rede elétrica ──── Medidor da concessionária ──── [TC] ──┬──── Cargas
                                                          │
                          Medidor GoodWe ─── RS-485 ───┐  │
                          (fusível 0,5 A)              │  │
                                                    Inversor ──── L / N
                                                       │
                                                    Bateria (Lynx U)
```

> 🔑 **Ponto de prova:** sem os cabos CA no medidor, não há referência de tensão. Os TCs medem apenas **corrente**; sem tensão de referência o medidor não determina **sentido nem magnitude do fluxo de potência** — inviabilizando autoconsumo, zero export e peak shaving.

## 9.5 Comissionamento via App SolarGo — inversores híbridos

### Etapas 1 a 3 — acesso e Safety Code

| # | Etapa | Detalhe |
|---|---|---|
| **1** | **Menu Quick Setting** | Usado para configuração rápida dos inversores de armazenamento GoodWe. É nele que são configuradas as principais funções para operação básica |
| **2** | **Senha de instalador** | Durante a alteração de configurações, o app exige login. A senha é sempre **"goodwe2010"** |
| **3** | **Escolha do Safety Code** | Selecionar o "Código de País" com as configurações da rede elétrica local |

### Opções de rede para o Brasil (híbridos)

| Opção | Aplicação |
|---|---|
| **Brazil 127Vca** | Utilizado **apenas para os inversores de 3,5 kW** em redes com tensão de 127 V |
| **Brazil 208Vca** | Locais com tensão nominal de 208 V |
| **Brazil 220Vca** | Locais com tensão nominal de 220 V |
| **Brazil 230Vca** | Locais com tensão nominal de 230 V |
| **Brazil 240Vca** | Locais com tensão nominal de 240 V |
| **Brazil 254Vca** | Locais com tensão nominal de 254 V |

**Menu Settings do híbrido:** Communication Settings, Quick Settings, Basic Settings, Advanced Settings, **Battery Function**, Port Connection, **Meter Function**, Device Information, APP Version.

### Etapas 4 a 6 — configuração da bateria

| # | Etapa | Detalhe |
|---|---|---|
| **4** | **Configuração da bateria (BAT Connect Mode)** | Selecionar se o sistema possui bateria conectada (**Connected Battery**) ou não (**Not Connected Battery**) |
| **5** | **Seleção da fabricante** | Selecionar a marca da bateria. Diversas marcas já homologadas pela GoodWe: **GoodWe, Lead-acid (chumbo-ácido), BYD B-Box, TCL, DYNESS, SUNVOLT, BYD, LG, PYLONTECH, OLOID, soluna, UZENERGY** |
| **6** | **Seleção do modelo e quantidade** | Além do modelo, selecionar a **quantidade de baterias em paralelo** |

**Exemplos de nomenclatura:**
- **LX U5.4-L\*2** → serão utilizadas **2 baterias** do modelo LX U5.4-L;
- **LX U5.4-L\*5** → serão utilizadas **5 baterias** do modelo LX U5.4-L.

Outros modelos listados no menu: SECU-A5.4L\*2 a \*6, LX U5.4-L\*1 a \*5, LX A5.0-10\*1, GW5.0-BAT-LVI-G10.

> ⚠️ **Alerta importante do material:** caso o cliente esteja utilizando **bateria de chumbo-ácido**, é necessário **contatar o suporte técnico da GoodWe**, pois é preciso um **firmware especial**.

**Lembretes do app:**
1. Se nenhum modelo de bateria disponível for encontrado, habilite a rede móvel e reinicie o APP para recuperá-los;
2. Se a seleção de bateria falhar, verifique se a versão de firmware do inversor corresponde à da bateria. Se não corresponderem, atualize o firmware do inversor.

## 9.6 Modos de operação

### Etapas 7 e 8 — Working Mode

Existem **dois modos de operação** configuráveis:

1. **Self-use Mode** (autoconsumo)
2. **Peak Shaving**

Para configurar, basta selecionar o modo e clicar na engrenagem **Set/Settings**.

Dentro do **Self-use Mode** é possível configurar **três submodos**, que podem operar **simultaneamente ou não**:

- **Backup Mode**
- **TOU Mode**
- **Delayed Charging**

### 9.6.1 Backup Mode (etapas 9 e 10)

**Quando ativar:** é necessário ativar este modo caso o sistema opere em **modo de back-up**, ou seja, quando for necessário o uso da bateria enquanto a rede da concessionária estiver **indisponível (sem energia)**.

#### Charging From Grid

Quando o Backup Mode é ativado, o app oferece a opção **Charging From Grid**:

| Item | Detalhe |
|---|---|
| **Função** | Carregar a bateria com a **energia da rede elétrica CA** |
| **Quando usar** | Quando o sistema fotovoltaico **não possui potência suficiente** para alimentar as cargas e carregar a bateria ao mesmo tempo |
| **Charging/Discharging Power (Rated Power)** | Potência destinada, **em porcentagem**, ao carregamento da bateria em relação à **potência nominal do inversor**. Faixa: 0–100% |

**Exemplo do material:** Rated Power de **25%** em um inversor de **6 kW** → o inversor carrega o banco de baterias com potência de **no máximo 1,5 kW** vinda da rede elétrica CA.

### 9.6.2 TOU Mode — Time of Use (etapas 11 e 12)

**Função:** configuração de **horários para carregamento e/ou descarregamento** da bateria. É possível adicionar **até quatro modos de trabalho** (battery working groups).

#### Parâmetros de cada modo de trabalho

| Parâmetro | Descrição |
|---|---|
| **Start Time** | Horário de início da configuração |
| **End Time** | Horário do fim da configuração |
| **Month** | Meses em que a configuração se repete |
| **Week** | Semanas/dias em que a configuração se repete |
| **Charging/Discharging Mode** | Selecionar **charging** (carregar) ou **discharging** (descarregar) |
| **Charging/Discharging Power** | Potência destinada, em % da potência nominal do inversor. Faixa: 0–100% |
| **Charge Cut-off SOC** | Porcentagem de carga da bateria em que se deseja **desligar o modo de trabalho**. Faixa: 10–100% |

> **Nota do app:** a repetição exige que **mês E semana** estejam configurados para ter efeito.

**Exemplo de Charge cut-off SOC:** configurado para o modo de carregamento com 90% → quando a carga da bateria atingir 90%, o inversor **para de carregar**.

**Aplicação no Brasil:** o TOU é a ferramenta natural para a **Tarifa Branca** e para o **posto tarifário ponta/fora-ponta** — carregar a bateria fora de ponta e descarregar na ponta.

### 9.6.3 Delayed Charging (etapas 13 e 14)

**Função:** otimizar o carregamento da bateria.

Quando o modo de carregamento inteligente é ativado, é possível configurar os **meses de operação** da função em **Smart charging month** (Monthly-Repeat).

A função permite **duas configurações distintas**, que podem ser complementares dependendo da aplicação, e definem **como deve ser a operação do fluxo de potência do inversor quando a potência FV for maior que a demanda das cargas**:

| Parâmetro | Descrição |
|---|---|
| **Peak Power Sales Limit** | Definido pela **porcentagem da potência nominal**. Quando a geração FV ultrapassar este valor, a **potência excedente será utilizada para carregamento da bateria**. A potência abaixo deste valor é consumida pelas cargas e/ou exportada para a rede. *(Restrição: o peak limit deve ser menor que o power limit. Faixa 0–100%)* |
| **PV Prioritizes Charging Battery** | **ON**: a geração FV deixa de ser vendida e passa a carregar as baterias |
| **Start Charging Time** | A partir do horário configurado, o inversor **deixa de exportar** a energia não consumida pelas cargas e a utiliza para o **carregamento do banco de baterias** |

**Exemplo 1 (do material):** fluxo de potência quando o *peak limiting power* é definido pelo usuário em função da potência nominal do inversor — tudo acima da linha de corte vai para a bateria (**Charge**), o restante alimenta cargas e exporta (**Power export**), e no fim do dia a bateria descarrega (**Discharge**).

**Exemplo 2 (do material):** fluxo de potência quando o *Switch to charge* e o *Charging time* são definidos pelo usuário — antes do horário, prioriza exportação; após o horário, prioriza carga da bateria.

> 💡 **Aplicação direta no Brasil pós-Lei 14.300:** com o Fio B sendo cobrado sobre a energia injetada, priorizar o **autoconsumo instantâneo e o armazenamento** em vez da injeção passa a ter racional econômico crescente. Delayed Charging e Peak Power Sales Limit são exatamente os parâmetros que operacionalizam isso.

### 9.6.4 Peak Shaving

Segundo modo de operação (alternativo ao Self-use), configurável pela engrenagem Settings. Destinado à **redução de demanda de ponta** — aplicação típica em unidades do Grupo A com demanda contratada.

## 9.7 Configuração das funções da bateria (etapa 15)

**Caminho:**
```
Settings → Battery Function → Limit Protection
```

Também disponíveis em Battery Function: **Parameter Settings** e **Immediate Charging**.

### Parâmetros de proteção

| Parâmetro | Descrição |
|---|---|
| **SOC Protection** | Habilita/desabilita a proteção por estado de carga |
| **SOC Upper Limit** | Limite máximo para carregamento da bateria — o sistema para de carregar quando o SOC atinge o valor definido. Deve ser **maior que o SOC Lower Limit**. Faixa 0–100% |
| **On-grid Depth of Discharge (DOD)** | Porcentagem **máxima** da energia da bateria que o sistema poderá descarregar **quando conectado à rede elétrica**. Faixa 0–100% |
| **Off-grid Depth of Discharge (DOD)** | Porcentagem **máxima** da energia da bateria que o sistema poderá descarregar **quando desconectado da rede elétrica**. Faixa 0–100% |
| **Backup SOC Holding** | **ON**: quando a rede está normal, a bateria descarrega até o nível de proteção SOC, mantendo a capacidade reservada para uso como fonte de backup durante quedas de energia. Se a energia solar for fraca ou indisponível, a rede pode ser utilizada para carregar a bateria e sustentar o SOC reservado |

### Exemplos de configuração de DOD

| Objetivo | Configuração |
|---|---|
| **Não descarregar** a bateria enquanto a rede estiver disponível | **On-grid DOD = 0%** |
| Descarregar a bateria **até 40% de sua carga** quando sem rede | **Off-grid DOD = 60%** |

> 🔑 **Lógica do DOD:** DOD é a **profundidade de descarga**, não o SOC remanescente. DOD 60% → SOC mínimo 40%. Confundir os dois é o erro clássico.

## 9.8 Teste do medidor (Meter/CT Detection)

**Caminho:**
```
Settings → Meter Function → Meter/CT Detection
```

| # | Etapa | Resultado |
|---|---|---|
| **1** | Acessar **Meter Function** | — |
| **2** | **Meter/CT Detection** | Se **Meter/CT Status: Abnormal** ❌ → "*Meter communication is abnormal, unable to test*" — o botão Start Test fica **bloqueado** |
| **3** | **Meter/CT-Assisted Test** | Se **Meter/CT Status: Normal** ✅ → **Start Test** habilitado |
| **4** | **Test Results** | Por fase (ex.: L1): **"CT meter connection correct"** ✅ ou **"CT meter connection reversed"** ❌ (TC invertido) |

### Pré-condições para o teste (Test considerations)

1. O inversor deve estar **conectado à rede** (on-grid mode);
2. A comunicação do **medidor inteligente** deve estar normal;
3. A comunicação da **bateria** deve estar normal;
4. A **bateria deve poder descarregar**;
5. **Desligar cargas instáveis** no sistema, como máquina de lavar;
6. **Desligar outros equipamentos de geração** no sistema, como inversores on-grid;
7. O processo de detecção **desligará temporariamente** o "Power Limit" do sistema;
8. Excluir outros fatores que causem instabilidade da potência on-grid.

**Clear Erroneous:** a detecção Meter/CT é apenas uma **função auxiliar**. Se for confirmado que a instalação está correta, o resultado da detecção pode ser limpo.

---

# 10. BOAS PRÁTICAS E MANUTENÇÃO PREVENTIVA

## 10.1 Regra de ouro — operação com o inversor energizado

> **NÃO faça NENHUMA operação nos conectores CC ou CA com o inversor ligado.**

**Riscos:**
- **Dano por arco elétrico**
- **Choque elétrico**

### Sequência de desligamento

| Ordem | Ação |
|---|---|
| **1º** | Desligar o **lado CA** |
| **2º** | Desligar o **lado CC** |
| **3º** | **Aguardar pelo menos 5 minutos** antes de qualquer operação |
| **4º** | Ter cuidado com qualquer choque elétrico (capacitores podem reter carga) |

**Consequência prática mostrada no material:** chave seccionadora CC totalmente destruída/derretida por arco elétrico após manobra indevida sob carga.

> 🔑 **Nemônica:** *Liga do CC pro CA; desliga do CA pro CC.* Ou: **"CC primeiro pra ligar, CC por último pra desligar."**

## 10.2 Corrente circulante em strings paralelizadas

**Fenômeno:** existem modelos de inversores nos quais as **strings são paralelizadas ANTES da chave CC**. Nesses casos, havendo **mismatch de tensão**, poderá ocorrer **corrente circulante entre as strings mesmo com a chave CC desligada**.

**Regra de segurança:**

> **Sempre medir, com instrumento adequado, a corrente contínua das strings antes de desconectá-las do equipamento.**

**Topologia de risco (diagrama do material):**
```
PV1+ ┐
PV1− ┤─── [Interruptor de CC] ─── EMI CC ─── MPPT1
PV2+ ┤                            EMI CC
PV2− ┘                            EMI CC ─── MPPT2
                                  EMI CC
```
As entradas em paralelo antes da chave permitem circulação entre strings.

**Ferramenta correta:** alicate amperímetro com escala **CC** (não CA). Desconectar MC4 sob corrente = arco.

## 10.3 Manutenção preventiva — princípios

- **Seguir as recomendações do manual do equipamento**;
- **Acompanhar a operação do equipamento e a presença de alarmes na plataforma de monitoramento**.

**Exemplo real de log apresentado:** um mesmo inversor (SN 55000DST21BW0167, modelo GW5K) registrando repetidos alarmes **"Isolation Fail"**, classificados como *Protection Events*, nível *Fault*, status *Recovered*, com múltiplas ocorrências ao longo de dias consecutivos. É o padrão clássico de degradação de isolação por umidade — falha intermitente que se "recupera" sozinha ao secar, até se tornar permanente.

## 10.4 Tabela de manutenção periódica

| Item de manutenção | Método de manutenção | Período |
|---|---|---|
| **Limpeza do sistema** | Verifique o dissipador de calor, a entrada de ar e a saída de ar quanto a corpos estranhos ou poeira | **A cada 6 a 12 meses** |
| **Ventoinha** | Verifique se a ventoinha está funcionando corretamente, com baixo ruído e aparência intacta | **Uma vez por ano** |
| **Interruptor CC** | Ligue e desligue o interruptor CC **dez vezes consecutivas** para certificar-se de que está funcionando corretamente | **Uma vez por ano** |
| **Conexão elétrica** | Verifique se os cabos estão bem conectados. Verifique se os cabos estão partidos ou se há algum núcleo de cobre exposto | **A cada 6 a 12 meses** |
| **Vedação** | Verifique se todos os terminais e portas estão devidamente vedados. Vede novamente o orifício do cabo se não estiver vedado ou for muito grande | **Uma vez por ano** |

## 10.5 Inspeções periódicas

### Inspeção visual
- Visuais do **inversor**, da **instalação** e de seus **componentes**;
- Verificação da **integridade dos condutores e dos módulos fotovoltaicos**.

**Achados típicos mostrados:** cabos CC desorganizados e sob tração; **micro-fissura/ponto de dano no vidro do módulo**; disjuntores caixa-moldada com **ninho/detritos** sobre o barramento; caixa de conexão com **ninho de vespas** e cabos degradados.

### Termografia

> **Termografia das conexões CC, CA e módulos fotovoltaicos.**

**Exemplos de leituras do material:**

| Registro | Temperatura de ponto | Máxima | Interpretação |
|---|---|---|---|
| Módulo FV | 67,8 °C | **91,2 °C** (HIGH) | **Hot spot** no módulo — correlacionado à mancha escura visível na célula |
| Conexão CA (barramento) | 49,6 °C | **83,0 °C** | Ponto quente em terminal — provável aperto insuficiente |
| Conexão CA | 62,0 °C | **67,0 °C** | Assimetria entre fases |
| Conexão | 34,2 °C | **59,5 °C** | Aquecimento localizado |
| Conexão | 30,1 °C | **41,8 °C** | Dentro do esperado |

**Método de análise:** o critério não é a temperatura absoluta isolada, mas o **ΔT entre fases/pontos equivalentes** sob a mesma carga. Uma fase 20 °C acima das outras é anomalia, mesmo abaixo de 60 °C.

> 🔑 **Ponto de prova:** para identificar **pontos quentes / mau contato / sobreaquecimento** → **termografia**. Curva I-V identifica degradação/mismatch de módulos; megôhmetro identifica falha de isolação; alicate amperímetro mede corrente. São ensaios com finalidades distintas.

---

# 11. GARANTIA, DATA DE FABRICAÇÃO E RMA

## 11.1 Garantia padrão e estendida

**Links oficiais:**
- **Compra de Garantia Estendida:** `https://warranty.semsportal.com/#/`
- **Termo de Garantia:** `https://br.goodwe.com/warranty`

### Prazos para compra da garantia estendida

| Categoria | Prazo a partir da **data de fabricação** |
|---|---|
| Inversores string com potência **igual ou superior a 25 kW** | **12 meses** |
| Inversores string **abaixo de 25 kW** | **30 meses** |

> 🔑 **Ponto de prova:** o prazo é contado da **data de fabricação** (não da data de compra, instalação ou faturamento). Quanto **maior** a potência, **menor** o prazo — quem tem inversor grande precisa decidir mais rápido.

## 11.2 Identificação da data de fabricação pelo número de série

### Estrutura do S/N

Exemplo: **`9 6000 DSN 22 4 R 0033`**

| Posição | Campo | Significado no exemplo |
|---|---|---|
| **9** | Identificação da **linha de produção** | Linha 9 |
| **6000** | **Potência do inversor** | 6000 W |
| **DSN** | **Modelo do inversor** | GW6000D-NS |
| **22** | **Ano** de fabricação | **2022** |
| **4** | **Mês** de fabricação | **Abril** |
| **R** | **Tipo de comunicação** | RS485 |
| **0033** | **Unidades produzidas neste lote** | Unidade 33 |

### Codificação do mês

| Código | Mês |
|---|---|
| **1 a 9** | **Janeiro a Setembro** |
| **A** | **Outubro** |
| **B** | **Novembro** |
| **C** | **Dezembro** |

### Codificação da comunicação

| Código | Comunicação |
|---|---|
| **W** | WIFI |
| **R** | RS485 |
| **G** | GPRS / 4G |
| **P** | PLC |
| **L/S** | Wi-Fi / LAN |

> 💡 **Uso prático:** com o S/N em mãos, o integrador determina em segundos se o equipamento ainda está na janela de compra de garantia estendida e qual o meio de comunicação nativo — informação essencial antes de vender um kit de monitoramento adicional.

## 11.3 Fluxo de solicitação de garantia (RMA)

```
Abertura do chamado
        ↓
  Análise do caso
   ↙          ↘
Solução     Análise
remota       local
   ↓            ↓
 ├─ Atualização de firmware      Testes locais
 ├─ Atualização de parâmetros      ↙        ↘
 └──────────────┐          Solução     Preenchimento
                ↓           local          RMA
         Análise da matriz ←──────────────────┘
          ↙      ↓      ↘
  Adequações   Aprovação  Reprovação
    locais         ✅         ❌
       ↓
   Aprovação
```

### Passos formais

| # | Etapa |
|---|---|
| **1** | **Identificar o inversor pelo número de série** |
| **2** | **Entrar em contato com o distribuidor parceiro de pós-vendas** |
| **3** | **Preencher o RMA** (documento de requisição de garantia) com o maior número de informações possíveis |
| **4** | O cliente, integrador ou engenheiro **receberá um e-mail com o procedimento de retorno** do inversor |
| **5** | **O período de garantia do inversor substituto é o tempo que restava de garantia do inversor original** |

> ⚠️ **Ponto de prova (o mais cobrado do bloco):** a garantia do equipamento substituto **NÃO é reiniciada** — ela herda o **saldo remanescente** da garantia do equipamento original. É prática padrão da indústria e precisa ser comunicada ao cliente final na venda, sob risco de conflito comercial futuro.

### Boas práticas de RMA para o integrador

- Anexar **fotos do S/N**, do local de instalação, do quadro e da tela de erro;
- Anexar o **log de eventos** exportado do SEMS+/SolarGo;
- Registrar **medições** (Voc, Isc, isolação, tensão CA por fase);
- Descrever a **sequência de eventos** (quando começou, se é intermitente, se correlaciona com horário/clima).
  Quanto melhor o RMA, maior a chance de aprovação e menor o tempo de resposta.

---

# 12. MONITORAMENTO — SOLARGO × SEMS+

## 12.1 SEMS+ — a nova plataforma

**Posicionamento (2026):** *"Olá, 2026. Olá, SEMS+. A Nova Era da Gestão de Energia Inteligente."*

| Pilar | Descrição |
|---|---|
| **Monitoramento Unificado** | Todos os dispositivos GoodWe em um único portal |
| **O&M Simplificada** | Diagnóstico remoto e manutenção mais eficiente |
| **Gestão Inteligente** | Controle integrado da geração, consumo e baterias |

Disponível em **portal web** e **aplicativo móvel**, com visualização de fluxo de energia residencial em tempo real (geração, consumo, rede, bateria), modos de trabalho e limite de potência.

## 12.2 Diferença fundamental entre as ferramentas

| Aspecto | **SolarGo** | **SEMS+** |
|---|---|---|
| **Finalidade** | Configuração e **comissionamento local** | **Monitoramento remoto** e gestão |
| **Conexão** | **Bluetooth** ou **Wi-Fi direto** ao equipamento | **Internet** (nuvem) |
| **Onde se usa** | No local da instalação, ao lado do equipamento | De qualquer lugar |
| **O que faz** | Safety Code, Grid Type, seleção de bateria, modos de operação, DOD, teste de medidor, export de log, atualização | Portfólio de plantas, geração histórica, alarmes, diagnóstico remoto, relatórios, gestão de clientes |
| **Perfil de uso** | Instalador/técnico em campo | Integrador (O&M) e cliente final |
| **Escopo de equipamentos** | Ambos atendem string, micro e híbridos — **não** são exclusivos por linha | idem |

> 🔑 **Ponto de prova:** SolarGo ≠ SEMS+ em finalidade, e **nenhum dos dois é exclusivo** de micro ou de híbrido. As alternativas que dizem "não há diferença" ou "SolarGo é só para micro" estão erradas.

## 12.3 Cadastro no SEMS+

| Requisito | Detalhe |
|---|---|
| Informações necessárias | **SN (número de série)** + **Checkcode** |
| Onde encontrar | **Etiqueta principal** (frontal). O Checkcode também está no **QR das etiquetas laterais** removíveis |

## 12.4 Medidor inteligente no SEMS+

O medidor **não possui conexão direta com o roteador**. A comunicação ocorre **através do inversor** (RS-485 → inversor → nuvem), e **por isso não é necessário adicioná-lo separadamente no SEMS+**. Os dados de consumo, importação e exportação aparecem automaticamente na planta do inversor ao qual está associado.

*(Coerente com o diagrama de fiação do módulo; nomenclatura de modelo específica — ex.: GM330 — não é detalhada no Módulo 3.)*

## 12.5 Itens de monitoramento não detalhados no Módulo 3 — [FORA DO MATERIAL]

> ⚠️ Os itens abaixo apareceram em avaliação, mas **não constam** no PDF do Módulo 3. Confirmar em material de monitoramento/SEMS+ antes de usar como referência:

| Item | Valor citado | Status |
|---|---|---|
| Senha padrão gerada ao cadastrar e-mail do cliente final na criação da planta | `gw123456` | **Verificar em fonte oficial** |
| Nomenclatura de modelo do smart meter (GM330) | — | **Verificar em fonte oficial** |

---

# 15. TABELA-RESUMO DE NÚMEROS CRÍTICOS

| Grandeza | Valor | Contexto |
|---|---|---|
| Distância máx. DPS → inversor | **10 m** | CA e CC |
| Seção mínima do PE (arranjo FV) | **6 mm²** Cu | NBR 16690 / 5410 |
| Seção do cabo CC | **4 ou 6 mm²** | Cabo FV (NBR 16612) |
| Seção mínima cabo CA do MIS | **6 mm²** Cu | Cabo PP 3 vias |
| Cabo da bateria (híbrido) | **25 a 35 mm²** | Terminal olhal |
| Temperatura ambiente de operação | **-30 °C a 50 °C** | Inversor |
| Tempo de espera após desligar | **5 minutos** | Antes de qualquer operação |
| Corrente de ensaio de continuidade PE | **200 mA** | Ensaio de condutor de proteção |
| Resistência de isolamento CC mín. (>120 V) | **1 MΩ** | Tensão de ensaio 500 V ou 1000 V |
| Resistência de isolamento CC mín. (<120 V) | **0,5 MΩ** | Tensão de ensaio 250 V |
| Resistência de isolamento CA mín. (até 500 V) | **≥ 0,5 MΩ** | Tensão de ensaio 500 V (Tabela 60) |
| Referência de malha de aterramento | **10 Ω** | Sem valor mínimo normativo |
| Critério de validação da malha | **≤ 10%** | ((S2−S1)/S)×100 |
| Tensão máx. por MPPT do MIS | **65 Vcc** | 1 módulo por MPPT |
| MPPTs do MIS | **4** | 2 de cada lado |
| Corrente máx. por tronco CA (MIS) | **40 A** | 4× 2 kW ou 5× 1,6 kW |
| Fator de dimensionamento do disjuntor (MIS) | **1,25 ×** | Corrente nominal do arranjo |
| Distância mín. micro → telhado | **45 mm** | Abaixo disso, usar espaçadores |
| Distância entre parafusos de fixação do MIS | **157 mm** | Trilho de alumínio |
| Torque M12 (potência CA) | **25–30 N·m** | Terminal de potência |
| Torque M8 (terminal CA / bateria) | **7–9 N·m** | — |
| Torque M8 (fixação MIS no trilho) | **8,5–9,5 N·m** | — |
| Torque tampa do inversor | **2,5–3 N·m** | Cover |
| Torque M4 (conector T do MIS) | **0,7–0,9 N·m** | — |
| Torque M4 (aterramento do MIS) | **1,6 N·m** | — |
| Faixa CA — Brazil 220Vca | **176 – 242 V** | Por fase |
| Faixa CA — 60Hz Default | **180 – 270 V** | Por fase |
| Faixa CA — Brazil LV 127Vca | **102 – 140 V** | Por fase |
| Faixa CA — 60Hz LV Default | **96 – 166,3 V** | Por fase |
| Senha instalador SolarGo (string/micro) | **1234** | Login no equipamento |
| Senha de parâmetros de rede / híbridos | **goodwe2010** | Safety Code |
| Garantia estendida — inversores ≥ 25 kW | **12 meses** | Da data de fabricação |
| Garantia estendida — inversores < 25 kW | **30 meses** | Da data de fabricação |
| Limpeza do sistema / conexão elétrica | **6 a 12 meses** | Manutenção preventiva |
| Ventoinha / interruptor CC / vedação | **1 vez por ano** | Manutenção preventiva |
| Acionamentos do interruptor CC no teste | **10 consecutivos** | Verificação anual |

---

## CONTATOS GOODWE (do material)

| Canal | Endereço |
|---|---|
| E-mail do programa | `goodweplus.br@goodwe.com` |
| LinkedIn | `@goodwebr` |
| YouTube | `@GoodWeSolarAcademy` |
| Termo de garantia | `https://br.goodwe.com/warranty` |
| Garantia estendida | `https://warranty.semsportal.com/#/` |

---

*Documento consolidado por EcoSunPower Energia Solar LTDA para fins de estudo técnico e produção editorial. O conteúdo técnico foi reorganizado e reescrito a partir do material de treinamento GoodWe Plus — Módulo 3. Marcas, modelos e denominações comerciais pertencem à GoodWe Technologies Co., Ltd. Valores normativos devem ser sempre confirmados nas edições vigentes das normas ABNT e nos manuais dos equipamentos.*
