# RAG EVA — DOCUMENTO 17
# BOOK TÉCNICO — INVERSORES STRING (ON-GRID) FOXESS

## METADADOS
- **Assunto:** inversores string on-grid (de rede) FoxESS comercializados pela Ecosunpower — linha residencial e comercial
- **Tags:** foxess, fox-ess, inversor string, on-grid, monofásico 220V, trifásico 380V, série F, série S, série G, série T, série VL, série R, mppt, afci, inmetro
- **Uso:** Eva consulta quando o cliente pergunta sobre inversor central de parede FoxESS (não microinversor, não híbrido)
- **Fontes oficiais:** datasheets FoxESS (fox-ess.com / br.fox-ess.com), registros INMETRO Portaria 140/2022
- **Última atualização:** agosto de 2026
- **Frequência de revisão:** trimestral

> ⚠️ Existem fichas separadas de **microinversor FoxESS** e de **híbrido FoxESS**. Esta ficha é só do **inversor string on-grid** (inversor de rede, sem bateria). Não confundir.

---

## INSTRUÇÕES PARA A EVA

Consulte este documento quando o cliente:
- Perguntar sobre inversor string / inversor central / inversor de parede FoxESS
- Quiser saber se o sistema é monofásico (220V) ou trifásico (380V)
- Perguntar quantas entradas/rastreadores o inversor tem
- Comparar inversor string com microinversor
- Perguntar sobre certificação INMETRO do inversor

A Eva **NUNCA passa preço** — escalona pro Junior. A Eva **NUNCA confirma o modelo específico** pro projeto — quem decide é o Junior na visita técnica. A Eva **nunca chama o profissional de "engenheiro" nem "eletrotécnico"** — o correto é **Responsável Técnico**.

---

## 1. O QUE É UM INVERSOR STRING ON-GRID

O inversor string (também chamado de inversor central ou de rede) é o "cérebro" do sistema solar. Ele fica instalado numa parede, recebe a energia em corrente contínua (CC) de **vários painéis ligados em série** — a "string", ou fileira — e converte em corrente alternada (CA) igual à da tomada, jogando na rede da distribuidora. É a solução mais usada em telhados **sem sombreamento e com orientação uniforme**, porque tem o melhor custo por watt.

A FoxESS é uma marca premium de bom custo-benefício da casa: certificação INMETRO completa, filial oficial no Brasil e forte também em híbrido. (Quem quer entender a marca a fundo, ver a ficha do microinversor FoxESS.)

---

## 2. LINHA STRING ON-GRID FOXESS — MONOFÁSICO 220V

Para casa e comércio pequeno ligados em **rede monofásica (220V)**:

- **Série F (G2)** — dois rastreadores (2 MPPT). Modelos **F3000-G2 a F6000-G2 = de 3,0 kW a 6,0 kW** (F3000 / F3600 / F4600 / F5000 / F5300 / F6000). Eficiência máxima **97,4%**, proteção **IP65**. É a linha residencial mais vendida. O **F5000-G2 (5 kW)** tem registro INMETRO nº 000312/2024 (Portaria 140/2022), família "Série F-G2".
- **Série S (G3)** — um rastreador (1 MPPT), para sistemas menores. Modelos **S700-G3 a S3300-G3 = de 0,7 kW a 3,3 kW**. Eficiência máxima **97,4%**, IP65.
- **Série G (linha anterior)** — inversores monofásicos on-grid **G7000 / G8000 / G9000** (registro INMETRO nº 007083/2021). Linha mais antiga, ainda encontrada no mercado.

> Os modelos **G8 e G9** citados por clientes são dessa família monofásica (G8000 / G9000).

---

## 3. LINHA STRING ON-GRID FOXESS — TRIFÁSICO 380V

Para comércio, indústria e casas maiores em **rede trifásica (380V)**:

- **Série T (G3)** — dois rastreadores (2 MPPT). Modelos **T3-G3 a T25-G3 = de 3 kW a 25 kW** (inclui T12 / T15 / T17 / T20 / T23 / T25). Eficiência máxima **98,6%**, IP65. Linha para comércio pequeno e médio.
- **Série VL** — quatro rastreadores (4 MPPT). Modelos **VL15 a VL37.5 = de 15 kW a 37,5 kW** (VL15 / VL20 / VL25 / VL30 / VL37.5). Eficiência máxima **98,7%**, IP65, com função **AFCI** e monitoramento de corrente por string. Linha comercial de médio porte.
- **Série R (G2)** — inversor de grande porte para usinas comerciais. Modelos **R75-G2 a R136-G2 = de 75 kW a 136 kW** (inclui o **R100-G2 = 100 kW**). Proteção **IP66**, eficiência máxima **98,6%**.

---

## 4. NÚMERO DE RASTREADORES (MPPT) — POR QUE IMPORTA

O MPPT é o rastreador que busca o ponto de máxima geração de cada grupo de painéis. Mais MPPTs = mais liberdade para o telhado ter águas em direções diferentes.

- Série F (G2) monofásico: **2 MPPT**
- Série S (G3) monofásico: **1 MPPT**
- Série T (G3) trifásico: **2 MPPT**
- Série VL trifásico: **4 MPPT**
- Série R (G2) trifásico: **9 a 10 MPPT** (conforme o modelo)

