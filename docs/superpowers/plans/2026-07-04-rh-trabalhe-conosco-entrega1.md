# RH Trabalhe Conosco — Entrega 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública de vagas + formulário que guarda currículos (PDF, cofre privado) + seção RH no dashboard (vagas CRUD e funil de candidatos).

**Architecture:** Site estático (repo `ecosunpower-site`) consome 2 rotas públicas do servidor da Eva (repo `ecosunpower-agente`): `GET /rh/vagas` e `POST /rh/candidatura` (multipart, com CORS). Currículos vão pro bucket privado `curriculos` (Supabase Storage) e os dados pra `rh_candidatos`. Dashboard ganha área de permissão `rh` + telas de vagas e candidatos, seguindo os padrões existentes (views server-rendered + Tailwind, multer memoryStorage, signed URLs como em `src/modules/anexos/storage.ts`).

**Tech Stack:** TypeScript ESM (imports com `.js`), Express, Supabase (Postgres + Storage), multer, vitest.

**Spec:** `docs/superpowers/specs/2026-07-04-rh-trabalhe-conosco-design.md`

**Regras do repo:** branch `feat/rh-trabalhe-conosco` (já criada). `npx tsc --noEmit` limpo + `npx vitest run` verde antes do PR. Commits pequenos. Migration 068 — Junior avisa no grupo antes de aplicar. Toda migration também copiada pra `C:\Users\Meu Computador\Desktop\migrations\`.

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/068_rh.sql` (criar) | tabelas `rh_vagas` + `rh_candidatos` + bucket `curriculos` |
| `src/modules/rh/validacao.ts` (criar) | validação PURA da candidatura (campos, PDF por magic bytes, honeypot) — 100% testável |
| `src/modules/rh/store.ts` (criar) | acesso a banco/Storage: vagas CRUD, salvar candidatura, listar/filtrar candidatos, mudar status (com histórico), URL assinada do PDF |
| `src/modules/rh/routes-publicas.ts` (criar) | Router Express público: GET /rh/vagas, POST /rh/candidatura, CORS + rate limit em memória |
| `src/index.ts` (modificar) | montar `app.use(criarRhRoutesPublicas(supabaseService))` junto das outras rotas públicas (perto do `/health`) |
| `src/modules/dashboard/permissions.ts` (modificar) | adicionar `'rh'` em `AREAS` |
| `src/modules/dashboard/rh-views.ts` (criar) | renderVagasPage, renderVagaFormPage, renderCandidatosPage |
| `src/modules/dashboard/router.ts` (modificar) | rotas `/dashboard/rh/*` com `can(req.dashUser,'rh',...)` |
| `src/modules/dashboard/views.ts` (modificar) | item "👥 RH" no menu lateral (array de navegação do renderLayout) |
| `tests/rh-validacao.test.ts`, `tests/rh-views.test.ts`, `tests/rh-store.test.ts` (criar) | testes |
| SITE `src/pages/trabalhe-conosco.astro` (criar) + `src/components/Header.astro` (modificar) | página pública + menu |

---

### Task 1: Migration 068 (tabelas + bucket)

**Files:** Create `supabase/migrations/068_rh.sql`

- [ ] **Step 1: escrever a migration**

