# Elo — Tela Viva do Cérebro (v1) · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Uma tela cheia `/dashboard/cerebro` com a animação do Elo + números reais do ecossistema (híbrido), clique nos departamentos, e "Pergunte ao Elo" (IA responde com base no dado real, nunca inventa). + ajuste de menu.

**Architecture:** Repo `ecosunpower-agente` (TS ESM, imports `.js`; Express server-rendered; Supabase via `SupabaseService`; Claude `@anthropic-ai/sdk` Haiku; vitest). A página é um documento HTML próprio (full-screen, NÃO usa `renderLayout`), baseado no protótipo `brain-elo.html`. Snapshot de dados via contagens `count:'exact',head:true`. "Pergunte ao Elo" = Claude grounded no snapshot + trava de preço.

**Spec:** `docs/superpowers/specs/2026-07-11-elo-tela-viva-design.md`. **Branch:** `feat/elo-tela-viva`.

**Protótipo base (ler o arquivo):** `C:\Users\Meu Computador\Documents\EcoSunPower\.superpowers\brainstorm\1733-1783784543\content\brain-elo.html` — é a planta visual aprovada (canvas com Elo + departamentos + sinais + barra de fala).

**Regras do repo:** TDD, `tsc --noEmit` limpo, `vitest run` verde (ignore as 2 falhas pré-existentes). `git add` por arquivo. Não pushar sem o Junior.

---

## Estrutura de arquivos

**Criar:**
- `src/modules/dashboard/cerebro-data.ts` — `montarSnapshotElo(supabase)` (contagens reais) + tipo `SnapshotElo`.
- `src/modules/dashboard/cerebro-elo.ts` — `responderComoElo(anthropic, pergunta, snapshot)` (IA grounded + trava de preço) + `montarFalasElo(snapshot)` (frases derivadas do dado).
- `src/modules/dashboard/cerebro-views.ts` — `renderCerebroPage(snapshot)` (HTML full-screen).
- Testes correspondentes.

**Modificar:**
- `src/modules/dashboard/router.ts` — `GET /cerebro`, `POST /cerebro/perguntar`.
- `src/modules/dashboard/views.ts` — reordenar menu + botão "🧠 Cérebro".

---

## Task 1: Ajuste de menu (Visão geral antes do Cockpit)

**Files:** Modify `src/modules/dashboard/views.ts` (SIDEBAR_SETORES, ~linha 118-124)

- [ ] **Step 1: Inverter a ordem** dos itens do setor "📊 Visão geral". Hoje:
```ts
itens: [
  { href: '/dashboard/cockpit', key: 'cockpit', label: '⚡ Cockpit' },
  { href: '/dashboard/home', key: 'home', label: '🏠 Home' },
],
```
Trocar para (Home/Visão geral primeiro; renomear o label pra "Visão geral" que é o título real da página):
```ts
itens: [
  { href: '/dashboard/home', key: 'home', label: '📊 Visão geral' },
  { href: '/dashboard/cockpit', key: 'cockpit', label: '⚡ Cockpit' },
],
```

- [ ] **Step 2:** `npx tsc --noEmit` limpo.
- [ ] **Step 3: Commit**
```bash
git add src/modules/dashboard/views.ts
git commit -m "feat(dashboard): Visao geral antes do Cockpit no menu"
```

---

## Task 2: Snapshot de dados reais — `cerebro-data.ts`

Monta as contagens reais do ecossistema. **Reusar o que já existe:** antes de escrever, procurar como o **cockpit/funil** já conta leads por etapa (grep `count`, `funil`, `cockpit`, `status`, `metricas` em `src/modules/dashboard/` e `supabase.ts`) e confirmar os nomes reais das tabelas (`leads`, `conversations`, `propostas_publicas`, `sistemas_clientes`, `fechamentos`, `manutencoes`, `eventos_elo`) e do enum `lead_status`.

**Files:**
- Create: `src/modules/dashboard/cerebro-data.ts`
- Test: `tests/cerebro-data.test.ts`

- [ ] **Step 1: Teste (com client fake)** — verifica que a função soma certo e é best-effort:

