# Eva consultora na abertura da proposta

> Spec — 17/06/2026. Linguagem de propósito (pra ler e aprovar).

---

## 1. O que a gente quer

Quando o cliente **abre a proposta** (`/p/:slug`), é o **pico de interesse** — ele está
olhando os números agora. Nesse momento a Eva deve **abordar o cliente como consultora do
Junior**: se apresentar, oferecer ajuda, **comparar opções, ajudar a decidir e persuadir a
fechar** (consultiva, não chata) e, quando o cliente quiser, **chamar o Junior**.

Já existe uma versão básica disso (`proposal-followup.ts`): na 1ª abertura a Eva manda uma
mensagem simples ("ficou alguma dúvida?"). Esta feature **turbina** isso.

## 2. A descoberta-chave (porque precisa de template)

No caso **comum**, o Junior manda a proposta pro cliente do **seu outro número** — então o
cliente **nunca falou com o número da Eva (WABA)**. Resultado: a janela de 24h do WhatsApp
está **fechada**, e a Eva **não pode mandar texto livre** (erro 131047). Hoje ela tenta e
**falha em silêncio** (marca `fora_janela_24h` e avisa o Junior) — o cliente não recebe
nada da Eva.

**Solução:** a abordagem da Eva é um **template aprovado** (`eva_proposta_aberta_v1` — nome
final confirmado pelo Junior ao criar na Meta). A Eva **já tem o telefone** do cliente (o que
o Junior coloca ao gerar a proposta) → essa é a **porta de entrada**. O template **sempre
funciona** (frio ou quente), então usamos ele na abordagem proativa.

## 3. Decisões do Junior (17/06)

- **Disparo automático**, na hora que abre, **1 vez só** (idempotência via `followup_sent_at`
  já existe; reaberturas só notificam o Junior, não re-abordam).
- **Abordagem = template** `eva_proposta_aberta_v1` (1 variável {{1}}=primeiro nome).
- **Conversa = Eva consultora** (modo proposta): compara opções, quebra objeção, ajuda a
  decidir, **persuade a fechar** — usando os dados da proposta dele.
- **Handoff:** quando o cliente quer falar com o Junior (ou sinaliza fechar), a Eva **avisa
  o Junior no zap** ("Fulano quer falar com você sobre a proposta" + botão pra abrir) e
  **pausa** pra aquele cliente (takeover) — o cliente não troca de número.

## 4. Como funciona (fluxo)

1. Cliente abre `/p/:slug` (1ª vez) → `proposal-followup` dispara.
2. Eva manda o **template `eva_proposta_aberta_v1`** pro telefone do cliente (porta de
   entrada). Marca `followup_sent_at`. Avisa o Junior ("Eva abordou o Fulano sobre a proposta").
   - Se já tinha mandado (followup_sent_at) → no-op. Reabertura → só notifica o Junior (como hoje).
   - Se cliente sem telefone → só avisa o Junior (como hoje).
3. Cliente **responde** → abre a janela de 24h → cai no **Brain** da Eva, agora com **postura
   de consultora de fechamento** pra clientes com proposta aberta (compara, persuade, ajuda a
   decidir). O Brain já tem dossiê + conhecimento técnico.
4. Cliente sinaliza **"quero falar com o Junior" / "quero fechar" / "pode me ligar"** → a Eva
   **avisa o Junior** (texto + botão pra abrir o cliente) e **pausa** (takeover) pra ele.

## 5. O que muda no código

- **`proposal-followup.ts`** — `executarEnvio`/`montarMensagemCliente`: trocar o texto livre
  pela chamada de **template** (`enviarTemplateInicial`-like, com fallback). A abordagem vira
  template sempre (porta de entrada fria). O aviso ao Junior ganha a linha "Eva abordou".
- **Template novo** `eva_proposta_aberta_v1` (criado/aprovado na Meta pelo Junior; nome final
  confirmado → apontar no código).
- **Brain (prompt)** — quando o cliente tem **proposta aberta** (followup enviado / contexto
  de proposta), adicionar a **postura consultiva de fechamento**: comparar opções da proposta,
  responder dúvidas técnicas, quebrar objeção, persuadir a fechar, e **detectar o pedido de
  falar com o Junior** → disparar o handoff.
- **Handoff** — reusar o mecanismo de **takeover** existente + o alerta com botão (mesmo
  padrão dos avisos com `evabt:`/botão "Assumir/abrir cliente"). Quando o Brain detecta a
  intenção, marca takeover pra aquele cliente e avisa o Junior.

## 6. Bordas e regras

- **Janela 24h:** a abordagem é template (funciona fechada). A conversa depois é texto livre
  (só roda enquanto o cliente responde, dentro da janela). Se o cliente sumir e voltar dias
  depois, é outra interação — fora de escopo nesta versão.
- **Idempotência:** 1 abordagem por proposta (followup_sent_at). Não re-aborda em reabertura.
- **Modo `junior_envia` vs `eva_envia`:** com template, os dois funcionam (o template não
  depende de janela). A abordagem automática vale pros dois; o "perguntar antes" do
  junior_envia deixa de ser necessário pra abordar (decisão: automático).
- **Takeover:** enquanto o Junior está atendendo (takeover ativo), a Eva não fala por cima.
- **Não-chata:** uma abordagem só; persuasão consultiva, sem insistência repetida.

## 7. Testes (Vitest)

- Texto do template (montar parâmetros {{1}}=primeiro nome).
- `executarEnvio`: usa template; em erro 131047 não "falha em silêncio" (agora template não
  cai nessa); marca followup_sent_at no sucesso; idempotência (não manda 2x).
- Detecção do handoff (intenção "falar com Junior/fechar") — função pura testável.
- Brain: contexto proposta aberta aplica a postura (teste do montador de prompt, se houver).

## 8. Fora de escopo (YAGNI)

- Template em outros idiomas; A/B de abordagem.
- Re-abordagem nas reaberturas.
- Cadência de follow-up de proposta (toques espaçados) — é outra coisa.
- Modo proposta como loop separado do Brain (reusa o Brain com a postura).

## 9. Risco / esforço

Médio-baixo. Reusa o gatilho + idempotência + avisos que já existem. O novo: 1 template
(aprovação Meta), trocar texto-livre→template na abordagem, postura de fechamento no Brain,
e o handoff via takeover. Sem migration. Build marker novo confirma o deploy.
