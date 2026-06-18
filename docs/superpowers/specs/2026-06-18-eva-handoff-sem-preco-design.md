# Eva — nunca cravar preço + handoff vivo pro Junior (redesign de comportamento)

Data: 2026-06-18
Status: aprovado em conceito (Junior), aguardando aprovação do spec
Arquivos-alvo: `src/prompts/system-prompt.md` (1547 linhas) e `src/prompts/residencial.md` (31)

## Por que (incidente)

Lead Vilma (R$600/mês): a Eva chutou preço de cabeça — "sistema 6-7 kWp, R$25-35 mil, parcela R$600-800/mês" — superdimensionou (pela tabela `precos-referencia.md`, R$500-800 = 3,4-5,4 kWp), gravou consumo 300 kWh (devia 350-550) e confundiu painéis com kWp. A cliente achou caro e quase cancelou. Junior teve que dar desconto.

**Causa raiz:** o prompt MANDA a Eva dar número (mandamento 7 + ~15 outros pontos), e a tabela de referência confiável nem está garantida no contexto. Pior: regras de prompt que pedem pra IA **fazer conta** ou **não espelhar o cliente** não seguram — a Eva volta a errar mesmo "com a regra". Conserto tem que ser **estrutural** (tirar o gatilho) e **completo** (todos os pontos), não remendo.

## O novo comportamento da Eva (decidido com o Junior)

1. **Qualifica** (ordem mantida): cumprimenta → pergunta **valor exato** da conta → se baixa (< critério), pergunta **"pretende aumentar o consumo?"** (carro elétrico / mais ar / ampliar) → pega **telhado** e **cidade**.
2. **NUNCA dá número ao cliente.** Proibido falar pro cliente: preço/faixa de preço, parcela em R$, kWp, quantidade de painéis, kWh estimado, payback em anos, R$/Wp, economia em R$. Pode falar de benefício **só de forma qualitativa** ("dá pra reduzir bastante sua conta", "solar aqui compensa muito"), sem número inventado. O número exato é responsabilidade do Junior / da proposta.
3. **No momento do preço/valor = handoff vivo, com consentimento.** A Eva pergunta:
   > "O Junior, nosso Responsável Técnico, pode te atender agora?"
   - **Cliente diz SIM** → a Eva dispara **`transfer_to_human`** na hora (Junior é avisado e entra na conversa e assume).
   - **Qualquer outra resposta** (agora não / mais tarde / vou pensar) → a Eva **segue o fluxo conforme o cliente** (propõe um horário concreto) **MAS sempre aciona o Junior do mesmo jeito** (lead quente nunca passa sem ele saber) — `transfer_to_human` com reason indicando o combinado.
4. **Nunca ecoa/repete** o que o cliente disse (papagaio). Reforçar com **exemplos** (exemplo segura estilo melhor que regra).
5. **Linguagem assertiva e certeira de agendamento** — sempre propõe horário concreto, nunca passivo:
   - ✅ "amanhã qual horário?" · "hoje ainda tem horário?" · "manhã ou tarde?" · "consigo te encaixar ainda hoje"
   - ❌ "te aguardo" · "pode pensar com calma" · "qualquer coisa me chama" · "te mando depois"

> Nota: o handoff vivo ("pode te atender agora?") é o **fechamento primário**. O fluxo de agendar visita/Meet futuro continua existindo como **alternativa pro "agora não"** — sempre com horário concreto e sempre avisando o Junior.

## O que SAI / MUDA no prompt (grounded na auditoria)

Todos os pontos abaixo hoje mandam a Eva cravar número — vão ser **removidos ou reescritos** pro comportamento "qualitativo + handoff":

