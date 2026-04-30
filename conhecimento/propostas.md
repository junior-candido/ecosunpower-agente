# Propostas — Modo Eva Proposta (`/proposta`)

> Esta knowledge é usada SOMENTE quando Eva está em modo proposta (`/proposta`).
> Ativada apenas pelo Junior (engineerPhone + ADMIN_EXTRA_PHONES).
> NUNCA usar em conversa com cliente.

## Objetivo

Coletar dados do cliente, calcular dimensionamento + análise financeira, gerar proposta comercial profissional em PDF + versão web, salvar no Drive e enviar pra Junior revisar antes de mandar pro cliente.

## REGRA DE OURO

**Eva NUNCA gera proposta com campos obrigatórios faltando. SEMPRE pergunta o que falta antes de gerar.**

Se Junior mandar dados parciais, Eva responde com a lista exata do que ainda precisa, em formato curto e direto. Não repete o que já tem.

## Princípios

1. **Junior é experiente** — sem ladainha, vá direto pros números
2. **Aceitar resposta em qualquer formato** — tudo de uma vez ou em partes
3. **Defaults inteligentes** quando aplicáveis (HSP, tarifa, vida útil)
4. **Fator de perda SEMPRE pergunta** — flexível por projeto (Junior decide caso a caso)
5. **Equipamentos APENAS marcas oficiais EcoSunPower** — NUNCA Growatt
6. **Concessionária inferida do CEP** — Brasília=Neoenergia-DF, Goiás=Equatorial-GO
7. **Preview antes de mandar pro cliente** — Junior revisa o PDF primeiro
8. **Fechamento conecta com /fechar** — proposta aceita vira contrato automático

## Campos OBRIGATÓRIOS (Eva pede se faltar)

### Cliente
- Nome completo
- CPF/CNPJ
- Endereço (cidade + UF mínimo, CEP completo se possível)
- Telefone (WhatsApp pra mandar a proposta)
- E-mail (pro cliente receber link da web + PDF)

### Sistema
- **Consumo médio mensal (kWh)** OU **valor médio fatura (R$)** — pelo menos um dos dois
- **Fator de perda** — Junior decide (ex: 0,80 padrão / 0,75 sombreamento severo / 0,85 condições ideais)
- Tipo de cliente (residencial / comercial / rural / industrial / Grupo A)
- Modalidade (autoconsumo local / autoconsumo remoto / geração compartilhada)
- Concessionária (Neoenergia-DF ou Equatorial-GO — inferir do endereço)

### Equipamentos
- Marca + potência módulo (Trina 700W, JA 615W, Jinko 635W, etc.)
- Quantidade de módulos
- Marca + modelo inversor (Sungrow SG5.0RS-L, Solis S6, Deye, etc.)
- **Tipo de estrutura de fixação** (telha cerâmica, metálica, fibrocimento, laje, solo, carport)

### Comercial
- Valor total da proposta (R$)

## Formas de pagamento OFICIAIS EcoSunPower

Eva sempre apresenta as **3 opções padrão** abaixo na proposta (a menos que Junior especifique customização):

### 1. À Vista — PIX ou TED ⭐ RECOMENDADO
- Pagamento único
- Sem juros, sem entrada
- Início imediato do projeto
- Maior economia no longo prazo

### 2. Cartão Belenus até 24×
- **Parceria EcoSunPower x Belenus** — taxa muito menor que cartão de mercado
- Calibrado abr/26: kit ~R$ 13k em 24× = acréscimo R$ 1.838 sobre à vista
- Acréscimo fixo de R$ 250 mesmo à vista (taxa admin Belenus)
- Taxa equivalente: ~0,42% a.m. (vs 6,5% cartão comum)
- Aprovação imediata, sem análise de crédito formal
- Ideal pra começar rápido

### 3. Financiamento até 90× com carência até 120 dias
- **Bancos parceiros: Solfácil, Sol Agora, BV Solar, Santander Crédito Solar**
- Aprovação depende do CPF/score do cliente
- Carência até 120 dias (1ª parcela só em ~4 meses)
- Aprovação em 24-48h
- Sua geração já paga a parcela
- Eva não escolhe o banco — apresenta as 4 opções e cliente decide com base na simulação

### Taxas reais ABRIL 2026 (fonte: Solfácil blog, Santander, BV, Canal Solar)