```ts
import { describe, it, expect, vi } from 'vitest';
import { montarSnapshotElo } from '../src/modules/dashboard/cerebro-data.js';

// helper: client fake cujo count depende da tabela/filtro
function fakeSupabase(counts: Record<string, number>) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const b: any = {
            _t: tabela,
            select() { return b; },
            eq() { return b; },
            in() { return b; },
            gte() { return b; },
            then(res: any) { res({ count: counts[b._t] ?? 0, error: null }); },
          };
          return b;
        },
      };
    },
  };
}

describe('montarSnapshotElo', () => {
  it('monta o snapshot com as contagens reais', async () => {
    const supa = fakeSupabase({ leads: 42, conversations: 15, propostas_publicas: 8, sistemas_clientes: 30, fechamentos: 5, eventos_elo: 120 });
    const snap = await montarSnapshotElo(supa as any);
    expect(snap.comercial.leads).toBe(42);
    expect(snap.operacao.usinas).toBe(30);
    expect(snap.elo.totalEventos).toBe(120);
  });

  it('best-effort: se uma consulta falha, aquele numero vira 0 e nao quebra', async () => {
    const supa = { getClient() { return { from() { return { select() { throw new Error('x'); } }; } }; } };
    const snap = await montarSnapshotElo(supa as any);
    expect(snap.comercial.leads).toBe(0);
  });
});
```

> Nota: ajuste o fake ao formato real de retorno de contagem que o repo usa (o subagente confirma olhando um count existente). O importante é: cada número é uma contagem best-effort que vira 0 em erro.

- [ ] **Step 2:** rodar → falhar.
- [ ] **Step 3: Implementar** `montarSnapshotElo` — uma contagem `count:'exact',head:true` por número, cada uma em `try/catch` retornando 0 em erro. Estrutura de retorno:

```ts
export type SnapshotElo = {
  comercial: { leads: number; negociacao: number; ganhos: number; propostas: number };
  atendimento: { conversas: number };
  marketing: { emailsEnviados: number; emailsAbertos: number; leadsQuentes: number };
  operacao: { usinas: number };
  relacionamento: { clientes: number; manutencoes: number };
  financeiro: { vendas: number };
  elo: { totalEventos: number };
};
```

Cada campo: helper `async function contar(client, tabela, filtros?)` que faz `client.from(tabela).select('*', { count: 'exact', head: true })` + filtros (`.eq('tipo','email_aberto')`, `.eq('status','negociacao')`, `.gte('created_at', ...)` p/ janelas) e retorna `count ?? 0`, com `try/catch → 0`. Confirmar nomes de coluna reais (ex: enum `lead_status` valores; `eventos_elo.tipo`).

- [ ] **Step 4:** rodar → passar. `tsc` limpo.
- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/cerebro-data.ts tests/cerebro-data.test.ts
git commit -m "feat(cerebro): snapshot de dados reais do ecossistema"
```

---

## Task 3: "Pergunte ao Elo" grounded — `cerebro-elo.ts`

**Files:**
- Create: `src/modules/dashboard/cerebro-elo.ts`
- Test: `tests/cerebro-elo.test.ts`

- [ ] **Step 1: Teste** (anthropic fake; o que garantimos: o snapshot vai no contexto, e a trava de preço se aplica):

```ts
import { describe, it, expect } from 'vitest';
import { responderComoElo, montarFalasElo } from '../src/modules/dashboard/cerebro-elo.js';

const snap: any = { comercial: { leads: 42, negociacao: 8, ganhos: 5, propostas: 12 }, atendimento:{conversas:15}, marketing:{emailsEnviados:0,emailsAbertos:0,leadsQuentes:0}, operacao:{usinas:30}, relacionamento:{clientes:24,manutencoes:2}, financeiro:{vendas:5}, elo:{totalEventos:120} };

function fakeAnthropic(texto: string, capture?: (sys: string) => void) {
  return { messages: { create: async (args: any) => { capture?.(args.system); return { content: [{ type: 'text', text: texto }] }; } } };
}

describe('responderComoElo', () => {
  it('passa o snapshot no contexto e devolve a resposta da IA', async () => {
    let sys = '';
    const a = fakeAnthropic('Voce tem 42 leads no momento.', (s) => { sys = s; });
    const r = await responderComoElo(a as any, 'quantos leads?', snap);
    expect(r).toContain('42');
    expect(sys).toContain('42');            // o dado real foi pro contexto
    expect(sys.toLowerCase()).toContain('nunca invente'); // regra anti-alucinacao
  });

  it('trava de preco: se a IA cravar valor, cai pra mensagem segura', async () => {
    const a = fakeAnthropic('Fica por R$ 19.900 o sistema');
    const r = await responderComoElo(a as any, 'preco?', snap);
    expect(r).not.toContain('19.900');
  });
});

describe('montarFalasElo', () => {
  it('gera frases com numeros reais do snapshot', () => {
    const falas = montarFalasElo(snap);
    expect(falas.join(' ')).toContain('42');
  });
});
```

- [ ] **Step 2:** rodar → falhar.
- [ ] **Step 3: Implementar** (padrão de chamada Claude igual `cadence.ts:442`; trava de preço de `../email/price-lock.js` — caminho a confirmar):

```ts
import { aplicarTravaPreco } from '../email/price-lock.js';
import type { SnapshotElo } from './cerebro-data.js';