```sql
-- 068: RH Trabalhe Conosco — vagas + candidatos + bucket privado de currículos.
-- Combinar o número 068 no grupo antes de aplicar (regra do time).

CREATE TABLE IF NOT EXISTS rh_vagas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL,
  descricao   text NOT NULL DEFAULT '',
  requisitos  text NOT NULL DEFAULT '',
  cidade      text NOT NULL DEFAULT 'Brasília-DF',
  tipo        text NOT NULL DEFAULT 'CLT',       -- CLT|PJ|Estágio|Temporário
  status      text NOT NULL DEFAULT 'aberta',    -- aberta|fechada
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rh_candidatos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id          uuid REFERENCES rh_vagas(id) ON DELETE SET NULL,  -- null = banco de talentos
  nome             text NOT NULL,
  telefone         text NOT NULL,
  email            text NOT NULL DEFAULT '',
  curriculo_path   text NOT NULL,                 -- caminho no bucket curriculos
  consentimento_em timestamptz NOT NULL,
  origem           text NOT NULL DEFAULT 'site',
  status           text NOT NULL DEFAULT 'novo',  -- novo|triado|entrevista|aprovado|reprovado
  nota_ia          numeric,                       -- Entrega 2
  resumo_ia        text,                          -- Entrega 2
  alertas_ia       text,                          -- Entrega 2
  historico        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_vaga ON rh_candidatos(vaga_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_status ON rh_candidatos(status);

-- Bucket PRIVADO de currículos (acesso só por URL assinada gerada no dashboard).
INSERT INTO storage.buckets (id, name, public)
VALUES ('curriculos', 'curriculos', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: copiar pra Área de Trabalho** — Run: `cp supabase/migrations/068_rh.sql "/c/Users/Meu Computador/Desktop/migrations/068_rh.sql"`
- [ ] **Step 3: commit** — `git add supabase/migrations/068_rh.sql && git commit -m "feat(rh): migration 068 — vagas, candidatos e bucket de curriculos"`

### Task 2: validação pura da candidatura

**Files:** Create `src/modules/rh/validacao.ts` · Test `tests/rh-validacao.test.ts`

- [ ] **Step 1: teste falhando**

```ts
// tests/rh-validacao.test.ts
import { describe, it, expect } from 'vitest';
import { validarCandidatura } from '../src/modules/rh/validacao.js';

const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 1)]);
const base = { nome: 'João da Silva', telefone: '61 99880-5002', email: 'j@x.com', vagaId: '', consentimento: '1', website: '' };

