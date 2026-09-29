# Cobrança recorrente (mensalidades) — guia do Junior

> 28/09/2026 · branch `feat/cobranca-recorrente` · migration **146**
> Código: `src/modules/cobranca-recorrente/` · Tela: **Financeiro › Assinaturas** (só a casa) · Tenant: **Minha assinatura**

## A régua — "dois toques antes e dois depois" + duas travas

| Quando | O quê |
|---|---|
| **D−3** | 1º toque: o robô cria a fatura do mês, gera o link (Pix ou cartão de crédito) e manda |
| **D−1** | 2º toque: "vence amanhã", com o link |
| **D0** | vencimento (sem mensagem extra) |
| **D+1** | 3º toque: "venceu", com o link |
| **D+2** | 4º toque: **último aviso** — "sua assistente será pausada amanhã", com o link. **Você também recebe no WhatsApp** |
| **D+3** | **1ª TRAVA**: a assistente do cliente **para de responder** (só cliente do painel) |
| **D+6** | aviso: "amanhã param também as mensagens automáticas", com o link (+ você) |
| **D+7** | **2ª TRAVA**: param também os **disparos automáticos** pros clientes dele (cadência, follow-ups, reativação, lembretes) |
| **Pagou** | Confere na InfinitePay, marca paga, lança **entrada no caixa**, manda **recibo** e **as duas travas voltam sozinhas** — os disparos que ficaram na fila voltam de onde pararam, **aos poucos** (espaçados, sem enxurrada) |

- Roda 1x por dia depois das 9h (Brasília). Nunca manda o mesmo aviso 2 vezes (nem com 2 servidores), nunca 2 toques no mesmo dia, e **nunca aviso e trava no mesmo dia** (a trava só vem depois que o aviso da véspera saiu).
- Robô falhou ou a InfinitePay recusou o link → você recebe um aviso no WhatsApp.
- Mudar o **valor** vale **da próxima fatura em diante**.
- **Pausar cobrança** = não gera fatura nem lembrete. **Cancelar** = para de cobrar e cancela as faturas em aberto.

## Quem recebe os avisos de cobrança

Todos (faturas, lembretes, último aviso, 1ª e 2ª trava, reativação, recibo) vão **só** para:
1. **você** (Junior, no seu WhatsApp); e
2. o **contato de cobrança** cadastrado na assinatura — a **proprietária** do tenant (ex.: Jimena: WhatsApp + e-mail dela).

**Nunca** para os clientes do tenant, **nunca** pelo número/instância da assistente dele (Clara), **nunca** para outros usuários do tenant (vendedoras). O envio sai **sempre pelo número da EcoSun (Eva/WABA) ou pelo e-mail da casa**.

## "Se não pagar, a assistente para" — as duas travas

- Só vale para **cliente do painel** (tenant, ex.: Conquista Solar / Clara). **A EcoSun e a Eva nunca pausam.** Cliente avulso não tem assistente.
- **1ª trava (D+3)**: a assistente **para de responder os clientes dele**; as mensagens **continuam chegando e ficam no painel dele** (Leads › Conversas), pra ele atender na mão.
- **2ª trava (D+7)**: param também os **disparos automáticos** pros clientes dele (cadência, follow-ups de proposta, reativação, lembretes de manutenção, pós-instalação, e-mails da jornada). Eles **ficam na fila** — não se perdem.
- Os avisos administrativos pra ele mesmo (resumo diário, avisos de cobrança) **continuam**.
- **Login, dados e telas continuam funcionando** (LGPD / boa-fé). Faixa no painel dele:
  - admin/proprietária: *"Assistente pausada por fatura em aberto"* (ou *"Assistente e mensagens automáticas pausadas"* na 2ª trava) + **Pagar agora (Pix ou cartão de crédito)** + Ver faturas;
  - outros usuários (vendedoras): só *"Assistente pausada. Fale com a administradora da conta."* — sem valores nem botão Pagar. "Minha assinatura" também só mostra faturas pra admin/proprietária.
- **Pagou → as duas voltam sozinhas** (pelo link ou quando você clica "Marcar como paga"), e ela e você são avisados. Se ainda deve outra fatura vencida, continua pausada.

### Como você ajusta (tela da assinatura › cartão "Assistente do cliente")

