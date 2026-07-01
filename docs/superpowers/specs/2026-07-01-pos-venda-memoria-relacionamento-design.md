# Memória de relacionamento no pós-venda das usinas

Data: 2026-07-01
Autor: Junior + Claude

## Problema

No pós-venda, a Eva sugere ações pro operador ("pedir depoimento", "mandar
relatório"…), mas a sugestão é recalculada a cada carregamento **sem memória**:
a mesma dica (ex.: depoimento) **reaparece pra mesma pessoa todo dia** até virar
um contato registrado. Resultado: parece que a Eva "pede depoimento da mesma
pessoa 5×/mês". Não há bombardeio ao cliente — o depoimento só sai quando o
operador clica (`router.ts` POST manual). O incômodo é a **sugestão sem trava**.

Diagnóstico confirmado no código:
- `pos-venda-sugestao.ts::sugestaoProativa` é puro, recomputa toda vez, e só para
  de sugerir depoimento quando `jaTeveDepoimento` vira true (abordagem registrada).
- `pos-venda-saude.ts::acaoSugerida` idem (prioridade problema > marco > depoimento).
- Depoimento ao cliente é **manual** (`eva_pedir_depoimento` / POST em `router.ts`).
  Não existe "cliente não respondeu → reenvia".

## Objetivo

Dar **memória de relacionamento por cliente** à sugestão do pós-venda, pra que ela
**naturalmente não repita** e sugira o próximo passo que faz sentido. A trava de
tempo vira rede de segurança, não a regra principal.

Duas intenções separadas do Junior:
- **Depoimento = decisão manual dele.** Sai das sugestões automáticas; vira botão
  sempre disponível pra disparar no momento certo. Eva para de cutucar.
- **Geração saudável = a Eva sugere.** Quando a usina rendeu bem e faz tempo sem
  contato positivo, ela destaca ("bom momento pra mandar a boa notícia").

## Escopo

**Só o pós-venda das usinas.** O atendimento de LEAD pela Eva (qualificação) fica
**intocado** — está indo bem e não se mexe.

Não-objetivos: mudar o motor de atendimento de lead; criar template novo no Meta
(os templates que existem já cobrem: relatório, parabéns, limpeza, depoimento,
upgrade, contato); auto-enviar ao cliente sem aprovação do operador.

## O que NÃO muda (compatibilidade travada)

O copiloto do operador está no ar e validado ("funcionou liso") — é **intocável**.
Esta feature é uma **camada por cima** da sugestão; nada que funciona hoje é
removido. Ficam idênticos:

- **Chat da Eva no pós-venda** (escreve a mensagem, prévia, "Enviar pela Eva",
  sinal de enviado). O botão "Enviar" de uma sugestão abre **o mesmo copiloto**.
- **Templates** (relatório, parabéns, limpeza, depoimento, upgrade, contato) e o
  **fluxo de envio** (registro de abordagem incluído).
- **Agenda, notas internas, termômetro de feedbacks, saúde da usina.**
- **Atendimento de LEAD** pela Eva — fora de escopo, nem toca.

Só muda a **sugestão** (ganha memória, para de repetir), o **depoimento** (vira
botão manual, mesmo envio) e são **adicionados** a boa notícia de geração e o
"Agora não". Garantias: migration additiva (não altera tabela existente); TDD +
code review 3× + suíte completa verde antes de subir; comportamento seguro por
padrão (sem dado de memória, a dica continua elegível — nunca trava).

## Abordagem escolhida (A): memória leve + Eva escreve na hora

A sugestão passa a **ler o histórico** de cada cliente (o que já foi enviado/
sugerido, quando, se o cliente engajou) e decide de forma determinística o que
NÃO repetir. A Eva escreve a mensagem com contexto **quando o operador abre o
cliente** (fluxo do copiloto que já existe). Nada de IA rodando por cliente todo
dia (evita custo de token com a frota crescendo).

## Modelo de dados

Reusa o que existe + 1 tabela nova.

**Já existe (fonte de "o que foi enviado"):** tabela de **abordagens**
(`lead_id`, `tipo`, `enviada_em`) — de onde `pos-venda-queries` já tira "último
contato" e "já deu depoimento".

**Nova tabela `pos_venda_sugestao_memoria`** (migration 065) — guarda o que foi
**sugerido/dispensado** (o que abordagens não cobre):

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `lead_id` | uuid not null | cliente (FK leads) |
| `sistema_id` | uuid null | usina (FK sistemas_clientes), quando aplicável |
| `tipo` | text not null | situação: `geracao_saudavel` \| `queda` \| `offline` \| `marco` \| `upgrade` |
| `ultima_sugerida_em` | timestamptz | quando a dica foi mostrada |
| `ultima_acao` | text null | `enviada` \| `dispensada` |
| `ultima_acao_em` | timestamptz null | |
| `snoozed_until` | timestamptz null | cooldown (default ação + 30d) |
| `created_at` / `updated_at` | timestamptz | |

- **unique (lead_id, tipo)** → upsert: 1 linha de memória por cliente+situação.
- `tipo` é a SITUAÇÃO (não o template). Depoimento **não** entra aqui (é manual).

## Lógica da sugestão (memória-aware)

Substitui `sugestaoProativa`/`acaoSugerida` por um motor que, por cliente, junta:
saúde da usina, se rendeu bem no período, último contato por tipo (abordagens),
memória de sugestões (`snoozed_until`), aniversário/marco, elegível upgrade.

Retorna **a melhor sugestão** (0 ou 1 por cliente na tela; o digest agrupa).
Prioridade e travas:

1. **Offline / falha (urgente).** Fura o cooldown. MAS não repete o mesmo alerta
   não-resolvido todo dia — respeita a cadência da `proactive-alerts` (só volta se
   piorar, ou resolver e reacontecer). Sugere "avisar cliente + acionar visita".
2. **Queda de geração.** Saúde vermelho/queda → sugere limpeza/relatório.
   Respeita `snoozed_until` (30d), salvo piora relevante.
3. **Marco / data.** Aniversário da usina ou marco de economia → parabéns/
   relatório. Respeita cooldown.
4. **Geração saudável (positiva).** Saúde verde **e** rendeu bem no período **e**
   sem contato positivo há ~60d **e** não snoozed → sugere relatório/parabéns
   ("boa notícia"). É a sugestão que o Junior QUER.
5. **Upgrade.** Elegível → sugere; cooldown maior (90d).
6. **Depoimento.** **Removido do motor automático.** Vira botão manual sempre
   disponível (ver abaixo).

Regra de cooldown (rede de segurança): ao **enviar** OU **dispensar** um tipo,
grava `snoozed_until = agora + 30d` (upgrade: 90d). Enquanto snoozed, o tipo não
reaparece. Urgente ignora o snooze, mas respeita "já alertei e não resolveu".

"Rendeu bem no período" e "saúde" vêm de `pos-venda-saude.ts` (geração real vs
esperada) — reusar, não recriar.

## Interface

**Tela pós-venda (`pos-venda-views.ts`):** cada dica ganha dois botões:
- **Enviar** → abre o copiloto (Eva escreve com contexto) → registra abordagem +
  grava memória `ultima_acao='enviada'` + snooze 30d.
- **Agora não** → grava memória `ultima_acao='dispensada'` + snooze 30d (sem
  mandar nada). É o que ensina a Eva a não repetir.

**Depoimento manual:** botão fixo "⭐ Pedir depoimento" no card do cliente,
sempre disponível (não passa pelo motor de sugestão). Usa o fluxo de envio atual.

**Resumo diário no zap (incremento 2):** 1× ao dia, na janela já existente da
`proactive-alerts`, manda ao Junior um resumo: "N usinas pedem atenção" agrupado
por situação, com as de **geração saudável** destacadas, + link pro painel. Usa a
MESMA memória (não lista cliente cujas sugestões estão snoozed).

## Incrementos (pra testar em pedaços)

- **Incremento 1 (núcleo, testar primeiro):** migration 065 + motor memória-aware
  + botões Enviar/Agora não na tela + depoimento manual + sugestão de geração
  saudável. Valida a ponta: não repete, boa notícia só quando rendeu bem, urgente
  fura.
- **Incremento 2:** resumo diário no zap reusando a memória.

## Tratamento de erro

- Memória é aditiva: falha ao gravar memória **não** bloqueia o envio (loga warn,
  segue). Sem linha de memória = tipo elegível (comportamento seguro = pode
  sugerir, nunca "trava" por falta de dado).
- Upsert idempotente por (lead_id, tipo).

## Testes

- **Puro (vitest), o motor:** já sugeriu/enviou faz 10d → não repete; snooze
  expirou (31d) → volta; depoimento nunca aparece no motor; geração saudável só
  com saúde verde + rendeu bem + sem contato positivo 60d; urgente fura snooze
  mas não repete alerta não-resolvido; upgrade cooldown 90d.
- **Memória:** upsert por (lead_id, tipo); "dispensada" e "enviada" gravam snooze;
  leitura devolve snoozed_until certo.
- **Integração leve:** POST "agora não" grava memória; botão depoimento manual
  registra abordagem sem passar pelo motor.
- **Validação real:** com os clientes do Junior — simular "já mandei depoimento
  pro fulano" e confirmar que não reaparece; conferir a boa notícia.
