# Pasta Digital do Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública com a marca EcoSunPower (`propostas.ecosunpower.eng.br/pasta/<slug>`) reunindo fotos + documentos da entrega pós-instalação, montada por tela no dashboard e enviada pelo zap.

**Architecture:** Módulo irmão do Relatório Pós-Instalação (r-pi): tabela `pastas_cliente` (1 por lead), arquivos no bucket `client-attachments` via `anexos/storage.ts`, signed URLs geradas a cada visita, service + template em `src/modules/relatorios/pasta/`, telas admin em `src/modules/dashboard/pasta-views.ts` + rotas no `dashboard/router.ts`, rota pública em `src/index.ts`. Mobile = item por item; desktop = ZIP montado no navegador (receita mkZip das coletas).

**Tech Stack:** TypeScript ESM (imports com `.js`), Express server-rendered, Supabase (Postgres + Storage), multer, vitest, Tailwind via CDN no dashboard.

**Spec:** `docs/superpowers/specs/2026-08-05-pasta-digital-cliente-design.md`

**Regras do repo (CLAUDE.md):** branch `feat/pasta-digital-cliente` (já criada) · commits pequenos · `git add` por nome de arquivo · NUNCA push na main · migration numerada combinada no grupo do zap ANTES de aplicar · `npx tsc --noEmit` limpo e `npx vitest run` verde (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` são conhecidas — ignorar).

---

### Task 1: Extrair `novoSlug` compartilhado (DRY com o r-pi)

**Files:**
- Create: `src/modules/relatorios/slug.ts`
- Modify: `src/modules/relatorios/pos-instalacao/service.ts` (remover função local, importar a compartilhada)

- [ ] **Step 1: Criar o módulo compartilhado**

```typescript
// src/modules/relatorios/slug.ts
// Slug curto não-enumerável (padrão do r-pi) — usado por relatórios públicos
// e pela Pasta Digital do Cliente. Alfabeto sem 0/o/1/l/i pra evitar confusão.
export function novoSlug(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
```

- [ ] **Step 2: Refatorar o r-pi pra usar o módulo**

Em `src/modules/relatorios/pos-instalacao/service.ts`:
- Apagar a função local `novoSlug()` (linhas 9–15, comentário "// Slug curto não-enumerável (igual S3)" incluso).
- Adicionar no topo, junto dos outros imports: `import { novoSlug } from '../slug.js';`

- [ ] **Step 3: Rodar os testes do r-pi (garantir que nada quebrou)**

Run: `npx vitest run tests/relatorio-pos-instalacao-service.test.ts`
Expected: PASS (todos verdes)

- [ ] **Step 4: Commit**

```bash
git add src/modules/relatorios/slug.ts src/modules/relatorios/pos-instalacao/service.ts
git commit -m "refactor: extrai novoSlug compartilhado dos relatorios

Co-Authored-By: Claude"
```

---

### Task 2: Migration `098_pastas_cliente.sql`

**Files:**
- Create: `supabase/migrations/098_pastas_cliente.sql`

⚠️ **Só criar o ARQUIVO.** O número 098 precisa ser combinado no grupo do zap e a migration é aplicada pelo Junior no SQL Editor ANTES do deploy. Se o grupo já tiver usado 098, renomear pro próximo livre.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/098_pastas_cliente.sql
-- Pasta Digital do Cliente (entrega pós-instalação)
-- Spec: docs/superpowers/specs/2026-08-05-pasta-digital-cliente-design.md

create table pastas_cliente (
  id uuid primary key default gen_random_uuid(),
  -- UMA pasta por lead (unique) — editar a existente em vez de duplicar
  lead_id uuid not null unique references leads(id) on delete cascade,
  slug text not null unique,
  status text not null default 'rascunho',       -- rascunho | publicada
  capa_storage_path text,
  data_entrega date,
  mensagem_zap text,
  -- cada item: { secao: 'fotos'|'projeto'|'art'|'homologacao'|'manuais'|'garantia'|'contrato',
  --              storage_path, nome_exibicao, caption?, origem?: 'upload'|'r-pi' }
  arquivos jsonb not null default '[]',
  acessos integer not null default 0,
  ultimo_acesso_em timestamptz,
  enviado_em timestamptz,
  enviado_para_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'junior'
);

-- Increment atômico de acessos (mesmo padrão do increment_pi_access da 034)
create or replace function increment_pasta_access(p_slug text)
returns void language sql security definer as $$
  update pastas_cliente
  set acessos = acessos + 1, ultimo_acesso_em = now()
  where slug = p_slug;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/098_pastas_cliente.sql
git commit -m "feat: migration pastas_cliente (pasta digital do cliente)

Co-Authored-By: Claude"
```

---

### Task 3: Métodos no `supabase.ts`

**Files:**
- Modify: `src/modules/supabase.ts` (adicionar bloco novo logo após `incrementarAcessoRelatorioPI`, ~linha 2382, ANTES de `getLeadsMedidorTrocadoSemRelatorio`)

Métodos finos (sem lógica) — mesmo estilo do bloco A5. Sem teste unitário próprio (padrão do repo: a lógica é testada no service com fake do supabase).

- [ ] **Step 1: Adicionar os métodos**

```typescript
  // ====================================================================
  // Pasta Digital do Cliente
  // ====================================================================

  async criarPastaCliente(input: { lead_id: string; slug: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.client
      .from('pastas_cliente')
      .insert({ lead_id: input.lead_id, slug: input.slug, created_by: 'junior' })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  }

  async getPastaClienteByLead(leadId: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('pastas_cliente')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle();
    if (error) {
      console.warn('[supabase] getPastaClienteByLead:', error.message);
      return null;
    }
    return data;
  }

  async getPastaClienteById(id: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('pastas_cliente')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  async getPastaClienteBySlug(slug: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('pastas_cliente')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error) return null;
    return data;
  }

  async listPastasCliente(limit: number = 100): Promise<any[]> {
    const { data, error } = await this.client
      .from('pastas_cliente')
      .select('id, lead_id, slug, status, arquivos, acessos, ultimo_acesso_em, enviado_em, updated_at, leads(name)')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[supabase] listPastasCliente:', error.message);
      return [];
    }
    return data ?? [];
  }

  async atualizarPastaCliente(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client
      .from('pastas_cliente')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async marcarPastaClienteEnviada(id: string, phone: string): Promise<void> {
    await this.client
      .from('pastas_cliente')
      .update({ enviado_em: new Date().toISOString(), enviado_para_phone: phone })
      .eq('id', id);
  }

  async incrementarAcessoPasta(slug: string): Promise<void> {
    // RPC atômico (definido na migration 098) — evita race em concurrent reads.
    const { error } = await this.client.rpc('increment_pasta_access', { p_slug: slug });
    if (error) console.warn('[supabase] increment_pasta_access:', error.message);
  }
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit`
Expected: limpo (sem erro)

- [ ] **Step 3: Commit**

```bash
git add src/modules/supabase.ts
git commit -m "feat: metodos supabase da pasta digital do cliente

Co-Authored-By: Claude"
```

---

### Task 4: Tipos do módulo pasta

**Files:**
- Create: `src/modules/relatorios/pasta/types.ts`

- [ ] **Step 1: Escrever os tipos**

```typescript
// src/modules/relatorios/pasta/types.ts

export type SecaoId = 'fotos' | 'projeto' | 'art' | 'homologacao' | 'manuais' | 'garantia' | 'contrato';

// Ordem de exibição na página pública e no editor admin.
export const SECOES: ReadonlyArray<{ id: SecaoId; titulo: string }> = [
  { id: 'fotos',       titulo: '📸 Fotos da instalação' },
  { id: 'projeto',     titulo: '📐 Projeto' },
  { id: 'art',         titulo: '📋 ART' },
  { id: 'homologacao', titulo: '✅ Homologação' },
  { id: 'manuais',     titulo: '📖 Manuais' },
  { id: 'garantia',    titulo: '🛡️ Garantia' },
  { id: 'contrato',    titulo: '📄 Contrato' },
];

export interface ArquivoPasta {
  secao: SecaoId;
  storage_path: string;
  nome_exibicao: string;
  caption?: string | null;
  origem?: 'upload' | 'r-pi';   // 'r-pi' = referenciado do relatório, NÃO apagar do bucket ao remover
}

export interface PastaClienteRow {
  id: string;
  lead_id: string;
  slug: string;
  status: 'rascunho' | 'publicada';
  capa_storage_path: string | null;
  data_entrega: string | null;      // YYYY-MM-DD
  mensagem_zap: string | null;
  arquivos: ArquivoPasta[];
  acessos: number;
  ultimo_acesso_em: string | null;
  enviado_em: string | null;
  enviado_para_phone: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Snapshot resolvido server-side antes de renderPastaHtml (signed URLs por visita).
export interface PastaView {
  cliente_nome: string;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  data_entrega: string | null;
  sistema: {
    apelido: string;
    marca_inversor: string;
    inversor_modelo: string | null;
    potencia_kwp: number | null;
    qtd_paineis: number | null;
    painel_marca: string | null;
    painel_modelo: string | null;
  } | null;
  capa_url: string | null;
  logo_base64: string;              // data URI (obterLogoBase64)
  whatsapp: string | null;          // empresa().telefoneAtendente — botão wa.me
  secoes: Array<{
    secao: SecaoId;
    titulo: string;
    arquivos: Array<{ url: string; nome: string; caption: string | null; is_imagem: boolean }>;
  }>;
  slug: string;
  publico: boolean;                 // false = banner PREVIEW
  gerado_em: string;
}
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit`
Expected: limpo

- [ ] **Step 3: Commit**

```bash
git add src/modules/relatorios/pasta/types.ts
git commit -m "feat: tipos da pasta digital do cliente

Co-Authored-By: Claude"
```

---

### Task 5: `PastaService` (TDD)

**Files:**
- Create: `tests/pasta-service.test.ts`
- Create: `src/modules/relatorios/pasta/service.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/pasta-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PastaService } from '../src/modules/relatorios/pasta/service.js';

const PASTA_BASE = {
  id: 'pasta-1', lead_id: 'lead-1', slug: 'abcdefghjk', status: 'rascunho',
  capa_storage_path: null, data_entrega: null, mensagem_zap: null,
  arquivos: [], acessos: 0, ultimo_acesso_em: null,
  enviado_em: null, enviado_para_phone: null,
  created_at: '2026-08-05T12:00:00Z', updated_at: '2026-08-05T12:00:00Z', created_by: 'junior',
};

function fakeSupabase(o: any = {}) {
  return {
    criarPastaCliente: vi.fn().mockResolvedValue({ ok: true, id: 'pasta-1' }),
    getPastaClienteByLead: vi.fn().mockResolvedValue(null),
    getPastaClienteById: vi.fn().mockResolvedValue({ ...PASTA_BASE }),
    getPastaClienteBySlug: vi.fn().mockResolvedValue(null),
    listPastasCliente: vi.fn().mockResolvedValue([]),
    atualizarPastaCliente: vi.fn().mockResolvedValue({ ok: true }),
    marcarPastaClienteEnviada: vi.fn().mockResolvedValue(undefined),
    incrementarAcessoPasta: vi.fn().mockResolvedValue(undefined),
    listRelatoriosPosInstalacaoByLead: vi.fn().mockResolvedValue([]),
    getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue(null),
    getClienteByLeadId: vi.fn().mockResolvedValue({
      id: 'lead-1', name: 'João Silva', phone: '5561999990000', opt_out: false,
      city: 'Brasília', uf: 'DF',
    }),
    getClient: vi.fn().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'p/x.pdf' }, error: null }),
          createSignedUrls: vi.fn().mockImplementation(async (paths: string[]) => ({
            data: paths.map((p) => ({ path: p, signedUrl: `https://sig/${p}` })), error: null,
          })),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          download: vi.fn().mockResolvedValue({ data: null, error: { message: 'no logo' } }),
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    ...o,
  };
}

