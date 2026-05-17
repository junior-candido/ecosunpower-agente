# Eva — Qualificação por Área de Atuação — Design Spec

**Data:** 2026-05-17
**Status:** Aprovado pelo Junior (brainstorm). Próximo: writing-plans.
**Origem:** Eva atendeu lead fora do raio sem filtrar por localização. Junior já documentou a área de atuação em `_INBOX-EVA-VENDAS/06_Manual_Ecosunpower.md` §3, mas isso nunca foi incorporado ao comportamento da Eva. Junior quer que a Eva detecte a cidade do lead e trate quem está fora da área.

## Objetivo

Adicionar qualificação geográfica à Eva — sem regredir nenhuma capacidade em produção — de forma que ela detecte a cidade do lead cedo na conversa e aja conforme a área de atuação real (instalação é física). Muda **quando/como ela qualifica por localização**, não o resto.

## Princípio inegociável: zero regressão

Preservar 100%, intocado, o comportamento atual em prod:
- `disqualify_lead` (lead inviável/vulnerável — caso Ivan) e sua seção no prompt "REGRA — LEAD ON-TOPIC MAS INVIAVEL / VULNERAVEL"
- `motivoEscalonamento`/`alertEscalonamento` + `leadEncerrado` (guard cross-layer) — Camada 2 do Eva Vendedora DNA
- Prompt caching (`system-blocks.ts`: `system-prompt.md` é o prefixo estável cacheado — a nova regra é prosa estática, não quebra)
- `/preco` (mandamento 7), `/proposta`, agendamento autônomo, takeover `/eva on|off|manutencao`, RAG, "Responsável Técnico", marcas premium, critério R$700/700kWh, sem markdown vazando
- Playbook de vendas, DNA de venda no prompt, carve-out de proatividade

## Área de atuação (fonte oficial — Junior, `06_Manual` §3)

Extrair APENAS os fatos limpos da §3. **NÃO** trazer o resto do `06_Manual` (história fabricada de 2014/franquia, "engenheiro técnico", contagens infladas) — esse arquivo foi excluído pela triagem do Eva Vendedora DNA por contaminação; só a §3 (fatos de cobertura) é legítima.

- **Distrito Federal:** todas as regiões administrativas (DF inteiro).
- **Goiás — 11 cidades confirmadas:** Valparaíso de Goiás, Jardim Ingá (Luziânia), Cidade Ocidental, Luziânia, Novo Gama, Pedregal (Novo Gama), Águas Lindas de Goiás, São João da Aliança, São Gabriel de Goiás, Alto Paraíso de Goiás, Formosa.
- **Regra do Junior para fora da lista:** nunca prometer atendimento de cidade não listada; sempre escalonar pro Junior validar. Frase documentada: *"Deixa eu confirmar com o Junior se atendemos sua cidade especificamente. Você pode me passar o nome dela e o nome da concessionária da sua conta de luz? Em muitos casos conseguimos atender mediante avaliação."*

## Comportamento (decisão aprovada: HÍBRIDO)

Eva detecta a cidade cedo na qualificação (ela já pergunta "cidade/bairro"; o lead tem campo `city`). Classifica em 3 casos:

1. **DENTRO** — DF (qualquer RA) OU uma das 11 cidades GO listadas → fluxo normal, **nada muda**.
2. **CLARAMENTE FORA** — outro estado / claramente longe, sem chance de atendimento (ex.: SP, BA, interior distante) → **corte digno**: 1 mensagem educada de encerramento + emite `disqualify_lead` com `reason="fora_de_area"` + PARA. Reusa o terminal já existente (reversível pelo botão Desfazer, notifica o Junior).
3. **AMBÍGUA / GO não listada / perto mas incerto** → **NÃO corta**: Eva responde com a frase documentada do Junior (pede cidade + concessionária, "confirmo com o Junior, em muitos casos atendemos mediante avaliação"), o lead **permanece ativo**, e Eva emite escalonamento pra o Junior validar. Eva NÃO promete atendimento.

Heurística de classificação (no prompt, julgamento da Eva — não regex rígido):
- Cidade/RA do DF → DENTRO.
- Uma das 11 GO (lista explícita no prompt) → DENTRO.
- Estado ≠ DF e ≠ GO → CLARAMENTE FORA (corte).
- GO mas não listada, ou cidade não identificável com clareza, ou cliente evasivo sobre localização → AMBÍGUA (escala, não corta).

## Arquitetura — 3 camadas (espelha o Eva Vendedora DNA, consistência + baixo risco)