export async function responderComoElo(anthropic: any, pergunta: string, snap: SnapshotElo): Promise<string> {
  const dados = JSON.stringify(snap, null, 0);
  const system =
    'Voce e o Elo, o cerebro do EcoSunPower. Responda a pergunta do usuario APENAS com base nos DADOS REAIS abaixo. ' +
    'NUNCA invente numeros nem fatos. Se a resposta nao estiver nos dados, diga que ainda nao tem esse dado. ' +
    'Nunca cite preco/valor em reais. Seja claro, curto e caloroso, em portugues do Brasil.\n' +
    'DADOS REAIS: ' + dados;
  let resposta = 'Nao consegui pensar agora, tenta de novo daqui a pouco.';
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system, messages: [{ role: 'user', content: pergunta.slice(0, 500) }],
    });
    const txt = resp.content.find((b: any) => b.type === 'text')?.text;
    if (txt && txt.trim()) resposta = txt.trim();
  } catch (err) {
    console.warn('[elo-pergunta] IA falhou:', (err as Error)?.message);
  }
  return aplicarTravaPreco(resposta, 'Sobre valores eu prefiro te conectar com o time — mas posso te contar como o negocio esta indo.');
}

export function montarFalasElo(snap: SnapshotElo): string[] {
  const f: string[] = ['Oi, eu sou o Elo. Ligo todos os departamentos do EcoSunPower pra que nada se perca.'];
  if (snap.comercial.leads) f.push(`Agora estou cuidando de ${snap.comercial.leads} leads, ${snap.comercial.negociacao} em negociacao.`);
  if (snap.marketing.emailsAbertos) f.push(`Essa semana ja tivemos ${snap.marketing.emailsAbertos} e-mails abertos.`);
  if (snap.operacao.usinas) f.push(`Monitoro ${snap.operacao.usinas} usinas gerando energia agora.`);
  if (snap.financeiro.vendas) f.push(`Ja comemoramos ${snap.financeiro.vendas} vendas fechadas.`);
  f.push('Cada conversa, clique e venda: eu guardo e conecto. Nada se perde comigo.');
  return f;
}
```

- [ ] **Step 4:** rodar → passar. `tsc` limpo.
- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/cerebro-elo.ts tests/cerebro-elo.test.ts
git commit -m "feat(cerebro): Pergunte ao Elo (IA grounded no dado real, sem inventar) + falas"
```

---

## Task 4: A tela full-screen — `cerebro-views.ts`

**Files:**
- Create: `src/modules/dashboard/cerebro-views.ts`
- Test: `tests/cerebro-views.test.ts`

- [ ] **Step 1: LER o protótipo** `...\.superpowers\brainstorm\1733-1783784543\content\brain-elo.html` — é a base do canvas (Elo central + departamentos + sinais + barra de fala). A tela reusa essa animação.

- [ ] **Step 2: Teste** (a função é pura: recebe snapshot, devolve HTML string):

```ts
import { describe, it, expect } from 'vitest';
import { renderCerebroPage } from '../src/modules/dashboard/cerebro-views.js';

const snap: any = { comercial:{leads:42,negociacao:8,ganhos:5,propostas:12}, atendimento:{conversas:15}, marketing:{emailsEnviados:3,emailsAbertos:1,leadsQuentes:0}, operacao:{usinas:30}, relacionamento:{clientes:24,manutencoes:2}, financeiro:{vendas:5}, elo:{totalEventos:120} };

describe('renderCerebroPage', () => {
  it('e um documento full-screen com os numeros reais embutidos', () => {
    const html = renderCerebroPage(snap, ['Oi, eu sou o Elo.']);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('42');          // numero real do Comercial
    expect(html).toContain('30');          // usinas
    expect(html).toContain('Pergunte ao Elo'); // a caixa de pergunta
  });
});
```