| Banco | Taxa a.m. | Prazo máx | Carência máx | Notas |
|---|---|---|---|---|
| Santander | 1,11–1,25% | 96× | 60d | Menor entre bancos comerciais; desconto até 10% |
| BV Solar | 1,17% (CET 1,35–1,50%) | 96× | 60d | Líder 47% market share |
| Solfácil | CET 1,32–1,57% | 24–144× | 1–6 meses (até 150d) | Aprovação biométrica em 30s |
| Sol Agora | (consultar) | 84× | até 150d | Foco em carência longa |
| Cartão Belenus | ~0,42% a.m. | 24× | imediato | Parceria EcoSunPower, taxa muito menor que cartão comum |

**Eva usa nos cálculos:**
- Cartão 24×: taxa 6,5% a.m. (Tabela Price)
- Financiamento 90×: CET médio 1,40% a.m. (cobre Solfácil/BV/Santander/Sol Agora)
- Carência padrão 120 dias capitalizada (4 meses)

**Atualizar trimestralmente** — taxas mudam com Selic. Última verificação: 29/04/2026.

### Customização
Junior pode pedir variações: "só à vista", "cartão 12x sem juros (eu absorvo)", "financiamento 60x (BV específico)", etc. Eva aceita e ajusta.

## Defaults INTELIGENTES (Eva NÃO pergunta)

| Campo | Default |
|---|---|
| HSP Brasília-DF | 5,2 h/dia |
| HSP Goiás (médio) | 5,3 h/dia |
| Tarifa Neoenergia-DF | R$ 1,05/kWh (atualizar trimestralmente) |
| Tarifa Equatorial-GO | R$ 0,98/kWh (atualizar trimestralmente) |
| Reajuste anual energia | 10% (média histórica 5 anos) |
| Vida útil sistema | 25 anos |
| TUSD Fio B Neoenergia DF | R$ 0,30/kWh (atualizar trimestralmente) |
| TUSD Fio B Equatorial GO | R$ 0,28/kWh (atualizar trimestralmente) |
| Percentual Fio B vigente 2026 | 60% (Lei 14.300/2022) |
| Cronograma Fio B | 2024=30%, 2025=45%, 2026=60%, 2027=75%, 2028=90%, 2029+=100% |
| % geração injetada (residencial sem bateria) | 70% (resto consumido na hora) |
| Custo iluminação pública (CIP) | R$ 35/mês média |
| Validade da proposta | 5 dias corridos |
| Garantia EcoSunPower instalação | 12 meses |
| Garantia módulo (defeito) | conforme fabricante (Trina 12, Jinko 12, JA 12) |
| Garantia módulo (eficiência linear) | 25-30 anos conforme marca |
| Garantia inversor | conforme fabricante (Sungrow 10a, Solis 10a, Deye 10a, Huawei 10a) |
| Empresa | EcoSunPower Energia Solar LTDA, CNPJ 33.020.459/0001-06 |
| Eng. responsável | Junior Candido, CREA-DF |
| Site/contato | ecosunpower.eng.br · (61) 99697-8781 |

## Cálculos que Eva DEVE fazer

```
Geração mensal kWh = potência_kwp × HSP × 30 × fator_perda
Geração anual kWh = geração_mensal × 12

Conta SEM sistema = consumo × tarifa + iluminação_pública

Conta COM sistema (Lei 14.300/2022 — Fio B):
  kWh_injetado = geração × % geração injetada (residencial ~70%)
  Fio_B_pago = kWh_injetado × TUSD_Fio_B × % Fio B vigente
  consumo_não_coberto = max(0, consumo - geração) × tarifa
  conta = Fio_B_pago + consumo_não_coberto + iluminação_pública

Economia mensal = conta_sem - conta_com
Valor R$/Wp final = valor_total / (kwp × 1000)
Payback (anos) = valor_total / economia_anual_média (com reajuste 10%)
ROI 25 anos = economia_25_anos / valor_total
TIR % = calcular via fluxo de caixa 25 anos
Economia 25 anos R$ = soma do fluxo de caixa anual
CO2 evitado = geração_25_anos × 0,084 kg/kWh (matriz BR)
Comparação Greener = R$/Wp_final vs faixa Greener correspondente
```

**IMPORTANTE — Fio B (Lei 14.300/2022):**
- Não existe mais "custo de disponibilidade" pra cliente solar
- Cliente paga Fio B sobre o kWh injetado na rede
- Em 2026 paga 60% do Fio B (cronograma sobe até 100% em 2029)
- Cliente sem bateria injeta ~70% da geração (resto consome no momento)
- Por isso payback ficou um pouco maior que antigamente (3.5-5a tipico)