| Linha(s) | Hoje | Vira |
|---|---|---|
| 55 | "É caro" → "paga em média R$15-25 mil... payback 4 a 6 anos" | Reframe pra valor + handoff, **sem número** |
| 77 | "Vc paga R$1.200/mês — em 5 anos economiza mais que o investimento" | Remove o número; valor qualitativo |
| 86–93 (mand. 6) | "Investimento R$28.000. Parcelado 60x de R$X..." | **Remove** o quote de parcela (isso é do Junior/proposta) |
| 95–107 (mand. 7) | "Cliente perguntou preço? Você **dá um número**... estimativa de mercado" | **Reescreve por completo:** "NUNCA dá número. No preço → handoff vivo pro Junior (script acima)" |
| 145, 163–164 | "NUNCA fale à vista sem parcelado"; "payback 4 a 6 anos" | Remove (Eva não fala preço/payback) |
| 195, 625, 635, 642 | "Eva faz cálculos/simulações (kWp, payback, dimensionamento)"; "PODE dar estimativas e cálculos" | Reescreve: Eva **não** apresenta números calculados ao cliente |
| 611, 615 | "reduz pra R$50-80"; "conta R$600, uns 5 kWp já resolvem" | Remove os números; benefício qualitativo |
| 990–996 | "Com R$700, uns 7 painéis... economia R$650/mês" | Remove/converte pra exemplo sem número |
| 1013–1014 | "Fiz o cálculo! Com [N] painéis de [W]W, economia R$[Z]/mês" | Remove |
| 1378–1382 | "conta R$900, 8 painéis Trina 720W, economia R$837/mês" | Remove |
| residencial.md 16–26 | "7 painéis Trina 720W → economia R$740/mês"; geração 85 kWh/painel | Remove os exemplos numéricos; mantém só perfil/segmento |

**Reforço (não tira, fortalece):**
- Anti-papagaio (537–553, 1026–1031, 1241): manter e **adicionar 2-3 exemplos few-shot** do jeito certo (reconhece em 1-3 palavras e avança).
- Postura/fechamento (46–48, 110–123, 149–150): **alinhar** com as frases assertivas novas e a **lista de frases proibidas**.
- Qualificação (327–353): **mantém** a ordem (exato → "pretende aumentar?" → telhado → cidade) e o critério de lead.

**Handoff (já existe, reusar):**
- `transfer_to_human` (251–270, 292, 1039–1058, 1190–1195) já é o mecanismo. O novo script "o Junior pode te atender agora?" entra como o **fechamento no momento do preço**, disparando `transfer_to_human` no SIM e também no "não agora" (com reason diferente).

## Como garantir que SEGURA (a parte que falhou antes)

1. **Tirar o gatilho, não só proibir** — o motivo nº1 da Eva cravar preço é o prompt MANDAR. Removendo/reescrevendo TODOS os ~15 pontos, ela deixa de ser empurrada pro erro. (estrutural)
2. **Exemplos few-shot** pro estilo (anti-papagaio + frase assertiva) — exemplo concreto pesa mais que regra abstrata pro modelo.
3. **Bloco único e no topo** — consolidar "PREÇO = nunca número, sempre handoff" num bloco curto e absoluto perto do início, em vez de espalhado e contraditório.
4. (Opcional, fast-follow) **Guardrail determinístico** — um pós-check barato que detecta R$/kWp/painéis numa resposta da Eva e bloqueia/reescreve antes de enviar. Fica pra 2ª etapa se o Junior quiser blindagem 100%.

## Fora de escopo (YAGNI)
- Mexer no /preco (precificadora interna do Junior) e no /proposta.
- Guardrail determinístico de pós-check (fast-follow opcional).
- Mudar tom/segmentação que não tenha a ver com preço/papagaio/fechamento.

## Aberto pra decisão do Junior
- **Economia qualitativa:** a Eva pode dizer "dá pra reduzir bastante sua conta" (sem R$) ou você quer **zero** menção a economia até você entrar? (recomendo permitir o qualitativo — motiva sem risco)
- **Guardrail determinístico (item 4):** fazer já junto ou deixar como 2ª etapa? (recomendo 2ª etapa)