const semSistema = async () => null;

describe('PastaService.obterOuCriarPorLead', () => {
  it('cria pasta nova com slug quando lead não tem', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.obterOuCriarPorLead('lead-1');
    expect(r.ok).toBe(true);
    expect(sb.criarPastaCliente).toHaveBeenCalledOnce();
    expect(sb.criarPastaCliente.mock.calls[0][0].slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it('retorna a existente sem criar de novo (1 pasta por lead)', async () => {
    const sb = fakeSupabase({ getPastaClienteByLead: vi.fn().mockResolvedValue({ ...PASTA_BASE }) });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.obterOuCriarPorLead('lead-1');
    expect(r.ok).toBe(true);
    expect(r.pasta?.id).toBe('pasta-1');
    expect(sb.criarPastaCliente).not.toHaveBeenCalled();
  });
});

describe('PastaService.adicionarArquivos', () => {
  it('sobe arquivos e anexa na seção com origem upload', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.adicionarArquivos('pasta-1', 'projeto', [
      { buffer: Buffer.from('pdf'), mimeType: 'application/pdf', ext: 'pdf', nome: 'prancha.pdf' },
    ]);
    expect(r.ok).toBe(true);
    const patch = sb.atualizarPastaCliente.mock.calls[0][1];
    expect(patch.arquivos.length).toBe(1);
    expect(patch.arquivos[0]).toMatchObject({ secao: 'projeto', nome_exibicao: 'prancha.pdf', origem: 'upload' });
    expect(patch.arquivos[0].storage_path).toMatch(/^lead-1\/pasta\//);
  });

  it('falha de upload: rollback e retorna error', async () => {
    const sb = fakeSupabase({
      getClient: vi.fn().mockReturnValue({
        storage: { from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket off' } }),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        }) },
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.adicionarArquivos('pasta-1', 'fotos', [
      { buffer: Buffer.from('x'), mimeType: 'image/jpeg', ext: 'jpg', nome: 'a.jpg' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('bucket off');
    expect(sb.atualizarPastaCliente).not.toHaveBeenCalled();
  });
});

describe('PastaService.removerArquivo', () => {
  it('remove do jsonb e apaga do bucket quando origem=upload', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'projeto', storage_path: 'lead-1/pasta/a.pdf', nome_exibicao: 'a.pdf', origem: 'upload' }],
      }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.removerArquivo('pasta-1', 'lead-1/pasta/a.pdf');
    expect(r.ok).toBe(true);
    expect(sb.atualizarPastaCliente.mock.calls[0][1].arquivos).toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith(['lead-1/pasta/a.pdf']);
  });

  it('origem=r-pi: desvincula MAS NÃO apaga do bucket (foto pertence ao relatório)', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f.jpg', nome_exibicao: 'f.jpg', origem: 'r-pi' }],
      }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.removerArquivo('pasta-1', 'lead-1/pos_instalacao/f.jpg');
    expect(r.ok).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('remover a foto que era capa limpa capa_storage_path', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        capa_storage_path: 'lead-1/pasta/c.jpg',
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pasta/c.jpg', nome_exibicao: 'c.jpg', origem: 'upload' }],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    await svc.removerArquivo('pasta-1', 'lead-1/pasta/c.jpg');
    expect(sb.atualizarPastaCliente.mock.calls[0][1].capa_storage_path).toBeNull();
  });
});

describe('PastaService.puxarFotosDoRelatorio', () => {
  it('adiciona fotos do r-pi com origem=r-pi sem re-upload, pulando duplicadas', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f1.jpg', nome_exibicao: 'foto-obra-1.jpg', origem: 'r-pi' }],
      }),
      listRelatoriosPosInstalacaoByLead: vi.fn().mockResolvedValue([{ id: 'rel-1' }]),
      getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue({
        id: 'rel-1', lead_id: 'lead-1',
        fotos: [
          { storage_path: 'lead-1/pos_instalacao/f1.jpg', caption: null },
          { storage_path: 'lead-1/pos_instalacao/f2.jpg', caption: 'Inversor' },
        ],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDoRelatorio('pasta-1');
    expect(r.ok).toBe(true);
    expect(r.adicionadas).toBe(1);
    const arquivos = sb.atualizarPastaCliente.mock.calls[0][1].arquivos;
    expect(arquivos.length).toBe(2);
    expect(arquivos[1]).toMatchObject({ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f2.jpg', origem: 'r-pi', caption: 'Inversor' });
  });

  it('lead sem relatório: ok=false com mensagem clara', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDoRelatorio('pasta-1');
    expect(r.ok).toBe(false);
  });
});

describe('PastaService.publicar', () => {
  it('pasta vazia NÃO publica', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.publicar('pasta-1');
    expect(r.ok).toBe(false);
    expect(sb.atualizarPastaCliente).not.toHaveBeenCalled();
  });

  it('com arquivo: muda status pra publicada', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pasta/a.jpg', nome_exibicao: 'a.jpg', origem: 'upload' }],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.publicar('pasta-1');
    expect(r.ok).toBe(true);
    expect(sb.atualizarPastaCliente.mock.calls[0][1].status).toBe('publicada');
  });
});

describe('PastaService.resolverView', () => {
  const pastaComArquivos = {
    ...PASTA_BASE,
    status: 'publicada',
    arquivos: [
      { secao: 'fotos', storage_path: 'lead-1/pasta/f1.jpg', nome_exibicao: 'f1.jpg', origem: 'upload' },
      { secao: 'projeto', storage_path: 'lead-1/pasta/p.pdf', nome_exibicao: 'prancha.pdf', origem: 'upload' },
    ],
  };

  it('agrupa por seção na ordem fixa e seções vazias somem', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const v = await svc.resolverView(pastaComArquivos as any, true);
    expect(v).not.toBeNull();
    expect(v!.secoes.map((s) => s.secao)).toEqual(['fotos', 'projeto']);
    expect(v!.secoes[0].arquivos[0].is_imagem).toBe(true);
    expect(v!.secoes[1].arquivos[0].is_imagem).toBe(false);
    expect(v!.secoes[1].arquivos[0].url).toBe('https://sig/lead-1/pasta/p.pdf');
  });

  it('sem capa definida: usa a primeira foto', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const v = await svc.resolverView(pastaComArquivos as any, true);
    expect(v!.capa_url).toBe('https://sig/lead-1/pasta/f1.jpg');
  });

  it('snapshot do cliente + sistema entram na view', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, async () => ({
      id: 's1', apelido: 'Casa', marca_inversor: 'deye', potencia_kwp: 5,
      qtd_paineis: 11, painel_marca: 'Risen', painel_modelo: 'X', inversor_modelo: 'Y',
    }));
    const v = await svc.resolverView(pastaComArquivos as any, false);
    expect(v!.cliente_nome).toBe('João Silva');
    expect(v!.sistema?.potencia_kwp).toBe(5);
    expect(v!.publico).toBe(false);
  });
});