- **Dar mais prazo** (+1 a +30 dias): **adia as duas travas** (mantendo a distância entre elas). Se já estava pausada, volta na hora.
- **Pausar agora** / **Reativar agora** (pedem confirmação; reativar desfaz as duas).
- **Regra**:
  - "Pausar automaticamente quando atrasar" — desmarque = **nunca pausar** (nem a 1ª nem a 2ª trava);
  - **"1ª trava: para de responder"** — dias depois do vencimento (padrão **3**; último aviso na véspera);
  - **"2ª trava: param os disparos automáticos"** — dias depois do vencimento (padrão **7**; aviso na véspera; sempre depois da 1ª).

## Quais modelos estão APROVADOS (e como marcar um novo — sem deploy)

Situação em 28/09/2026:
- ✅ **aprovados** (saem pelo WhatsApp): `cobranca_mensalidade_v1`, `aviso_pausa_assistente_v1`, `assistente_pausada_v1`
- ⏳ **ainda não**: `recibo_mensalidade_v1` (submetido), `aviso_pausa_disparos_v1` e `disparos_pausados_v1` (não submetidos) → esses saem por **e-mail + texto pronto no seu WhatsApp** pra encaminhar.

O robô só usa o WhatsApp pra modelo que está na **lista de aprovados**. A lista vem, nesta ordem:
1. linha `cobranca_modelos_aprovados` na tabela `app_flags` (muda **sem deploy**; o robô relê a cada 5 min);
2. variável de ambiente `COBRANCA_MODELOS_APROVADOS` no EasyPanel (precisa reiniciar);
3. padrão do código = os 3 aprovados acima.

**Quando a Meta aprovar outro modelo**, cole no SQL Editor do Supabase (a lista inteira, separada por vírgula):
```sql
INSERT INTO app_flags (key, value) VALUES
  ('cobranca_modelos_aprovados', 'cobranca_mensalidade_v1, aviso_pausa_assistente_v1, assistente_pausada_v1, recibo_mensalidade_v1')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
```
(Pra tirar um da lista, rode de novo sem ele. Apagar a linha volta pro padrão.)

## WhatsApp: os 6 MODELOS que você submete na Meta

Fora da janela de 24 h a Meta só deixa mandar **modelo aprovado**. Enquanto um modelo não é
aprovado, aquele aviso sai **por e-mail** e você recebe no WhatsApp **o texto pronto (com o link)**
pra encaminhar. Aprovou → o robô passa a usar sozinho (ele consulta a Meta; não precisa mexer em nada).

**Onde:** Gerenciador do WhatsApp (business.facebook.com) › Modelos de mensagem › Criar modelo.
Todos: **Categoria: Utilidade · Idioma: Português (BR)** · **sem cabeçalho, rodapé ou botão** (o link vai no corpo).
**Nenhum começa nem termina com variável** (a Meta recusa). O texto tem que ser **exatamente** este
(o código usa a mesma cópia em `src/modules/cobranca-recorrente/mensagens.ts`).

### 1) `cobranca_mensalidade_v1` (D−3, D−1, D+1)
```
Olá, {{1}}! Aqui é da EcoSunPower. A fatura de {{2}} está em aberto: valor de {{3}}, com vencimento em {{4}}.

Você pode pagar por Pix ou cartão de crédito neste link seguro: {{5}}

Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder por aqui.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `10/10/2026` · {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 2) `aviso_pausa_assistente_v1` (D+2 — último aviso antes da 1ª trava)
```
Olá, {{1}}. A fatura de {{2}} ({{3}}) venceu e ainda está em aberto. Para a sua assistente virtual continuar atendendo, o pagamento precisa ser identificado até {{4}}; depois disso ela é pausada até a fatura ser paga.

Pague por Pix ou cartão de crédito neste link seguro: {{5}}

Seu painel continua funcionando normalmente. Se você já pagou, pode desconsiderar.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `12/10/2026` · {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 3) `assistente_pausada_v1` (D+3 — 1ª trava)
```
Olá, {{1}}. Como a fatura de {{2}} ({{3}}) segue em aberto, a sua assistente virtual foi pausada hoje. O painel continua funcionando e as mensagens dos seus clientes continuam chegando nele, para você responder.

Pague por Pix ou cartão de crédito neste link seguro: {{4}}

Assim que o pagamento for confirmado, ela volta a atender sozinha.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 4) `aviso_pausa_disparos_v1` (D+6 — véspera da 2ª trava)
```
Olá, {{1}}. A fatura de {{2}} ({{3}}) segue em aberto e a sua assistente virtual já está pausada. Se o pagamento não for identificado até {{4}}, também vamos pausar as mensagens automáticas para os seus clientes (acompanhamentos, lembretes e reativações).

