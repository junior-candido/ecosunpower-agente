# Instagram variedade+qualidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acabar com a repetição dos posts automáticos de Instagram/Facebook (imagem e texto) e subir a qualidade, espelhando o que o blog já faz: memória no banco, anti-repetição pelo histórico, copy em Opus e mais eixos de variação visual.

**Architecture:** Forward-only no módulo de marketing. A trava anti-repetição deixa de viver na memória do processo e passa a ler o banco (`marketing_drafts`), que ganha duas colunas (`topic_type`, `scene_key`). `pickScene` ganha mais eixos de variação (composição + estética fotográfica realista) e aceita uma lista de cenas a excluir. Um seletor de tipo de post evita os últimos 3 tipos. O prompt do Claude recebe os últimos posts pra variar tema/ângulo, e a legenda passa a ser gerada por `claude-opus-4-7`.

**Tech Stack:** TypeScript (ESM, imports com `.js`), Vitest, Supabase, Anthropic SDK.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/migrations/054_marketing_historico.sql` | adiciona `topic_type`, `scene_key` em `marketing_drafts` | criar |
| `src/modules/marketing/solar-scenes.ts` | `pickScene(excludeKeys[])` + eixo composição + Q realista | modificar |
| `src/modules/marketing/post-rotation.ts` | `ALL_TOPIC_TYPES` + `pickTopicType(excludeTypes[])` puro | criar |
| `src/modules/marketing.ts` | `getRecentDrafts`, wiring do histórico, grava colunas, modelo Opus | modificar |
| `tests/marketing/solar-scenes.test.ts` | testes de `pickScene` | criar |
| `tests/marketing/post-rotation.test.ts` | testes de `pickTopicType` | criar |
| `tests/marketing/marketing-history.test.ts` | teste de `getRecentDrafts` (erro→[]) | criar |

Convenção de tipo do post (`PostTopicType`) permanece definida em `marketing.ts` e é
importada por `post-rotation.ts` (sem ciclo: `post-rotation.ts` não importa nada de
`marketing.ts` além do `type`).

---

### Task 1: Migration 054 (memória no banco)

**Files:**
- Create: `supabase/migrations/054_marketing_historico.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Histórico dos posts de marketing pra anti-repetição (sobrevive a restart do app).
-- topic_type: qual dos 6 tipos de post foi gerado.
-- scene_key: qual cena visual (solar-scenes) o Higgsfield usou (null em post de vídeo).
alter table marketing_drafts
  add column if not exists topic_type text,
  add column if not exists scene_key text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/054_marketing_historico.sql
git commit -m "feat(marketing): migration 054 historico (topic_type, scene_key)"
```

> NOTA: o MCP do Supabase aponta pro projeto errado. A migration deve ser aplicada
> **manual** no SQL Editor do projeto `kupnsoyymulbdzakqlqc` (Junior aplica). O código
> usa `add column if not exists`, então é seguro reaplicar.

---

### Task 2: `pickScene` com exclusão múltipla + composição + Q realista

**Files:**
- Modify: `src/modules/marketing/solar-scenes.ts`
- Test: `tests/marketing/solar-scenes.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/marketing/solar-scenes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pickScene, SOLAR_SCENES } from '../../src/modules/marketing/solar-scenes.js';

