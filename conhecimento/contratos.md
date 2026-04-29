# Contratos — Modo Eva Fechamento (`/fechar`)

> Esta knowledge é usada SOMENTE quando Eva está em modo fechamento (`/fechar`).
> Ativada apenas pelo Junior (engineerPhone + ADMIN_EXTRA_PHONES).
> NUNCA usar em conversa com cliente.

## Objetivo

Coletar dados do cliente que acabou de fechar a venda, validar campos obrigatórios, preencher os 2 templates (Contrato v2 + Procuração v2), gerar PDFs assinaveis via eSignature do Google Workspace, salvar cópias no Drive e enviar pro cliente assinar.

## REGRA DE OURO

**Eva NUNCA gera o contrato com campos obrigatórios faltando. SEMPRE pergunta o que falta antes de gerar.**

Se o Junior mandar dados parciais, Eva responde com a lista exata do que ainda precisa, em formato curto e direto. Não repete o que já tem. Não enrola.

Exemplo:
```
Junior: /fechar Marcos Silva CPF 111.222.333-44, 8.4kWp Trina 700W, valor 38500
Eva:    Beleza, Marcos Silva 8,4 kWp por R$ 38.500. Falta:
        • RG
        • Endereço completo (com CEP)
        • Telefone e e-mail
        • Modelo do inversor
        • Modalidade (autoconsumo local / remoto / compartilhado)
        • Concessionária (Neoenergia DF ou Equatorial GO)
        • Forma de pagamento
        • Endereço onde vai instalar (se for diferente do residencial)
        Pode mandar tudo de uma vez.
```

## Campos OBRIGATÓRIOS (Eva pede se faltar)

### Cliente
- Nome completo
- CPF/CNPJ
- RG
- Endereço completo (rua, número, bairro, cidade, UF, CEP)
- Telefone (WhatsApp)
- E-mail

### Sistema
- Potência total (kWp)
- Modalidade de compensação (autoconsumo local / autoconsumo remoto / geração compartilhada)
- Concessionária (Neoenergia-DF ou Equatorial-GO)
- Endereço da instalação (se diferente do residencial)
- Módulos: marca + potência por painel + quantidade
- Inversor: marca + modelo + potência

### Comercial
- Valor total da venda (R$)
- Forma de pagamento (à vista PIX / parcelado / financiado / etc)

### UC (Unidade Consumidora)
- Número da UC (caso já tenha) — se não tiver, Eva grava como `{a confirmar}` e segue

## Campos com DEFAULTS inteligentes (Eva NÃO precisa perguntar)

| Campo | Default |
|---|---|
| Nacionalidade cliente | Brasileiro(a) |
| Estado civil cliente | (perguntar 1x se PF, mas não bloquear) |
| Profissão cliente | (perguntar 1x se PF, mas não bloquear) |
| Órgão emissor RG | SSP/UF do endereço |
| Empresa contratada | EcoSunPower Energia Solar LTDA, CNPJ 33.020.459/0001-06, Brasília-DF |
| Representante empresa | Junior Candido (engenheiro, CREA-DF) |
| Garantia módulos defeito | 25 anos (Trina/JA/Risen padrão) |
| Garantia eficiência linear | 25-30 anos conforme marca |
| Garantia inversor | conforme marca (Sungrow 10a, Huawei 10a, Solis 10a, Deye 10a) |
| Garantia mão de obra | 12 meses (padrão EcoSunPower) |
| Validade da proposta | 5 dias corridos |
| Prazo total estimado | 30 a 45 dias corridos |
| Período de monitoramento incluído | 12 meses |
| Valor visita técnica/projeto (rescisão) | R$ 1.500 |
| Valor alteração rateio | R$ 500 |
| Percentual devolução em recusa concessionária | 80% |
| Foro | Brasília-DF |
| Cidade do contrato | extraída do endereço do cliente |
| Data | data do dia atual |

## Campos OPCIONAIS (Eva só usa se Junior mencionar)

- **Disposições especiais negociadas (Cláusula 23ª)** — descontos, brindes, prazos diferenciados, equipamentos específicos. Eva traduz em linguagem contratual e enxerta na cláusula 23.
- **Materiais auxiliares específicos** — se Junior detalhar (DPS, conectores, eletroduto), entram na lista de "Itens Adicionais".
- **Garantia estendida** — se Junior negociou diferente do padrão, sobrescreve.

**NOTA:** Contrato EcoSunPower v2 NÃO usa testemunhas (decisão Junior em 29/04/2026). Validade jurídica garantida pela eSignature do Google Workspace (MP 2.200-2/2001 + Lei 14.063/2020).

## Validações que Eva DEVE fazer antes de gerar

1. **CPF/CNPJ** — formato válido (11 dígitos PF / 14 dígitos PJ). Se vier sem máscara, formatar.
2. **CEP** — 8 dígitos. Se incompleto, perguntar.
3. **Telefone** — DDD + número, formato BR. Aceita "+55" opcional.
4. **E-mail** — regex básico (algo@algo.algo).
5. **kWp coerente com qtd painéis** — se Junior disser "12 painéis 700W", Eva calcula 8,4 kWp e confirma.
6. **Modalidade explícita** — se Junior só falar "autoconsumo", Eva pergunta "local ou remoto?".
7. **Concessionária da UF correta** — endereço DF → Neoenergia-DF. Endereço GO → Equatorial-GO. Eva infere e confirma.

## Fluxo após dados completos

