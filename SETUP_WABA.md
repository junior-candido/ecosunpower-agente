# Setup WABA Cloud API — Passo a Passo

Documento gerado em 24/04/2026. Siga em ordem depois que o App Review for aprovado.

## Pré-requisitos

- [x] Verificação Comercial Meta APROVADA (24/04/2026)
- [x] App Review SUBMETIDO (em análise — aguardando aprovação ~2-7 dias)
- [ ] Chip novo ativado com número BR (Vivo/TIM/Claro)
- [ ] App Review APROVADO (quando sair)

## Etapa 1 — Registrar número na WABA

1. Acessa: https://business.facebook.com/wa/manage/home/
2. Clica em **Adicionar número** (Add phone number)
3. Insere o número NOVO (formato: +55 61 9XXXX-XXXX)
4. Escolhe método de verificação:
   - **SMS** (recomendado) → vai chegar no chip
   - **Voice call** (se SMS não chegar)
5. Recebe código de 6 dígitos no chip → digita no painel
6. Meta valida e libera o número na WABA
7. **Anota o Phone Number ID** (aparece no painel após verificação — é um número de ~15 dígitos)

## Etapa 2 — Criar Access Token

1. Acessa: https://developers.facebook.com/apps/2507358756362279/whatsapp-business/wa-settings/
2. Gera um **System User Access Token** (longa duração, não expira em 2h)
3. Permissões necessárias:
   - `whatsapp_business_messaging` (enviar mensagens)
   - `whatsapp_business_management` (gerenciar templates)
4. **Copia o token gerado** (só aparece 1 vez — salva em lugar seguro)

## Etapa 3 — Configurar Webhook da WABA

1. Ainda em `whatsapp-business/wa-settings/` → clica em **Webhooks**
2. URL do callback: `https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host/webhook/meta/whatsapp`
3. Verify Token: **gera uma string aleatória longa** (ex: uuid ou 32 chars random) — essa string você cola também na env `META_WABA_VERIFY_TOKEN`
4. Campos (fields) pra assinar:
   - ✅ `messages` (receber mensagens de clientes)
   - ✅ `message_template_status_update` (acompanhar aprovação de templates)
5. Clica em **Verificar e Salvar** — Meta vai fazer GET no webhook pra confirmar o challenge

## Etapa 4 — Adicionar env vars no Easypanel

Vai em: https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host → container `agente-whatsapp` → Environment Variables

Adiciona:

```env
META_WABA_PHONE_NUMBER_ID=<ID_DO_PASSO_1>
META_WABA_ACCESS_TOKEN=<TOKEN_DO_PASSO_2>
META_WABA_BUSINESS_ACCOUNT_ID=<WABA_ACCOUNT_ID>  # ver no painel WA, ao lado do Phone Number ID
META_WABA_VERIFY_TOKEN=<STRING_RANDOM_DO_PASSO_3>
USE_WABA_CLOUD_API=false  # deixa false ainda — so liga quando templates forem aprovados
```

## Etapa 5 — Criar templates de mensagem (24-48h de análise)

Templates precisam ser aprovados pela Meta antes de usar. Comece com esses 3:

### Template 1: `intro_lead_ads` (pra leads novos)

**Categoria:** Marketing  
**Linguagem:** Portuguese (BR)  
**Body:**
```
Oi {{1}}, aqui é o Junior da Ecosunpower ⚡

Vi que você mandou um sinal pelo anúncio sobre energia solar.

Pra eu já te passar uma ideia certinha, me conta: qual tá sendo sua conta de luz hoje?
```

Onde `{{1}}` é substituído pelo primeiro nome do lead.

### Template 2: `followup_1` (1º toque de reengajamento)

**Categoria:** Marketing  
**Body:**
```
Oi {{1}}, vi que a gente não conseguiu continuar nossa conversa sobre solar.

Queria te mandar uma dica rápida: {{2}}

Faz sentido a gente retomar?
```

Onde `{{2}}` é um conteúdo educativo do dia (ex: "com a Lei 14.300, quem instala até 2026 ainda pega tarifa antiga").

### Template 3: `proposta_pronta` (aviso que proposta foi gerada)

**Categoria:** Utility  
**Body:**
```
{{1}}, sua proposta personalizada tá pronta! ☀️

Sistema dimensionado pra sua conta de R${{2}}
Investimento: R${{3}}
Payback estimado: {{4}} meses

Dá uma olhada: {{5}}

Qualquer dúvida, me chama.
```

### Como submeter templates

1. Vai em: https://business.facebook.com/wa/manage/message-templates/
2. Clica **Criar template**
3. Preenche conforme acima
4. Submete → aguarda 24-48h (geralmente aprovado em 1-4h se não tiver termo proibido)

## Etapa 6 — Ligar WABA

Quando os 3 templates estiverem **APROVADOS**:

1. Volta no Easypanel → env vars
2. Muda `USE_WABA_CLOUD_API=true`
3. Reinicia o container
4. Eva agora responde pelo número novo via WABA

## Etapa 7 — Desligar Evolution API

Depois de 1-2 dias rodando bem no WABA:

1. Cancela o webhook do Evolution API no Easypanel
2. Desliga container Evolution
3. Remove env vars `EVOLUTION_*` (opcional, pode deixar como backup)

## Custos esperados

- **Conversations iniciadas por serviço (user contacta primeiro):** GRÁTIS na janela de 24h
- **Conversations de marketing iniciadas pela empresa:** ~R$0,35/conversa (24h de janela)
- **Conversations de utility (ex: confirmação):** ~R$0,14/conversa

Estimativa EcoSun (100 contatos/mês × 1-2 conversas): **R$50-200/mês**

## Monitoramento

- Dashboard: https://business.facebook.com/wa/manage/phone-numbers/
- Quality Rating: **tem que ficar em GREEN**. Se cair pra YELLOW/RED, para de mandar template e analisa.
- Metrics: templates enviados, delivery rate, read rate, block rate

## Troubleshooting comum

- **Webhook não verifica:** URL errada ou Verify Token diferente do que tá no .env
- **Mensagem retorna erro "recipient not in allowed list":** conta tá em modo dev, adiciona números de teste em Settings → WhatsApp
- **Template não aprova:** linguagem muito comercial, promessa, emoji excessivo. Simplifica o texto.
- **Status quality caiu:** muitos blocks/reports. Reduz volume, melhora segmentação, mensagem mais relevante.
