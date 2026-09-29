# Cobrança recorrente (mensalidades) — guia do Junior

> 28/09/2026 · branch `feat/cobranca-recorrente` · migration **146**
> Código: `src/modules/cobranca-recorrente/` · Tela: **Financeiro › Assinaturas** (só a casa) · Tenant: **Minha assinatura**

## A régua — "dois toques antes e dois depois"

| Quando | O quê |
|---|---|
| **D−3** | 1º toque: o robô cria a fatura do mês, gera o link (Pix ou cartão de crédito) e manda |
| **D−1** | 2º toque: "vence amanhã", com o link |
| **D0** | vencimento (sem mensagem extra) |
| **D+1** | 3º toque: "venceu", com o link |
| **D+2** | 4º toque: **último aviso** — "sua assistente será pausada amanhã", com o link. **Você também recebe no WhatsApp** |
| **D+3** | **PAUSA a assistente** do cliente (só cliente do painel) |
| **Pagou** | Confere na InfinitePay, marca paga, lança **entrada no caixa**, manda **recibo** e a **assistente volta sozinha** |

- Roda 1x por dia depois das 9h (Brasília). Nunca manda o mesmo aviso 2 vezes (nem com 2 servidores), e nunca 2 toques no mesmo dia.
- Robô falhou ou a InfinitePay recusou o link → você recebe um aviso no WhatsApp.
- Mudar o **valor** vale **da próxima fatura em diante**.
- **Pausar cobrança** = não gera fatura nem lembrete. **Cancelar** = para de cobrar e cancela as faturas em aberto.

## "Se não pagar, a assistente para"

- Só vale para **cliente do painel** (tenant, ex.: Conquista Solar / Clara). **A EcoSun e a Eva nunca pausam.** Cliente avulso não tem assistente.
- Pausada = a assistente **para de responder os clientes dele**; as mensagens **continuam chegando e ficam no painel dele** (Leads › Conversas), pra ele atender na mão. **Login, dados e telas continuam funcionando** (LGPD / boa-fé).
- No painel dele aparece uma faixa: *"Assistente pausada por fatura em aberto — Pagar agora (Pix ou cartão de crédito) · Ver faturas"*.
- **Pagou → volta sozinha** (pelo link ou quando você clica "Marcar como paga"), e ele e você são avisados. Se ainda deve outra fatura vencida, continua pausada.

### Como você ajusta (tela da assinatura › cartão "Assistente do cliente")

- **Dar mais prazo** (+1 a +30 dias): a pausa só acontece depois dessa data. Se já estava pausada, ela volta na hora.
- **Pausar agora** / **Reativar agora** (pedem confirmação).
- **Regra**: "Pausar automaticamente quando atrasar" (desmarque = **nunca pausar automaticamente**) e **"Pausa quantos dias depois do vencimento"** (padrão **3**; o último aviso sai sempre na véspera da pausa). Ex.: 5 → último aviso em D+4, pausa em D+5.

## WhatsApp: os 4 MODELOS que você submete na Meta

Fora da janela de 24 h a Meta só deixa mandar **modelo aprovado**. Enquanto um modelo não é
aprovado, aquele aviso sai **por e-mail** e você recebe no WhatsApp **o texto pronto (com o link)**
pra encaminhar. Aprovou → o robô passa a usar sozinho (ele consulta a Meta; não precisa mexer em nada).

**Onde:** Gerenciador do WhatsApp (business.facebook.com) › Modelos de mensagem › Criar modelo.
Todos: **Categoria: Utilidade · Idioma: Português (BR)** · sem cabeçalho, rodapé ou botão.
O texto tem que ser **exatamente** este (o código usa a mesma cópia em `src/modules/cobranca-recorrente/mensagens.ts`).

