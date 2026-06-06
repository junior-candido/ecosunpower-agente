# Desenho — Proposta Multi-Serviço (Fatia 1 do Departamento Financeiro)

> Documento de desenho (spec). Escrito em 06/06/2026.
> Linguagem simples de propósito — é pra ler e aprovar, não é manual técnico.
> Contexto maior: `Documents\EcoSunPower\Financeiro\PLANO-Departamento-Financeiro.md` (Fatia 1).

---

## 1. O que a gente quer

Hoje a proposta da EcoSunPower só sabe fazer **solar, com preço único**. Mas a empresa
é de **energia, não só de solar**: vende adequação de padrão, carregador de carro
elétrico, criação de circuitos, projeto elétrico e qualquer outro serviço de elétrica.

Tanto que numa proposta pro cliente **Edmilson**, a Eva combinou na conversa que
incluiria uma **adequação de padrão**, mas o item **não entrou na proposta** — não
existe "gaveta" pra serviço avulso.

**Objetivo desta fatia:** a proposta passa a ser uma **lista de itens**, podendo conter
solar, serviços, ou os dois juntos — inclusive **dois sistemas solares diferentes na
mesma proposta** pro cliente comparar. Tudo continua bonito e com a cara da EcoSunPower.

**Esta fatia entrega só a proposta.** O engate no financeiro (venda → conta a receber →
imposto) é a Fatia 2.

---

## 2. Decisões já fechadas com o Junior (06/06)

1. **Proposta sem solar** vem numa versão **elegante**: logo original EcoSunPower +
   imagem do serviço + o que está incluso + preço + formas de pagamento. **Sem** gráfico
   e **sem** payback (não existem sem solar). Quando tem solar, vem a proposta completa de sempre.
2. **Comparação de dois sistemas solares:** mostra um **quadro lado a lado** com os
   números principais, **sem marcar "recomendado"** (cliente decide neutro). Junto, um
   **descritivo da marca/tecnologia** de cada opção. Não duplica gráfico/payback.
3. **Descritivo das marcas:** eu cadastro **uma ficha por marca** (uma vez), e o sistema
   puxa sozinho. Junior pode **sobrescrever** numa proposta específica.
4. **Serviços são item livre:** Junior descreve do jeito que quer e a Eva **replica fiel**.
   Não tem catálogo amarrando.
5. **Imagem do serviço:** a Eva **gera uma por IA** (Higgsfield) a partir da descrição;
   se Junior **mandar a dele**, usa a dele.
6. **Fora desta fatia:** custo/lucro por item (Fase 2, interno) e engate automático na
   venda via `/fechar` (Fatia 2).

---

## 3. Como a proposta fica estruturada

Em vez de "uma proposta = um sistema solar", a proposta passa a ter uma **lista de itens**.
Cada item é de um tipo:

- **Item Solar** — tem potência, equipamentos (placa + inversor), consumo, valor. Renderiza
  o bloco rico de solar (capa, gráfico, payback, antes/depois). Pode ter uma **variante de
  comparação** (uma segunda configuração de sistema pro cliente comparar).
- **Item Serviço** — texto livre: título, descrição (do jeito que o Junior escreveu), valor
  e uma imagem opcional. Renderiza um bloco elegante e simples.

**Total da proposta:**
- Itens de serviço **somam** ao total.
- Quando há **comparação** de dois solares, **não existe um total único** — o cliente vai
  escolher um dos dois. A proposta mostra o preço de cada opção no quadro comparativo, e
  os serviços adicionais aparecem como "somam à opção escolhida".

---

## 4. As três caras da proposta

### 4.1 Com solar (igual hoje, + serviços opcionais)
A proposta completa de sempre (capa com kWp/geração/economia, gráfico consumo×geração,
equipamentos, análise financeira, garantias, formas de pagamento). **Novo:** se houver
serviços junto, entra uma seção **"Serviços adicionais"** listando cada um (título,
descrição, preço) e somando ao investimento total.

### 4.2 Só serviço (sem solar) — versão elegante
Layout enxuto, sem as partes de solar (que não existem):
- Capa com **logo original EcoSunPower** e o nome do serviço.
- **Imagem do serviço** (gerada por IA a partir da descrição, ou enviada pelo Junior).
- **O que está incluso** — a descrição livre que o Junior escreveu, replicada fiel.
- **Preço** e **formas de pagamento**.
- Blocos de confiança que valem pra qualquer serviço (garantia, Responsável Técnico,
  ART/TRT, atendimento Eva) — reaproveitados da proposta atual.

### 4.3 Comparação de dois sistemas solares
- **Quadro lado a lado** das duas opções (A e B), **sem "recomendado"**, com os números
  que importam: potência (kWp), geração estimada (kWh/mês), investimento (R$), payback e
  economia em 25 anos.
- Embaixo de cada opção, a **ficha da marca/tecnologia** (ver seção 5): tempo de mercado
  brasileiro, tecnologia, Tier 1 (sim/não), garantias.
- **Não** duplica o gráfico nem a análise pesada — o quadro + as fichas bastam pra decisão.
- Serviços adicionais (se houver) aparecem como "somam à opção escolhida".

---

## 5. Ficha das marcas (descritivo de tecnologia)

