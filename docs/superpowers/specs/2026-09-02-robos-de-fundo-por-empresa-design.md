# Robôs de fundo por empresa — e o digest que induz o upgrade

**Data:** 02/09/2026
**Gatilho:** print do Junior às 07h03 — o Digest das 7h que chega no zap dele
listava leads da Conquista Solar (DDD 77) misturados com os da EcoSunPower.

---

## 1. O problema

Os robôs de fundo foram escritos quando só existia a EcoSunPower. Eles leem a
tabela `leads` **inteira** e mandam tudo pro `config.engineerPhone` (o zap do
Junior). Nenhum deles sabe que existe mais de uma empresa.

No print de 07h03 apareceram, no zap do Junior:

| Nome | Telefone | De quem é |
|---|---|---|
| Geraldo | (77) 98818-6875 | Conquista Solar |
| "amor ❤️" | (77) 98873-3117 | Conquista Solar |
| Leonardo Marinho | (77) 99989-8465 | Conquista Solar |
| Jimena | (77) 99961-0038 | **a própria linha da Clara** |
| Adriele Nascimento | (27) 99574-6379 | fora do DF |
| Daniella Cecília | (27) 99223-4174 | fora do DF |

Isso é o **mesmo vazamento LGPD de 31/08** (lead da Conquista no zap do Junior),
por um **caminho diferente** do que o PR #260 fechou.

### Por que a trava do PR #260 não pegou

`tenant-admin-guard.ts` pergunta *"de qual empresa é esta mensagem?"*. O digest
**não nasce de uma mensagem** — é um relógio (`setInterval`). Sem mensagem em
curso, `empresa()` devolve o padrão (EcoSunPower), a trava vê "é a EcoSun mesmo"
e libera.

O furo não está na trava. Está na **leitura**, que nunca separou as empresas.

### Onde está, exatamente

| Arquivo | O que faz | Frequência | Filtro por empresa |
|---|---|---|---|
| `src/modules/eva-digest.ts` | 7 consultas (leads, eva_cadence, conversations) | 3x/dia — 7h, 12h40, 21h | **nenhum** |
| `src/modules/eva-alerts.ts:434` | `sweepStuckHotLeads` — alerta lead quente parado | 1x/hora | **nenhum** |
| `src/modules/supabase.ts:674` | `getSilentLeadsWithoutCadence` — agenda cadência | 1x/hora | **nenhum** |
| `src/modules/supabase.ts:811` | `getDueCadenceSteps` — dispara cadência | 15 min | ✅ fixo na EcoSun |

Varredura completa: **20 módulos** consultam `leads` sem filtro de empresa. A
maioria é relatório de dashboard (que já roda dentro do contexto da empresa, via
`dashboard/router.ts`, com 48 usos de `company_id`). Os graves são os quatro
acima — os que **saem por WhatsApp**.

### O que NÃO está vazando (verificado)

`getDueCadenceSteps` (o disparo da cadência) já tem
`.eq('company_id', '00000000-...0001')` com o comentário *"cron fora de contexto:
só EcoSun (tenant = fase 2)"*. Ou seja: **nenhum cliente da Conquista recebeu
mensagem da Eva**. O agendador até enfileira, mas nada sai.

---

## 2. Decisões do Junior (02/09, manhã)

1. **Destino do digest de um tenant:** o próprio número da assistente
   (Clara = 5577999610038). A equipe da Conquista vive nesse aparelho.
2. **Cadência automática pra tenant: NÃO.** Em vez de a Clara cadenciar sozinha,
   o digest mostra os leads esfriando e diz que pra cadenciar automático precisa
   do **WhatsApp Oficial da Meta**.
3. **Objetivo declarado:** *"aí ela vai percebendo o que precisa fazer / vamos
   induzir ela a fazer"* — a mensagem é a isca do upgrade, não só um aviso.

### Por que a regra do WhatsApp Oficial é honesta

Mandar mensagem em massa pra quem está em silêncio há mais de 24h, por conexão
não-oficial, derruba o número. A regra *"pra cadenciar, precisa do Oficial"* não
é desculpa comercial — é o que protege a linha da Conquista. O trilho já existe
no código (`metaWaba.sendTemplate`, `enviarTemplateInicial`).

---

## 3. O desenho

### Fatia 1 — Fechar o vazamento

