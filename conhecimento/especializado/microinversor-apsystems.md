# RAG EVA — MICROINVERSORES APSYSTEMS

## METADADOS
- **Assunto:** microinversores APsystems comercializados pela EcoSunPower — linhas DS3, QT2 e EZ1
- **Tags:** apsystems, microinversor, ds3, qt2, ez1, sombreamento, multi-módulo, inmetro, garantia, ema
- **Uso:** Eva consulta quando o cliente pergunta sobre microinversor APsystems, projeto com sombra parcial ou telhado com águas diferentes, ou monitoramento por módulo
- **Fontes oficiais:** APsystems (apsystems.com / latam.apsystems.com), datasheets oficiais DS3/QT2/EZ1, Portaria INMETRO 140/2022
- **Última atualização:** agosto de 2026
- **Frequência de revisão:** trimestral

---

## INSTRUÇÕES PARA A EVA

Consulte este documento quando o cliente:
- Perguntar especificamente sobre microinversor APsystems
- Tiver telhado com sombreamento parcial (árvore, antena, chaminé, prédio vizinho, ar-condicionado) ou várias orientações (águas diferentes)
- Quiser acompanhar a geração painel a painel pelo celular
- Comparar APsystems com outras marcas de microinversor

Regras de ouro:
- A Eva **NUNCA passa preço** — escalona pro Junior (Responsável Técnico).
- A Eva **NUNCA confirma o modelo exato** do projeto — quem decide é o Responsável Técnico na visita.
- A Eva **NUNCA inventa número**. Dado que não está aqui: "Vou conferir esse dado técnico com o Responsável Técnico pra te passar com precisão."

---

## 1. O QUE É UM MICROINVERSOR (e por que APsystems é boa pra sombra)

O inversor central (string) é um aparelho único que junta a energia de todos os painéis. Se um painel entra na sombra, ele puxa a geração dos outros junto pra baixo.

O microinversor é o contrário: é um aparelho pequeno instalado no telhado que atende só um pequeno grupo de painéis. Cada painel trabalha de forma independente — sombra em um não derruba a geração dos demais.

O diferencial da APsystems é ser **multi-módulo**: uma única unidade atende **2 ou 4 painéis** (dependendo da linha). Isso reduz a quantidade de aparelhos no telhado sem perder a vantagem painel a painel. A APsystems foi pioneira nesse formato de microinversor que atende vários painéis por unidade.

Por isso a EcoSunPower usa APsystems como uma das marcas premium de microinversor — é ótima pra **sombra parcial** e pra **telhado com águas viradas pra lados diferentes**.

---

## 2. LINHAS APSYSTEMS QUE A ECOSUNPOWER USA

### Linha DS3 (dual — 1 unidade atende 2 painéis)
- **Atende 2 painéis** por unidade, com **2 MPPT independentes** (cada painel otimizado sozinho)
- Saída **monofásica**
- Potência de saída típica na faixa de **~730 a 880 VA por unidade**, variando conforme o modelo (DS3-LV, DS3-H, DS3D e outros) — *potência exata de cada modelo: confirmar no datasheet com o Responsável Técnico*
- Eficiência de pico de **97%**
- Proteção **IP67** (protegido contra poeira e água — importante pro clima de Brasília e Goiás)
- Comunicação **Zigbee** criptografada (via ECU, ver seção 5)
- É a linha mais usada em projeto residencial

### Linha QT2 (quad — 1 unidade atende 4 painéis)
- **Atende 4 painéis** por unidade, com **2 MPPT independentes**
- Saída **trifásica** (modelo QT2-220 pra rede 220V; QT2D pra rede 380V)
- Potência de saída de até **~2000 VA por unidade** (versão brasileira QT2-220) — *valor exato: confirmar no datasheet com o Responsável Técnico*
- Eficiência de pico de até **96,5%**
- Comunicação **Zigbee** criptografada (via ECU)
- Indicada pra projeto **trifásico** e comercial pequeno, onde 1 unidade cobre 4 painéis (menos aparelhos no telhado)

### Linha EZ1 (dual — 1 unidade atende 2 painéis, plug-in)
- **Atende 2 painéis**, com **2 MPPT independentes**, saída monofásica
- Potência de saída em torno de **~800 VA** — *valor exato do modelo: confirmar com o Responsável Técnico*
- **Wi-Fi e Bluetooth integrados** (não precisa de ECU separado)
- Proteção IP67, eficiência de pico ~96%
- É uma linha mais compacta / "plug-in". Se o cliente citar EZ1, a Eva confirma o uso com o Responsável Técnico, pois nem todo projeto usa essa linha.

*A escolha da linha e do modelo é decisão técnica do Responsável Técnico, feita a partir do projeto. A Eva nunca decide.*

---

## 3. GARANTIAS — SÃO DUAS, NUNCA CONFUNDIR

### Garantia do EQUIPAMENTO (fabricante APsystems)
- **Quem dá:** a própria APsystems, fabricante
- **Prazo:** garantia padrão de fábrica robusta (a APsystems anunciou extensão do prazo padrão pra até **25 anos** nas linhas DS3 e QT2 em alguns mercados) — *o prazo exato válido pra sua compra no Brasil: confirmar com o Responsável Técnico*
- **O que cobre:** defeito de fabricação e falha de hardware, com troca da peça no caso coberto
- **Como acionar:** via distribuidor autorizado APsystems no Brasil; a EcoSunPower acompanha e intermedeia o processo pelo cliente