Cada marca de **placa** e de **inversor** que a EcoSunPower usa ganha uma **ficha**
cadastrada uma vez:

- Nome da marca.
- **Tempo de mercado brasileiro** (ex: "no Brasil desde 2015").
- **Tecnologia** (ex: "TOPCon N-Type bifacial", "microinversor", "inversor string").
- **Tier 1** — sim ou não.
- **Garantias** (defeito / eficiência pra placa; garantia pra inversor).
- Um parágrafo curto, em linguagem de cliente, juntando tudo.

**Como funciona:**
- Toda proposta que usar aquela marca **puxa a ficha automaticamente** (no bloco de
  equipamentos da proposta solar normal, e em cada opção da comparação).
- O Junior pode **sobrescrever** o texto numa proposta específica quando quiser destacar algo.

Marcas a cadastrar (lista oficial EcoSunPower): placas — Trina, JA Solar, LONGi, Jinko,
DAH, Risen; inversores — Sungrow, Solis, Deye, FoxESS, SolarEdge, Huawei, GoodWe,
Hoymiles, NEP. **Nunca Growatt.**

---

## 6. Itens de serviço (texto livre) + imagem

- O Junior descreve o serviço **livre** (título, o que está incluso, preço). A Eva
  **replica exatamente** o que ele mandar, sem reescrever por conta própria.
- A **imagem do serviço**:
  - **Por padrão:** a Eva gera uma imagem por IA (Higgsfield) a partir da descrição, e
    mostra pro Junior **aprovar** antes de ir pro cliente.
  - **Override:** se o Junior **enviar uma imagem** (foto ou desenho), a Eva usa a dele no
    lugar — mesmo fluxo de anexo que já existe na proposta personalizada.

---

## 7. Como o Junior monta isso pela Eva (WhatsApp)

O fluxo conversacional do `/proposta` continua, mas a Eva passa a entender **vários itens**:

- **Serviço:** *"proposta pro Edmilson: adequação de padrão trifásico + troca do disjuntor
  geral, R$ 2.800"* → proposta de serviço elegante.
- **Solar + serviço:** *"sistema 8 kWp Trina 700W por 38.500 + carregador EV R$ 4.500"* →
  proposta solar completa + seção serviços adicionais.
- **Comparação:** *"sistema 8 kWp Trina, e uma opção 2 com LONGi pra comparar"* → quadro
  comparativo com as duas opções + fichas das marcas.

A Eva confirma o **resumo** dos itens e gera com os botões de sempre (✅ Gerar / ✏️ Ajustar
/ ❌ Cancelar). As regras de ouro atuais continuam (não gera com campo obrigatório faltando;
fator de perda sempre pergunta; só marcas oficiais).

---

## 8. O que NÃO entra nesta fatia (escopo fechado)

- **Custo/lucro por item** — quanto a empresa lucra em cada serviço. É interno (financeiro),
  não aparece pro cliente. Fica pra Fase 2.
- **Engate automático na venda** — `/fechar` criar conta a receber e imposto a separar. É a
  **Fatia 2**.
- **Catálogo de serviços com ficha pronta** — descartado a pedido do Junior (item livre é melhor).
- **Organizar receita por tipo de serviço no financeiro** — depende do financeiro (Fatia 2).

---

## 9. Ordem de construção (unidades isoladas, cada uma testável)

Construído em passos pequenos, cada um entregando algo que funciona, com testes antes do código (TDD):

1. **Modelo de itens** — a proposta passa a aceitar uma lista de itens (solar / serviço),
   mantendo compatibilidade com as propostas solar-only que já existem.
2. **Ficha das marcas** — fonte das fichas + puxar automático no bloco de equipamentos +
   override. Cadastrar as marcas oficiais.
3. **Seção "Serviços adicionais"** na proposta com solar (soma ao total).
4. **Proposta só-serviço elegante** (layout sem solar) + imagem (IA/override).
5. **Comparação de dois solares** — quadro lado a lado (sem recomendado) + fichas.
6. **Fluxo da Eva** (`/proposta`) entendendo vários itens, comparação e serviços livres,
   com resumo + botões.

---

## 10. Pontos de atenção técnicos

- A `interface ProposalData` (em `src/modules/proposal/template.ts`) hoje é solar-only
  (campos `potenciaKwp`, `modulo`, `inversor`, `valorTotalRs`). Vai ganhar uma lista de
  itens **sem quebrar** as propostas antigas (compatibilidade pra não estourar o `/p/:slug`
  que lê propostas já salvas).
- A geração de PDF/web (`pdf-generator.ts`, `/p/:slug` em `src/index.ts`) precisa renderizar
  os três formatos sem quebrar o preview admin (`?eu=<token>`) nem a prova social.
- A imagem por IA reusa o Higgsfield já configurado; o override de imagem reusa o pipeline de
  anexos (`src/modules/proposal/attachments/`).
- Banco/Storage: Supabase de produção `kupnsoyymulbdzakqlqc` (dar SQL pro Junior aplicar
  manual — MCP aponta pra projeto errado). Próxima migration = **046**.
- Validação: as "regras de ouro" do `proposal-assistant.ts` continuam valendo por item.