describe('PastaService.enviarPorWhatsApp', () => {
  const publicada = {
    ...PASTA_BASE, status: 'publicada',
    arquivos: [{ secao: 'fotos', storage_path: 'p', nome_exibicao: 'p', origem: 'upload' }],
  };

  it('rascunho NÃO envia', async () => {
    const sb = fakeSupabase();
    const sendText = vi.fn();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nao_publicada');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('opt_out NÃO envia', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue(publicada),
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'J', phone: '556111', opt_out: true }),
    });
    const sendText = vi.fn();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.reason).toBe('opt_out');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('envia com link /pasta/<slug> e marca enviada', async () => {
    const sb = fakeSupabase({ getPastaClienteById: vi.fn().mockResolvedValue(publicada) });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.ok).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/pasta/abcdefghjk');
    expect(sb.marcarPastaClienteEnviada).toHaveBeenCalledWith('pasta-1', '5561999990000');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pasta-service.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/relatorios/pasta/service.js'`

- [ ] **Step 3: Implementar o service**

```typescript
// src/modules/relatorios/pasta/service.ts
import type { SupabaseService } from '../../supabase.js';
import { uploadAnexo, deleteAnexoFile, getSignedUrls } from '../../anexos/storage.js';
import { novoSlug } from '../slug.js';
import { obterLogoBase64 } from '../../proposal/assets/logo-base64.js';
import { empresa } from '../../empresa-config.js';
import type { ResolverSistema } from '../pos-instalacao/service.js';
import { SECOES } from './types.js';
import type { ArquivoPasta, PastaClienteRow, PastaView, SecaoId } from './types.js';

const PUBLIC_BASE_URL = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';
const IMG_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']);

function ehImagem(storagePath: string): boolean {
  const ext = storagePath.split('.').pop()?.toLowerCase() ?? '';
  return IMG_EXTS.has(ext);
}

export class PastaService {
  constructor(
    private supabase: SupabaseService,
    private resolverSistema: ResolverSistema,
  ) {}

  // 1 pasta por lead: retorna a existente ou cria rascunho novo com slug.
  async obterOuCriarPorLead(leadId: string): Promise<{ ok: boolean; pasta?: PastaClienteRow; error?: string }> {
    const existente = await this.supabase.getPastaClienteByLead(leadId);
    if (existente) return { ok: true, pasta: existente };
    const lead = await this.supabase.getClienteByLeadId(leadId);
    if (!lead) return { ok: false, error: 'Cliente não encontrado' };
    const r = await this.supabase.criarPastaCliente({ lead_id: leadId, slug: novoSlug() });
    if (!r.ok || !r.id) return { ok: false, error: r.error ?? 'Falha ao criar pasta' };
    const pasta = await this.supabase.getPastaClienteById(r.id);
    return pasta ? { ok: true, pasta } : { ok: false, error: 'Falha ao reler pasta criada' };
  }

  async adicionarArquivos(
    pastaId: string,
    secao: SecaoId,
    files: Array<{ buffer: Buffer; mimeType: string; ext: string; nome: string }>,
  ): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const client = this.supabase.getClient();
    const novos: ArquivoPasta[] = [];
    // Upload em sequência; se um falhar, rollback dos anteriores (padrão r-pi).
    for (const f of files) {
      const up = await uploadAnexo(client, pasta.lead_id, 'pasta', f.buffer, f.mimeType, f.ext);
      if (!up.ok || !up.storage_path) {
        for (const n of novos) { try { await deleteAnexoFile(client, n.storage_path); } catch {} }
        return { ok: false, error: up.error ?? 'Upload falhou' };
      }
      novos.push({ secao, storage_path: up.storage_path, nome_exibicao: f.nome, origem: 'upload' });
    }
    const r = await this.supabase.atualizarPastaCliente(pastaId, {
      arquivos: [...(pasta.arquivos ?? []), ...novos],
    });
    if (!r.ok) {
      for (const n of novos) { try { await deleteAnexoFile(client, n.storage_path); } catch {} }
      return { ok: false, error: r.error };
    }
    return { ok: true };
  }

  async removerArquivo(pastaId: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const arquivos: ArquivoPasta[] = pasta.arquivos ?? [];
    const alvo = arquivos.find((a) => a.storage_path === storagePath);
    if (!alvo) return { ok: false, error: 'Arquivo não está na pasta' };
    const patch: Record<string, unknown> = { arquivos: arquivos.filter((a) => a.storage_path !== storagePath) };
    if (pasta.capa_storage_path === storagePath) patch.capa_storage_path = null;
    const r = await this.supabase.atualizarPastaCliente(pastaId, patch);
    if (!r.ok) return { ok: false, error: r.error };
    // Arquivo do r-pi pertence ao relatório — só desvincula, não apaga do bucket.
    if (alvo.origem !== 'r-pi') {
      try { await deleteAnexoFile(this.supabase.getClient(), storagePath); } catch {}
    }
    return { ok: true };
  }

  async puxarFotosDoRelatorio(pastaId: string): Promise<{ ok: boolean; adicionadas: number; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, adicionadas: 0, error: 'Pasta não encontrada' };
    const rels = await this.supabase.listRelatoriosPosInstalacaoByLead(pasta.lead_id, 1);
    if (rels.length === 0) return { ok: false, adicionadas: 0, error: 'Cliente não tem relatório pós-instalação' };
    const rel = await this.supabase.getRelatorioPosInstalacaoById(rels[0].id);
    const fotos = (rel?.fotos ?? []) as Array<{ storage_path: string; caption?: string | null }>;
    const jaTem = new Set((pasta.arquivos ?? []).map((a: ArquivoPasta) => a.storage_path));
    const novas: ArquivoPasta[] = fotos
      .filter((f) => f.storage_path && !jaTem.has(f.storage_path))
      .map((f, i) => ({
        secao: 'fotos' as const,
        storage_path: f.storage_path,
        nome_exibicao: `foto-obra-${jaTem.size + i + 1}.jpg`,
        caption: f.caption ?? null,
        origem: 'r-pi' as const,
      }));
    if (novas.length === 0) return { ok: true, adicionadas: 0 };
    const r = await this.supabase.atualizarPastaCliente(pastaId, {
      arquivos: [...(pasta.arquivos ?? []), ...novas],
    });
    if (!r.ok) return { ok: false, adicionadas: 0, error: r.error };
    return { ok: true, adicionadas: novas.length };
  }

  async definirCapa(pastaId: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const existe = (pasta.arquivos ?? []).some((a: ArquivoPasta) => a.storage_path === storagePath);
    if (!existe) return { ok: false, error: 'Foto não está na pasta' };
    return this.supabase.atualizarPastaCliente(pastaId, { capa_storage_path: storagePath });
  }

  async atualizarDados(
    pastaId: string,
    dados: { data_entrega: string | null; mensagem_zap: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    return this.supabase.atualizarPastaCliente(pastaId, {
      data_entrega: dados.data_entrega,
      mensagem_zap: dados.mensagem_zap,
    });
  }

  async publicar(pastaId: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    if ((pasta.arquivos ?? []).length === 0) {
      return { ok: false, error: 'Adicione ao menos 1 arquivo antes de publicar' };
    }
    return this.supabase.atualizarPastaCliente(pastaId, { status: 'publicada' });
  }

  async resolverView(pasta: PastaClienteRow, publico: boolean): Promise<PastaView | null> {
    const lead = await this.supabase.getClienteByLeadId(pasta.lead_id);
    if (!lead) return null;
    const sistema = await this.resolverSistema(pasta.lead_id);

    const arquivos: ArquivoPasta[] = pasta.arquivos ?? [];
    const paths = arquivos.map((a) => a.storage_path);
    // Signed URLs geradas A CADA visita (TTL 1h) — o link da pasta nunca vence.
    const urls = paths.length > 0 ? await getSignedUrls(this.supabase.getClient(), paths, 3600) : {};

    const secoes = SECOES.map((s) => ({
      secao: s.id,
      titulo: s.titulo,
      arquivos: arquivos
        .filter((a) => a.secao === s.id && urls[a.storage_path])
        .map((a) => ({
          url: urls[a.storage_path]!,
          nome: a.nome_exibicao,
          caption: a.caption ?? null,
          is_imagem: ehImagem(a.storage_path),
        })),
    })).filter((s) => s.arquivos.length > 0);

    const capaPath =
      pasta.capa_storage_path ?? arquivos.find((a) => a.secao === 'fotos')?.storage_path ?? null;

    return {
      cliente_nome: lead.name ?? 'Cliente',
      cliente_cidade: lead.city ?? null,
      cliente_uf: lead.uf ?? null,
      data_entrega: pasta.data_entrega,
      sistema,
      capa_url: capaPath ? (urls[capaPath] ?? null) : null,
      logo_base64: await obterLogoBase64(this.supabase.getClient()),
      whatsapp: empresa().telefoneAtendente,
      secoes,
      slug: pasta.slug,
      publico,
      gerado_em: pasta.updated_at,
    };
  }

  async enviarPorWhatsApp(
    pastaId: string,
    sendText: (to: string, text: string) => Promise<void>,
  ): Promise<{ ok: boolean; reason?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, reason: 'pasta_not_found' };
    if (pasta.status !== 'publicada') return { ok: false, reason: 'nao_publicada' };
    const lead = await this.supabase.getClienteByLeadId(pasta.lead_id);
    if (!lead) return { ok: false, reason: 'lead_not_found' };
    if (lead.opt_out) return { ok: false, reason: 'opt_out' };
    if (!lead.phone) return { ok: false, reason: 'sem_phone' };

    const primeiroNome = (lead.name ?? 'Olá').split(/\s+/)[0];
    const link = `${PUBLIC_BASE_URL}/pasta/${pasta.slug}`;
    const body = pasta.mensagem_zap?.trim()
      ? `${pasta.mensagem_zap.trim()}\n\n${link}`
      : `📁 ${primeiroNome}, sua usina agora tem uma pasta digital!\n\n` +
        `Fotos da obra, projeto e todos os seus documentos guardados num lugar só:\n${link}\n\n` +
        `Salve esse link — ele é seu. Qualquer dúvida, é só chamar a gente.`;

    await sendText(lead.phone, body);
    await this.supabase.marcarPastaClienteEnviada(pastaId, lead.phone);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pasta-service.test.ts`
Expected: PASS (todos)

Nota: `obterLogoBase64` lê do Storage com cache e tem fallback embutido — no teste o `download` falha de propósito e ele devolve a logo default (não quebra). Se o teste acusar algo do logo, checar a assinatura real em `src/modules/proposal/assets/logo-base64.ts:23`.

- [ ] **Step 5: Compilar e commitar**

Run: `npx tsc --noEmit` → limpo

```bash
git add tests/pasta-service.test.ts src/modules/relatorios/pasta/service.ts
git commit -m "feat: PastaService (pasta digital do cliente) com TDD

Co-Authored-By: Claude"
```

---

### Task 6: Template público (TDD)

**Files:**
- Create: `tests/pasta-template.test.ts`
- Create: `src/modules/relatorios/pasta/template.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/pasta-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderPastaHtml } from '../src/modules/relatorios/pasta/template.js';
import type { PastaView } from '../src/modules/relatorios/pasta/types.js';

function view(o: Partial<PastaView> = {}): PastaView {
  return {
    cliente_nome: 'João <b>Silva</b>',
    cliente_cidade: 'Brasília', cliente_uf: 'DF',
    data_entrega: '2026-08-01',
    sistema: null,
    capa_url: null,
    logo_base64: 'data:image/png;base64,AAA',
    whatsapp: '5561996978781',
    secoes: [
      { secao: 'fotos', titulo: '📸 Fotos da instalação', arquivos: [
        { url: 'https://sig/f1.jpg', nome: 'f1.jpg', caption: null, is_imagem: true },
      ]},
      { secao: 'projeto', titulo: '📐 Projeto', arquivos: [
        { url: 'https://sig/p.pdf', nome: 'prancha.pdf', caption: null, is_imagem: false },
      ]},
    ],
    slug: 'abcdefghjk', publico: true, gerado_em: '2026-08-05T12:00:00Z',
    ...o,
  };
}

describe('renderPastaHtml', () => {
  it('só renderiza seções que vieram na view', () => {
    const html = renderPastaHtml(view());
    expect(html).toContain('Fotos da instalação');
    expect(html).toContain('Projeto');
    expect(html).not.toContain('Homologação');
    expect(html).not.toContain('Contrato');
  });

  it('escapa HTML do nome do cliente', () => {
    const html = renderPastaHtml(view());
    expect(html).not.toContain('<b>Silva</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('preview mostra banner; público não', () => {
    expect(renderPastaHtml(view({ publico: false }))).toContain('PREVIEW');
    expect(renderPastaHtml(view({ publico: true }))).not.toContain('PREVIEW');
  });

  it('lista de arquivos do ZIP vai como JSON seguro no script', () => {
    const html = renderPastaHtml(view());
    expect(html).toContain('const ARQUIVOS_ZIP');
    expect(html).toContain('https://sig/p.pdf');
    // </script> dentro de URL/nome não pode quebrar a página
    const comNomeMaligno = view();
    comNomeMaligno.secoes[1].arquivos[0].nome = 'a</script><script>alert(1)';
    expect(renderPastaHtml(comNomeMaligno)).not.toContain('</script><script>alert(1)');
  });

  it('botão do zap usa o telefone da empresa', () => {
    expect(renderPastaHtml(view())).toContain('wa.me/5561996978781');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pasta-template.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o template**

Mobile-first: cartão de documento = toque abre em aba nova (viewer nativo). ZIP montado no navegador (mkZip store-only, receita das coletas de homologação). Botão ZIP grande só aparece em tela ≥768px (CSS); no celular fica um link discreto no rodapé.

```typescript
// src/modules/relatorios/pasta/template.ts
import type { PastaView } from './types.js';
import { empresa } from '../../empresa-config.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cliente';
}

