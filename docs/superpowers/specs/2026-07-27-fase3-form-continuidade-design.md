# Fase 3 da campanha — respostas do form no lead + Eva modo continuação

**Data:** 27/07/2026 · **Aprovado por:** Junior (opção "confirmar e aprofundar")

## Problema

O form Meta novo (campanha do funil conversacional, 26/07) pergunta faixa da conta
e tipo de imóvel — mas hoje essas respostas morrem no `extraFields` do
`normalize()` (só usadas no welcome do caminho Evolution e no aviso pro Junior).
Quando o lead responde o template, a Eva não sabe nada do form e re-pergunta o
que ele já respondeu — quebra a promessa "seu estudo já está em andamento".

## Decisões

- **Armazenamento: `leads.energy_data` (jsonb já existente), SEM migration.**
  Mesma convenção da importação de junho (`leads-import-meta-junho.ts`):
  `conta_faixa`, `tipo_imovel`, `fonte: 'meta_form'`. Alerta de lead quente,
  follow-up e dashboard já leem esse campo.
- **Comportamento da Eva: confirmar e aprofundar (escolha do Junior).** Na 1ª
  resposta, cita o que já sabe ("vi no seu cadastro que a conta fica entre X")
  e pede a foto da conta (ou o valor exato) — o dado que falta pro
  dimensionamento e o gatilho mais comum do estágio CAPI `lead_respondeu`.
- **Trava de preço mantida:** com faixa (valor parcial) a Eva nunca crava preço
  nem estimativa fechada (regra pré-existente, explícita no modo continuação).

## Peças

### Peça 1 — Persistir respostas do form
Novo módulo `src/modules/leadgen-form-respostas.ts`:
- `extrairRespostasForm(extraFields)` → `{ contaFaixa, tipoImovel }` — acha por
  fragmento do slug do campo (mesma técnica do aviso no zap: 'valor'/'conta'/
  'fatura' e 'tipo'+'imov'), robusto a renomeações do form.
Wiring em `processarEventoLeadgen()` (index.ts), depois do `upsertLead`:
- merge no `energy_data` existente: chaves do form (`conta_faixa`,
  `tipo_imovel`, `fonte`) sobrescrevem, o resto (ex: `monthly_bill` de conversa
  anterior) é preservado. Só grava se a extração achou algo.
- Vale pro webhook E pro `/meta-leadgen/reprocess` (mesma função).

### Peça 2 — Eva modo continuação
No mesmo módulo:
- `blocoContinuacaoForm(energyData)` → `string | null` — bloco de prompt quando
  `conta_faixa` existe: lista o que o form já respondeu, instrui a NÃO
  re-perguntar, confirmar o que sabe, pedir foto da conta (ou valor exato), e
  proíbe cravar preço com valor parcial.
Wiring no `leadContext` (index.ts ~4686, seção "Dados ja coletados"):
- lead existente com `conta_faixa` → bloco anexado ao contexto.
- Bônus: leads de junho importados já têm `conta_faixa` → ganham o mesmo
  tratamento ao responder cadência.

### Fora de escopo
Dimensionamento a partir da faixa, mudanças no form Meta, cadência de
não-resposta (já existe), CTWA (não tem form).

## Testes (TDD)
- `extrairRespostasForm`: slugs reais do form (com acento/interrogação) → acha;
  extraFields vazio → nulls; campo não relacionado → ignorado.
- `blocoContinuacaoForm`: com faixa+tipo → bloco cita ambos, contém "não
  re-pergunte", pedido da foto da conta e trava de preço; só faixa → bloco sem
  tipo; sem `conta_faixa` → null (conversa normal).
- Merge preserva `monthly_bill` existente e sobrescreve `conta_faixa`.