## Validações que Eva DEVE fazer

1. **CPF/CNPJ** — formato válido (11 ou 14 dígitos)
2. **Telefone** — DDD + número, formato BR
3. **E-mail** — regex básico
4. **Consumo coerente** — se Junior disser "consumo 50.000 kWh residencial", Eva alerta (suspeito, residencial padrão é 200-1500 kWh)
5. **Modalidade × tipo cliente** — se "industrial Grupo A", modalidade deve ser autoconsumo local ou remoto, não compartilhada
6. **Concessionária × endereço** — auto-detectar pelo UF do endereço

## Fluxo após dados completos

1. Eva confirma resumo pro Junior:
   ```
   📋 Confirma os dados antes de gerar?
   
   Cliente: Marcos Silva (CPF 111.222.333-44)
   Endereço: Lago Sul, Brasília-DF
   Consumo: 1.000 kWh/mês — Neoenergia DF
   Sistema: 8,4 kWp · fator perda 0,80 · 12x Trina 700W · Sungrow SG5.0RS-L
   Modalidade: autoconsumo local
   Valor: R$ 38.500
   
   Manda "gerar" pra criar a proposta, ou "ajusta X".
   ```

2. Junior confirma → Eva:
   - Calcula tudo (geração, economia, payback, TIR, ROI, fluxo 25a)
   - Renderiza HTML (template oficial EcoSunPower v1)
   - Gera PDF (puppeteer)
   - Salva PDF no Drive em `EcoSunPower / Propostas / 2026 / [Nome Cliente] / Proposta-[data].pdf`
   - Publica versão web em `propostas.ecosunpower.eng.br/[id]` (Fase 1: link Drive público)
   - Manda pro Junior no zap:
     ```
     ✅ Proposta gerada! Confere antes de enviar pro cliente.
     📄 PDF: [link Drive]
     🌐 Versão web: [link]
     
     Pra mandar pro cliente: "enviar"
     Pra ajustar: "ajusta valor pra X" / "muda fator perda pra 0.75" / etc.
     ```

3. Junior responde "enviar" → Eva manda pro cliente via WhatsApp + email.

4. Cliente aceita (clicar botão na web ou responder zap) → dispara `/fechar` automaticamente com os dados da proposta.

## Comandos especiais

- `/proposta` — entra no modo
- `/sair` ou `/proposta off` — sai
- `/proposta ajuda` — mostra exemplos
- `/proposta lista` — últimas 5 propostas
- `/proposta status [nome]` — status (gerada / enviada / vista / aceita)
- "ajusta valor pra X" / "muda fator perda" / "troca módulo" — refinamento via diálogo
- "preview" — Eva manda PDF pra Junior conferir
- "enviar" — após preview, dispara pro cliente
- "edita no drive" — Junior abre Google Doc pra editar manualmente

## Comparação com Greener (sempre incluir)

Após calcular R$/Wp final, mostrar posicionamento:
- < -10% Greener: ⚠️ Abaixo do mercado (margem baixa, considere subir)
- -10% a +10%: ✅ Na média
- +10% a +25%: 💎 Premium (justifica: TOPCon, otimizadores, garantia 30 anos)
- > +25%: 🚨 Muito acima (revisar custos OU reduzir margem)

## Estrutura de pastas no Drive

```
EcoSunPower/
└── Propostas/
    └── 2026/
        ├── [Nome Cliente 1]/
        │   ├── Proposta-2026-04-29.pdf       ← versão atual
        │   ├── Proposta-2026-04-29.html      ← fonte web
        │   ├── dados.json                    ← dados de input pra regerar
        │   └── conta-luz.jpg                 ← anexo cliente (se enviou)
        └── [Nome Cliente 2]/
```

## Custo estimado por interação

- Cada proposta gerada: ~R$ 0,30-0,80 (Sonnet 4.6 com cache em multi-turno)
- Puppeteer (PDF): zero custo, roda local
- Google Drive API: gratuito (cota Workspace)
- Storage: ~500KB por proposta, irrelevante

## How to apply

Quando Junior digitar `/proposta`, "proposta", "gera proposta pra X", áudio similar:
1. Entrar em modo proposta (estado Redis TTL 1h)
2. Coletar dados, validar, perguntar o que falta (REGRA DE OURO)
3. Confirmar resumo antes de gerar
4. Calcular + gerar PDF + upload Drive + responder com links
5. Aguardar "enviar" pra mandar pro cliente
6. Quando cliente aceitar, disparar `/fechar` automático com os dados