### Garantia da INSTALAÇÃO (EcoSunPower)
- **Quem dá:** EcoSunPower, sobre o serviço de montagem
- **Prazo:** 12 meses
- **O que cobre:** montagem, conexões elétricas, estrutura de fixação e comissionamento
- **O que NÃO cobre:** o equipamento em si (isso fica com o fabricante)

> Frase da Eva: "São duas garantias diferentes: a do equipamento é com a APsystems, fabricante; a da instalação, de 12 meses, é com a EcoSunPower. E você não precisa correr atrás de fabricante sozinho — a EcoSunPower intermedeia o acionamento pra você. Fala sempre com o Junior, que ele coordena a solução."

---

## 4. CERTIFICAÇÃO INMETRO

Os microinversores APsystems vendidos no Brasil têm **registro INMETRO** (Portaria INMETRO nº 140/2022), obrigatório pra conexão na rede da concessionária. Exemplo de registro já concedido: linha DS3D, registro **006030/2021**. *O número de registro exato de cada modelo do seu projeto: confirmar com o Responsável Técnico.*

> Frase da Eva: "Os microinversores APsystems têm registro INMETRO, que é o que a concessionária exige pra ligar o sistema na rede. Está tudo dentro das exigências brasileiras."

---

## 5. MONITORAMENTO — PLATAFORMA EMA

A APsystems tem plataforma própria de monitoramento, a **EMA (Energy Monitoring & Analysis)**, com **app no celular** e portal web:
- Acompanhamento da geração **painel a painel** em tempo real
- Histórico diário, mensal e anual
- Alarme quando algum painel para de gerar

Nas linhas DS3 e QT2, a comunicação passa por um pequeno aparelho chamado **ECU** (gateway que leva os dados dos microinversores pra nuvem) — ele vem incluso no projeto quando necessário. Na linha EZ1, o Wi-Fi já é integrado e dispensa a ECU.

---

## 6. QUANDO INDICAR MICROINVERSOR APSYSTEMS

Indicado quando:
- O telhado tem **sombreamento parcial** (árvore, antena, caixa d'água, prédio vizinho)
- O telhado tem **águas em orientações diferentes** (ex.: parte pro norte, parte pro leste)
- O cliente quer **ver a geração de cada painel** pelo celular
- Telhado pequeno ou recortado, onde otimizar painel a painel rende mais

Inversor string costuma valer mais quando o telhado é limpo, sem sombra e com orientação uniforme, e o cliente prioriza o menor custo inicial.

> Frase da Eva: "Se o seu telhado pega sombra em alguma parte, ou tem águas viradas pra lados diferentes, o microinversor APsystems é uma ótima escolha: cada painel trabalha sozinho, então a sombra em um não derruba os outros. Quem confirma se faz sentido pro seu caso é o Junior, na visita técnica."

---

## 7. PERGUNTAS COMUNS

**"Um aparelho desses atende quantos painéis?"**
Depende da linha: a DS3 atende 2 painéis por unidade; a QT2 atende 4 painéis por unidade. A APsystems é conhecida justamente por isso — uma unidade cobre vários painéis, reduzindo a quantidade de aparelhos no telhado.

**"E se um microinversor falhar?"**
Só os painéis ligados naquela unidade param — o resto do sistema continua gerando. Diferente do inversor central, em que uma falha para o sistema inteiro.

**"Como acompanho a geração?"**
Pela plataforma EMA da APsystems, no celular ou no computador: você vê cada painel em tempo real, o histórico e recebe alarme se algum parar. Sem mensalidade.

**"Qual o modelo/valor exato pro meu caso?"**
Aí é com o Junior. O modelo é decisão técnica da visita, e o valor ele te passa direto.

---

## 8. ESCALONAR PRO JUNIOR (Responsável Técnico) QUANDO

- Cliente pede **preço** ou **modelo exato** do projeto
- Cliente quer o **número de registro INMETRO** ou o **prazo de garantia exato** por escrito
- Caso com sombreamento complexo, telhado muito recortado ou projeto trifásico (QT2)
- Cliente quer instalar APsystems em sistema já existente de outra empresa
- Qualquer dado técnico que não esteja neste documento

> Frase de escalonamento: "Essa parte é melhor o Junior te responder direto, porque depende de avaliar o seu caso. Posso te passar pra ele agora? Prefere WhatsApp, ligação ou videochamada?"

---

## 9. ALERTAS PRA EVA
- **Não confundir as linhas:** DS3 = 2 painéis (monofásico) · QT2 = 4 painéis (trifásico) · EZ1 = 2 painéis (plug-in, Wi-Fi integrado). ECU é o aparelho de comunicação, não é microinversor.
- **Não confundir as garantias:** equipamento (fabricante APsystems) × instalação (12 meses, EcoSunPower).
- **Não comparar marca contra marca.** Cada marca tem seu ponto forte; o Responsável Técnico escolhe a melhor pro caso. Se o cliente insistir, escalona.
- **Não inventar especificação.** Número incerto = "confirmar no datasheet com o Responsável Técnico".

---

## 10. FONTES OFICIAIS
- APsystems Global: https://global.apsystems.com
- APsystems LATAM: https://latam.apsystems.com
- Datasheets DS3 / QT2 / EZ1: publicados no site oficial APsystems e nos distribuidores autorizados
- INMETRO: Portaria nº 140/2022 (regulamentação de inversores fotovoltaicos no Brasil)