export function renderPastaHtml(v: PastaView): string {
  const previewBanner = !v.publico
    ? `<div class="banner-revisao">⚠ PREVIEW — versão de revisão. O cliente só vê depois de você publicar e enviar.</div>`
    : '';

  const capaHtml = v.capa_url
    ? `<div class="capa"><img src="${escapeHtml(v.capa_url)}" alt="Foto da usina de ${escapeHtml(v.cliente_nome)}"></div>`
    : '';

  const sistema = v.sistema;
  const sistemaHtml = sistema ? `
    <section>
      <h2>⚡ Seu sistema solar</h2>
      <div class="grid-info">
        <div><label>Potência</label><value>${sistema.potencia_kwp ?? '—'} kWp</value></div>
        <div><label>Painéis</label><value>${sistema.qtd_paineis ?? '—'}${sistema.painel_marca ? ' · ' + escapeHtml(sistema.painel_marca) : ''}${sistema.painel_modelo ? ' ' + escapeHtml(sistema.painel_modelo) : ''}</value></div>
        <div><label>Inversor</label><value>${escapeHtml(sistema.marca_inversor)}${sistema.inversor_modelo ? ' · ' + escapeHtml(sistema.inversor_modelo) : ''}</value></div>
        <div><label>Entrega</label><value>${escapeHtml(formatDateBR(v.data_entrega))}</value></div>
      </div>
    </section>` : '';

  // Seções: fotos = galeria com lightbox; demais = cartões "tocou, abriu".
  const secoesHtml = v.secoes.map((s) => {
    if (s.secao === 'fotos') {
      return `
    <section>
      <h2>${escapeHtml(s.titulo)}</h2>
      <div class="grid-fotos">
        ${s.arquivos.map((a) => `
        <figure onclick="abrirFoto('${escapeHtml(a.url)}')">
          <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.caption ?? 'Foto da instalação')}" loading="lazy">
          ${a.caption ? `<figcaption>${escapeHtml(a.caption)}</figcaption>` : ''}
        </figure>`).join('')}
      </div>
    </section>`;
    }
    return `
    <section>
      <h2>${escapeHtml(s.titulo)}</h2>
      <div class="lista-docs">
        ${s.arquivos.map((a) => `
        <a class="doc" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
          <span class="doc-ico">${a.is_imagem ? '🖼️' : '📄'}</span>
          <span class="doc-nome">${escapeHtml(a.nome)}</span>
          <span class="doc-acao">abrir ›</span>
        </a>`).join('')}
      </div>
    </section>`;
  }).join('');

  // Lista pro ZIP: nn-secao-nome. JSON com < escapado (não fecha o <script>).
  const zipItems = v.secoes.flatMap((s) =>
    s.arquivos.map((a) => ({ url: a.url, nome: a.nome, secao: s.secao })),
  ).map((a, i) => ({
    url: a.url,
    name: `${String(i + 1).padStart(2, '0')}-${a.secao}-${a.nome.replace(/[\\/:*?"<>|]/g, '_')}`,
  }));
  const zipJson = JSON.stringify(zipItems).replace(/</g, '\\u003c');
  const zipNome = `pasta-${slugify(empresa().nomeFantasia)}-${slugify(v.cliente_nome)}.zip`;
  const temArquivos = zipItems.length > 0;

  const zapHtml = v.whatsapp
    ? `<a class="btn-zap" href="https://wa.me/${escapeHtml(v.whatsapp)}" target="_blank" rel="noopener">💬 Falar com a ${escapeHtml(empresa().nomeFantasia)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Pasta da sua Usina Solar — ${escapeHtml(v.cliente_nome)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;color:#1c1917;line-height:1.6}
  .banner-revisao{background:#fcd34d;color:#78350f;padding:10px;text-align:center;font-weight:600;font-size:14px}
  .container{max-width:780px;margin:0 auto;padding:20px 16px 32px}
  header.hero{background:linear-gradient(135deg,#0891b2 0%,#7c3aed 100%);color:#fff;padding:30px 22px;border-radius:18px;text-align:center;margin-bottom:16px}
  header.hero img.logo{max-height:52px;max-width:220px;margin-bottom:12px}
  header.hero h1{font-size:24px;font-weight:700;margin-bottom:4px}
  header.hero .sub{font-size:14px;opacity:.92}
  .capa{border-radius:16px;overflow:hidden;margin-bottom:16px;box-shadow:0 4px 18px rgba(0,0,0,.12)}
  .capa img{width:100%;max-height:340px;object-fit:cover;display:block}
  section{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:20px;margin-bottom:14px}
  section h2{font-size:16px;font-weight:700;margin-bottom:12px;color:#0c4a6e}
  .grid-info{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .grid-info div{display:flex;flex-direction:column}
  .grid-info label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#a8a29e;margin-bottom:2px}
  .grid-info value{font-size:14px;font-weight:600}
  .grid-fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .grid-fotos figure{background:#f5f5f4;border-radius:10px;overflow:hidden;cursor:pointer}
  .grid-fotos img{width:100%;height:130px;object-fit:cover;display:block}
  .grid-fotos figcaption{padding:5px 8px;font-size:11px;color:#78716c;background:#fff}
  .lista-docs{display:flex;flex-direction:column;gap:8px}
  .doc{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e7e5e4;border-radius:12px;text-decoration:none;color:#1c1917;background:#fafaf9}
  .doc:active{background:#f0f9ff}
  .doc-ico{font-size:22px}
  .doc-nome{flex:1;font-size:14px;font-weight:600;word-break:break-word}
  .doc-acao{font-size:13px;color:#0891b2;font-weight:600;white-space:nowrap}
  .zip-desktop{display:none}
  .btn-zip{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border:none;border-radius:12px;background:#0891b2;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  .btn-zip:disabled{opacity:.6;cursor:wait}
  .zip-mobile{text-align:center;margin-top:10px}
  .zip-mobile button{background:none;border:none;color:#78716c;font-size:12px;text-decoration:underline;cursor:pointer}
  .btn-zap{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:12px;background:#16a34a;color:#fff;font-size:15px;font-weight:700;text-decoration:none;margin-top:6px}
  footer{text-align:center;padding:24px 0 8px;color:#78716c;font-size:13px}
  footer .marca{font-weight:700;color:#0c4a6e;margin-bottom:2px}
  #lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:50;align-items:center;justify-content:center;padding:16px}
  #lightbox img{max-width:100%;max-height:92vh;border-radius:8px}
  #lightbox .fechar{position:absolute;top:14px;right:18px;color:#fff;font-size:30px;background:none;border:none;cursor:pointer}
  @media(min-width:768px){
    .container{padding-top:32px}
    header.hero h1{font-size:28px}
    .grid-fotos{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
    .grid-fotos img{height:170px}
    .zip-desktop{display:block;margin-bottom:14px}
    .zip-mobile{display:none}
  }
</style>
</head>
<body>
${previewBanner}
<div class="container">
  <header class="hero">
    <img class="logo" src="${escapeHtml(v.logo_base64)}" alt="${escapeHtml(empresa().nomeFantasia)}">
    <h1>📁 Pasta da sua Usina Solar</h1>
    <div class="sub">${escapeHtml(v.cliente_nome)}${v.cliente_cidade ? ' · ' + escapeHtml([v.cliente_cidade, v.cliente_uf].filter(Boolean).join('-')) : ''}${v.data_entrega ? ' · entregue em ' + escapeHtml(formatDateBR(v.data_entrega)) : ''}</div>
  </header>

  ${capaHtml}

  ${temArquivos ? `
  <div class="zip-desktop">
    <button class="btn-zip" id="btnZipTopo" onclick="baixarTudo(this)">⬇️ Baixar pasta completa (ZIP)</button>
  </div>` : ''}

  ${sistemaHtml}

  ${secoesHtml}

  ${zapHtml}

  ${temArquivos ? `
  <div class="zip-mobile">
    <button onclick="baixarTudo(this)">baixar tudo de uma vez (arquivo ZIP)</button>
  </div>` : ''}

  <footer>
    <div class="marca">${escapeHtml(empresa().nomeFantasia)}</div>
    <div>${escapeHtml(empresa().rtTitulo)} · energia solar com responsabilidade técnica</div>
  </footer>
</div>

<div id="lightbox" onclick="this.style.display='none'">
  <button class="fechar" aria-label="Fechar">×</button>
  <img id="lightbox-img" src="" alt="Foto ampliada">
</div>

<script>
const ARQUIVOS_ZIP = ${zipJson};
const ZIP_NOME = ${JSON.stringify(zipNome)};

function abrirFoto(url){
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}

/* ZIP store-only no navegador — receita validada nas coletas de homologação */
function crc32(u8){var t=crc32.t;if(!t){t=crc32.t=[];for(var i=0;i<256;i++){var c=i;for(var j=0;j<8;j++)c=(c&1)?(3988292384^(c>>>1)):(c>>>1);t[i]=c>>>0}}
 var c=4294967295;for(var k=0;k<u8.length;k++)c=t[(c^u8[k])&255]^(c>>>8);return (c^4294967295)>>>0}
function mkZip(items){
 var enc=new TextEncoder(),parts=[],cd=[],off=0;
 items.forEach(function(it){
  var nm=enc.encode(it.name),by=it.by,crc=crc32(by);
  var lh=new DataView(new ArrayBuffer(30));
  lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);
  lh.setUint32(14,crc,true);lh.setUint32(18,by.length,true);lh.setUint32(22,by.length,true);lh.setUint16(26,nm.length,true);
  parts.push(new Uint8Array(lh.buffer),nm,by);
  cd.push({nm:nm,crc:crc,sz:by.length,off:off});
  off+=30+nm.length+by.length});
 var cdStart=off;
 cd.forEach(function(e){
  var ch=new DataView(new ArrayBuffer(46));
  ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);
  ch.setUint32(16,e.crc,true);ch.setUint32(20,e.sz,true);ch.setUint32(24,e.sz,true);
  ch.setUint16(28,e.nm.length,true);ch.setUint32(42,e.off,true);
  parts.push(new Uint8Array(ch.buffer),e.nm);off+=46+e.nm.length});
 var eo=new DataView(new ArrayBuffer(22));
 eo.setUint32(0,0x06054b50,true);eo.setUint16(8,cd.length,true);eo.setUint16(10,cd.length,true);
 eo.setUint32(12,off-cdStart,true);eo.setUint32(16,cdStart,true);
 parts.push(new Uint8Array(eo.buffer));
 return new Blob(parts,{type:'application/zip'})}

async function baixarTudo(btn){
  if(!ARQUIVOS_ZIP.length) return;
  var original = btn.textContent;
  btn.disabled = true;
  try{
    var items = [];
    for(var i=0;i<ARQUIVOS_ZIP.length;i++){
      btn.textContent = 'Preparando... ' + (i+1) + '/' + ARQUIVOS_ZIP.length;
      var r = await fetch(ARQUIVOS_ZIP[i].url);
      if(!r.ok) throw new Error('download falhou');
      items.push({ name: ARQUIVOS_ZIP[i].name, by: new Uint8Array(await r.arrayBuffer()) });
    }
    var blob = mkZip(items);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ZIP_NOME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 60000);
  }catch(e){
    alert('Não deu pra montar o ZIP agora. Tente de novo — ou baixe os arquivos um a um.');
  }finally{
    btn.disabled = false; btn.textContent = original;
  }
}
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pasta-template.test.ts`
Expected: PASS

