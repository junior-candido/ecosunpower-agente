# Cobrança recorrente (mensalidades) — guia do Junior

> 28/09/2026 · branch `feat/cobranca-recorrente` · migration **146**
> Código: `src/modules/cobranca-recorrente/` · Tela: **Financeiro › Assinaturas** (só a casa) · Tenant: **Minha assinatura**

## O que o robô faz sozinho

| Quando | O quê |
|---|---|
| **3 dias antes** do vencimento | Cria a fatura do mês, gera o link InfinitePay (Pix ou cartão) e manda pro cliente |
| **No dia** do vencimento (se não pagou) | Lembrete |
| **3 dias depois** (se não pagou) | Lembrete |
| **7 dias de atraso** | Te avisa no WhatsApp: "atrasada" (o cliente não recebe mais nada) |
| **Pagou pelo link** | Confere na InfinitePay (o aviso dela não é assinado), confere o valor, marca paga, lança **entrada no caixa** (categoria *Mensalidades*, banco *InfinitePay*), manda **recibo** e te avisa |

- Roda 1x por dia depois das 9h (Brasília). Nunca manda o mesmo aviso 2 vezes, nem com 2 servidores.
- Robô falhou ou a InfinitePay recusou o link → você recebe um aviso no WhatsApp.
- **Não suspende o acesso sozinho.** Com 7 dias de atraso você decide ("⋯ Mais › Suspender acesso"). Pagou → volta sozinho.
- Mudar o **valor** vale **da próxima fatura em diante** (a que já saiu fica com o valor antigo).
- **Pausar** = não gera fatura nem lembrete. **Cancelar** = para de cobrar de vez.

## Os botões da tela

- **Nova assinatura** — cadastro (cliente do painel ou avulso).
- **Gerar cobrança agora** — cria a próxima fatura sem esperar os 3 dias e já manda.
- **Reenviar** — manda o link de novo (texto do dia: "em aberto" / "vence hoje").
- **Copiar link** — pra mandar você mesmo.
- **Marcar como paga (Pix direto)** — quando o cliente pagou fora do link. Pede confirmação, lança no caixa e manda recibo.

## WhatsApp: os MODELOS que você precisa submeter na Meta

Fora da janela de 24 h a Meta só deixa mandar **modelo aprovado**. Enquanto os modelos
abaixo não forem aprovados, o robô manda a cobrança **por e-mail** e te manda no
WhatsApp **o texto pronto (com o link)** pra você encaminhar do seu celular.
Quando a Meta aprovar, o robô passa a usar sozinho (ele consulta a Meta — não precisa mexer em nada).

**Onde:** Gerenciador do WhatsApp (business.facebook.com) › Modelos de mensagem › Criar modelo.

### 1) `cobranca_mensalidade_v1`
- **Categoria:** Utilidade · **Idioma:** Português (BR)
- **Corpo:**

```
Olá, {{1}}! Aqui é da EcoSunPower. A fatura da sua mensalidade de {{2}} está em aberto: valor de {{3}}, com vencimento em {{4}}.

Para pagar por Pix ou cartão, use este link seguro: {{5}}

Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder por aqui.
```

- **Exemplos das variáveis** (a Meta pede):
  - {{1}} `Jimena`
  - {{2}} `Monitoramento de Usinas — outubro/2026`
  - {{3}} `R$ 297,00`
  - {{4}} `10/10/2026`
  - {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`
- Sem cabeçalho, sem rodapé, sem botão.

### 2) `recibo_mensalidade_v1`
- **Categoria:** Utilidade · **Idioma:** Português (BR)
- **Corpo:**

```
Olá, {{1}}! Recebemos o seu pagamento de {{2}} referente à mensalidade de {{3}}, em {{4}}. Obrigado pela confiança! Guarde esta mensagem como comprovante.
```

- **Exemplos:** {{1}} `Jimena` · {{2}} `R$ 297,00` · {{3}} `Monitoramento de Usinas — outubro/2026` · {{4}} `09/10/2026`

> O texto tem que ser **exatamente** este (o robô preenche as variáveis na ordem). Se a Meta pedir
> mudança, me avise antes de alterar — o código usa a mesma cópia (`src/modules/cobranca-recorrente/mensagens.ts`).

## Passo a passo — cadastrar a Jimena (Conquista Solar)

1. Aplicar a migration 146 (SQL no Desktop: `SQL-146-assinaturas-recorrentes.sql`) e Implantar.
2. Painel › **Financeiro › Assinaturas** › **Nova assinatura**:
   - Empresa no painel: **Conquista Solar**
   - Nome de quem paga: **Jimena Pereira Fonseca**
   - CPF ou CNPJ: **04.520.636/0001-15** (a observação registra que às vezes ela paga pelo CPF)
   - WhatsApp de cobrança: **o número que ela confirmar** (ex.: (77) 99961-0038, se for dela — **não** o da assistente)
   - E-mail de cobrança: o e-mail financeiro dela
   - Produto: Monitoramento de Usinas · Descrição: *Plataforma de monitoramento*
   - Valor: **297,00** · Dia de vencimento: **o que vocês combinarem (sugestão: dia 10)**
   - Primeira mensalidade: **outubro/2026** (setembro já foi pago junto com a implantação)
   - Observação: *Setembro pago junto da implantação (R$ 1.097 = ≈800 + 297). Paga às vezes pelo CPF, às vezes pelo CNPJ.*
3. Criar. A fatura de outubro sai sozinha 3 dias antes do dia escolhido — ou clique **Gerar cobrança agora**.
4. Ela vê as faturas em **Minha assinatura** (com o botão **Pagar**).

## Limites (o que NÃO faz)

- **InfinitePay não faz débito automático no cartão** (não tem assinatura/recorrência no Checkout Integrado): todo mês vai um **link novo**; o cliente paga cada um.
- Cartão parcelado: o link aceita, mas a mensalidade é cobrada no valor cheio; a **taxa não vem** na confirmação da InfinitePay (o caixa lança o valor pago e anota "taxa não informada").
- Sem boleto/NF automática aqui (NFS-e é no módulo Fiscal).
- O robô não cria fatura com mais de 7 dias de atraso (se ficou parado muito tempo, use **Gerar cobrança agora**).
