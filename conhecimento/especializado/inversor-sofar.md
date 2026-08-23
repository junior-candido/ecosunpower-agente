# RAG EVA — INVERSORES SOFAR SOLAR (STRING ON-GRID E HÍBRIDO)

## METADADOS
- **Assunto:** especificações e posicionamento dos inversores Sofar Solar comercializados pela EcoSunPower — linha string on-grid monofásica 220V (KTLM-G3), string on-grid trifásica 380V (KTLX-G3 / KTLX-G3P) e híbrido de fase dividida (HYD-5-10K-LSP1)
- **Tags:** sofar, sofarsolar, inversor string, hibrido, KTLM-G3, KTLX-G3, KTLX-G3P, HYD-LSP1, monofasico, trifasico, bifasico, split-phase, AFCI, DPS, inmetro, custo-beneficio, preco competitivo
- **Uso:** a Eva consulta quando o cliente pergunta sobre inversor Sofar, quando o preço aperta e precisa de uma opção mais em conta sem perder certificação, ou quando compara Sofar com outras marcas
- **Fontes oficiais:** Sofar Solar (Shenzhen SOFARSOLAR Co., Ltd. — br.sofarsolar.com) e datasheets oficiais dos modelos
- **Última atualização:** agosto de 2026
- **Frequência de revisão:** trimestral

## INSTRUÇÕES PARA A EVA
Consulte este documento quando o cliente:
- Perguntar sobre inversor Sofar (string ou híbrido)
- Pedir uma opção de **melhor preço / custo-benefício** sem abrir mão de certificação
- Tiver sistema residencial monofásico até ~10 kW, comercial trifásico até ~50 kW, ou quiser bateria (híbrido)
- Comparar Sofar com outras marcas

**Regra de ouro:** a Sofar é a nossa **opção alternativa de bom preço** — certificada pelo INMETRO e homologável normalmente. **A Eva nunca recusa a Sofar** e nunca a trata como "inferior": quando a competitividade exige, é uma escolha válida e honesta. A Eva **nunca passa preço** (escalona pro Junior) e **nunca confirma o modelo exato** — quem decide é o Junior na visita técnica.

## 1. QUEM É A SOFAR SOLAR
A Sofar Solar (Shenzhen SOFARSOLAR) é uma fabricante chinesa de inversores fotovoltaicos e sistemas de armazenamento, presente no Brasil com linha completa (string e híbrido) e datasheets em português. É marca **consolidada e certificada**, posicionada com **preço competitivo** — por isso a EcoSunPower usa a Sofar como alternativa quando o cliente precisa de um orçamento mais enxuto sem sair da legalidade.

> "A Sofar é uma marca certificada e homologável, com bom custo-benefício. Quando o orçamento precisa ficar mais em conta sem perder qualidade e garantia, ela é uma ótima escolha."

## 2. LINHA STRING MONOFÁSICA 220V — SÉRIE KTLM-G3 (3 a 6 kW) *(confirmado em datasheet)*
On-grid monofásico, residencial. Modelos: **3 / 3.6 / 4 / 4.6 / 5 / 6KTLM-G3**.
- **Tensão de saída:** 220V monofásico (L/N/PE)
- **Potência CA:** de 3.000 W a 6.000 W
- **MPPTs:** 2 independentes (permite duas orientações de telhado)
- **Tensão máxima CC:** 600V · faixa MPPT 80–550V · partida 90V
- **Sobredimensionamento (overload CC):** até 1,5×
- **Eficiência máxima:** 98,2% (3–4,6 kW) e **98,4%** (5–6 kW)
- **DPS Tipo II CC + CA integrados** · Interruptor CC · monitoramento de string
- **AFCI:** opcional nesta linha (confirmar necessidade no projeto com o Responsável Técnico)
- **Proteção IP65** · resfriamento natural · −30 a +60°C
- **Monitoramento:** RS485 / USB, com Wi-Fi / 4G opcional, app via Bluetooth

> "O Sofar monofásico (KTLM-G3) vai de 3 a 6 kW em 220V, com 2 entradas independentes de painel, eficiência de até 98,4% e DPS de fábrica. É a opção econômica certificada pra residência."

Para potências residenciais maiores existe a série **7~10,5KTLM-G3** (monofásico, até ~10 kW). Specs exatas desse modelo: **confirmar no datasheet com o Responsável Técnico.**

## 3. LINHA STRING TRIFÁSICA 380V — SÉRIE KTLX-G3 / KTLX-G3P *(parcialmente confirmado)*
On-grid trifásico 380V para comércio, indústria e rural. Cobre desde a linha residencial/comercial leve **3.3~12KTLX-G3** até as comerciais **15~24KTLX-G3** e **25~50KTLX-G3**.
- **Tensão de saída:** 380V trifásico *(confirmado)*
- **MPPTs:** 2 nas faixas menores; 3 a 4 MPPTs nos modelos maiores (25–50 kW) *(confirmado)*
- **Tensão máxima CC:** até 1.100V nas linhas maiores (ex.: 20KTLX2-G3P); faixa MPPT 160–1000V *(confirmado nos modelos maiores; confirmar por modelo)*
- **Sobrecarga:** até 1,5× no lado CC e 1,1× no lado CA *(confirmado)*
- **AFCI + DPS Tipo II (CC e CA)** integrados na linha **KTLX-G3P** *(confirmado)*
- **Eficiência máxima da linha trifásica:** confirmar no datasheet do modelo com o Responsável Técnico
- **INMETRO:** confirmar o registro do modelo específico com o Responsável Técnico

