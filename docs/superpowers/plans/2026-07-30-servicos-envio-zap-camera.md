# Enviar serviço pelo zap + câmera no celular — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "📤 Enviar pelo zap" no Diário de Serviços (reenvio pro atribuído + envio pra número avulso com ou sem acesso temporário) e botões "📷 Tirar foto"/"🖼️ Galeria" que abrem a câmera no celular.

**Architecture:** Tudo reusa o que já existe: textos e canal de zap dos PRs #182/#183, acesso temporário do #184, papel Campo, `createUser`/`updateUser` do users-store. Novidades: módulo `servicos-zap.ts` (textos puros, testáveis), `usuarioPorTelefone` (users-store), `atribuirServico` (servicos-store), rota `POST /servicos/:id/enviar-zap` e modal no detalhe do serviço. Sem migration.

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, vitest, Supabase.

**Spec:** `docs/superpowers/specs/2026-07-30-servicos-envio-zap-camera-design.md`

**Regras do repo:** TDD; `npx tsc --noEmit` limpo + `npx vitest run` verde antes do PR (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` são conhecidas); `git add` por nome; commits com `Co-Authored-By`; CI sem minutos até 01/08 → merge na mão depois de suíte local.

---

### Task 1: Câmera no Diário — "📷 Tirar foto" + "🖼️ Galeria" (mata o bug da visita de hoje)

**Files:**
- Modify: `src/modules/dashboard/servicos-views.ts` (novo ~L275-280 e detalhe pendente ~L90-95)
- Test: `tests/dashboard-servicos-views.test.ts`

- [ ] **Step 1: Teste que falha** — em `dashboard-servicos-views.test.ts`, dentro do describe `renderNovoServicoPage (form mobile)` troque o teste `aceita foto e vídeo...` por:

```ts
  it('câmera E galeria separadas (bug 30/07: Android abria só arquivos)', () => {
    expect(html).toContain('capture="environment"');           // 📷 abre a câmera
    expect(html).toContain('accept="image/*" multiple');       // 🖼️ galeria continua
    expect(html).toContain('Tirar foto');
    expect(html).toContain('Galeria');
    expect(html).toContain('MAX_VIDEOS=2');
  });
```

E no describe `atribuição (F2)`, adicione ao teste `detalhe pendente vira tela de trabalho...`:

```ts
    expect(html).toContain('capture="environment"'); // câmera também na tela do instalador
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/dashboard-servicos-views.test.ts` → FAIL (não tem `capture=`).

- [ ] **Step 3: Implementar** — em `servicos-views.ts`, nos DOIS lugares (bloco do form novo e bloco `completar` do detalhe), troque:

```html
    <div class="mt-4 grid grid-cols-2 gap-3">
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Fotos
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
```

por (mesma classe nos 3; no form novo o wrapper não tem `mt-4`):

```html
    <div class="mt-4 grid grid-cols-3 gap-2">
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Tirar foto
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🖼️ Galeria
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
```

`addFotos` já aceita 1 ou N arquivos — nada muda no JS.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/dashboard-servicos-views.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/servicos-views.ts tests/dashboard-servicos-views.test.ts
git commit -m "fix(servicos): botao Tirar foto abre a camera no celular (capture) + Galeria separada"
```

---

### Task 2: Textos do zap — módulo `servicos-zap.ts` (+ DRY no aviso do #182)

**Files:**
- Create: `src/modules/dashboard/servicos-zap.ts`
- Modify: `src/modules/dashboard/servicos-views.ts` (exportar `GUIAS_FOTOS`)
- Modify: `src/modules/dashboard/router.ts` (~L685: usar o texto novo no aviso da atribuição)
- Test: `tests/servicos-zap.test.ts`

- [ ] **Step 1: Teste que falha** — criar `tests/servicos-zap.test.ts`:

```ts
// Textos do zap do Diário de Serviços (botão 📤 Enviar pelo zap).
import { describe, it, expect } from 'vitest';
import { textoAvisoServico, textoInfoServico } from '../src/modules/dashboard/servicos-zap.js';
import type { ServicoRow } from '../src/modules/dashboard/servicos-store.js';

const S: ServicoRow = {
  id: 's1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'l1',
  clienteNome: 'Tatiane', sistemaId: null, observacoes: 'levar escada',
  dataServico: '2026-07-30', fotos: 0, videos: 0,
  status: 'atribuido', atribuidoA: 'u1', atribuidoNome: 'João',
};

describe('textoAvisoServico (mesmo texto do aviso automático #182)', () => {
  it('com link: tipo, cliente, data BR e o link do guia', () => {
    const t = textoAvisoServico(S, 'https://app/dashboard/servicos/s1');
    expect(t).toContain('🔧 Novo serviço pra você: Visita técnica — Tatiane, dia 30/07/2026');
    expect(t).toContain('https://app/dashboard/servicos/s1');
  });
  it('sem link: manda abrir a tela Serviços', () => {
    expect(textoAvisoServico(S, null)).toContain('Abra a tela Serviços no dashboard');
  });
});

describe('textoInfoServico (só as informações, sem acesso)', () => {
  it('tipo, cliente, data, endereço, observações e o guia NUMERADO do tipo', () => {
    const t = textoInfoServico(S, 'Cond. Ouro Vermelho I, Qd 28 Lt 11, Jardim Botânico');
    expect(t).toContain('Visita técnica');
    expect(t).toContain('Tatiane');
    expect(t).toContain('30/07/2026');
    expect(t).toContain('📍 Cond. Ouro Vermelho I');
    expect(t).toContain('levar escada');
    expect(t).toContain('1. Foto do padrão de entrada');   // lista do Junior
    expect(t).toContain('Capacidade da corrente do disjuntor');
  });
  it('sem endereço e tipo sem guia: não quebra', () => {
    const t = textoInfoServico({ ...S, tipoId: 'laudo', observacoes: null }, null);
    expect(t).toContain('Visita técnica');
    expect(t).not.toContain('📍');
    expect(t).not.toContain('Fotos pra tirar');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/servicos-zap.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — em `servicos-views.ts` troque `const GUIAS_FOTOS` por `export const GUIAS_FOTOS`. Criar `src/modules/dashboard/servicos-zap.ts`:

```ts
// src/modules/dashboard/servicos-zap.ts
// Textos do WhatsApp do Diário de Serviços — usados no aviso automático da
// atribuição (#182) e no botão 📤 Enviar pelo zap. Funções puras, sem banco.
import type { ServicoRow } from './servicos-store.js';
import { GUIAS_FOTOS } from './servicos-views.js';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** Aviso pro atribuído (mesmo texto do zap automático da atribuição). */
export function textoAvisoServico(s: ServicoRow, linkServico: string | null): string {
  return `🔧 Novo serviço pra você: ${s.tipoNome} — ${s.clienteNome}, dia ${dataBr(s.dataServico)}.` +
    (linkServico ? `\nAbra pra ver o guia de fotos: ${linkServico}` : '\nAbra a tela Serviços no dashboard pra ver o guia.');
}

/** "Só as informações" (sem acesso): tipo, cliente, endereço e o guia numerado. */
export function textoInfoServico(s: ServicoRow, endereco: string | null): string {
  const guia = GUIAS_FOTOS[s.tipoId];
  return `🔧 Serviço: ${s.tipoNome}\n👤 Cliente: ${s.clienteNome}\n📅 Dia ${dataBr(s.dataServico)}` +
    (endereco ? `\n📍 ${endereco}` : '') +
    (s.observacoes ? `\n📝 ${s.observacoes}` : '') +
    (guia ? `\n\n📷 Fotos pra tirar:\n${guia.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : '');
}
```

No `router.ts` (rota `POST /servicos/nova`, ~L676-693), trocar a montagem inline da mensagem pelo texto novo — o bloco vira:

```ts
      // Atribuiu? Avisa o instalador NO ZAP na hora (se tiver telefone cadastrado).
      if (atribuidoA && options.sendText) {
        try {
          const { telefoneDoUsuario } = await import('./users-store.js');
          const { getServico } = await import('./servicos-store.js');
          const { textoAvisoServico } = await import('./servicos-zap.js');
          const tel = await telefoneDoUsuario(supabase, atribuidoA);
          if (tel) {
            const s = await getServico(supabase, servicoId);
            const base = (options.appBaseUrl ?? '').replace(/\/$/, '');
            if (s) await options.sendText(tel, textoAvisoServico(s, base ? `${base}/dashboard/servicos/${servicoId}` : null));
          }
        } catch (err) {
          console.warn('[servicos] aviso de atribuição falhou:', (err as Error).message);
        }
      }
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/servicos-zap.test.ts tests/dashboard-servicos-views.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/servicos-zap.ts src/modules/dashboard/servicos-views.ts src/modules/dashboard/router.ts tests/servicos-zap.test.ts
git commit -m "feat(servicos): textos do zap num modulo so (aviso #182 + versao so-informacoes com guia numerado)"
```

---

### Task 3: Stores — `usuarioPorTelefone` + `atribuirServico`

**Files:**
- Modify: `src/modules/dashboard/users-store.ts`
- Modify: `src/modules/dashboard/servicos-store.ts`
- Test: `tests/servicos-store.test.ts` (mockClient já existe lá) e `tests/users-store-telefone.test.ts` (novo)

- [ ] **Step 1: Testes que falham** — em `tests/servicos-store.test.ts` adicionar (importar `atribuirServico` no topo):

```ts
describe('atribuirServico (📤 enviar pelo zap)', () => {
  it('amarra o usuário e volta pra 🟡 pendente', async () => {
    const { client, updates } = mockClient({ servicos: [{ data: null, error: null }] });
    await atribuirServico(client, 's1', 'u-novo');
    expect(updates.servicos?.[0]).toMatchObject({ atribuido_a: 'u-novo', status: 'atribuido' });
  });
});
```

Criar `tests/users-store-telefone.test.ts`:

```ts
// usuarioPorTelefone — acha quem já tem cadastro pelo zap (📤 enviar pelo zap).
import { describe, it, expect } from 'vitest';
import { usuarioPorTelefone } from '../src/modules/dashboard/users-store.js';

function mockClient(resposta: any) {
  const eqs: [string, unknown][] = [];
  const chain: any = {
    select() { return chain; },
    eq(col: string, val: unknown) { eqs.push([col, val]); return chain; },
    maybeSingle() { return Promise.resolve({ data: resposta, error: null }); },
  };
  return { client: { from: () => chain } as any, eqs };
}

describe('usuarioPorTelefone', () => {
  it('filtra por empresa + telefone e devolve id/nome/ativo', async () => {
    const { client, eqs } = mockClient({ id: 'u1', nome: 'João', ativo: false });
    const u = await usuarioPorTelefone(client, 'c1', '5561999998888');
    expect(u).toEqual({ id: 'u1', nome: 'João', ativo: false });
    expect(eqs).toContainEqual(['company_id', 'c1']);
    expect(eqs).toContainEqual(['telefone', '5561999998888']);
  });
  it('sem cadastro → null', async () => {
    const { client } = mockClient(null);
    expect(await usuarioPorTelefone(client, 'c1', '556100000000')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/servicos-store.test.ts tests/users-store-telefone.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — em `servicos-store.ts` (depois de `reabrirServico`):

```ts
/** 📤 Enviar pelo zap: amarra o serviço em alguém e volta pra 🟡 pendente. */
export async function atribuirServico(client: SupabaseClient, id: string, userId: string): Promise<void> {
  const { error } = await client.from('servicos').update({ atribuido_a: userId, status: 'atribuido' }).eq('id', id);
  if (error) throw new Error(`atribuirServico: ${error.message}`);
}
```

Em `users-store.ts` (depois de `telefoneDoUsuario`):

```ts
/** Acha usuário da empresa pelo telefone (📤 enviar serviço pelo zap sem duplicar gente). */
export async function usuarioPorTelefone(
  client: SupabaseClient,
  companyId: string,
  telefone: string,
): Promise<{ id: string; nome: string; ativo: boolean } | null> {
  const { data } = await client.from('dashboard_users')
    .select('id, nome, ativo')
    .eq('company_id', companyId)
    .eq('telefone', telefone)
    .maybeSingle();
  return (data as { id: string; nome: string; ativo: boolean } | null) ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/servicos-store.test.ts tests/users-store-telefone.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/servicos-store.ts src/modules/dashboard/users-store.ts tests/servicos-store.test.ts tests/users-store-telefone.test.ts
git commit -m "feat(servicos): atribuirServico + usuarioPorTelefone (base do enviar pelo zap)"
```

---

### Task 4: Rota `POST /servicos/:id/enviar-zap`

**Files:**
- Modify: `src/modules/dashboard/router.ts` (colar depois da rota `/servicos/:id/reabrir`, antes do `GET /servicos/:id`)

Regras: gate `exigir('servicos', 'editar')` (mesma permissão do Reabrir). `hashSenha` já está importado no topo do router (usado no `/usuarios/novo`). Sem teste de rota — o repo não tem harness de Express pras rotas de serviços (a lógica está nos stores/textos testados nas Tasks 2-3); o `tsc` garante os tipos.

- [ ] **Step 1: Implementar a rota**

```ts
  // 📤 Enviar pelo zap: reenvio pro atribuído OU número avulso (com acesso
  // temporário criado na hora, ou só as informações). Pedido do Junior 30/07.
  router.post('/servicos/:id/enviar-zap', exigir('servicos', 'editar'), async (req: AuthedRequest, res) => {
    try {
      if (!options.sendText) { res.status(400).json({ ok: false, erro: 'Envio de WhatsApp indisponível no momento.' }); return; }
      const { getServico, atribuirServico } = await import('./servicos-store.js');
      const { textoAvisoServico, textoInfoServico } = await import('./servicos-zap.js');
      const s = await getServico(supabase, String(req.params.id));
      if (!s) { res.status(404).json({ ok: false, erro: 'Registro não achado.' }); return; }
      const base = (options.appBaseUrl ?? '').replace(/\/$/, '');
      const link = base ? `${base}/dashboard/servicos/${s.id}` : null;
      const destino = String(req.body?.destino ?? 'atribuido');

      if (destino === 'atribuido') {
        if (!s.atribuidoA) { res.status(400).json({ ok: false, erro: 'Este serviço não está atribuído a ninguém.' }); return; }
        const { telefoneDoUsuario } = await import('./users-store.js');
        const tel = await telefoneDoUsuario(supabase, s.atribuidoA);
        if (!tel) { res.status(400).json({ ok: false, erro: 'O atribuído não tem telefone cadastrado — edite ele na tela Usuários.' }); return; }
        await options.sendText(tel, textoAvisoServico(s, link));
        res.json({ ok: true }); return;
      }

      // Número avulso
      const tel = String(req.body?.telefone ?? '').replace(/\D/g, '');
      const nome = String(req.body?.nome ?? '').trim();
      if (tel.length < 10) { res.status(400).json({ ok: false, erro: 'Telefone inválido — use DDD+número.' }); return; }
      const modo = String(req.body?.modo ?? 'info');

      if (modo === 'info') {
        // Endereço do cliente entra na mensagem, se tiver.
        const { data: lead } = await supabase.from('leads')
          .select('endereco_rua, endereco_numero, neighborhood, city')
          .eq('id', s.leadId).maybeSingle();
        const l = lead as { endereco_rua?: string; endereco_numero?: string; neighborhood?: string; city?: string } | null;
        const endereco = [l?.endereco_rua, l?.endereco_numero, l?.neighborhood, l?.city].filter(Boolean).join(', ') || null;
        await options.sendText(tel, textoInfoServico(s, endereco));
        res.json({ ok: true }); return;
      }

      // modo 'acesso': já tem cadastro pelo telefone? Reusa (reativa se preciso).
      const { usuarioPorTelefone, updateUser, createUser, textoBoasVindas, listRoles } = await import('./users-store.js');
      const cid = req.dashUser!.companyId;
      const jaExiste = await usuarioPorTelefone(supabase, cid, tel);
      if (jaExiste) {
        if (!jaExiste.ativo) await updateUser(supabase, jaExiste.id, { ativo: true });
        await atribuirServico(supabase, s.id, jaExiste.id);
        const depois = await getServico(supabase, s.id);
        await options.sendText(tel, textoAvisoServico(depois ?? s, link));
        res.json({ ok: true, aviso: `${jaExiste.nome} já tinha cadastro — atribuí e enviei o guia.` }); return;
      }

      // Cria na hora: papel Campo + ⏳ acesso temporário (expira ao concluir, #184).
      if (!nome) { res.status(400).json({ ok: false, erro: 'Informe o nome de quem vai receber.' }); return; }
      const roles = await listRoles(supabase, cid);
      const campo = roles.find((r) => r.nome.trim().toLowerCase() === 'campo');
      if (!campo) { res.status(400).json({ ok: false, erro: 'Crie antes o papel "Campo" (área serviços) na tela Usuários.' }); return; }
      const { randomUUID } = await import('crypto');
      const senha = randomUUID().replace(/-/g, '').slice(0, 8);
      const login = `${nome.split(' ')[0]!.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}${tel.slice(-4)}`;
      const r = await createUser(supabase, {
        companyId: cid, nome, login, senhaHash: await hashSenha(senha),
        roleId: campo.id, telefone: tel, acessoTemporario: true,
      });
      if ('error' in r) {
        res.status(400).json({ ok: false, erro: r.error === 'login_em_uso' ? `O login "${login}" já existe — crie o usuário na tela Usuários.` : r.error }); return;
      }
      await audit(supabase, { companyId: cid, userId: req.dashUser!.id, entidade: 'usuario', entidadeId: r.id, acao: 'criou' });
      await atribuirServico(supabase, s.id, r.id);
      const depois = await getServico(supabase, s.id);
      await options.sendText(tel,
        textoBoasVindas(nome, login, senha, base ? `${base}/dashboard` : null) +
        `\n\n${textoAvisoServico(depois ?? s, link)}`);
      res.json({ ok: true, aviso: `Acesso temporário criado pra ${nome} (login ${login}) — guia enviado.` });
    } catch (err) {
      console.error('[servicos/enviar-zap]', err);
      res.status(500).json({ ok: false, erro: 'Falha ao enviar — tente de novo.' });
    }
  });
```

- [ ] **Step 2: Conferir tipos** — `npx tsc --noEmit` → limpo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(servicos): rota enviar-zap — reenvio pro atribuido, avulso so-informacoes e acesso temporario na hora"
```

---

### Task 5: UI — botão 📤 + modal no detalhe + aviso "Serviço criado ✅" pós-salvar

**Files:**
- Modify: `src/modules/dashboard/servicos-views.ts` (`renderDetalheServicoPage` + redirect do `salvar()`)
- Modify: `src/modules/dashboard/router.ts` (`GET /servicos/:id` passa os dados novos)
- Test: `tests/dashboard-servicos-views.test.ts`

- [ ] **Step 1: Testes que falham** — adicionar em `dashboard-servicos-views.test.ts`:

```ts
describe('📤 Enviar pelo zap (detalhe)', () => {
  const zap = { pode: true, telAtribuido: '5561999998888', criadoAgora: false };
  it('quem pode editar vê o botão e o modal (atribuído + outro número + 2 modos)', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(ATRIBUIDO, [], undefined, false, zap);
    expect(html).toContain('Enviar pelo zap');
    expect(html).toContain('/enviar-zap');
    expect(html).toContain('João Instalador');          // opção do atribuído com nome
    expect(html).toContain('Outro número');
    expect(html).toContain('Criar acesso temporário');
    expect(html).toContain('Só as informações');
  });
  it('sem permissão de editar → sem botão', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    expect(renderDetalheServicoPage(ATRIBUIDO, [], undefined, false, { pode: false, telAtribuido: null }))
      .not.toContain('Enviar pelo zap');
  });
  it('atribuído SEM telefone → orienta cadastrar', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(ATRIBUIDO, [], undefined, false, { pode: true, telAtribuido: null });
    expect(html).toContain('sem telefone cadastrado');
  });
  it('criadoAgora → faixa "Serviço criado" com o convite de enviar', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(ATRIBUIDO, [], undefined, false, { ...zap, criadoAgora: true });
    expect(html).toContain('Serviço criado');
  });
  it('form novo redireciona pro detalhe com ?criado=1 (aviso pós-salvar)', () => {
    const html = renderNovoServicoPage(TIPOS, undefined);
    expect(html).toContain('?criado=1');
  });
});
```

E no teste-guarda dos `<script>` (describe `o JS embutido...`), acrescentar à lista:

```ts
      renderDetalheServicoPage(ATRIBUIDO, [], undefined, false, { pode: true, telAtribuido: '556199', criadoAgora: true }),
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/dashboard-servicos-views.test.ts` → FAIL.

- [ ] **Step 3: Implementar a view** — em `renderDetalheServicoPage`, nova assinatura:

```ts
export function renderDetalheServicoPage(
  s: ServicoRow,
  midias: { tipoMidia: string; url: string }[],
  user: DashUser | undefined,
  podeReabrir = false,
  envioZap?: { pode: boolean; telAtribuido: string | null; criadoAgora?: boolean },
): string {
```

Antes de `const body =`, montar o bloco (banner + botão + modal + script):

```ts
  const faixaCriado = envioZap?.criadoAgora
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">✅ Serviço criado! Quer mandar as informações no zap de quem vai fazer? Use o botão aqui embaixo.</div>`
    : '';
  const opcaoAtribuido = s.atribuidoA
    ? (envioZap?.telAtribuido
      ? `<label class="flex items-center gap-2 text-sm"><input type="radio" name="z_destino" value="atribuido" checked onchange="zapModo()"> Pro atribuído: <b>${escapeHtml(s.atribuidoNome ?? '')}</b> (${escapeHtml(envioZap.telAtribuido)})</label>`
      : `<p class="text-sm text-amber-700">⚠️ ${escapeHtml(s.atribuidoNome ?? 'O atribuído')} está sem telefone cadastrado — <a class="underline" href="/dashboard/usuarios">cadastre na tela Usuários</a> ou use "Outro número".</p>`)
    : '';
  const zapHtml = envioZap?.pode ? `
    ${faixaCriado}
    <button onclick="document.getElementById('zap_modal').classList.remove('hidden')" class="mt-4 w-full px-5 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold shadow">📤 Enviar pelo zap</button>
    <div id="zap_modal" class="hidden mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
      ${opcaoAtribuido}
      <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_destino" value="avulso" ${s.atribuidoA && envioZap.telAtribuido ? '' : 'checked'} onchange="zapModo()"> Outro número</label>
      <div id="z_avulso" class="space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <input id="z_nome" placeholder="Nome" class="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          <input id="z_tel" placeholder="Telefone (zap)" inputmode="tel" class="border border-slate-300 rounded-xl px-3 py-2 text-sm">
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_modo" value="acesso" checked> 🔑 Criar acesso temporário (entra, tira as fotos e conclui; o acesso expira sozinho)</label>
        <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_modo" value="info"> 📄 Só as informações (endereço + roteiro de fotos, sem acesso)</label>
      </div>
      <button id="z_enviar" onclick="zapEnviar()" class="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Enviar</button>
      <div id="z_status" class="text-sm text-center text-slate-500"></div>
    </div>
    <script>
    function zapModo(){
     var d=document.querySelector('input[name="z_destino"]:checked');
     document.getElementById('z_avulso').style.display=(d&&d.value==='avulso')?'':'none'}
    zapModo();
    function zapEnviar(){
     var d=document.querySelector('input[name="z_destino"]:checked');
     var m=document.querySelector('input[name="z_modo"]:checked');
     var corpo={destino:d?d.value:'avulso'};
     if(corpo.destino==='avulso'){
      corpo.telefone=document.getElementById('z_tel').value.trim();
      corpo.nome=document.getElementById('z_nome').value.trim();
      corpo.modo=m?m.value:'info';
      if(!corpo.telefone){alert('Informe o telefone');return}}
     var btn=document.getElementById('z_enviar');btn.disabled=true;btn.textContent='Enviando…';
     fetch('/dashboard/servicos/${escapeHtml(s.id)}/enviar-zap',{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(corpo)})
     .then(function(r){return r.json()}).then(function(j){
      btn.disabled=false;btn.textContent='Enviar';
      if(!j.ok)throw new Error(j.erro||'falha');
      document.getElementById('z_status').textContent='✅ Enviado!'+(j.aviso?' '+j.aviso:'')})
     .catch(function(e){btn.disabled=false;btn.textContent='Enviar';
      document.getElementById('z_status').textContent='❌ '+e.message})}
    </script>` : '';
```

E no `body`, logo depois de `${completar}`, incluir `${zapHtml}`.

No `renderNovoServicoPage`, trocar o redirect do `salvar()`:

```js
     window.location='/dashboard/servicos/'+j.id+'?criado=1'})})