- [ ] **Step 5: Compilar e commitar**

Run: `npx tsc --noEmit` → limpo

```bash
git add tests/pasta-template.test.ts src/modules/relatorios/pasta/template.ts
git commit -m "feat: pagina publica da pasta digital (mobile item-a-item, desktop ZIP)

Co-Authored-By: Claude"
```

---

### Task 7: Rota pública `GET /pasta/:slug` no `src/index.ts`

**Files:**
- Modify: `src/index.ts` (logo DEPOIS do bloco `/r-pi/:slug`, que termina na ~linha 8331)

- [ ] **Step 1: Adicionar imports no topo do index.ts** (junto dos imports do r-pi, ~linhas 105–107)

```typescript
import { PastaService } from './modules/relatorios/pasta/service.js';
import { renderPastaHtml } from './modules/relatorios/pasta/template.js';
```

- [ ] **Step 2: Adicionar a rota** (colar após o `});` da rota `/r-pi/:slug`)

```typescript
  // ===== Pasta Digital do Cliente (rota pública) =====
  // Sem auth — cliente abre via link secreto enviado no WhatsApp.
  // URL pública: https://propostas.ecosunpower.eng.br/pasta/<slug>
  app.get('/pasta/:slug', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[a-z0-9]{6,20}$/.test(slug)) return res.status(400).send('Slug inválido');

    const pasta = await supabase.getPastaClienteBySlug(slug);
    // Rascunho NÃO é público — só depois de publicar.
    if (!pasta || pasta.status !== 'publicada') {
      return res.status(404).type('text/html').send(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrada</title>
      <style>body{font-family:sans-serif;text-align:center;padding:60px 20px;color:#444}</style></head>
      <body><h1>📁 Pasta não encontrada</h1><p>O link que você acessou pode estar errado ou ter sido removido.</p></body></html>
    `);
    }

    const pastaService = new PastaService(supabase, async (leadId) => {
      const sistemas = await monitoringService.listarParaDashboard() as any[];
      const s = sistemas.find((x) => x.lead_id === leadId);
      if (!s) return null;
      return {
        id: s.id,
        apelido: s.apelido,
        marca_inversor: s.marca_inversor,
        potencia_kwp: s.potencia_kwp,
        qtd_paineis: s.qtd_paineis ?? null,
        painel_marca: s.painel_marca ?? null,
        painel_modelo: s.painel_modelo ?? null,
        inversor_modelo: s.inversor_modelo ?? null,
      };
    });
    const view = await pastaService.resolverView(pasta, true);
    if (!view) return res.status(500).send('Erro ao montar a pasta');

    supabase.incrementarAcessoPasta(slug).catch((e) =>
      console.warn('[pasta] increment failed:', (e as Error).message),
    );

    res.type('text/html').send(renderPastaHtml(view));
  });