O digest passa a rodar **uma vez por empresa** em vez de uma vez só:

- `collectDigestData(client, hoursBack, companyId)` — as 7 consultas ganham
  `.eq('company_id', companyId)`.
- `maybeRunDigest` vira um laço sobre as empresas ativas.
- `sweepStuckHotLeads` (eva-alerts) ganha o mesmo filtro.
- `getSilentLeadsWithoutCadence` ganha o mesmo filtro — para de enfileirar
  cadência de empresa que não dispara.

**Armadilha da idempotência:** a trava anti-disparo-repetido é uma chave por dia
+ janela (`eva_digest_2026-09-02_manha`). Com várias empresas, a primeira
"gastaria" o disparo das outras. A chave passa a levar a empresa junto:
`eva_digest_2026-09-02_manha_<company_id>`.

**Resultado:** o Junior continua recebendo o digest às 7h/12h40/21h, só com
leads da EcoSunPower.

### Fatia 2 — O digest que induz

Destino do digest de um tenant = `telefone_atendente` da própria empresa.
Sem botões (não funcionam em chat consigo mesmo).

```
📊 Clara — Digest 7h

🆕 Novos no período (3):
• Geraldo — (77) 98818-6875
• Katiuscia Alvim — (77) 99944-4433
• Jefferson Cunha — (77) 98466-0017

⚠️ Esperando há mais de 24h (12):
• Leonardo Marinho — (77) 99989-8465
• Adriele Nascimento — (27) 99574-6379
  ...+10 outros

💤 Esses 12 esfriam se ninguém chamar hoje.
   Eu consigo chamar um por um, no dia certo,
   sem ninguém digitar — mas só pelo WhatsApp
   Oficial da Meta. Está no seu painel, em
   "Ativar WhatsApp Oficial".

📈 Conversas hoje: 2
```

Três decisões dentro do formato:

**A isca só aparece quando dói.** Sem ninguém esperando há mais de 24h, a linha
do WhatsApp Oficial **não vai**. Repetir com a fila vazia vira propaganda e a
Jimena para de ler. Com 12 nomes na tela, é constatação.

**O botão fica no painel, não na mensagem.** Ninguém consegue responder num chat
consigo mesmo: se a Jimena digitar ali, o webhook chega como `fromMe`, cai em
`index.ts:7570` e o sistema entende "humano assumiu" — cala a Clara. Então a
mensagem empurra pro painel, onde a **vitrine** tem o "Quero conhecer" que avisa
no zap do Junior.

**A Clara não cita o Junior nem a EcoSunPower.** Fala "está no seu painel". Quem
aparece é a plataforma, não a marca — a trava do PR #265 continua de pé.

### Mudança de regra no `tenant-admin-guard`

Hoje o guard diz: *tenant não manda aviso administrativo pra ninguém* — e
proíbe explicitamente a linha da assistente, com o argumento "o robô mandaria
mensagem pra ele mesmo".

A regra passa a distinguir duas coisas que estavam juntas:

| | Antes | Depois |
|---|---|---|
| Aviso de lead pro zap do dono da EcoSun | proibido | **proibido** (não muda) |
| Relatório pro próprio número da empresa | proibido | **permitido** |

A metade que importa pra LGPD — nada de um controlador vaza pro outro —
continua fechada. O que abre é a empresa falar consigo mesma.

---

## 4. O que os testes garantem

1. Digest da EcoSunPower não pode conter lead de outra empresa.
2. Digest de um tenant não pode conter lead da EcoSunPower.
3. Nenhum robô de fundo manda nada pro `engineerPhone` fora do contexto da
   EcoSunPower.
4. A chave de idempotência de uma empresa não bloqueia o disparo de outra.
5. A linha do WhatsApp Oficial não aparece quando não há leads silentes.
6. Empresa sem `telefone_atendente` não recebe digest (falha fechado).

---

## 5. Fora de escopo (de propósito)

- **Cadência automática pra tenant.** Cortada na conversa: exige WhatsApp
  Oficial. É justamente o que a isca vai vender.
- **Os outros 16 módulos** que consultam `leads` sem filtro. São relatórios de
  dashboard, que já rodam dentro do contexto da empresa. Merecem uma varredura
  própria, não esta.
- **A vitrine no dashboard.** É entrega separada, já na lista do Junior. Esta
  aqui só aponta pra lá.