### Camada 1 — Regra no `system-prompt.md` (nova seção, concisa, sempre ativa)
Nova seção curta "REGRA — ÁREA DE ATUAÇÃO" próxima da regra de lead inviável. Contém: a lista DF+11 (compacta — vai no prompt pra ser gate determinístico, sem risco de RAG não recuperar numa qualificação), os 3 casos acima, a frase documentada para o caso ambíguo, e o quê emitir (`disqualify_lead` no corte; sinal de escalonamento no ambíguo). Reconciliar explicitamente com a seção de lead inviável e o carve-out de proatividade (proatividade não reabre lead cortado por área; lead em "aguardando validação de área" não é tratado como esfriamento).

### Camada 2 — Lógica (REUSO, não duplicar)
- **Corte:** ação `disqualify_lead` já existente. Estender o handler para, quando `reason` indicar área (`fora_de_area`), gravar `contact_type='fora_area'` (em vez de `'inviavel'`) e usar um corpo de notificação distinto ("Eva encerrou — fora da área de atuação", com cidade), pra o Junior diferenciar no painel corte geográfico de corte por inviabilidade. `eva_active=false`, cancelamento de cadência, botão Desfazer — tudo reaproveitado, intacto. `leadEncerrado` já cobre o novo `contact_type` (basta incluir `'fora_area'` ou manter via `eva_active=false`).
- **Validar (ambíguo):** novo motivo em `motivoEscalonamento` (ex.: `fora_area_validar`) — porém este caso NÃO é detectável por regex de texto livre confiável; será **acionado pela própria Eva via uma action/sinal** (decisão de plano: a forma mais limpa é a Eva emitir um `action` que o handler converte em `alertEscalonamento` com o motivo, incluindo cidade + concessionária no alerta). Eva permanece ativa (lead aguarda validação). Reusa o canal/idempotência de `alertEscalonamento`.

### Camada Conhecimento
Arquivo curado com a área de atuação (DF todas RAs + 11 cidades + a regra de fora-da-lista). Decisão de plano: como a lista também vive no prompt (gate), o arquivo de conhecimento é complementar (referência/detalhe pra Eva responder "vocês atendem em X?"). Fonte: SOMENTE §3 limpa do `06_Manual`. Sem dados contaminados.

## Detecção da cidade

Reusar o que já existe: Eva captura cidade naturalmente na qualificação (campo `city` do lead; `residencial.md`/perguntas-qualificação já pedem "cidade/bairro"). A classificação é julgamento da Eva guiado pela regra do prompt — não nova infra de detecção, não DDD-parsing (DDD não é confiável: portabilidade, mudança). Se a cidade não foi dita ainda, Eva pergunta cedo (antes de aprofundar valor) como parte da qualificação.

## Regras de conteúdo / cuidados

- A frase do caso ambíguo é a documentada pelo Junior — não inventar atendimento; "em muitos casos atendemos mediante avaliação" é o teto (não vira promessa).
- Corte (caso fora) com a mesma dignidade do `disqualify_lead`: educado, sem destrato, porta aberta ("se você mudar pra nossa região, me chama").
- Não citar concorrente; não prometer; "Responsável Técnico" (nunca "engenheiro").
- Anti-bloat: a seção do prompt é concisa (~15-25 linhas, lista incluída). Medir bytes do `system-prompt.md` antes/depois (alvo < ~2 KB de acréscimo).

## Verificação (cérebro da Eva em prod = alto risco)

1. Cada item da seção "zero regressão" preservado e não-contraditado (revisão do diff).
2. `npx tsc` EXIT 0 + suíte verde (só `cases-fetcher` pré-existente permitida); `garantia-consistencia` e escalonamento seguem verdes.
3. Code review obrigatório (lógica nova + mudança de prompt cliente-facing), incl. checagem cross-layer (área × disqualify_lead inviável × proatividade × escalonamento — não duplicar nem contradizer; reaproveitar `leadEncerrado`).
4. Teste antes/depois com o Junior: lead DF (in), lead 1 das 11 GO (in), lead outro estado (corte), lead GO não listada (escala, não corta), lead evasivo sobre cidade (pergunta). Confirmar `/preco`, `/proposta`, agendamento, takeover, disqualify_lead inviável idênticos.
5. Deploy: push → Implantar. Rede de segurança: `/eva off` reverte; botão Desfazer reverte corte individual.
6. Atualizar memória.

## Fora de escopo

- Geocoding/distância real em km (não pedido; a regra é lista + julgamento, suficiente).
- DDD-parsing para inferir cidade (não confiável).
- Reescrever/ingerir o `06_Manual` inteiro (contaminado; só §3 limpa).
- Pendência separada já registrada: inconsistência da garantia de ESTRUTURA de fixação (faq.md "mínimo 5 anos" vs outros "25 anos") — Junior decide o número oficial; NÃO neste escopo.

## Critério de sucesso

Eva qualifica por localização cedo: segue normal dentro da área, encerra com dignidade quem está claramente fora (corte distinguível no painel, reversível), e escala pro Junior validar o ambíguo sem prometer nem cortar — com todas as capacidades atuais intactas.