```

- [ ] **Step 3: Compilar e commitar**

Run: `npx tsc --noEmit` → limpo

```bash
git add src/index.ts
git commit -m "feat: rota publica /pasta/:slug

Co-Authored-By: Claude"
```

---

### Task 8: Telas admin (`pasta-views.ts`)

**Files:**
- Create: `src/modules/dashboard/pasta-views.ts`

Três views server-rendered (mesmo estilo dark do `relatorio-pi-views.ts`): lista, editor e preview.

- [ ] **Step 1: Escrever as views**

```typescript
// src/modules/dashboard/pasta-views.ts
// Pasta Digital do Cliente — telas admin:
//   renderListaPastas  → GET  /dashboard/pastas
//   renderEditorPasta  → GET  /dashboard/pastas/:id
//   renderPreviewPasta → GET  /dashboard/pastas/:id/preview
import { renderLayout } from './views.js';
import { SECOES } from '../relatorios/pasta/types.js';
import type { ArquivoPasta, PastaClienteRow } from '../relatorios/pasta/types.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function renderListaPastas(input: {
  pastas: Array<{ id: string; slug: string; status: string; acessos: number; enviado_em: string | null; updated_at: string; cliente_nome: string | null; qtd_arquivos: number }>;
  clientes: Array<{ id: string; name: string | null }>;
  publicBase: string;
}): string {
  const linhas = input.pastas.map((p) => `
    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40">
      <td class="py-3 px-3"><a href="/dashboard/pastas/${escapeHtml(p.id)}" class="text-sky-300 hover:underline font-semibold">${escapeHtml(p.cliente_nome ?? 'sem nome')}</a></td>
      <td class="py-3 px-3">${p.status === 'publicada'
        ? '<span class="text-emerald-400 text-sm">🟢 publicada</span>'
        : '<span class="text-amber-300 text-sm">📝 rascunho</span>'}</td>
      <td class="py-3 px-3 text-slate-300 text-sm">${p.qtd_arquivos} arquivo${p.qtd_arquivos === 1 ? '' : 's'}</td>
      <td class="py-3 px-3 text-slate-300 text-sm">${p.acessos} acesso${p.acessos === 1 ? '' : 's'}</td>
      <td class="py-3 px-3 text-slate-400 text-sm">${p.enviado_em ? '📤 ' + escapeHtml(String(p.enviado_em).slice(0, 10)) : '—'}</td>
      <td class="py-3 px-3">
        ${p.status === 'publicada'
          ? `<button onclick="navigator.clipboard.writeText('${escapeHtml(input.publicBase)}/pasta/${escapeHtml(p.slug)}').then(()=>this.textContent='✅ copiado')" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">🔗 copiar link</button>`
          : ''}
      </td>
    </tr>`).join('');

  const opcoesClientes = input.clientes
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name ?? 'sem nome')}</option>`)
    .join('');

  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-slate-100">📁 Pasta do Cliente</h1>
          <p class="text-slate-400 text-sm mt-1">Entrega digital pós-instalação: fotos + documentos num link só, com a marca da casa.</p>
        </div>
        <form action="/dashboard/pastas" method="post" class="flex items-center gap-2">
          <select name="lead_id" required class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm min-w-[220px]">
            <option value="">— escolher cliente —</option>
            ${opcoesClientes}
          </select>
          <button class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold whitespace-nowrap">➕ Abrir pasta</button>
        </form>
      </div>

      ${input.pastas.length === 0
        ? '<div class="bg-slate-800/60 border border-slate-700 rounded-xl p-10 text-center text-slate-400">Nenhuma pasta ainda. Escolha um cliente acima pra abrir a primeira. 🌞</div>'
        : `<div class="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <table class="w-full text-left">
          <thead><tr class="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
            <th class="py-2 px-3">Cliente</th><th class="py-2 px-3">Status</th><th class="py-2 px-3">Arquivos</th>
            <th class="py-2 px-3">Acessos</th><th class="py-2 px-3">Enviada</th><th class="py-2 px-3"></th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`}
    </div>
  `;
  return renderLayout({ active: 'pastas', title: 'Pasta do Cliente', body, dark: true });
}

export function renderEditorPasta(input: {
  pasta: PastaClienteRow;
  cliente_nome: string | null;
  tem_rpi: boolean;
  fotos_urls: Record<string, string>;   // storage_path -> signed url (miniaturas das fotos)
  publicBase: string;
}): string {
  const p = input.pasta;
  const arquivos: ArquivoPasta[] = p.arquivos ?? [];

  const blocosSecoes = SECOES.map((s) => {
    const doSecao = arquivos.filter((a) => a.secao === s.id);
    const listaHtml = doSecao.map((a) => `
      <div class="flex items-center gap-3 py-2 border-b border-slate-700/40 last:border-0">
        ${s.id === 'fotos' && input.fotos_urls[a.storage_path]
          ? `<img src="${escapeHtml(input.fotos_urls[a.storage_path])}" class="w-14 h-14 object-cover rounded-lg" alt="">`
          : '<span class="text-xl w-14 text-center">📄</span>'}
        <span class="flex-1 text-sm text-slate-200 break-all">${escapeHtml(a.nome_exibicao)}
          ${a.origem === 'r-pi' ? '<span class="text-xs text-violet-300 ml-1">(do relatório)</span>' : ''}
          ${p.capa_storage_path === a.storage_path ? '<span class="text-xs text-amber-300 ml-1">⭐ capa</span>' : ''}
        </span>
        ${s.id === 'fotos' && p.capa_storage_path !== a.storage_path ? `
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/capa" method="post">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">⭐ capa</button>
        </form>` : ''}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos/remover" method="post" onsubmit="return confirm('Tirar este arquivo da pasta?')">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button class="text-xs px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200">🗑️</button>
        </form>
      </div>`).join('');

    return `
      <div class="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
        <h3 class="text-sm font-bold text-slate-200 mb-2">${escapeHtml(s.titulo)} <span class="text-slate-500 font-normal">(${doSecao.length})</span></h3>
        ${listaHtml || '<p class="text-xs text-slate-500 mb-2">Nada aqui ainda.</p>'}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos" method="post" enctype="multipart/form-data" class="mt-3 flex items-center gap-2">
          <input type="hidden" name="secao" value="${s.id}">
          <input type="file" name="arquivos" multiple ${s.id === 'fotos' ? 'accept="image/*"' : 'accept="image/*,application/pdf"'} required
            class="block flex-1 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer">
          <button class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs whitespace-nowrap">⬆️ Adicionar</button>
        </form>
        ${s.id === 'fotos' && input.tem_rpi ? `
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/puxar-rpi" method="post" class="mt-2">
          <button class="text-xs px-3 py-1.5 rounded-lg bg-violet-800/70 hover:bg-violet-700 text-violet-100">✨ Puxar fotos do Relatório Pós-Instalação</button>
        </form>` : ''}
      </div>`;
  }).join('');

  const publicUrl = `${input.publicBase}/pasta/${p.slug}`;

  const body = `
    <div class="max-w-4xl mx-auto">
      <div class="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href="/dashboard/pastas" class="text-sky-300 text-sm hover:underline">← Todas as pastas</a>
          <h1 class="text-2xl font-bold text-slate-100 mt-2">📁 Pasta de ${escapeHtml(input.cliente_nome ?? 'sem nome')}</h1>
          <p class="mt-1 text-sm ${p.status === 'publicada' ? 'text-emerald-400' : 'text-amber-300'}">
            ${p.status === 'publicada' ? `🟢 Publicada · ${p.acessos} acesso(s)` : '📝 Rascunho — o cliente ainda não vê'}
          </p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <a href="/dashboard/pastas/${escapeHtml(p.id)}/preview" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">👁️ Prévia</a>
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/publicar" method="post">
            <button class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">${p.status === 'publicada' ? '🔄 Republicar' : '🚀 Publicar'}</button>
          </form>
          ${p.status === 'publicada' ? `
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/enviar" method="post" onsubmit="return confirm('Enviar o link da pasta pelo WhatsApp do cliente agora?')">
            <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">📤 Enviar no zap</button>
          </form>` : ''}
        </div>
      </div>

      ${p.status === 'publicada' ? `
      <div class="mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-slate-400">Link do cliente:</span>
        <code class="text-xs bg-slate-900 px-2 py-1 rounded text-sky-300">${escapeHtml(publicUrl)}</code>
        <button onclick="navigator.clipboard.writeText('${escapeHtml(publicUrl)}').then(()=>this.textContent='✅ copiado')" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">copiar</button>
      </div>` : ''}

      <form action="/dashboard/pastas/${escapeHtml(p.id)}/dados" method="post" class="mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-5 grid gap-4 md:grid-cols-2">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">📅 Data da entrega</label>
          <input type="date" name="data_entrega" value="${escapeHtml(p.data_entrega ?? '')}" class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">💬 Mensagem do zap <span class="text-slate-500 font-normal">(opcional — vazio usa a mensagem padrão; o link entra sozinho no final)</span></label>
          <textarea name="mensagem_zap" rows="3" class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">${escapeHtml(p.mensagem_zap ?? '')}</textarea>
        </div>
        <div><button class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">💾 Salvar dados</button></div>
      </form>

      <div class="grid gap-4">${blocosSecoes}</div>
    </div>
  `;
  return renderLayout({ active: 'pastas', title: `Pasta — ${input.cliente_nome ?? ''}`, body, dark: true });
}

export function renderPreviewPasta(input: {
  pasta_id: string;
  cliente_nome: string | null;
  html_preview: string;
}): string {
  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-4">
        <a href="/dashboard/pastas/${escapeHtml(input.pasta_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao editor</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">Prévia — pasta de ${escapeHtml(input.cliente_nome ?? '')}</h1>
        <p class="text-slate-400 text-sm mt-1">É exatamente isso que o cliente vai ver (menos o banner amarelo).</p>
      </div>
      <div class="bg-white rounded-xl overflow-hidden shadow-2xl">
        <iframe srcdoc="${escapeHtml(input.html_preview)}" class="w-full" style="min-height:900px;border:none"></iframe>
      </div>
    </div>
  `;
  return renderLayout({ active: 'pastas', title: 'Prévia da pasta', body, dark: true });
}
```

- [ ] **Step 2: Compilar e commitar**

Run: `npx tsc --noEmit` → limpo

```bash
git add src/modules/dashboard/pasta-views.ts
git commit -m "feat: telas admin da pasta digital (lista, editor, previa)