Quantos painéis por entrada e o arranjo exato quem calcula é o **Responsável Técnico** no projeto.

---

## 5. AFCI, INMETRO E PROTEÇÕES

- **INMETRO:** os inversores FoxESS têm certificação INMETRO conforme **Portaria nº 140/2022** — obrigatória para vender e homologar no Brasil.
- **AFCI (proteção contra arco elétrico):** **varia por série e modelo.** Vem de série na Série VL, é opcional em várias outras (S, T, R) e não está presente na Série F (G2). Se o cliente exigir AFCI, a Eva responde: *"Esse recurso depende da série e do modelo. Vou confirmar no datasheet com o Responsável Técnico pra te passar certo."*
- **Proteções padrão** na maioria das linhas: anti-ilhamento, proteção contra polaridade reversa, sobretensão e sobrecorrente CA, curto-circuito, monitoramento de isolamento e proteção contra surtos. Resfriamento por convecção natural (linhas menores) — sem ventilador nos modelos residenciais.
- **Monitoramento remoto** por Wi-Fi/app FoxESS na maioria das linhas (módulo de comunicação conforme o modelo).

---

## 6. QUANDO O INVERSOR STRING É A ESCOLHA CERTA

- Telhado **sem sombreamento** e com **orientação uniforme** (uma ou poucas águas)
- Sistema **maior**, onde o custo por watt do string compensa
- Cliente que prioriza **investimento inicial mais enxuto**

Quando há sombreamento parcial (árvore, caixa d'água, prédio vizinho) ou várias águas de telhado, o microinversor costuma render mais — aí a Eva puxa a ficha do microinversor. A decisão final é sempre do **Responsável Técnico** na visita.

---

## 7. GARANTIA

- **Garantia da instalação (12 meses):** dada pela Ecosunpower, sobre o serviço de montagem.
- **Garantia do equipamento:** dada pela FoxESS (fabricante), acionada por processo RMA oficial no Brasil — a Ecosunpower intermedeia. O prazo exato do inversor string varia conforme o modelo e a política vigente da FoxESS (geralmente entre 5 e 10 anos). **Prazo exato: confirmar no datasheet/política com o Responsável Técnico.**

---

## 8. COMO A EVA RESPONDE — FRASES PRONTAS

> "O inversor string FoxESS é o modelo de parede que recebe os painéis em fileira e converte a energia pra rede. É a solução mais usada em telhado sem sombra, com ótimo custo por watt."

> "Se a sua rede é monofásica (220V), a linha mais comum é a Série F, de 3 a 6 kW. Se for trifásica (380V), tem desde a Série T (3 a 25 kW) até modelos comerciais bem maiores. Qual é a sua? Posso confirmar no seu projeto."

> "A FoxESS tem certificação INMETRO completa (Portaria 140/2022) e filial oficial no Brasil. É uma marca premium de bom custo-benefício que a gente trabalha."

> "Esse número exato eu confirmo no datasheet com o Responsável Técnico pra te passar com precisão. Quer que eu encaminhe?"

---

## 9. ALERTAS PRA EVA

- **Não confundir string com microinversor nem com híbrido.** Os três são FoxESS, mas são fichas diferentes. Na dúvida, pergunte: *"Você está falando do inversor de parede (string), do microinversor que fica nos painéis, ou do híbrido com bateria?"*
- **Não inventar especificação.** Número não confirmado aqui → *"confirmar no datasheet com o Responsável Técnico"*.
- **Nunca chamar de "engenheiro" nem "eletrotécnico"** — sempre **Responsável Técnico**.
- **Não comparar marca contra marca.** Cada marca tem seu ponto forte; se o cliente insistir, escalona.

---

## 10. ESCALONAMENTO IMEDIATO PRO JUNIOR

A Eva escalona quando o cliente pergunta preço, qual modelo exato vai no projeto, prazo exato de garantia, compatibilidade com painel específico, ou pede comparação técnica detalhada.

> "Pelo que você está me perguntando, é melhor o Junior te responder direto, porque precisa avaliar o seu caso. Posso te passar pra ele agora? Prefere WhatsApp, ligação ou videochamada?"

---

## 11. FONTES OFICIAIS DESTE DOCUMENTO

- **FoxESS Brasil — monofásico:** https://br.fox-ess.com/single-phase/
- **FoxESS Brasil — trifásico:** https://br.fox-ess.com/three-phase/
- **Datasheet Série F (G2) — BR:** https://br.fox-ess.com/wp-content/uploads/2023/07/BR-F-G2-Datasheet-V2.5-7.18.pdf
- **Datasheet Série S (G3), T (G3), R (G2) e catálogo geral 1kW–136kW:** fox-ess.com (downloads oficiais)
- **Datasheet Série VL (15–37,5 kW):** https://www.fox-ess.com/Public/Uploads/uploadfile/files/20251202/ENVLdatasheetV1.520241227.pdf
- **INMETRO** — Portaria nº 140/2022 (registro 000312/2024 = F5000-G2; registro 007083/2021 = G7000/G8000/G9000)
