# EcoSof — Peça B: Eva Vitrine (vendedora do funil) — spec

**Data:** 15/06/2026 · **Aprovado por:** Junior (design) · **Status:** spec p/ revisão
**Contexto pai:** [2026-06-11-ecosof-comercializacao-design.md](./2026-06-11-ecosof-comercializacao-design.md)

## O que é

A **Eva vitrine** é a vendedora do funil do EcoSof: uma **instância clone** do agente, configurada
para **vender o próprio software** (em vez de atender leads de solar). Ela atende os cliques do
anúncio Meta no WhatsApp, se apresenta como O PRODUTO, qualifica o integrador, demonstra valor,
responde objeções e leva o quente pro pagamento ou pra uma call de 15min com o Junior.

Princípio do projeto (Junior 15/06): **o cliente faz o mínimo** — white-label e onboarding feitos por nós.

## Arquitetura (reusa o kit clone)

A Eva vitrine NÃO é um sistema novo — é um **clone com um "modo" diferente**:

- Novo campo na `empresa_config`: **`modo`** = `'solar'` (default) | `'vitrine_ecosof'` (migration 050).
- No boot (`src/index.ts` ~242), quando `empresa().modo === 'vitrine_ecosof'`:
  - a `KnowledgeBase` aponta pra **`conhecimento-ecosof/`** em vez de `conhecimento/`;
  - o `brain` carrega **`src/prompts/system-prompt-vitrine.md`** em vez de `system-prompt.md`.
- Tudo o mais (WABA, motor de chat, follow-up, dashboard de leads) é reusado como está. **Risco zero
  pro sistema da EcoSunPower** — o modo é lido só da config daquela instância.
- A vitrine roda numa **instância própria** (deploy + WABA próprios), igual qualquer clone.

## Componentes

1. **`src/prompts/system-prompt-vitrine.md`** — persona vendedora + roteiro do funil (abaixo).
   Usa os mesmos placeholders de empresa (`{{nome_atendente}}` etc.) — na vitrine o atendente é "Eva"
   e a empresa é "EcoSof".
2. **`conhecimento-ecosof/`** — base de conhecimento do produto (arquivos abaixo).
3. **Switch de modo** — `empresa_config.modo` (migration 050 + tipo + normalizar) e o condicional no
   boot que escolhe prompt + pasta de conhecimento.
4. **Hand-off do quente** — quando o lead esquenta, a Eva manda o **link de pagamento** (placeholder de
   config `link_pagamento`, preenchido na Peça C) OU oferece **agendar 15min** (reusa o /agenda existente).

## Roteiro do funil (no system-prompt-vitrine.md)

1. **Abertura:** se apresenta como a Eva que É o produto ("eu mesma sou o software que você pode ter
   na sua empresa, com o nome e a cara dela").
2. **Qualifica o integrador:** ramo (solar/elétrica/projeto), cidade, **quantos leads/orçamentos
   perde por mês** por demora no atendimento.
3. **Demonstra valor nela mesma** + mostra a **prova real**: venda de R$ 33k com R$ 255 de anúncio
   (case Ferraz), atendimento 24h, proposta com a marca do cliente.
4. **Apresenta os planos** (Essencial R$297 / Completo R$597 + Implantação R$497) e a **garantia 30d**.
5. **Objeções** (puxa do conhecimento): é caro? / funciona pro meu caso? / e se copiarem? / tem
   suporte? / não tem teste grátis? (resposta: garantia incondicional de 30 dias + paga desde o dia 1).
6. **Fechamento:** quente → manda o link de pagamento OU agenda 15min com o Junior. Morno → registra
   e segue (follow-up existente). Frio/curioso → educado, sem queimar.

## conhecimento-ecosof/ (arquivos)

- `produto.md` — o que é o EcoSof, o que entrega (Eva 24h, propostas com marca do cliente, dashboard,
  financeiro, monitoramento — com **lista honesta** de marcas suportadas), white-label (nome/marca do cliente).
- `planos-precos.md` — Essencial 297 / Completo 597 / Implantação 497; o que cada um inclui; preço
  fundador travado pros 10 primeiros.
- `garantia.md` — 30 dias incondicional; paga desde o dia 1; sem teste grátis de instância.
- `objecoes.md` — respostas pras objeções comuns (caro / cópia / suporte / "serve pra mim?").
- `prova.md` — case Ferraz (R$33k/R$255), nasceu dentro de empresa real, velocidade de evolução.
- `processo.md` — implantação white glove em até 3 dias úteis; o cliente só passa marca/preços/número.

## Fora de escopo (outras peças)

- **Peça A** — página ecosof.com.br (web). 
- **Peça C** — link de pagamento recorrente + contrato (a vitrine só consome o `link_pagamento`).
- **Peça D** — onboarding automático (provisionar o clone após pagar).

## O que precisa do Junior

- Número de WhatsApp dedicado pra vitrine (WABA) — no deploy.
- Conteúdo fino que só ele sabe: confirmar números/planos, e o vídeo/prova (Peça A).

## Testes

- **Switch de modo:** teste do carregamento — `modo='vitrine_ecosof'` faz o boot escolher
  `system-prompt-vitrine.md` + `conhecimento-ecosof/`; `modo='solar'`/ausente mantém o atual (regressão).
- **empresa_config:** `normalizarEmpresaRow` mapeia `modo` com default `'solar'`.
- O conteúdo (prompt/markdown) é validado por leitura + smoke manual do Junior numa instância de teste.

## Riscos

| Risco | Antídoto |
|---|---|
| Vitrine "vaza" comportamento de solar | modo isola prompt + conhecimento; testes de regressão do modo solar |
| Conteúdo de venda fraco | iterar com o Junior + dados reais do funil |
| Custo de IA na vitrine | mesmo limite de conversas/mês previsto pros clones |
