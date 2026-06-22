# Proposta — Seção "Como funciona" + Logo PNG em destaque

> Dois ajustes na proposta: **Parte 1** — nova seção da jornada (aceite → usina ligada). **Parte 2** — logo PNG em destaque com troca por fundo.

**Data:** 2026-06-22
**Repo:** `ecosunpower-agente`
**Arquivo principal de hoje:** `src/modules/proposal/template.ts`

## Problema

A proposta gerada pela Eva (PDF + link web `/p/:slug`) não explica ao cliente:

- O **descritivo do serviço** de instalação do sistema fotovoltaico no telhado.
- Que existe **projeto técnico, homologação na concessionária e vistoria**.
- O **prazo** e o **passo a passo** desde "proposta aceita" até a "usina ligada".

O cliente fecha sem entender o que acontece depois do "sim", o que gera insegurança e dúvidas no fechamento.

## Objetivo

Adicionar uma seção visual e escaneável ("bate o olho") na proposta que mostre a jornada completa, com prazos e o processo real — incluindo o **paralelismo** (projeto + homologação + compra de material correm juntos após a assinatura).

## Decisões de design (aprovadas pelo Junior)

- **Visual escolhido:** Opção **A — "Trilha de Raios"**. Linha do tempo horizontal; cada etapa é um raio numa bolinha; no meio, um bloco tracejado "⚡ Em paralelo". Empilha na vertical no celular (`@media max-width:760px`).
- **Conteúdo:** **estático/padrão** em toda proposta. O processo é sempre o mesmo — Eva NÃO precisa perguntar nada e não há campo novo de dados.
- **Prazo total padronizado em ~45 dias** em toda a proposta (prazo de segurança, frequentemente antecipado). O CTA atual ("Ativação em 30 dias" / "Em 30 dias seu sistema está gerando") será **alinhado para ~45 dias** para não se contradizer.
- **Renderiza nos dois modos** (normal e comparação), igual à seção CTA — o processo vale pra qualquer proposta.
- **Posição:** logo **antes da seção CTA** (depois de serviços adicionais e da prova social). Narrativa: "viu o investimento → veja como acontece → aceite".

## Conteúdo da seção (texto fixo)

Título da seção: tag "Sua jornada solar" + título "Do aceite à usina ligada" + subtítulo curto sobre o paralelismo.

Etapas, na ordem:

1. ✍️ **Aceite & Contrato** — você aprova a proposta e assina. _(Dia 0)_
2. **⚡ Em paralelo — começa tudo junto após a assinatura:**
   - 📐 **Projeto + Homologação** — Responsável Técnico CREA/CFT elabora o projeto e protocola o pedido de acesso; a concessionária (Neoenergia-DF / Equatorial-GO) analisa e aprova. _Por lei até 15 dias para inversor ≤ 75 kW._
   - 📦 **Compra & entrega do material** — equipamentos pedidos e entregues no período.
3. 🔧 **Instalação** — nossa equipe monta o sistema no telhado. _(1–3 dias)_
4. 🔎 **Vistoria & troca do medidor** — concessionária vistoria e troca pelo medidor bidirecional. _(~7 dias)_
5. ⚡ **Usina ligada** — sistema gerando, sua economia começa. _(✅)_

Rodapé da seção: **"Prazo total estimado: cerca de 45 dias — prazo de segurança, frequentemente antecipado."**

> Nota de título profissional: usar **"Responsável Técnico CREA/CFT"**, nunca "engenheiro" nem "técnico eletrotécnico" (padrão da empresa em material cliente-facing).

## Arquitetura

Seguir o padrão já existente de `service-render.ts` (módulo puro que devolve string HTML, testável isolado):

- **Novo módulo:** `src/modules/proposal/como-funciona-render.ts`
  - Exporta `renderComoFuncionaSection(): string` — devolve o HTML da seção. Sem dependência de dados da proposta (conteúdo estático), o que torna o teste trivial e o módulo independente.
  - O texto/etapas ficam numa constante no topo do módulo (fácil de editar depois).
- **CSS:** adicionar as classes da trilha (`.journey-section`, `.trail`, `.bolt`, `.par`, etc.) ao bloco `<style>` de `template.ts`, usando as variáveis de tema já existentes (`--primary-500`, `--accent-500`, `--primary-800`, `--muted`, `--border`). Prefixar classes para não colidir com as seções atuais.
- **Inserção:** em `template.ts`, chamar `renderComoFuncionaSection()` entre `socialProofHtml` e a `<section class="cta-section">` (renderização incondicional, igual ao CTA).
- **Ajuste do CTA:** trocar "Em 30 dias seu sistema está gerando" → "Em cerca de 45 dias seu sistema está gerando" e o badge "⚡ Ativação em 30 dias" → "⚡ Ativação em ~45 dias".

