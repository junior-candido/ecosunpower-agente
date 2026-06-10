# Desenho — Gerenciador de Propostas

> Spec escrito em 09/06/2026. Linguagem simples de propósito — é pra ler e aprovar.

---

## 1. O que a gente quer

Hoje, quando o cliente olha a proposta e pede um ajuste, o Junior **refaz tudo do zero**
— inclusive reanexar fotos. E quando ele está montando uma proposta e entra alerta da
Eva, o fio se perde no meio da conversa ("vira um peteco").

**Objetivo:** cada proposta vira um **registro reaproveitável**. O Junior:
- **reabre uma proposta gerada pra ajustar** (no dashboard), sem redigitar nem refazer foto;
- **continua um rascunho** que se perdeu nos alertas (no WhatsApp).

**Filosofia:** a proposta não vive na memória frágil do chat — vive no banco, com endereço.
Isso também reduz a contaminação entre clientes (cada proposta carrega isolada).

---

## 2. Escopo

**Entra nesta fatia:**
1. **Fundação** — salvar o cadastro COMPLETO da proposta (pra reabrir sem perder nada).
2. **(A) Reabrir proposta gerada** — no dashboard (web), com escolha "atualizar essa" vs
   "nova versão".
3. **(B) Continuar rascunho atual** — no zap (palavra `rascunho`, sem `/`).

**NÃO entra (próxima fatia):**
- Vários rascunhos ao mesmo tempo (alternar entre clientes diferentes).
- Reabrir proposta pelo zap (fica no dashboard nesta fatia).

---

## 3. Onde isso encaixa no código (estado atual)

- **Tabela `propostas_publicas`**: `slug`, `numero_proposta`, `cliente_nome`,
  `cliente_telefone`, `html_content`, `dados_input` (jsonb), `created_at`, `revoked`, etc.
- **`generateProposalCore`** (`src/modules/proposal-assistant.ts`) gera o HTML, salva no
  Supabase via `savePropostaPublica({ slug, htmlContent, dadosInput, ... })`. **Hoje o
  `dadosInput` é um SUBCONJUNTO** (`dadosInputMinimo`: calcInput + sistema + comercial),
  insuficiente pra reabrir 100%.
- **Dashboard** (`src/modules/dashboard/router.ts`): já tem `/dashboard/propostas` (lista),
  `/dashboard/propostas/:slug` (detalhe/preview), `/dashboard/propostas/novo` (form A4
  GET+POST), `renderFormNovaProposta` (view do form).
- **Sessão de proposta no zap** (Redis): `proposal:state:${phone}` (modo/tipo/anexos +
  flag `geracaoConcluida` + campo `reopenedSlug` JÁ EXISTE no tipo, mas sem uso),
  `proposal:history:${phone}` (conversa), `proposal:${phone}` (modo ativo).

---

## 4. Fundação — salvar o cadastro completo

**Mudança:** em `generateProposalCore`, salvar o **`data` inteiro** (o objeto que monta a
proposta) no `dados_input`, em vez do `dadosInputMinimo`. Assim a reabertura pré-preenche
todos os campos: cliente (nome/doc/endereço/telefone/email), sistema (potência, fator,
consumo, concessionária, modalidade), equipamentos completos (módulo + inversor + estrutura),
comercial (valor, formas de pagamento), comparação, e overrides (geração do estudo, tarifa,
iluminação, consumo 12 meses).

- **Compatibilidade:** o dashboard já lê `dados_input.investimento.total` etc. em alguns
  lugares (ticket médio, valor). Manter esses campos OU ajustar os leitores. Decidir no
  plano: salvar o `data` completo **e** manter os campos derivados que o dashboard já usa
  (ex: um bloco `resumo` com `investimento.total`), pra não quebrar KPIs.
- **Fotos / estudo:** o `estudoPersonalizado` (fotos já processadas pro Supabase Storage)
  fica no `proposalData`/HTML. Guardar referência suficiente pra **reusar** ao reabrir sem
  re-upload. Ao reabrir SEM novas fotos → reusa o estudo salvo; COM novas fotos → troca.

**Unidade isolada:** uma função pura `montarDadosInputCompleto(data, calc?)` que decide o
que vai pro `dados_input` (data completo + resumo derivado). Testável sem banco.

---

## 5. (A) Reabrir proposta gerada — dashboard

**Fluxo:**
1. Na tela da proposta (`/dashboard/propostas/:slug`), botão **"✏️ Reabrir / Ajustar"**.
2. `GET /dashboard/propostas/:slug/reabrir` → carrega `dados_input` (completo) → renderiza
   o **form A4 pré-preenchido** (`renderFormNovaProposta` ganha suporte a valores iniciais).
3. Junior edita o que quiser. As fotos já anexadas continuam (reusa estudo) a menos que
   ele suba novas.