describe('validarCandidatura', () => {
  it('aceita candidatura válida com PDF de verdade e normaliza o telefone', () => {
    const r = validarCandidatura(base, pdfBuf, 'curriculo.pdf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.telefone).toBe('5561998805002');
  });
  it('recusa arquivo que não é PDF (magic bytes), mesmo com nome .pdf', () => {
    const r = validarCandidatura(base, Buffer.from('nao sou pdf'), 'curriculo.pdf');
    expect(r.ok).toBe(false);
  });
  it('recusa sem consentimento, sem nome ou telefone inválido', () => {
    expect(validarCandidatura({ ...base, consentimento: '' }, pdfBuf, 'c.pdf').ok).toBe(false);
    expect(validarCandidatura({ ...base, nome: ' ' }, pdfBuf, 'c.pdf').ok).toBe(false);
    expect(validarCandidatura({ ...base, telefone: '123' }, pdfBuf, 'c.pdf').ok).toBe(false);
  });
  it('honeypot preenchido (campo website) = spam, recusa em silêncio', () => {
    const r = validarCandidatura({ ...base, website: 'http://spam' }, pdfBuf, 'c.pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.spam).toBe(true);
  });
  it('PDF acima de 5MB é recusado', () => {
    const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024 + 1)]);
    expect(validarCandidatura(base, grande, 'c.pdf').ok).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/rh-validacao.test.ts` → FAIL (módulo não existe)
- [ ] **Step 3: implementar**

```ts
// src/modules/rh/validacao.ts
// Validação PURA da candidatura pública (sem IO): campos, consentimento LGPD,
// honeypot anti-spam e PDF de verdade (magic bytes %PDF-), máx 5MB.
import { variantesTelefone } from '../phone.js';

export const CURRICULO_MAX_BYTES = 5 * 1024 * 1024;

export interface CandidaturaInput {
  nome: string; telefone: string; email: string;
  vagaId: string;           // '' = banco de talentos
  consentimento: string;    // '1' quando marcado
  website: string;          // honeypot: humano deixa vazio
}
export type CandidaturaValidada = { nome: string; telefone: string; email: string; vagaId: string | null };
export type ResultadoValidacao =
  | { ok: true; dados: CandidaturaValidada }
  | { ok: false; erro: string; spam?: boolean };

export function validarCandidatura(
  input: CandidaturaInput, arquivo: Buffer | null | undefined, nomeArquivo: string,
): ResultadoValidacao {
  if ((input.website ?? '').trim() !== '') return { ok: false, erro: 'spam', spam: true };
  const nome = (input.nome ?? '').trim();
  if (nome.length < 3) return { ok: false, erro: 'Preencha seu nome completo.' };
  if ((input.consentimento ?? '') !== '1') return { ok: false, erro: 'É preciso autorizar o uso dos dados pra candidatura.' };
  const variantes = variantesTelefone(input.telefone ?? '');
  const telefone = variantes.find((v) => v.length === 13 || v.length === 12) ?? '';
  if (!telefone) return { ok: false, erro: 'Telefone inválido — use DDD + número.' };
  if (!arquivo || arquivo.length === 0) return { ok: false, erro: 'Anexe seu currículo em PDF.' };
  if (arquivo.length > CURRICULO_MAX_BYTES) return { ok: false, erro: 'Currículo acima de 5 MB — diminua o arquivo.' };
  if (!arquivo.subarray(0, 5).equals(Buffer.from('%PDF-'))) return { ok: false, erro: `O arquivo "${nomeArquivo}" não é um PDF.` };
  const vagaId = (input.vagaId ?? '').trim();
  return { ok: true, dados: { nome, telefone, email: (input.email ?? '').trim(), vagaId: vagaId || null } };
}
```

- [ ] **Step 4: rodar e ver passar** — `npx vitest run tests/rh-validacao.test.ts` → PASS
- [ ] **Step 5: commit** — `git add src/modules/rh/validacao.ts tests/rh-validacao.test.ts && git commit -m "feat(rh): validacao pura da candidatura (PDF magic bytes, honeypot, LGPD)"`

### Task 3: store (banco + Storage)

**Files:** Create `src/modules/rh/store.ts` · Test `tests/rh-store.test.ts`

Molde: `src/modules/anexos/storage.ts` (upload/signed URL) e stores do dashboard (`users-store.ts`). Funções (todas recebem `SupabaseClient`):

```ts
// Assinaturas (o corpo segue o padrão dos stores existentes — .from().select() etc.):
listarVagasAbertas(client): Promise<Array<{ id, titulo, descricao, requisitos, cidade, tipo }>>
listarVagas(client): Promise<VagaRow[]>                       // todas, pro dashboard
criarVaga(client, v: { titulo, descricao, requisitos, cidade, tipo }): Promise<{ ok, id?, error? }>
atualizarVaga(client, id, campos: Partial<...> & { status? }): Promise<{ ok, error? }>
salvarCandidatura(client, dados: CandidaturaValidada, pdf: Buffer): Promise<{ ok, error? }>
   // path no bucket: `${vagaId ?? 'banco-talentos'}/${randomUUID()}.pdf`; contentType application/pdf;
   // insere rh_candidatos com consentimento_em = new Date().toISOString()
listarCandidatos(client, filtros: { vagaId?, status?, q? }): Promise<CandidatoRow[]>  // ordena created_at desc
mudarStatus(client, id, novoStatus, quem: string): Promise<{ ok, error? }>
   // valida novoStatus ∈ novo|triado|entrevista|aprovado|reprovado;
   // append no historico: { de, para, quem, quando: iso } (lê a linha, concatena, update)
urlCurriculo(client, path): Promise<string | null>            // createSignedUrl bucket 'curriculos', TTL 600s
```

- [ ] **Step 1: teste falhando** — teste do que é puro/decidível sem banco: `mudarStatus` recusa status inválido; `salvarCandidatura` monta path `banco-talentos/...` quando vagaId=null (exportar helper `montarPathCurriculo(vagaId: string|null): string` puro e testá-lo; UUID no fim com regex).

```ts
// tests/rh-store.test.ts
import { describe, it, expect } from 'vitest';
import { montarPathCurriculo, STATUS_VALIDOS } from '../src/modules/rh/store.js';

describe('rh store (partes puras)', () => {
  it('path do currículo: vaga vira pasta, sem vaga = banco-talentos', () => {
    expect(montarPathCurriculo('abc-123')).toMatch(/^abc-123\/[0-9a-f-]{36}\.pdf$/);
    expect(montarPathCurriculo(null)).toMatch(/^banco-talentos\/[0-9a-f-]{36}\.pdf$/);
  });
  it('lista de status do funil é a combinada', () => {
    expect([...STATUS_VALIDOS]).toEqual(['novo', 'triado', 'entrevista', 'aprovado', 'reprovado']);
  });
});
```

- [ ] **Step 2: ver falhar** → **Step 3: implementar o store completo** (funções acima) → **Step 4: ver passar + `npx tsc --noEmit`** → **Step 5: commit** `feat(rh): store de vagas/candidatos + curriculo no bucket privado`

### Task 4: rotas públicas com CORS + rate limit

**Files:** Create `src/modules/rh/routes-publicas.ts` · Modify `src/index.ts` (montar perto do bloco do `/health`)

- [ ] **Step 1: implementar** (a lógica validável já está testada na Task 2; aqui é fiação fina)

```ts
// src/modules/rh/routes-publicas.ts
// Rotas PÚBLICAS do RH (consumidas pela página /trabalhe-conosco do site).
// CORS liberado só pro domínio do site. Honeypot+rate limit contra spam.
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { SupabaseService } from '../supabase.js';
import { validarCandidatura, CURRICULO_MAX_BYTES } from './validacao.js';
import { listarVagasAbertas, salvarCandidatura } from './store.js';

const ORIGENS = new Set(['https://ecosunpower.eng.br', 'https://www.ecosunpower.eng.br']);

function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = String(req.headers.origin ?? '');
  if (ORIGENS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
}

// Rate limit simples em memória: máx 5 candidaturas por IP por hora.
const envios = new Map<string, number[]>();
function estourouLimite(ip: string): boolean {
  const agora = Date.now();
  const lista = (envios.get(ip) ?? []).filter((t) => agora - t < 60 * 60 * 1000);
  if (lista.length >= 5) { envios.set(ip, lista); return true; }
  lista.push(agora); envios.set(ip, lista);
  return false;
}

export function criarRhRoutesPublicas(supabase: SupabaseService): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CURRICULO_MAX_BYTES + 1024 } });
  router.use(cors);

  router.get('/rh/vagas', async (_req, res) => {
    try { res.json({ vagas: await listarVagasAbertas(supabase.getClient()) }); }
    catch { res.status(500).json({ vagas: [] }); }
  });

  router.post('/rh/candidatura', upload.single('curriculo'), async (req, res) => {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
    if (estourouLimite(ip)) { res.status(429).json({ ok: false, erro: 'Muitas tentativas — tenta de novo mais tarde.' }); return; }
    const b = req.body ?? {};
    const r = validarCandidatura(
      { nome: String(b.nome ?? ''), telefone: String(b.telefone ?? ''), email: String(b.email ?? ''),
        vagaId: String(b.vaga_id ?? ''), consentimento: String(b.consentimento ?? ''), website: String(b.website ?? '') },
      req.file?.buffer, String(req.file?.originalname ?? ''),
    );
    if (!r.ok) {
      if (r.spam) { res.json({ ok: true }); return; }   // spam: finge sucesso, não dá dica
      res.status(400).json({ ok: false, erro: r.erro }); return;
    }
    const salvo = await salvarCandidatura(supabase.getClient(), r.dados, req.file!.buffer);
    if (!salvo.ok) { res.status(500).json({ ok: false, erro: 'Não consegui salvar agora — tenta de novo em instantes.' }); return; }
    res.json({ ok: true });
  });
  return router;
}
```

Em `src/index.ts`, perto das rotas públicas existentes: `app.use(criarRhRoutesPublicas(supabase));` (+ import). Cuidado: montar ANTES do router do dashboard.
Erro do multer (arquivo grande) responde 400 legível: registrar error-handler no router: `router.use((err, _req, res, _next) => res.status(400).json({ ok: false, erro: 'Arquivo inválido ou grande demais (máx 5 MB).' }))`.

- [ ] **Step 2: `npx tsc --noEmit` + suíte** → **Step 3: commit** `feat(rh): rotas publicas /rh/vagas e /rh/candidatura (CORS + honeypot + rate limit)`

### Task 5: permissão + telas do dashboard

**Files:** Modify `src/modules/dashboard/permissions.ts` (adicionar `'rh'` em AREAS) · Create `src/modules/dashboard/rh-views.ts` · Modify `src/modules/dashboard/router.ts` e `views.ts` (menu) · Test `tests/rh-views.test.ts`

- [ ] **Step 1: teste falhando das views**

```ts
// tests/rh-views.test.ts
import { describe, it, expect } from 'vitest';
import { renderVagasPage, renderCandidatosPage } from '../src/modules/dashboard/rh-views.js';

