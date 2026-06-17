# Apagar entrada de venda com estorno automático

> Spec — 17/06/2026. Linguagem de propósito. Dinheiro em jogo — cuidado redobrado.

---

## 1. O problema

O Junior lança entradas normais (ex: "recebi 2.500 de instalação"). Quando a entrada é
de venda (PJ com nota), o sistema amarra **3 coisas** nela: a **conta a receber** (a venda),
o **imposto confirmado**, e o **total do mês (RBT12)**. Hoje, o "🗑️ Apagar lançamento"
**trava** nessas entradas ("estorno é manual") pra não bagunçar os números.

Resultado: o Junior **não consegue apagar uma entrada de venda errada** pelo menu — tem que
chamar pra ajustar no banco. Pra ele, isso é entrave no dia a dia: *"tem que apagar qualquer
entrada"*.

## 2. A solução: apagar que DESFAZ tudo (estorno)

Em vez de travar, apagar uma entrada de venda **desfaz tudo junto**, deixando os números
certos. O Junior apaga **qualquer entrada** pelo menu, sem trava.

**Quando apaga uma entrada com conta (venda), a Eva:**
1. Tira o valor do **recebido da conta** (volta `valor_recebido`).
2. Tira o **imposto** que tinha contado (volta `imposto_confirmado`).
3. Tira do **total do mês (RBT12)** — subtrai do bucket `financeiro_receita_mensal`
   (RPC `fin_somar_receita_mes` com valor **negativo**).
4. Apaga o **recebimento** (`financeiro_recebimentos`).
5. A conta:
   - se nasceu só desse lançamento (**avulsa**, sem fechamento) → **cancela/some**;
   - se era venda de verdade (do **/fechar**, tem fechamento) → **volta pra "a receber"**
     (status pendente, recebido zerado, imposto zerado) — como se não tivesse sido paga.
6. O lançamento vira **apagado** (fica no histórico).
7. Confirma no zap: *"🗑️ Apagado e estornado: tirei R$ X do recebido e R$ Y de imposto."*

## 3. Escopo da V1 (seguro)

- **Caso comum (Junior): 1 entrada ↔ 1 conta ↔ 1 recebimento.** Estorno completo, automático.
  É o caso de "recebi X de instalação" (entrada avulsa que cria a própria conta).
- **Pagamento parcial / conta com VÁRIOS recebimentos:** o vínculo entrada↔recebimento não é
  1:1 (não dá pra saber qual recebimento é de qual lançamento com segurança). Nesse caso a V1
  **mantém a trava**, com mensagem mais clara: *"Essa venda tem pagamentos parciais — me chama
  que a gente acerta com cuidado."* Raro pro Junior; evita estorno errado. (Melhoria futura:
  amarrar recebimento ao lançamento que o gerou.)
- Entrada **sem conta** (não é de venda) e **despesa**: apaga direto, como hoje (já funciona).

## 4. Como funciona (fluxo no menu)

`menu` → 💰 Financeiro → 🗑️ Apagar lançamento → lista → toca a entrada → confirma →
- se **não** é entrada de venda → soft-delete simples (hoje).
- se **é** entrada de venda com **1 recebimento** → **estorno completo** + apaga.
- se **é** venda com **vários recebimentos** → mensagem "me chama" (V1).

A confirmação (botão "🗑️ Apagar") já existe; muda só o que acontece ao confirmar.

## 5. O que muda no código

- **`financeiro/contas.ts` (ou repo):** nova função `estornarRecebimento(client, contaId)` —
  o **inverso** de `registrarRecebimento`: lê a conta + recebimentos; se 1 recebimento →
  subtrai do bucket (`fin_somar_receita_mes` negativo), apaga o recebimento, reverte/cancela
  a conta. Retorna `{ valorEstornado, impostoEstornado }` ou um sinal de "tem parcial, não dá".
- **`financeiro/apagar-menu.ts`:** `executarApagarLancamento` — trocar o guard
  `entrada + conta_id → ENTRADA_LIGADA_MSG` por: chamar `estornarRecebimento`; se OK → soft-delete
  o lançamento + confirma com o valor estornado; se "tem parcial" → a mensagem nova "me chama".
  Mesma proteção no `montarConfirmacaoApagarLancamento` (não bloqueia mais; mostra "vai estornar X").
- **Tabelas:** `financeiro_contas_a_receber`, `financeiro_recebimentos`, `financeiro_receita_mensal`
  (bucket via RPC), `financeiro_lancamentos`. **Sem migration** (só usa o que existe).
- Reaproveita `cancelarConta` (avulsa) e os helpers de bucket.

## 6. Bordas e regras

- **Tudo ou nada (consistência):** a ordem do estorno desfaz na ordem inversa do recebimento.
  Se um passo falhar, logar e avisar (não deixar meio-feito calado). V1: best-effort sequencial
  com logs (sem transação distribuída — Supabase REST). Aceitável pro volume.
- **Idempotência:** o soft-delete (status→apagado, CAS) já protege clique duplo. O estorno só
  roda quando a conta ainda está "recebida" (CAS no status da conta evita estornar 2x).
- **Admin-only:** todo o fluxo de apagar já é admin-only (menu). Mantém.
- **Avulsa vs venda real:** distinguir por `fechamento_id` (null = avulsa). Confirmar a coluna no plano.
- **Lucro/relatório:** ao estornar, KPIs (recebido, imposto, lucro, a receber) voltam ao certo
  sozinhos (eles leem das tabelas que o estorno corrige).

## 7. Testes (Vitest)

- `estornarRecebimento` (repo mockado): 1 recebimento avulso → subtrai bucket (valor negativo),
  apaga recebimento, cancela conta, retorna valorEstornado/impostoEstornado.
- venda real (fechamento_id set) → reverte conta pra pendente (não cancela).
- conta com 2 recebimentos → retorna sinal "parcial, não estorna" (mantém trava).
- `executarApagarLancamento`: entrada de venda 1-recebimento → estorna + apaga + mensagem com valor;
  entrada de venda parcial → mensagem "me chama"; despesa/entrada-sem-conta → apaga direto (hoje).

## 8. Fora de escopo (YAGNI)

- Estorno de pagamento parcial específico (precisa amarrar recebimento↔lançamento — futuro).
- Desfazer estorno (re-lançar). 
- Tela de estorno no dashboard.

## 9. Risco / esforço

Médio (é dinheiro). Sem migration. 1 função nova (inverso do recebimento) + troca do guard no
apagar. 3 code reviews obrigatórios (correção/regressão/segurança), com foco em: não deixar
número torto, não estornar 2x, parcial mantém trava. Build marker novo.