```

(no lugar do `window.location='/dashboard/servicos?ok=...'`).

- [ ] **Step 4: Router passa os dados** — no `GET /servicos/:id`:

```ts
      const podeEditar = can(req.dashUser, 'servicos', 'editar');
      let telAtribuido: string | null = null;
      if (podeEditar && s.atribuidoA) {
        const { telefoneDoUsuario } = await import('./users-store.js');
        telAtribuido = await telefoneDoUsuario(supabase, s.atribuidoA);
      }
      res.type('html').send(renderDetalheServicoPage(s, comUrl, req.dashUser, podeEditar,
        { pode: podeEditar, telAtribuido, criadoAgora: (req.query as Record<string, string | undefined>).criado === '1' }));
```

(substitui a chamada atual que passava `can(...)` direto).

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run tests/dashboard-servicos-views.test.ts` → PASS (incluindo o teste-guarda dos scripts).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/servicos-views.ts src/modules/dashboard/router.ts tests/dashboard-servicos-views.test.ts
git commit -m "feat(servicos): botao Enviar pelo zap (modal atribuido/avulso, acesso ou so-informacoes) + faixa pos-salvar"
```

---

### Task 6: Replicar a câmera nas outras telas de foto do dash

Padrão SEM mexer no servidor: UM input escondido + dois botões que ligam/desligam o `capture` antes de abrir. Exemplo (adaptar classe/em cada tela):

```html
<input type="file" name="fotos" multiple accept="image/*" class="hidden" id="fotos_input">
<div class="flex gap-2">
  <button type="button" onclick="var i=document.getElementById('fotos_input');i.setAttribute('capture','environment');i.removeAttribute('multiple');i.click()" class="...">📷 Tirar foto</button>
  <button type="button" onclick="var i=document.getElementById('fotos_input');i.removeAttribute('capture');i.setAttribute('multiple','');i.click()" class="...">🖼️ Escolher arquivo</button>