// rng determinístico: devolve valores fixos em sequência (cicla).
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickScene', () => {
  it('nunca devolve uma cena que está em excludeKeys', () => {
    const exclude = SOLAR_SCENES.slice(0, 3).map((s) => s.key);
    // rng=0 escolheria o primeiro do pool; como os 3 primeiros estão excluídos,
    // o primeiro candidato passa a ser o 4º da lista original.
    const { scene } = pickScene(exclude, seqRng([0, 0, 0]));
    expect(exclude).not.toContain(scene.key);
  });

  it('cai no pool cheio quando a exclusão esgota as cenas', () => {
    const exclude = SOLAR_SCENES.map((s) => s.key); // exclui todas
    const { scene } = pickScene(exclude, seqRng([0, 0, 0]));
    expect(scene).toBeDefined();
    expect(SOLAR_SCENES.map((s) => s.key)).toContain(scene.key);
  });

  it('combina cena + variação de luz + variação de composição no prompt', () => {
    const { prompt, scene } = pickScene([], seqRng([0, 0, 0]));
    expect(prompt.startsWith(scene.prompt)).toBe(true);
    // prompt final tem 2 sufixos a mais que o prompt base da cena (luz e composição).
    const sufixos = prompt.slice(scene.prompt.length).split(',').filter((s) => s.trim());
    expect(sufixos.length).toBeGreaterThanOrEqual(2);
  });

  it('aceita string única por retrocompatibilidade defensiva', () => {
    // Se alguém passar string em vez de array, não deve quebrar nem excluir errado.
    const { scene } = pickScene([SOLAR_SCENES[0]!.key], seqRng([0, 0, 0]));
    expect(scene.key).not.toBe(SOLAR_SCENES[0]!.key);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/marketing/solar-scenes.test.ts`
Expected: FAIL (assinatura atual de `pickScene` é `(lastKey?: string, rng?)`, não aceita array; e o prompt só tem 1 sufixo de luz).

- [ ] **Step 3: Implementar**

Em `src/modules/marketing/solar-scenes.ts`, trocar o sufixo `Q`, adicionar
`COMPOSICOES` e reescrever `pickScene`:

```typescript
// Sufixo de realismo fotográfico (substitui o antigo "8k ultra sharp" que dava cara de IA).
const Q =
  'shot on a professional full-frame camera, realistic natural textures, ' +
  'true-to-life natural lighting, subtle film grain, photojournalistic realism, ' +
  'sharp where it matters, no CGI look, no plastic skin';
```

(Mantém `PAINEIS` e o array `SOLAR_SCENES` como estão — só o `Q` muda de conteúdo.)

Substituir o array `VARIACOES` (mantido) e adicionar um novo eixo logo abaixo dele:

```typescript
// Eixo de composição/estética, ortogonal à cena (seguro mesmo em cenas com
// enquadramento embutido como "vista aérea" ou "close").
const COMPOSICOES = [
  'documentary photography style, candid natural framing',
  'architectural photography, balanced composition',
  'editorial magazine look, shallow depth of field',
  'strong foreground with natural depth',
  'intimate detail-focused composition',
];
```

Reescrever `pickScene` (substitui a função inteira a partir do comentário acima dela):

```typescript
// Escolhe uma cena diferente das recentes (excludeKeys) + variação de luz +
// variação de composição + seed. rng injetável pra teste determinístico.
// Aceita string única por defesa (normaliza pra array).
export function pickScene(
  excludeKeys: string[] | string = [],
  rng: () => number = Math.random,
): PickedScene {
  const exclude = Array.isArray(excludeKeys) ? excludeKeys : [excludeKeys];
  const candidatas = SOLAR_SCENES.filter((s) => !exclude.includes(s.key));
  const pool = candidatas.length > 0 ? candidatas : SOLAR_SCENES;
  const scene = pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
  const variacao = VARIACOES[Math.floor(rng() * VARIACOES.length)] ?? VARIACOES[0];
  const composicao = COMPOSICOES[Math.floor(rng() * COMPOSICOES.length)] ?? COMPOSICOES[0];
  const seed = Math.floor(rng() * 1_000_000);
  return { scene, prompt: `${scene.prompt}, ${variacao}, ${composicao}`, seed };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/marketing/solar-scenes.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/solar-scenes.ts tests/marketing/solar-scenes.test.ts
git commit -m "feat(marketing): pickScene exclui multiplas cenas + eixo composicao + Q realista"
```

---

### Task 3: Seletor de tipo de post anti-repetição (`pickTopicType`)

**Files:**
- Create: `src/modules/marketing/post-rotation.ts`
- Test: `tests/marketing/post-rotation.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/marketing/post-rotation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pickTopicType, ALL_TOPIC_TYPES } from '../../src/modules/marketing/post-rotation.js';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickTopicType', () => {
  it('lista os 6 tipos', () => {
    expect(ALL_TOPIC_TYPES).toHaveLength(6);
  });

  it('nunca devolve um tipo presente em excludeTypes', () => {
    const exclude = ALL_TOPIC_TYPES.slice(0, 3);
    const t = pickTopicType(exclude, seqRng([0]));
    expect(exclude).not.toContain(t);
  });

  it('cai no pool cheio quando a exclusão esgota os tipos', () => {
    const t = pickTopicType([...ALL_TOPIC_TYPES], seqRng([0]));
    expect(ALL_TOPIC_TYPES).toContain(t);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/marketing/post-rotation.test.ts`
Expected: FAIL ("Cannot find module .../post-rotation.js").

- [ ] **Step 3: Implementar**

Create `src/modules/marketing/post-rotation.ts`:

```typescript
import type { PostTopicType } from '../marketing.js';

// Os 6 tipos de post que rotacionamos. Fonte única pra seleção anti-repetição.
export const ALL_TOPIC_TYPES: PostTopicType[] = [
  'objecao_desmistificada',
  'dica_tecnica',
  'economia_antes_depois',
  'curiosidade_setor',
  'lei_regulacao',
  'comparativo',
];

// Escolhe um tipo de post evitando os recentes (excludeTypes). Se a exclusão
// esgotar a lista, usa todos. rng injetável pra teste determinístico.
export function pickTopicType(
  excludeTypes: PostTopicType[] = [],
  rng: () => number = Math.random,
): PostTopicType {
  const candidatos = ALL_TOPIC_TYPES.filter((t) => !excludeTypes.includes(t));
  const pool = candidatos.length > 0 ? candidatos : ALL_TOPIC_TYPES;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/marketing/post-rotation.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing/post-rotation.ts tests/marketing/post-rotation.test.ts
git commit -m "feat(marketing): pickTopicType anti-repeticao dos tipos de post"
```

---

### Task 4: `getRecentDrafts` (lê histórico do banco)

**Files:**
- Modify: `src/modules/marketing.ts` (adiciona método; perto de `getDraft`, ~linha 255)
- Test: `tests/marketing/marketing-history.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/marketing/marketing-history.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MarketingService } from '../../src/modules/marketing.js';

// Supabase fake mínimo: from().select().order().limit() → resultado controlado.
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain } as never;
}

function makeService(supabase: never): MarketingService {
  // imageGen não é usado por getRecentDrafts; passamos um stub vazio.
  return new MarketingService('test-key', supabase, {} as never, '5561999999999');
}

describe('getRecentDrafts', () => {
  it('devolve as linhas quando o banco responde', async () => {
    const rows = [{ topic: 'x', topic_type: 'dica_tecnica', scene_key: 'comercial', caption: 'c' }];
    const svc = makeService(fakeSupabase({ data: rows, error: null }));
    const out = await svc.getRecentDrafts(15);
    expect(out).toHaveLength(1);
    expect(out[0]!.scene_key).toBe('comercial');
  });

  it('devolve [] quando o banco dá erro (não lança)', async () => {
    const svc = makeService(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const out = await svc.getRecentDrafts(15);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/marketing/marketing-history.test.ts`
Expected: FAIL ("getRecentDrafts is not a function").

- [ ] **Step 3: Implementar**

Em `src/modules/marketing.ts`, adicionar o tipo de retorno perto do topo (após
`GeneratedDraft`, ~linha 27) e o método logo antes de `getDraft` (~linha 255):

```typescript
export interface RecentDraft {
  topic: string;
  topic_type: PostTopicType | null;
  scene_key: string | null;
  caption: string;
}
```

```typescript
  // Últimos N posts gerados (qualquer status). Usado pra anti-repetição de cena/tipo
  // e pra mostrar ao Claude o que já foi postado. Erro/silêncio não bloqueia geração.
  async getRecentDrafts(limit = 15): Promise<RecentDraft[]> {
    const { data, error } = await this.supabase
      .from('marketing_drafts')
      .select('topic, topic_type, scene_key, caption')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[marketing] getRecentDrafts falhou:', error.message);
      return [];
    }
    return (data ?? []) as RecentDraft[];
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/marketing/marketing-history.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/marketing.ts tests/marketing/marketing-history.test.ts
git commit -m "feat(marketing): getRecentDrafts le historico do banco"
```

---

### Task 5: `generateSolarImage` devolve a cena usada + aceita exclusão

**Files:**
- Modify: `src/modules/marketing.ts:92-111` (`generateSolarImage`)

Sem teste unitário novo (depende de Higgsfield/FLUX externos); verificado pela
compilação e pelo smoke. A mudança é de assinatura/retorno apenas.

- [ ] **Step 1: Reescrever `generateSolarImage`**

Substituir a função inteira (`marketing.ts:92-111`) por:

```typescript
  // Gera a imagem do post: Higgsfield (cena solar variada, anti-repetição via banco)
  // + logo EcoSunPower no canto. Fallback pro FLUX (ainda com logo) se o Higgsfield
  // falhar ou não estiver configurado. Devolve a scene_key usada pra gravar no banco.
  private async generateSolarImage(
    fallbackPrompt: string,
    excludeSceneKeys: string[] = [],
  ): Promise<{ bytes: Buffer; contentType: string; sceneKey?: string }> {
    if (this.higgsfield) {
      const { scene, prompt, seed } = pickScene(excludeSceneKeys, undefined);
      this.lastSceneKey = scene.key;
      try {
        console.log(`[marketing] Higgsfield gerando cena="${scene.key}" (seed ${seed})`);
        const { url } = await this.higgsfield.generate({ prompt, aspectRatio: '4:5', seed });
        const dl = await this.higgsfield.downloadImage(url);
        return { bytes: applyBrandLogo(dl.bytes), contentType: 'image/png', sceneKey: scene.key };
      } catch (err) {
        console.warn(`[marketing] Higgsfield falhou (${(err as Error).message}); fallback FLUX`);
      }
    }
    const { url } = await this.imageGen.generate({
      prompt: fallbackPrompt, aspectRatio: '4:5', outputFormat: 'jpg', outputQuality: 95,
    });
    const dl = await this.imageGen.downloadImage(url);
    return { bytes: applyBrandLogo(dl.bytes), contentType: 'image/png' };
  }
```

> Nota: `pickScene` agora recebe `excludeSceneKeys` (array) em vez de `this.lastSceneKey`.
> O `this.lastSceneKey` continua sendo setado como reforço dentro do mesmo processo,
> mas a fonte de verdade da anti-repetição é o histórico do banco (passado pelo caller).

- [ ] **Step 2: Compilar pra garantir que nada quebrou**

Run: `npx tsc --noEmit`
Expected: pode acusar erro só no caller `generateDraft` (que ainda não passa o array nem
usa `sceneKey`) — será resolvido na Task 6. Nenhum outro erro novo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/marketing.ts
git commit -m "refactor(marketing): generateSolarImage aceita exclusao e devolve scene_key"
```

---

### Task 6: Wiring do `generateDraft` (histórico → cena/tipo/prompt → grava colunas → Opus)

**Files:**
- Modify: `src/modules/marketing.ts` — `generateDraft` (~113-253), import e SYSTEM_PROMPT

- [ ] **Step 1: Adicionar o import do seletor de tipo**

No topo de `marketing.ts`, junto dos outros imports de `./marketing/...`:

```typescript
import { pickTopicType, ALL_TOPIC_TYPES } from './marketing/post-rotation.js';
```

- [ ] **Step 2: Carregar histórico e decidir cena/tipo no início de `generateDraft`**

Logo no começo do corpo de `generateDraft` (antes do `// 1) Ask Claude...`), inserir:

```typescript
    // Histórico do banco pra anti-repetição (sobrevive a restart). Não bloqueia geração.
    const recent = await this.getRecentDrafts(15).catch(() => []);
    const recentSceneKeys = recent
      .map((r) => r.scene_key)
      .filter((k): k is string => !!k)
      .slice(0, 3);
    const recentTopicTypes = recent
      .map((r) => r.topic_type)
      .filter((t): t is PostTopicType => !!t)
      .slice(0, 3);

    // Tipo do post: respeita o pedido explícito; senão escolhe evitando os 3 últimos.
    const chosenType: PostTopicType = preferredType ?? pickTopicType(recentTopicTypes);

    // Bloco de "posts recentes" pro Claude variar tema E ângulo (igual o blog faz).
    const recentList = recent
      .slice(0, 15)
      .map((r, i) => `${i + 1}. "${r.topic}" (${r.topic_type ?? 'tipo?'})`)
      .join('\n') || '(nenhum)';
```

- [ ] **Step 3: Trocar a montagem do `userPrompt`**

Substituir o bloco atual (`marketing.ts:115-117`):

```typescript
    const userPrompt = preferredType
      ? `Crie um post do tipo "${preferredType}". Retorne apenas o JSON, sem explicacoes.`
      : `Crie um post escolhendo um dos tipos disponiveis. Retorne apenas o JSON, sem explicacoes.`;
```

por:

```typescript
    const userPrompt = `Crie um post do tipo "${chosenType}".

POSTS RECENTES (NÃO repita tema nem ângulo destes — varie de verdade, traga ângulo/exemplo/abertura diferente):
${recentList}

Retorne apenas o JSON, sem explicacoes.`;
```

- [ ] **Step 4: Subir o modelo da legenda pra Opus**

Trocar `marketing.ts:120`:

```typescript
      model: 'claude-haiku-4-5-20251001',
```

por:

```typescript
      model: 'claude-opus-4-7',
```

- [ ] **Step 5: Passar a exclusão de cena e capturar a `scene_key`**

Substituir a chamada atual (`marketing.ts:167`):

```typescript
      ({ bytes: imgBytes, contentType: imgContentType } = await this.generateSolarImage(parsed.image_prompt));
```

por (declarar `sceneKey` antes do `if (useVideo)`):

```typescript
    let sceneKey: string | null = null;
```

e no ramo `else`:

```typescript
    } else {
      // Post de imagem: Higgsfield + cena solar (excluindo as 3 recentes) + logo.
      const img = await this.generateSolarImage(parsed.image_prompt, recentSceneKeys);
      imgBytes = img.bytes;
      imgContentType = img.contentType;
      sceneKey = img.sceneKey ?? null;
    }
```

- [ ] **Step 6: Gravar `topic_type` e `scene_key` no insert**

No `.insert({ ... })` (`marketing.ts:205-215`), adicionar duas linhas:

```typescript
        topic: parsed.topic,
        topic_type: chosenType,
        scene_key: sceneKey,
        caption: parsed.caption,
```

(o resto do objeto continua igual.)

- [ ] **Step 7: Compilar e rodar a suíte inteira**

Run: `npx tsc --noEmit && npx vitest run tests/marketing/`
Expected: tsc sem erros; todos os testes de marketing PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/marketing.ts
git commit -m "feat(marketing): generateDraft usa historico p/ cena+tipo, injeta no prompt, grava colunas, copy em Opus"
```

---

### Task 7: Verificação final + smoke

**Files:** nenhum (verificação)

- [ ] **Step 1: Build + suíte completa**

Run: `npm run build && npm test`
Expected: build sem erro; suíte verde.

- [ ] **Step 2: Checklist de smoke (Junior, após aplicar a migration 054 e Implantar)**

- Aplicar a migration `054` no SQL Editor do projeto `kupnsoyymulbdzakqlqc`.
- Gerar 3-4 posts seguidos (botão "Gerar post" no zap).
- Conferir: cenas visuais distintas entre eles, temas/tipos distintos, imagem com cara
  de foto (não de IA), legenda mais forte.
- Conferir no banco: `select topic_type, scene_key, created_at from marketing_drafts order by created_at desc limit 5;` — colunas preenchidas.

- [ ] **Step 3: Code review 3× (preferência do Junior) antes de pedir push**

Rodar review, corrigir achados, repetir 3 vezes.

---

## Self-Review (preenchido)

**Cobertura da spec:**
- Migração `054` → Task 1 ✓
- Gravar topic_type+scene_key → Task 5 (devolve) + Task 6 (grava) ✓
- Anti-repetição pelo banco (últimos 3 cena+tipo) → Task 4 (lê) + Task 6 (usa) + Task 2/3 (exclui) ✓
- Histórico pro Claude → Task 6 step 2/3 ✓
- Copy mais forte (Opus) → Task 6 step 4 ✓
- Mais variedade + realismo visual → Task 2 ✓
- Marca → reforço de prompt cabe na Task 6 (system prompt já ancora Brasília/DF/GO; sem
  nova mudança estrutural necessária além do que já existe).

**Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código.

**Consistência de tipos:** `pickScene(excludeKeys[]|string)`, `pickTopicType(excludeTypes[])`,
`getRecentDrafts→RecentDraft[]`, `generateSolarImage→{bytes,contentType,sceneKey?}`,
`chosenType: PostTopicType` usado no insert e no prompt. Nomes batem entre tasks.