- [ ] **Step 3: Implementar** `renderCerebroPage(snap: SnapshotElo, falas: string[]): string` — documento HTML completo (dark, full-screen) adaptado do `brain-elo.html`:
  - Canvas com Elo + 7 departamentos; cada rótulo mostra o **número real** do snapshot (ex: "🎯 Comercial · 42").
  - Barra de fala do Elo alimentada pelo array `falas` (JSON embutido, cicla).
  - **Caixa "Pergunte ao Elo..."** (input + botão) que faz `fetch('/dashboard/cerebro/perguntar', {method:'POST', body: JSON.stringify({pergunta})})` e mostra a `resposta` na barra de fala.
  - **Painel lateral** (escondido) que abre ao clicar num departamento, mostrando os números daquele depto + um texto explicativo (pode montar client-side a partir do snapshot embutido).
  - Injeta o snapshot como `<script>const SNAP = {...}` pra o JS client-side usar nos cliques.
  - `escapeHtml`/`JSON.stringify` seguros; sem dado externo (CSP-friendly, tudo inline).

- [ ] **Step 4:** rodar → passar. `tsc` limpo.
- [ ] **Step 5: Commit**
```bash
git add src/modules/dashboard/cerebro-views.ts tests/cerebro-views.test.ts
git commit -m "feat(cerebro): tela full-screen do Elo (animacao + numeros reais + Pergunte ao Elo)"
```

---

## Task 5: Rotas + botão no dashboard

**Files:**
- Modify: `src/modules/dashboard/router.ts`
- Modify: `src/modules/dashboard/views.ts` (botão "🧠 Cérebro")

- [ ] **Step 1: Rotas** (espelhar o padrão das rotas do dashboard; confirmar nomes reais de `supabase`, `anthropic`, `exigir`):

```ts
// GET tela cheia
r.get('/cerebro', exigir('relatorios', 'visualizar'), async (req, res) => {
  const snap = await montarSnapshotElo(supabase);
  const falas = montarFalasElo(snap);
  res.send(renderCerebroPage(snap, falas));   // full-screen, SEM renderLayout
});

// POST pergunta ao Elo
r.post('/cerebro/perguntar', exigir('relatorios', 'visualizar'), async (req, res) => {
  const pergunta = String(req.body?.pergunta ?? '').slice(0, 500);
  let resposta = 'Nao entendi, pode repetir?';
  try {
    const snap = await montarSnapshotElo(supabase);
    resposta = await responderComoElo(anthropic, pergunta, snap);
  } catch (err) { console.warn('[cerebro-perguntar]', (err as Error)?.message); }
  res.json({ resposta });
});
```
Confirmar: a área de permissão correta (`relatorios` ou outra), e como obter a instância `anthropic`/`supabase` no escopo do router (reusar o que já existe; se o router não tem `anthropic`, instanciar `new Anthropic({ apiKey: config.anthropicApiKey })` como em `cadence.ts`, ou receber via injeção — confirmar o padrão do router).

- [ ] **Step 2: Botão "🧠 Cérebro"** no dashboard — adicionar no setor "📊 Visão geral" do `SIDEBAR_SETORES` (abaixo do Cockpit) um item `{ href: '/dashboard/cerebro', key: 'cerebro', label: '🧠 Cérebro' }`, e incluir `'cerebro'` na union `active` se necessário. (A tela em si é full-screen, mas o link vive no menu.)

- [ ] **Step 3:** `tsc` limpo; `vitest run` verde. Subir local se possível e abrir `/dashboard/cerebro`.

- [ ] **Step 4: Commit**
```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts
git commit -m "feat(cerebro): rotas /cerebro + /cerebro/perguntar e botao no menu"
```

---

## Task 6: Verificação final

- [ ] `npx tsc --noEmit` limpo; `npx vitest run` verde (fora as 2 pré-existentes).
- [ ] Smoke: abrir `/dashboard/cerebro` → animação + números reais aparecem; clicar num departamento → painel; "Pergunte ao Elo" com uma pergunta de número real (responde certo) e uma de dado inexistente (admite, não inventa).
- [ ] Menu: Visão geral antes do Cockpit; botão 🧠 Cérebro abre a tela.
- [ ] Code review do diff.
- [ ] PR (Junior autoriza push).

---

## Self-review

- **Cobertura da spec:** menu (T1), snapshot real (T2), Pergunte-ao-Elo grounded + falas (T3), tela full-screen híbrida + clique + caixa (T4), rotas + botão (T5). ✓
- **Precisão/exatidão:** o grounding (T3) põe o snapshot no contexto e proíbe inventar; trava de preço na saída. ✓
- **Aberto pra execução (o subagente confirma):** nomes reais de tabelas/colunas e do enum `lead_status`; formato de retorno de `count`; como o router acessa `supabase`/`anthropic`/`exigir`; área de permissão da rota. Reusar consultas do cockpit/funil.
- **Tipos consistentes:** `SnapshotElo` (T2) usado em T3/T4/T5; `montarSnapshotElo`, `responderComoElo`, `montarFalasElo`, `renderCerebroPage` batem entre tasks. ✓