</div>
```

**Files (cada um: teste primeiro no arquivo de teste da view, depois a view, depois commit):**
- Modify: `src/modules/dashboard/relatorio-pi-views.ts` (~L29, name="fotos" multiple)
- Modify: `src/modules/dashboard/os-views.ts` (~L32, name="foto")
- Modify: `src/modules/dashboard/proposta-form-view.ts` (~L261, name="foto${i}" — id único por i, ex.: `id="foto_inp_${i}"`)
- Modify: `src/modules/dashboard/clientes-views.ts` (~L496) e `contrato-form-views.ts` (~L442) e `contratos-views.ts` (~L134): aceitam PDF também → o botão "📷 Tirar foto" seta `capture` E `accept="image/*"`; o "🖼️ Escolher arquivo" restaura `accept="image/*,application/pdf"`.

- [ ] **Step 1:** Para cada arquivo: achar o teste da view correspondente (`ls tests | grep -i <nome>`); se existir, adicionar `expect(html).toContain('capture')`; rodar → FAIL; aplicar o padrão; rodar → PASS. Se não existir teste da view, aplicar o padrão e conferir com `npx tsc --noEmit`.
- [ ] **Step 2:** Commit único da replicação:

```bash
git add src/modules/dashboard/relatorio-pi-views.ts src/modules/dashboard/os-views.ts src/modules/dashboard/proposta-form-view.ts src/modules/dashboard/clientes-views.ts src/modules/dashboard/contrato-form-views.ts src/modules/dashboard/contratos-views.ts
git commit -m "fix(dash): botao Tirar foto (camera) em todas as telas com upload de foto"
```

---

### Task 7: Suíte completa + PR (merge na mão — CI sem minutos)

- [ ] **Step 1:** `npx tsc --noEmit` → limpo.
- [ ] **Step 2:** `npx vitest run` → verde (2 falhas pré-existentes de `supabase-vincular-novo` são conhecidas).
- [ ] **Step 3:** Code review do diff (`git diff main...HEAD`) — 3× como o Junior pede.
- [ ] **Step 4:** Pedir OK do Junior pro push (regra dele) → `git push origin feat/servicos-envio-zap` → `gh pr create` → merge na mão (`gh pr merge --squash`) após OK.
- [ ] **Step 5:** Avisar: **sem migration**; deploy = Implantar no EasyPanel (conferir /health build novo).

---

### Task 8: Replicar câmera nas coletas do site (repo `ecosunpower-site`)

- [ ] **Step 1:** No repo do site: `grep -rn 'type="file"' src/pages/coleta* src/` — achar os inputs de foto das coletas.
- [ ] **Step 2:** Aplicar o MESMO padrão da Task 6 (dois botões ligando/desligando `capture`).
- [ ] **Step 3:** Conferir build (`npm run build`) → commit → push direto na `main` (regra do site) após OK do Junior.