## Testes

- `tests/como-funciona-render.test.ts`:
  - A seção contém os marcos: Aceite, Projeto, Homologação, Compra do material, Instalação, Vistoria, Usina ligada.
  - Contém o bloco "Em paralelo".
  - Contém "15 dias" (lei) e "45 dias" (total).
  - Usa "Responsável Técnico CREA/CFT" e NÃO contém "engenheiro".
  - HTML escapado/sem tags quebradas (smoke do output).
- Teste de fumaça no `template.ts`: o HTML gerado inclui a nova seção (em modo normal e comparação).

## Parte 2 — Marca / Logo PNG em destaque

### Problema
Hoje o topo (hero) e o rodapé mostram o **nome da empresa como texto** (`escapeHtml(empresa().nomeFantasia)`), não a logo PNG. O cliente não vê a marca de verdade.

### Decisões (aprovadas pelo Junior)
- Usar **sempre a logo PNG**, nunca só o nome em texto.
- **Regra de variação por fundo:** fundo **escuro → logo nome BRANCO**; fundo **claro → logo nome PRETO**. (Confirmado visualmente: a variação errada faz "ECOSUN" sumir no fundo.)
- A logo deve **se destacar** (não miniatura). No topo: **~54px de altura** (médio).
- **Onde aparece:** Topo (hero), Seção final (CTA) e Rodapé. A marca d'água das fotos do estudo personalizado permanece como está (já usa a branca).

### Assets
- **Logo nome BRANCO** (fundo escuro): já embutida — `LOGO_ECOSUNPOWER_BRANCO_BASE64` em `src/modules/proposal/assets/logo-base64.ts`. Arquivo-fonte: `EcoSunPower/Marketing/logos/Logo nova/logo-ecosunpower-1024-branco.png` (hash `9bd553…`).
- **Logo nome PRETO** (fundo claro): gerar constante base64 `LOGO_ECOSUNPOWER_PRETO_BASE64` a partir de `EcoSunPower/Marketing/logos/Logo nova/logo-ecosunpower-1024-transparente.png` (hash `2848fe…`). Necessária pra que a geração de **PDF** renderize a logo (o renderer precisa do asset embutido, não de caminho externo).

### Implementação
- Helper puro `logoVariante(fundo: 'escuro' | 'claro'): string` (no módulo de assets ou util) devolvendo o base64 certo. Mantém a regra num só lugar e testável.
- **Hero** (`template.ts` ~linha 314): trocar `<div class="hero-logo">…texto…</div>` por `<img src="${logoVariante('escuro')}" alt="${nomeFantasia}" class="hero-logo-img">` com `height:54px;width:auto`. CSS `.hero-logo-img` substitui `.hero-logo`/`.hero-logo-dot`.
- **CTA** (`template.ts` ~linha 676): adicionar a logo branca acima do título "Pronto pra economizar?", tamanho de destaque (~48–56px).
- **Rodapé** (`template.ts` ~linha 693): adicionar a logo branca antes/junto do bloco `<strong>${empresa.nome}</strong>`.
- Todas as 3 posições têm fundo escuro → todas usam `logoVariante('escuro')` (branca). A variante preta fica disponível para qualquer placement de fundo claro futuro (ex: cabeçalho da seção "Como funciona", se decidirmos depois).

### Testes (Parte 2)
- `logoVariante('escuro')` devolve o base64 branco; `logoVariante('claro')` devolve o preto; ambos começam com `data:image/png;base64,`.
- O HTML do hero contém `<img` com a logo e NÃO contém mais o texto do nome no `.hero-logo`.
- CTA e rodapé contêm a `<img>` da logo.

## Fora de escopo (tratado separadamente)

- 🐛 **Bug "Eva re-pergunta tudo ao reabrir/fechar a proposta e refaz do zero".** Será investigado e corrigido em trabalho próprio, via debugging sistemático — não faz parte deste spec.

## Critério de pronto

- Proposta (web + PDF) mostra a seção "Como funciona" no visual A, coerente em ~45 dias.
- Logo PNG (branca) em destaque no topo (~54px), CTA e rodapé — sem mais o nome só em texto.
- Testes passam; code review 3×.
- Sem alteração de banco (migration) — é só template/render/assets.