4. **Dois botões de submit:**
   - **"Atualizar essa"** → `POST .../reabrir?modo=atualizar` → regenera o HTML e
     **sobrescreve o MESMO slug** (`updatePropostaPublicaHtml(slug, novoHtml)` + atualiza
     `dados_input`). O link que o cliente tem passa a mostrar o conserto. Tracking/slug
     preservados.
   - **"Gerar nova versão"** → `POST .../reabrir?modo=nova` → gera **slug novo** (proposta
     nova), preserva a antiga.

**Pré-preenchimento do form:** `renderFormNovaProposta` passa a aceitar um objeto de
valores iniciais (do `dados_input`). Campos de arquivo (foto) não pré-preenchem (limitação
do browser) — mostra "estudo já anexado, mantém se não subir novo".

**Erros:** slug inexistente/revogado → 404 com mensagem. Falha ao regenerar → 500 limpo,
sem perder a proposta antiga (no modo "atualizar", só sobrescreve se a geração nova der
certo).

---

## 6. (B) Continuar rascunho — zap

**Gatilho:** palavra **`rascunho`** (sem `/`, igual `menu`), só pra telefone admin.

**Fluxo:**
1. Junior digita `rascunho` → a Eva checa a sessão de proposta no Redis
   (`proposal:state` + `proposal:history`).
2. **Se há rascunho em andamento** (modo proposta ativo E `geracaoConcluida` != true):
   mostra o nome do cliente (capturado no histórico) + o que falta (último `missing[]` que
   o Claude devolveu) + botões:
   > "Você estava montando a proposta do **[cliente]**. Falta: [X]. Continuar?"
   > **[▶️ Continuar] [🗑️ Descartar]**
   - **Continuar** → segue de onde parou (a sessão já está viva; só re-mostra o estado).
   - **Descartar** → `exitProposalMode` (limpa tudo).
3. **Se NÃO há rascunho** (nada em andamento): "Você não tem nenhuma proposta em andamento.
   Manda `/proposta` ou `menu` pra começar."

**Unidade isolada:** uma função `resumirRascunho(state, history)` que extrai (nome do
cliente, campos faltando, se está em andamento). Pura, testável.

**Limite:** como é UM rascunho por telefone (sessão única), o `rascunho` mostra o atual.
Vários ao mesmo tempo = próxima fatia.

---

## 7. Componentes (unidades isoladas)

| Unidade | O que faz | Depende de |
|---|---|---|
| `montarDadosInputCompleto(data, calc?)` | monta o jsonb completo + resumo derivado | nada (pura) |
| `prefillFormFromDadosInput(dadosInput)` | mapeia `dados_input` → valores do form A4 | nada (pura) |
| reabrir routes (dashboard) | GET form pré-preenchido + POST atualizar/nova | supabase, generateProposalCore |
| `resumirRascunho(state, history)` | extrai nome/faltando/em-andamento | nada (pura) |
| handler `rascunho` (zap) | mostra rascunho + botões Continuar/Descartar | proposalAssistant, metaService |

---

## 8. Fluxo de dados

```
GERAR  → generateProposalCore → savePropostaPublica(slug, html, dados_input=COMPLETO)
REABRIR(dashboard) → lê dados_input → prefill form → editar →
   "atualizar" → regenera HTML → updatePropostaPublicaHtml(MESMO slug) + update dados_input
   "nova"      → generateProposalCore (slug NOVO)
RASCUNHO(zap) → lê proposal:state+history → resumirRascunho → botões
   continuar → mantém sessão
   descartar → exitProposalMode
```

---

## 9. Testes

- **Fundação:** `montarDadosInputCompleto` inclui todos os campos do `data`; round-trip
  `data → dados_input → prefill` preserva os valores. Os campos que o dashboard lê
  (`investimento.total`) continuam presentes.
- **(A) Atualizar essa:** mantém o `slug`; o HTML é sobrescrito; `dados_input` atualizado.
- **(A) Nova versão:** gera `slug` diferente; a antiga continua existindo.
- **(A) Prefill:** `prefillFormFromDadosInput` mapeia certo (nome, potência, módulo,
  inversor, valor, formas de pagamento, overrides).
- **(B) `resumirRascunho`:** com sessão em andamento → retorna nome + faltando; sem sessão
  → "nada em andamento"; com `geracaoConcluida=true` → não trata como rascunho.

---

## 10. Riscos / decisões pro plano

- **Não quebrar os leitores atuais de `dados_input`** (KPIs/ticket médio do dashboard) —
  manter o bloco `resumo` derivado junto do `data` completo.
- **Reuso do estudo (fotos) ao reabrir** — confirmar o mecanismo (reusar
  `estudoPersonalizado` salvo vs re-render). Pode ser a parte mais delicada do (A).
- **Pré-preenchimento do form A4** — o form é grande; mapear todos os campos com cuidado.
- **`reopenedSlug`** no estado do zap já existe — pode ser reaproveitado se a reabertura
  algum dia for pro zap (fora desta fatia).
