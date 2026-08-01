# FoxESS híbrido trifásico H3-Pro + bateria EP11 — guia técnico

> **Escopo:** linha FoxESS híbrida trifásica está NO ESCOPO da Ecosunpower para projetos comerciais/institucionais com bateria e backup (dados dos datasheets oficiais FoxESS Brasil).

## Inversor H3-Pro (7,5 a 30 kW · trifásico 380/220 V)

- Híbrido trifásico com **3 MPPTs** (2 entradas por MPPT = até 6 strings) nos modelos 15-30 kW.
- Entrada FV: máx. 1.000 V (operação até 950 V) · faixa MPPT 150-850 V (tensão ótima ~750 V) · 32 A por MPPT · **máximo recomendado 15 kW por MPPT**.
- Sobredimensionamento: até 2× (ex.: H3-Pro-20.0 aceita matriz de até 40 kWp).
- Bateria: 2 entradas (50+50 A), faixa 150-800 V, comunicação CAN.
- **Backup (EPS):** até a potência nominal com comutação < 10 ms — cargas essenciais seguem funcionando quando falta rede.
- Paralelo de até 10 inversores com Smart Meter (controle de exportação).
- INMETRO (AFCI conforme Portaria 515/23) · IP65 (uso externo) · monitoramento FoxCloud.

## Bateria EP11 (alta tensão)

- **10,36 kWh** por unidade · LFP (LiFePO₄) · 384 V nominal.
- Até **4 em paralelo por inversor** (41,4 kWh) — expansão acima de 2 unidades usa a **HV-Junction Box** (4 entradas → 1 saída, 50 A).
- 90% de profundidade de descarga · ≥ 6.000 ciclos · IP65 (piso ou parede, interno/externo) · INMETRO.
- Compatível com as séries H1, KH, H3, H3-Pro e US.

## Lições de dimensionamento que aplicamos (boas práticas Ecosunpower)

- **1 string por MPPT sem paralelismo** quando possível: strings longas (Vmp perto de 750 V) rendem mais, dispensam fusível de string e têm monitoramento individual.
- Conferir sempre o **Voc no frio** da string contra os 950 V de operação (coeficiente do módulo × temperatura mínima local).
- Respeitar o limite de **15 kW por MPPT** — 2 strings grandes em paralelo no mesmo MPPT podem estourar.
- Módulo bifacial soma corrente: conferir a margem dos 32 A por MPPT.
- Em cliente Grupo A: potência total de inversores limitada pela demanda contratada (ver `solucoes-grupo-a-demanda-bess.md`).

## Como a Eva apresenta

- "O híbrido FoxESS H3-Pro com baterias EP11 é a nossa solução quando o cliente quer solar + bateria + backup num sistema trifásico: a bateria zera o horário caro da noite e o prédio não para quando falta luz — com comutação mais rápida que um piscar de olhos."
- Perfil ideal: comércio, escolas, igrejas e instituições com atividades noturnas ou que não podem parar.