Co-Authored-By: Claude"
```

---

### Task 9: Rotas admin no `dashboard/router.ts` + item na sidebar

**Files:**
- Modify: `src/modules/dashboard/router.ts` (bloco novo logo após as rotas do r-pi, ~linha 5028)
- Modify: `src/modules/dashboard/views.ts` (item na sidebar, setor "⚡ Operação", ~linha 161)

- [ ] **Step 1: Imports no router.ts** (junto do import do relatorio-pi-views, linha 83)

```typescript
import { renderListaPastas, renderEditorPasta, renderPreviewPasta } from './pasta-views.js';
import { PastaService } from '../relatorios/pasta/service.js';
import { renderPastaHtml } from '../relatorios/pasta/template.js';
import type { SecaoId } from '../relatorios/pasta/types.js';
import { SECOES } from '../relatorios/pasta/types.js';
import { getSignedUrls } from '../anexos/storage.js';
```

(Se `getSignedUrls` já estiver importado no router, não duplicar.)

- [ ] **Step 2: Instanciar o service** (logo após `const posInstService = new PosInstalacaoService(...)`, ~linha 4938 — reusa o MESMO resolver de sistema)

O resolver hoje é uma arrow inline no construtor do `posInstService`. Extrair pra const e passar pros dois:

```typescript
  // Resolve sistema FV do lead (compartilhado: r-pi e pasta digital)
  const resolverSistemaFV = async (leadId: string) => {
    const sistemas = await monitoringService.listarParaDashboard() as any[];
    const s = sistemas.find((x: any) => x.lead_id === leadId);
    if (!s) return null;
    return {
      id: s.id,
      apelido: s.apelido,
      marca_inversor: s.marca_inversor,
      potencia_kwp: s.potencia_kwp,
      qtd_paineis: s.qtd_paineis ?? null,
      painel_marca: s.painel_marca ?? null,
      painel_modelo: s.painel_modelo ?? null,
      inversor_modelo: s.inversor_modelo ?? null,
    };
  };
  const posInstService = new PosInstalacaoService(supabaseService, resolverSistemaFV);
  const pastaService = new PastaService(supabaseService, resolverSistemaFV);