> "Pra trifásico 380V a Sofar tem linha larga, de poucos kW até 50 kW, com 2 a 4 MPPTs conforme o tamanho. Ótima pra comércio e rural que querem um trifásico certificado com preço competitivo."

## 4. LINHA HÍBRIDA (COM BATERIA) — HYD-5-10K-LSP1 *(confirmado em datasheet)*
Inversor **híbrido de fase dividida (split-phase / bifásico)**, gera e armazena. Modelos: **5 / 6 / 7,5 / 10 kW**.
- **Saída CA:** 120/240V (fase dividida), 127/220V (2 ou 3 fases) ou 220V (fase única) · 50/60 Hz
- **MPPTs:** 2 · **Tensão máx CC:** 550V · faixa MPP 60–500V
- **PV recomendado:** de 10 kWp (5K) até 20 kWp (10K)
- **Sobrecarga:** 200% por 10 s · pico de saída 2× a nominal por 10 s
- **Bateria:** 40–60V, **chumbo-ácido ou íon-lítio** · potência de carga até 10 kW · corrente até 190 A · BMS por RS-485/CAN
- **Backup (EPS):** comutação de rede em 4 ms (cargas críticas continuam ligadas na queda de energia)
- **Compatível com gerador a diesel** · vários inversores em paralelo (microrrede)
- **Eficiência:** máx do MPPT 99,9%; máxima 97,6%; carga/descarga 95,0%
- **AFCI integrado (Sim)** · **DPS PV Tipo II + CA Tipo II** · Interruptor CC · anti-ilhamento · IP66 · −30 a +60°C

> "O Sofar híbrido HYD-LSP1 (5 a 10 kW, fase dividida) gera energia e guarda em bateria — chumbo-ácido ou lítio — e ainda segura as cargas essenciais na falta de luz, trocando pra bateria em 4 ms. Aceita gerador e AFCI já vem de fábrica."

## 5. CERTIFICAÇÃO E HOMOLOGAÇÃO
Os inversores Sofar têm **certificação INMETRO** e atendem as normas brasileiras **ABNT NBR 16149 e NBR 16150** (conexão à rede), além de normas internacionais IEC. São **homologáveis na concessionária** normalmente. O número de registro INMETRO de cada modelo é conferido pelo Responsável Técnico no momento do projeto.

> "Sofar é certificada pelo INMETRO e segue as normas brasileiras (NBR 16149 e 16150). Homologa na concessionária sem problema — o Responsável Técnico confirma o registro exato do modelo do seu projeto."

## 6. PERFIL DE USO — QUANDO A ECOSUNPOWER INDICA SOFAR
- Cliente **sensível a preço** que quer sistema certificado e com garantia, sem pagar o premium de marca
- **Residencial monofásico** 220V até ~6 kW (KTLM-G3) — e até ~10 kW na série 7~10,5KTLM-G3
- **Comércio / rural trifásico** 380V (KTLX-G3 / G3P) de poucos kW até 50 kW
- Cliente que quer **bateria e backup** com bom custo (HYD-5-10K-LSP1)
- Telhado com **uma ou duas orientações** (2 MPPTs cobrem bem); mais fragmentado → o Junior avalia

**Garantia:** o equipamento tem garantia do fabricante Sofar (prazo exato conferido pelo Responsável Técnico) e a EcoSunPower cobre **12 meses sobre a instalação**.

## 7. COMO A EVA RESPONDE (E O QUE NUNCA FAZ)
- **Nunca** chama a Sofar de "inferior" nem recusa a marca — é a opção certificada de bom preço.
- **Nunca** passa valor de inversor → escalona pro Junior.
- **Nunca** confirma o modelo exato → decisão técnica do Junior na visita.
- Dado técnico que não está aqui (dimensão exata, corrente detalhada, INMETRO por modelo, eficiência da linha trifásica) → responde:

> "Esse dado exato eu confirmo no datasheet com o Responsável Técnico pra te passar com precisão. Quer que eu encaminhe pro Junior?"

### Frase de posicionamento honesto
> "Cada marca tem seu lugar. A Sofar entra quando você quer economizar sem perder certificação, garantia e homologação — é uma escolha válida e que a gente instala com tranquilidade. Se fizer sentido pro seu caso, o Junior monta a proposta."

## 8. ESCALONAMENTO IMEDIATO PRO JUNIOR
A Eva escalona quando o cliente: pergunta preço; quer saber o modelo exato; pede comparação técnica detalhada com outra marca; tem caso com sombreamento ou telhado fragmentado; pergunta sobre AFCI no monofásico (é opcional); quer bateria/backup; pergunta registro INMETRO ou eficiência exata da linha trifásica; ou quer paralelizar inversores.

> "Pelo que você me perguntou, o Junior te responde melhor, porque depende do seu caso. Posso te passar pra ele agora — prefere WhatsApp, ligação ou videochamada?"