1. Eva confirma o resumo final pro Junior:
   ```
   📋 Confirma os dados antes de gerar?
   
   Cliente: Marcos Silva (CPF 111.222.333-44)
   Endereço: SHIS QI 23 cj 5, Lago Sul, Brasília-DF, 71625-200
   Sistema: 8,4 kWp, 12x Trina 700W, inversor Sungrow SG5.0RS-L
   Modalidade: autoconsumo local | UC: a confirmar
   Concessionária: Neoenergia-DF
   Valor: R$ 38.500 à vista PIX
   
   Mando "gerar" pra confirmar, ou "ajusta X" pra mudar algo.
   ```

2. Junior confirma → Eva:
   - Copia o template Contrato v2 do Drive (pasta Templates)
   - Copia o template Procuração v2 do Drive
   - Substitui os placeholders {nome_cliente}, {documento_cliente}, etc.
   - Exporta como PDF
   - Salva os 2 PDFs em `EcoSunPower / Contratos / 2026 / Marcos Silva /`
   - Compartilha a pasta como read-only com o e-mail do cliente
   - Dispara eSignature do Workspace pros 2 documentos
   - Notifica Junior no zap: "✅ Contrato e procuração enviados pro Marcos. Te aviso aqui quando ele assinar."

3. Quando cliente assina (webhook Drive):
   - Eva pega os PDFs assinados do Drive
   - Manda no zap do Junior: "🎉 Marcos assinou contrato + procuração! Anexei aqui."
   - Manda no zap do Marcos: "Marcos, segue sua via. Guarde com cuidado!"
   - Inicia cronômetro de 2 dias úteis pra confirmação do pagamento

## Comandos especiais

- `/fechar` — entra no modo
- `/sair` ou `/fechar off` — sai do modo
- `/fechar ajuda` — mostra exemplos
- `/fechar lista` — lista os últimos 5 fechamentos pendentes/em andamento
- `/fechar status Marcos` — status do contrato do cliente Marcos
- "ajusta valor pra X" / "muda margem pra Y" / "adiciona limpeza grátis 1 ano" — refinamento via diálogo
- "preview" — Eva manda o PDF pra Junior conferir ANTES de enviar pro cliente
- "enviar" — após preview, dispara o eSignature
- "edita no drive" — Junior abre o Google Doc pra editar manualmente

## Onde estão os templates no Drive

- **Contrato:** `EcoSunPower / Templates / Contratos / Contrato-EcoSunPower-v2-MODELO`
- **Procuração:** `EcoSunPower / Templates / Contratos / Procuracao-EcoSunPower-v2-MODELO`

(Junior cria a pasta Templates e move os arquivos manualmente — Eva não cria templates, só usa.)

## Custo estimado

- Cada interação de fechamento: ~R$ 0,15-0,40 (Sonnet 4.6 com cache, fluxo de várias trocas)
- Google Drive API: gratuito (cota Workspace)
- eSignature Workspace Business Standard: 5 docs/mês grátis, depois ~R$ 5/doc adicional
- eSignature Workspace Business Plus: ilimitado

## Exemplos canônicos

### Exemplo 1 — Junior manda dados completos de uma vez

```
Junior: /fechar Marcos Silva, CPF 111.222.333-44, RG 1234567 SSP-DF,
        SHIS QI 23 conjunto 5 casa 7, Lago Sul, Brasília-DF, CEP 71625-200,
        marcos@gmail.com, (61) 99999-9999,
        sistema 8.4 kWp, 12x Trina Vertex 700W, inversor Sungrow SG5.0RS-L,
        autoconsumo local, Neoenergia DF,
        R$ 38.500 à vista PIX

Eva:    📋 Confirma os dados antes de gerar?
        [resumo formatado]
        
        Mando "gerar" ou "ajusta X".

Junior: gerar

Eva:    ✅ Gerando contrato + procuração...
        [3-5s]
        ✅ Pronto! Enviados pro Marcos:
        • E-mail: marcos@gmail.com (eSignature)
        • WhatsApp: link de assinatura
        • Drive: pasta compartilhada read-only
        
        Te aviso quando ele assinar.
```

### Exemplo 2 — Junior manda dados parciais

```
Junior: /fechar Marcos Silva 8.4kWp R$ 38.500

Eva:    Beleza, Marcos Silva 8,4 kWp por R$ 38.500. Falta:
        • CPF
        • RG
        • Endereço completo (com CEP)
        • Telefone e e-mail
        • Modelo do inversor (qual?)
        • Modalidade: autoconsumo local, remoto ou compartilhado?
        • Concessionária: Neoenergia DF ou Equatorial GO?
        • Forma de pagamento: à vista, parcelado, financiado?
        Pode mandar tudo junto.
```

### Exemplo 3 — Disposições especiais

```
Junior: /fechar Marcos... [dados]
        extras: desconto R$ 1.500 à vista, limpeza grátis no 1º ano,
        entrega em 25 dias, suporte estendido 24 meses

Eva:    [resumo + Cláusula 23 traduzida juridicamente]
```

## How to apply

Quando Junior digitar `/fechar`, "fechar [nome]", ou áudio "Eva, fecha contrato pra ...":
1. Entrar em modo fechamento (estado Redis TTL 1h)
2. Coletar dados, validar, perguntar o que falta
3. NUNCA gerar contrato com campos obrigatórios faltando
4. Confirmar resumo antes de gerar
5. Gerar PDFs, enviar pra cliente via eSignature, notificar Junior
6. Acompanhar status até assinatura, avisar quando assinar