const vagas = [{ id: 'v1', titulo: 'Instalador Fotovoltaico', descricao: 'obra', requisitos: 'NR-35', cidade: 'Brasília-DF', tipo: 'CLT', status: 'aberta', created_at: '2026-07-04' }] as any[];
const candidatos = [{ id: 'c1', vaga_id: 'v1', vaga_titulo: 'Instalador Fotovoltaico', nome: "José D'Ávila", telefone: '5561999990000', email: 'z@x.com', curriculo_path: 'v1/a.pdf', status: 'novo', nota_ia: null, resumo_ia: null, created_at: '2026-07-04' }] as any[];

describe('telas RH', () => {
  it('vagas: lista com título, status e botão nova vaga', () => {
    const html = renderVagasPage(vagas, undefined);
    expect(html).toContain('Instalador Fotovoltaico');
    expect(html).toContain('aberta');
    expect(html).toContain('/dashboard/rh/vagas/nova');
  });
  it('candidatos: lista com funil, escapa apóstrofo e tem link do PDF', () => {
    const html = renderCandidatosPage(candidatos, vagas, {}, undefined);
    expect(html).toContain('D&#039;Ávila');
    expect(html).toContain('/dashboard/rh/candidatos/c1/curriculo');
    for (const s of ['novo', 'triado', 'entrevista', 'aprovado', 'reprovado']) expect(html).toContain(s);
  });
});
```

- [ ] **Step 2: ver falhar** → **Step 3: implementar** `rh-views.ts` (seguir o molde visual do `renderMonitoramentoPage`/tabelas claras do dashboard; sempre `escapeHtml`):
  - `renderVagasPage(vagas, user)`: tabela (título, cidade, tipo, status, nº candidatos se vier) + botão "➕ Nova vaga" → `/dashboard/rh/vagas/nova` + botão abrir/fechar (form POST) + editar.
  - `renderVagaFormPage(vaga | null, user)`: form título/descrição/requisitos/cidade/tipo (POST `/dashboard/rh/vagas` ou `/dashboard/rh/vagas/:id`).
  - `renderCandidatosPage(candidatos, vagas, filtros, user)`: filtros (vaga, status, busca por nome) + tabela: nome, vaga (ou "Banco de Talentos"), telefone (link wa.me), e-mail, data, status atual como `<select>` que submete POST `/dashboard/rh/candidatos/:id/status`, link "📄 Currículo" → `/dashboard/rh/candidatos/:id/curriculo` (abre em nova aba). Colunas nota/resumo IA já presentes mas mostrando "—" quando null (prontas pra Entrega 2).
- [ ] **Step 4: rotas no `router.ts`** (todas com `can(req.dashUser, 'rh', ...)`; 'visualizar' pra GET, 'criar'/'editar' pra POST):
  - GET `/rh` → redirect `/rh/candidatos` · GET `/rh/vagas` · GET `/rh/vagas/nova` · POST `/rh/vagas` · GET+POST `/rh/vagas/:id` · POST `/rh/vagas/:id/status`
  - GET `/rh/candidatos` (filtros por query) · POST `/rh/candidatos/:id/status` (chama `mudarStatus` com `req.dashUser.nome`) · GET `/rh/candidatos/:id/curriculo` → `urlCurriculo` → `res.redirect(url)` (404 se null)
  - Menu: adicionar `{ href: '/dashboard/rh', label: '👥 RH', active: 'rh' }` no array de navegação do layout em `views.ts` (procurar onde 'monitoramento' está listado).
- [ ] **Step 5: rodar testes + tsc** → **Step 6: commit** `feat(rh): area rh no dashboard (vagas CRUD + funil de candidatos)`

### Task 6: página do site `/trabalhe-conosco` (repo ecosunpower-site)

**Files:** Create `src/pages/trabalhe-conosco.astro` · Modify `src/components/Header.astro` (add `{ href: '/trabalhe-conosco', label: 'Trabalhe Conosco' }`)

- [ ] **Step 1: criar a página** seguindo o visual do site (usar `Layout` + classes existentes; olhar `src/pages/calculadora.astro` como molde de página com CTA):
  - Hero curto ("Vem trabalhar com a gente ☀️").
  - `<div id="vagas">` preenchida por script: `fetch('https://propostas.ecosunpower.eng.br/rh/vagas')` → cards (título, cidade, tipo, descrição, botão "Candidatar-se" que seleciona a vaga no form). Se o fetch falhar: esconde a seção de vagas (só Banco de Talentos) — a página nunca quebra.
  - Formulário: nome, telefone, e-mail, `<select>` vaga (opções do fetch + "Banco de Talentos"), `<input type="file" accept="application/pdf">`, checkbox consentimento (texto: "Autorizo a EcoSunPower a guardar meus dados e currículo por até 12 meses, só pra processos seletivos."), campo honeypot `website` escondido via CSS (`position:absolute;left:-9999px`).
  - Envio via `fetch` POST `FormData` pra `https://propostas.ecosunpower.eng.br/rh/candidatura`; sucesso → troca o form por "✅ Recebemos seu currículo! Se rolar match, a gente te chama."; erro → mostra a mensagem devolvida.
