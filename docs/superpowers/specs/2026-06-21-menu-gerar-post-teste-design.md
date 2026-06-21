# Botão "Gerar post (teste)" no /menu

Data: 2026-06-21
Branch: `feat/menu-gerar-post-teste`

## Problema

Hoje, pra gerar um post de marketing fora do agendamento (Segunda/Quinta 08:00 BRT),
o Junior precisa abrir o link `/marketing/run-weekly?token=...` no navegador — chato e
exige saber o domínio + o token. Ele quer um jeito fácil: um botão no WhatsApp.

Regra do Junior: **tudo no /menu**, nenhum comando solto; ação que ele dispara deve ser
um botão (não texto livre).

## Decisão fechada

Tocar o botão gera **1 post de imagem** (não vídeo) — caso mais comum e mais rápido
(~1 min). Usa a anti-repetição recém-construída (evita cena/tipo dos últimos 3).

## Design

### 1. Item no menu (`src/modules/menu/menu.ts`)

Na categoria `marketing` (📣 Marketing, hoje com 7 itens), adicionar 1 item com `action`
(mesmo mecanismo de `menu_fin_imposto` / `menu_fin_apagar`):

```typescript
{ id: 'menu_gerar_post', title: '✨ Gerar post (teste)', description: 'Cria um post agora e te manda', action: deps.acaoGerarPost },
```

Submenu fica com 8 itens + linha Voltar = **9 linhas** (limite WhatsApp = 10). OK.

Adicionar `acaoGerarPost: Acao` na interface `MenuDeps`.

### 2. A ação (`src/index.ts`, no objeto passado pra `construirMenu({...})`, ~linha 3311)

```typescript
acaoGerarPost: async (to: string) => {
  if (!marketing) { await sendText(to, '❌ Geração de posts está desativada.'); return; }
  await sendText(to, '✨ Gerando um post de teste (imagem)... chega aqui em ~1 min.');
  // Em segundo plano: a geração leva ~1 min, não pode travar o toque do menu.
  void (async () => {
    try {
      const draft = await marketing.generateDraft(undefined, false); // false = imagem (não vídeo)
      await sendDraftToJunior(draft.id);
    } catch (err) {
      console.error('[marketing] gerar-post teste falhou:', err);
      await sendText(to, `❌ Não consegui gerar o post agora: ${(err as Error).message}`);
    }
  })();
},
```

`marketing` (const linha 359), `sendText` (405) e `sendDraftToJunior` (função hoisted,
6447) já estão em escopo nesse ponto. `generateDraft(undefined, false)`: `undefined`
deixa a anti-repetição escolher o tipo; `false` = post de imagem (Higgsfield+logo, com
fallback FLUX). O rascunho chega com os botões de aprovar/publicar/gerar outra imagem
já existentes.

### 3. Tratamento de erro

- Marketing desativado → mensagem clara, sem quebrar.
- Falha na geração → manda o motivo pro Junior + loga no console.

### 4. Teste (`tests/menu.test.ts`)

- A categoria `marketing` contém um item `menu_gerar_post` com `action` definida.
- O submenu de marketing (com Voltar) continua dentro do limite de 10 linhas.

## Fora de escopo (YAGNI)

- Não mexe no agendador (seg/qui 08:00) nem no endpoint `/marketing/run-weekly`.
- Não gera vídeo nesse botão (só imagem).
- Não pergunta tipo de post (a rotação escolhe sozinha).

## Riscos

- Nenhum relevante: reusa caminhos já em produção (`generateDraft`, `sendDraftToJunior`)
  e o padrão de `action` do menu. Sem migration.