```

(O corpo da arrow é idêntico ao atual — só muda de inline pra const compartilhada.)

- [ ] **Step 3: Adicionar as rotas** (após o bloco r-pi, ~linha 5028)

```typescript
  // ===== Pasta Digital do Cliente =====

  const PASTA_PUBLIC_BASE = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';
  const SECAO_IDS = new Set(SECOES.map((s) => s.id));

  // Lista + form "abrir pasta"
  router.get('/pastas', async (_req: Request, res: Response) => {
    const [rows, clientes] = await Promise.all([
      supabaseService.listPastasCliente(),
      supabaseService.listClientesByStatus(
        ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido'],
        { ord: 'nome' }, 200, 0, true,
      ),
    ]);
    const pastas = rows.map((r: any) => ({
      id: r.id, slug: r.slug, status: r.status, acessos: r.acessos,
      enviado_em: r.enviado_em, updated_at: r.updated_at,
      cliente_nome: r.leads?.name ?? null,
      qtd_arquivos: (r.arquivos ?? []).length,
    }));
    res.type('text/html').send(renderListaPastas({
      pastas,
      clientes: clientes.map((c: any) => ({ id: c.id, name: c.name })),
      publicBase: PASTA_PUBLIC_BASE,
    }));
  });

  // Abrir (criar ou reabrir) a pasta do lead
  router.post('/pastas', async (req: Request, res: Response) => {
    const leadId = String(req.body?.lead_id ?? '');
    if (!UUID_RE.test(leadId)) return res.status(400).send('Escolha um cliente');
    const r = await pastaService.obterOuCriarPorLead(leadId);
    if (!r.ok || !r.pasta) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/pastas/${r.pasta.id}`);
  });

  // Editor
  router.get('/pastas/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const pasta = await supabaseService.getPastaClienteById(id);
    if (!pasta) return res.status(404).send('Pasta não encontrada');
    const lead = await supabaseService.getClienteByLeadId(pasta.lead_id);
    const rels = await supabaseService.listRelatoriosPosInstalacaoByLead(pasta.lead_id, 1);
    // Miniaturas das fotos no editor (TTL curto)
    const fotoPaths = (pasta.arquivos ?? [])
      .filter((a: any) => a.secao === 'fotos')
      .map((a: any) => a.storage_path);
    const fotosUrls = fotoPaths.length > 0
      ? await getSignedUrls(supabaseService.getClient(), fotoPaths, 3600)
      : {};
    res.type('text/html').send(renderEditorPasta({
      pasta,
      cliente_nome: lead?.name ?? null,
      tem_rpi: rels.length > 0,
      fotos_urls: fotosUrls,
      publicBase: PASTA_PUBLIC_BASE,
    }));
  });

  // Upload de arquivos numa seção
  router.post('/pastas/:id/arquivos',
    upload.array('arquivos', 20),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
      const secao = String(req.body?.secao ?? '');
      if (!SECAO_IDS.has(secao as SecaoId)) return res.status(400).send('Seção inválida');

      const files = ((req as any).files ?? []) as Express.Multer.File[];
      if (files.length === 0) return res.status(400).send('Escolha ao menos 1 arquivo');
      for (const f of files) {
        const ok = f.mimetype.startsWith('image/') || f.mimetype === 'application/pdf';
        if (!ok) return res.status(415).send(`Tipo inválido: ${escapeHtmlSimple(f.mimetype)}. Só imagem ou PDF.`);
      }

      const r = await pastaService.adicionarArquivos(id, secao as SecaoId, files.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        ext: (f.originalname.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8),
        nome: f.originalname.slice(0, 120),
      })));
      if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
      res.redirect(303, `/dashboard/pastas/${id}`);
    },
  );

  // Remover arquivo
  router.post('/pastas/:id/arquivos/remover', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await pastaService.removerArquivo(id, String(req.body?.storage_path ?? ''));
    if (!r.ok) return res.status(400).send(`<h2>${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Puxar fotos do r-pi
  router.post('/pastas/:id/puxar-rpi', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await pastaService.puxarFotosDoRelatorio(id);
    if (!r.ok) return res.status(400).send(`<h2>${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/pastas/${id}">← voltar</a>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Definir capa
  router.post('/pastas/:id/capa', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await pastaService.definirCapa(id, String(req.body?.storage_path ?? ''));
    if (!r.ok) return res.status(400).send(`<h2>${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Salvar data de entrega + mensagem do zap
  router.post('/pastas/:id/dados', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const dataRaw = req.body?.data_entrega ? String(req.body.data_entrega) : null;
    if (dataRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dataRaw)) return res.status(400).send('Data inválida');
    const r = await pastaService.atualizarDados(id, {
      data_entrega: dataRaw,
      mensagem_zap: req.body?.mensagem_zap ? String(req.body.mensagem_zap).trim() || null : null,
    });
    if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Publicar
  router.post('/pastas/:id/publicar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await pastaService.publicar(id);
    if (!r.ok) return res.status(400).send(`<h2>${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/pastas/${id}">← voltar</a>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Enviar link pelo WhatsApp
  router.post('/pastas/:id/enviar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const sendText = options.sendText;
    if (!sendText) return res.status(500).send('sendText não configurado neste ambiente.');
    const r = await pastaService.enviarPorWhatsApp(id, sendText);
    if (!r.ok) return res.status(400).send(`<h2>Não foi possível enviar: ${escapeHtmlSimple(r.reason ?? '')}</h2><a href="/dashboard/pastas/${id}">← voltar</a>`);
    res.redirect(303, `/dashboard/pastas/${id}`);
  });

  // Prévia (iframe com o HTML público em modo preview)
  router.get('/pastas/:id/preview', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const pasta = await supabaseService.getPastaClienteById(id);
    if (!pasta) return res.status(404).send('Pasta não encontrada');
    const lead = await supabaseService.getClienteByLeadId(pasta.lead_id);
    const view = await pastaService.resolverView(pasta, false);
    if (!view) return res.status(500).send('Erro montando prévia');
    res.type('text/html').send(renderPreviewPasta({
      pasta_id: id,
      cliente_nome: lead?.name ?? null,
      html_preview: renderPastaHtml(view),
    }));
  });
```

- [ ] **Step 4: Item na sidebar** — em `src/modules/dashboard/views.ts`, setor `⚡ Operação` (~linha 161), adicionar após a linha do `pos_venda`:

```typescript
      { href: '/dashboard/pastas', key: 'pastas', label: '📁 Pasta do Cliente', area: 'usinas' },
```

- [ ] **Step 5: Compilar e rodar TODOS os testes**

Run: `npx tsc --noEmit` → limpo
Run: `npx vitest run`
Expected: verde (exceto as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts
git commit -m "feat: rotas admin da pasta digital + item na sidebar

Co-Authored-By: Claude"
```

---

### Task 10: Verificação final + aprovação do Junior

- [ ] **Step 1: Checagem completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; vitest verde (menos as 2 falhas pré-existentes conhecidas)

- [ ] **Step 2: Smoke manual (se ambiente local tiver env do Supabase)**

Sem env local, pular — a validação visual acontece após o deploy. Com env: subir o app, abrir `/dashboard/pastas`, criar pasta de um cliente de teste, subir 1 foto + 1 PDF, prévia, publicar, abrir `/pasta/<slug>` no celular (ou DevTools mobile) e no desktop (conferir botão ZIP).

- [ ] **Step 3: Print do real pro Junior**

Regra do Junior: visual só aprova com print da tela real. Tirar screenshot da lista, do editor e da página pública (mobile + desktop) e mandar pro Junior ANTES de considerar pronto.

- [ ] **Step 4: Checklist de entrega (nesta ordem, cada um com ok do Junior)**

1. Combinar número da migration no grupo do zap (padrão: 098).
2. Junior aplica a migration no SQL Editor do Supabase.
3. `git push origin feat/pasta-digital-cliente` (SÓ com ok do Junior) + abrir PR.
4. Junior revisa e junta na main → EasyPanel publica.
5. Conferir `/health` (carimbo de build) e testar no ar com um cliente real.

**NUNCA** pushar sem o Junior autorizar. **NUNCA** aplicar a migration direto (o MCP do Supabase aponta pro projeto errado — SQL sempre via Editor pelo Junior).