Pague por Pix ou cartão de crédito neste link seguro: {{5}}

Seu painel continua funcionando normalmente. Se você já pagou, pode desconsiderar.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `16/10/2026` · {{5}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 5) `disparos_pausados_v1` (D+7 — 2ª trava)
```
Olá, {{1}}. Como a fatura de {{2}} ({{3}}) segue em aberto, as mensagens automáticas para os seus clientes (acompanhamentos, lembretes e reativações) foram pausadas hoje, junto com a assistente virtual. O painel continua funcionando.

Pague por Pix ou cartão de crédito neste link seguro: {{4}}

Assim que o pagamento for confirmado, tudo volta sozinho, aos poucos.
```
Exemplos: {{1}} `Jimena` · {{2}} `Monitoramento de Usinas — outubro/2026` · {{3}} `R$ 297,00` · {{4}} `https://checkout.infinitepay.io/ecosunpower/exemplo`

### 6) `recibo_mensalidade_v1` (pagou)
```
Olá, {{1}}! Recebemos o seu pagamento de {{2}} referente a {{3}}, em {{4}}. Obrigado pela confiança! Guarde esta mensagem como comprovante.
```
Exemplos: {{1}} `Jimena` · {{2}} `R$ 297,00` · {{3}} `Monitoramento de Usinas — outubro/2026` · {{4}} `09/10/2026`

Cliente sem painel (avulso) ou com "nunca pausar": no D+2 recebe o modelo 1 (lembrete comum, sem falar de assistente) e não tem aviso de D+6.

## Passo a passo — cadastrar a Jimena (Conquista Solar)

1. Aplicar a migration 146 (SQL no Desktop: `SQL-146-assinaturas-recorrentes.sql`) e Implantar.
2. Painel › **Financeiro › Assinaturas** › **Nova assinatura**:
   - Cliente do painel: **Conquista Solar**
   - Nome de quem paga: **Jimena Pereira Fonseca** · CPF ou CNPJ: **04.520.636/0001-15**
   - WhatsApp de cobrança: **o dela, proprietária** — (77) 99961-0035 (confirmar o número; **não** o da assistente Clara)
   - E-mail de cobrança: o e-mail financeiro dela
   - Produto: Monitoramento de Usinas · Descrição: *Plataforma de monitoramento*
   - Valor: **297,00** · Dia de vencimento: **o que vocês combinarem (sugestão: dia 10)**
   - Primeira mensalidade: **outubro/2026** (setembro foi pago junto com a implantação)
   - Observação: *Setembro pago junto da implantação (R$ 1.097 = ≈800 + 297). Paga às vezes pelo CPF, às vezes pelo CNPJ.*
3. Criar. A fatura de outubro sai sozinha 3 dias antes do dia escolhido — ou **Gerar cobrança agora**.
4. Na tela dela, cartão **Assistente do cliente**: confira a regra (padrão: 1ª trava em 3 dias, 2ª trava em 7 dias).
5. Ela vê as faturas em **Minha assinatura** (botão **Pagar**).

## Limites

- **InfinitePay não faz débito automático no cartão**: todo mês vai um **link novo**; o cliente paga cada um.
- **Pix e cartão de crédito**: o checkout da InfinitePay mostra os dois no mesmo link. A API de links **não tem campo** pra escolher a forma, travar parcelas nem repassar a taxa (o código já registrava isso em `cobranca-forma.ts`). Então: **parcelas máximas por assinatura e "taxa do cartão com o cliente" não são possíveis pela API** — o cliente pode parcelar no checkout, e a taxa fica com a gente. (Alternativa futura: 2 links por fatura — Pix no valor cheio e cartão com a taxa embutida, como a tela "Cobrar" já faz.)
- A **taxa** não vem na confirmação da InfinitePay (o caixa lança o valor pago e anota "taxa não informada").
- A 2ª trava segura as filas de disparo automático conhecidas (cadência, apresentação, follow-up de proposta, pós-instalação, reativação, lembrete de manutenção, e-mails da jornada) num **ponto único** (`pausa.ts#filtrarDisparosLiberados`). Fila nova de disparo tem que passar por ele (e entrar em `disparos-repo.ts` pro reagendamento).
- O robô não cria sozinho fatura com mais de 7 dias de atraso (use **Gerar cobrança agora**).