### 1) `cobranca_mensalidade_v1` (D−3, D−1, D+1)
```
Olá, {{1}}! Aqui é da EcoSunPower. A fatura de {{2}} está em aberto: valor de {{3}}, com vencimento em {{4}}.

Você pode pagar por Pix ou cartão de crédito neste link seguro: {{5}}

Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder por aqui.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `10/10/2026` · {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 2) `aviso_pausa_assistente_v1` (D+2 — último aviso)
```
Olá, {{1}}. A fatura de {{2}} ({{3}}) venceu e ainda está em aberto. Para a sua assistente virtual continuar atendendo, o pagamento precisa ser identificado até {{4}}; depois disso ela é pausada até a fatura ser paga.

Pague por Pix ou cartão de crédito neste link seguro: {{5}}

Seu painel continua funcionando normalmente. Se você já pagou, pode desconsiderar.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `12/10/2026` · {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 3) `assistente_pausada_v1` (D+3 — pausou)
```
Olá, {{1}}. Como a fatura de {{2}} ({{3}}) segue em aberto, a sua assistente virtual foi pausada hoje. O painel continua funcionando e as mensagens dos seus clientes continuam chegando nele, para você responder.

Assim que o pagamento for confirmado, ela volta a atender sozinha. Pague por Pix ou cartão de crédito: {{4}}
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 4) `recibo_mensalidade_v1` (pagou)
```
Olá, {{1}}! Recebemos o seu pagamento de {{2}} referente a {{3}}, em {{4}}. Obrigado pela confiança! Guarde esta mensagem como comprovante.
```
Exemplos: {{1}} `Jimena` · {{2}} `R$ 297,00` · {{3}} `Monitoramento de Usinas — outubro/2026` · {{4}} `09/10/2026`

Cliente sem painel (avulso) ou com "nunca pausar": no D+2 recebe o modelo 1 (lembrete comum, sem falar de assistente).

## Passo a passo — cadastrar a Jimena (Conquista Solar)

1. Aplicar a migration 146 (SQL no Desktop: `SQL-146-assinaturas-recorrentes.sql`) e Implantar.
2. Painel › **Financeiro › Assinaturas** › **Nova assinatura**:
   - Cliente do painel: **Conquista Solar**
   - Nome de quem paga: **Jimena Pereira Fonseca** · CPF ou CNPJ: **04.520.636/0001-15**
   - WhatsApp de cobrança: **o número que ela confirmar** (ex.: (77) 99961-0038, se for dela — **não** o da assistente)
   - E-mail de cobrança: o e-mail financeiro dela
   - Produto: Monitoramento de Usinas · Descrição: *Plataforma de monitoramento*
   - Valor: **297,00** · Dia de vencimento: **o que vocês combinarem (sugestão: dia 10)**
   - Primeira mensalidade: **outubro/2026** (setembro foi pago junto com a implantação)
   - Observação: *Setembro pago junto da implantação (R$ 1.097 = ≈800 + 297). Paga às vezes pelo CPF, às vezes pelo CNPJ.*
3. Criar. A fatura de outubro sai sozinha 3 dias antes do dia escolhido — ou **Gerar cobrança agora**.
4. Na tela dela, cartão **Assistente do cliente**: confira a regra (padrão: pausa 3 dias depois do vencimento).
5. Ela vê as faturas em **Minha assinatura** (botão **Pagar**).

## Limites

- **InfinitePay não faz débito automático no cartão**: todo mês vai um **link novo**; o cliente paga cada um.
- **Pix e cartão de crédito**: o checkout da InfinitePay mostra os dois no mesmo link. A API de links **não tem campo** pra escolher a forma, travar parcelas nem repassar a taxa (o código já registrava isso em `cobranca-forma.ts`). Então: **parcelas máximas por assinatura e "taxa do cartão com o cliente" não são possíveis pela API** — o cliente pode parcelar no checkout, e a taxa fica com a gente. (Alternativa futura: 2 links por fatura — Pix no valor cheio e cartão com a taxa embutida, como a tela "Cobrar" já faz.)
- A **taxa** não vem na confirmação da InfinitePay (o caixa lança o valor pago e anota "taxa não informada").
- A pausa vale para as **respostas** da assistente. Mensagens automáticas que ela mesma inicia (follow-up/cadência do tenant) não foram mexidas nesta entrega.
- O robô não cria sozinho fatura com mais de 7 dias de atraso (use **Gerar cobrança agora**).