- [ ] **Step 2: build** — `npm run build` no repo do site → 0 erros
- [ ] **Step 3: commit local** (SEM push — site vai junto com autorização do Junior no final): `feat(rh): pagina /trabalhe-conosco + link no menu`

### Task 7: retenção LGPD 12 meses

**Files:** Modify `src/modules/rh/store.ts` (+`limparCandidatosAntigos`), `src/index.ts` (cron 1x/dia, molde do `resumirTelemetria`)

- [ ] **Step 1:** `limparCandidatosAntigos(client, corteIso)`: seleciona `rh_candidatos` com `created_at < corteIso`, remove PDFs do bucket (`storage.remove(paths)`) e apaga as linhas; devolve `{ apagados }`. Corte = 365 dias. Teste puro: exportar `corteRetencao(agoraMs): string` (ISO de agora-365d) e testar.
- [ ] **Step 2:** cron em index.ts junto dos crons de telemetria: `setInterval` 24h + log `[rh] retenção: X candidatos antigos apagados` (só loga quando X>0).
- [ ] **Step 3:** testes + tsc + commit `feat(rh): retencao LGPD de 12 meses pros curriculos`

### Task 8: fechamento

- [ ] `npx tsc --noEmit` limpo + `npx vitest run` 100% verde
- [ ] Code review do diff completo 3× (regra do Junior), corrigindo achados
- [ ] Push da branch + link do PR pro Junior (agente) — site espera autorização de push
- [ ] Instruções pro Junior: avisar 068 no grupo → aplicar 068 (Desktop\migrations) → merge PR → Forçar Reconstrução → smoke: abrir /trabalhe-conosco, mandar candidatura de teste com PDF, ver aparecer em /dashboard/rh/candidatos, abrir o PDF, mudar status
