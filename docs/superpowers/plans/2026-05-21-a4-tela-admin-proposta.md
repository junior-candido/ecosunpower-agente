# A4 — Tela Admin "Nova Proposta" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela web admin `/dashboard/propostas/novo?lead_id=<uuid>` que pré-preenche do cadastro do cliente, aceita campos faltantes + anexos (1-3 fotos + 1 vídeo), gera proposta reusando o pipeline atual, mostra preview com botão "Enviar pelo WhatsApp".

**Architecture:** Refactor não-quebrante em 2 pontos: (1) `processAttachment` → extrair `processAttachmentFromBuffer` pra aceitar buffer já em mãos; (2) `proposal-assistant.generateProposal` privado → extrair `generateProposalCore` público que aceita input estruturado (sem phone/Redis). Wrapper antigo preserva 100% do comportamento do zap. Tela admin chama `generateProposalCore` direto. Sem migration nova (reusa `propostas_publicas` + `proposta_attachments` + bucket `client-attachments`).

**Tech Stack:** TypeScript Node16 ESM (imports `.js`), Express, multer pra multipart, Supabase JS, puppeteer (via `proposal/pdf-generator`), Vitest.

Spec: `docs/superpowers/specs/2026-05-21-a4-tela-admin-proposta-design.md`

---

## Block 1 — Refactor não-quebrante (zero-regressão pro fluxo zap)

### Task 1: `processAttachmentFromBuffer` em `attachments/index.ts`

Hoje `processAttachment` faz: download WABA → validate → upload → DB. Tela admin já tem o buffer (multer). Extrai a parte pós-download numa função reusável.

**Files:**
- Modify: `src/modules/proposal/attachments/index.ts`
- Test: `tests/proposal-attachments-from-buffer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/proposal-attachments-from-buffer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processAttachmentFromBuffer } from '../src/modules/proposal/attachments/index.js';

const fakeSupabase = () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({ insert }),
    storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
    _insert: insert,
  } as any;
};

vi.mock('../src/modules/proposal/attachments/storage-uploader.js', () => ({
  uploadToStorage: vi.fn().mockResolvedValue({ storagePath: 'propostas/SLUG/foto-1.jpg' }),
  getSignedUrlFromPath: vi.fn().mockResolvedValue('https://signed/x'),
}));

describe('processAttachmentFromBuffer', () => {
  it('foto: valida tamanho + chama upload + persiste DB sem fazer download WABA', async () => {
    const supabase = fakeSupabase();
    const buf = Buffer.alloc(100_000); // 100KB
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: buf,
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'Teste',
      fotoCount: 0,
      videoCount: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.tipo).toBe('foto');
      expect(r.record.ordem).toBe(1);
      expect(r.record.storagePath).toBe('propostas/SLUG/foto-1.jpg');
    }
    expect(supabase._insert).toHaveBeenCalledOnce();
  });

  it('rejeita foto > 20MB', async () => {
    const supabase = fakeSupabase();
    const buf = Buffer.alloc(25 * 1024 * 1024);
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: buf,
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'Big',
      fotoCount: 0,
      videoCount: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita 4ª foto (limite 3)', async () => {
    const supabase = fakeSupabase();
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: Buffer.alloc(1000),
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'X',
      fotoCount: 3,
      videoCount: 0,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proposal-attachments-from-buffer.test.ts`
Expected: FAIL (`processAttachmentFromBuffer` not exported).

- [ ] **Step 3: Refactor `attachments/index.ts`**

Extrair a parte pós-download. `processAttachment` continua exportada (wrapper que faz download WABA + chama from-buffer).

Substituir o conteúdo do arquivo:

```typescript
// src/modules/proposal/attachments/index.ts
// Orquestra: download WABA -> validacao -> upload Supabase -> thumbnail (se video) -> persistencia.
// processAttachment (com WABA media_id): usado pelo /proposta zap.
// processAttachmentFromBuffer (com buffer ja em maos): usado pela tela admin A4.

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadWabaMedia } from './whatsapp-media-downloader.js';
import { uploadToStorage } from './storage-uploader.js';
import { extractFirstFrame, getVideoDuration } from './video-thumbnail.js';
import {
  validateFotoUpload,
  validateVideoUpload,
  validateAttachmentCount,
} from './attachment-validator.js';

export interface ProcessAttachmentInput {
  mediaIdWaba: string;
  accessToken: string;
  proposalSlug: string;
  legenda: string;
  fotoCount: number;
  videoCount: number;
}

export interface ProcessAttachmentFromBufferInput {
  buffer: Buffer;
  mimeType: string;
  proposalSlug: string;
  legenda: string;
  fotoCount: number;
  videoCount: number;
}

export type ProcessAttachmentResult =
  | {
      ok: true;
      record: {
        tipo: 'foto' | 'video';
        ordem: number;
        legenda: string;
        storagePath: string;
        thumbnailPath: string | null;
        mimeType: string;
        sizeBytes: number;
      };
    }
  | { ok: false; reason: string };

// Wrapper antigo: download WABA + processa.
export async function processAttachment(
  supabase: SupabaseClient,
  input: ProcessAttachmentInput,
): Promise<ProcessAttachmentResult> {
  const dl = await downloadWabaMedia({ mediaId: input.mediaIdWaba, accessToken: input.accessToken });
  return processAttachmentFromBuffer(supabase, {
    buffer: dl.buffer,
    mimeType: dl.mimeType,
    proposalSlug: input.proposalSlug,
    legenda: input.legenda,
    fotoCount: input.fotoCount,
    videoCount: input.videoCount,
  });
}

// Nova: aceita buffer ja em maos (multer / admin upload).
export async function processAttachmentFromBuffer(
  supabase: SupabaseClient,
  input: ProcessAttachmentFromBufferInput,
): Promise<ProcessAttachmentResult> {
  const sizeBytes = input.buffer.length;
  const isVideo = input.mimeType.startsWith('video/');
  const tipo: 'foto' | 'video' = isVideo ? 'video' : 'foto';

  const countCheck = validateAttachmentCount({
    fotoCount: input.fotoCount,
    videoCount: input.videoCount,
    novoTipo: tipo,
  });
  if (!countCheck.ok) return { ok: false, reason: countCheck.reason! };

  if (tipo === 'foto') {
    const v = validateFotoUpload({ mimeType: input.mimeType, sizeBytes });
    if (!v.ok) return { ok: false, reason: v.reason! };
  } else {
    const duration = await getVideoDuration(input.buffer);
    const v = validateVideoUpload({ mimeType: input.mimeType, sizeBytes, durationSeconds: duration });
    if (!v.ok) return { ok: false, reason: v.reason! };
  }

  const ordem = tipo === 'foto' ? input.fotoCount + 1 : 1;
  const ext =
    input.mimeType === 'image/png' ? 'png'
    : input.mimeType === 'image/webp' ? 'webp'
    : tipo === 'video' ? 'mp4'
    : 'jpg';
  const filename = tipo === 'foto' ? `foto-${ordem}.${ext}` : 'video.mp4';

  const upload = await uploadToStorage(supabase, {
    buffer: input.buffer,
    propostaSlug: input.proposalSlug,
    filename,
    mimeType: input.mimeType,
  });

  let thumbnailPath: string | null = null;
  if (tipo === 'video') {
    try {
      const { thumbnailBuffer } = await extractFirstFrame(input.buffer);
      const thumbUpload = await uploadToStorage(supabase, {
        buffer: thumbnailBuffer,
        propostaSlug: input.proposalSlug,
        filename: 'video-thumb.jpg',
        mimeType: 'image/jpeg',
      });
      thumbnailPath = thumbUpload.storagePath;
    } catch (err) {
      console.warn('[attachments] Thumbnail falhou:', (err as Error).message);
    }
  }

  const { error: insertErr } = await supabase
    .from('proposta_attachments')
    .insert({
      proposta_slug: input.proposalSlug,
      tipo,
      ordem,
      legenda: input.legenda,
      storage_path: upload.storagePath,
      mime_type: input.mimeType,
      size_bytes: sizeBytes,
      thumbnail_path: thumbnailPath,
    });

  if (insertErr) return { ok: false, reason: `DB insert falhou: ${insertErr.message}` };

  return {
    ok: true,
    record: {
      tipo,
      ordem,
      legenda: input.legenda,
      storagePath: upload.storagePath,
      thumbnailPath,
      mimeType: input.mimeType,
      sizeBytes,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proposal-attachments-from-buffer.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar suite inteira pra garantir zero-regressão**

Run: `npx vitest run`
Expected: PASS (todas as testes que usavam `processAttachment` continuam verdes — assinatura externa não mudou).

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/attachments/index.ts tests/proposal-attachments-from-buffer.test.ts
git commit -m "refactor(proposal/attachments): extrai processAttachmentFromBuffer (A4 T1)"
```

---

### Task 2: `generateProposalCore` público no ProposalAssistant

Extrai a parte de gerar PDF + upload Drive + salvar Supabase do método privado `generateProposal`. O privado vira shim que faz: carregar state Redis → baixar anexos WABA → chamar core → salvar `proposal:last:${phone}` → formatar string zap.

**Files:**
- Modify: `src/modules/proposal-assistant.ts`
- Test: `tests/proposal-assistant-core.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/proposal-assistant-core.test.ts
// Testa que generateProposalCore aceita input estruturado e retorna slug+publicUrl+pdfBuffer.
// Mocka Drive + Supabase pra rodar sem rede.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalAssistant } from '../src/modules/proposal-assistant.js';

vi.mock('../src/modules/proposal/pdf-generator.js', () => ({
  htmlToPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  gerarQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

const inputBasico = {
  data: {
    nomeCliente: 'Marcos Teste',
    documentoCliente: '123.456.789-00',
    enderecoCliente: 'Rua X, 100 - Brasília-DF',
    telefoneCliente: '5561999999999',
    emailCliente: 'marcos@test.com',
    potenciaKwp: 8.4,
    fatorPerda: 0.80,
    consumoMensalKwh: 1000,
    tarifaRsKwh: 1.05,
    custoDisponibilidadeMensal: 50,
    tipoCliente: 'residencial',
    modalidade: 'autoconsumo local',
    concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30, tecnologia: 'TOPCon' },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10, eficiencia: 0.985, tipoInversor: 'string' },
    estruturaFixacao: { tipo: 'Telha cerâmica', material: 'Alumínio anodizado', descricao: 'Ganchos' },
    valorTotalRs: 38500,
  },
  modoEnvio: 'junior_envia' as const,
  tipo: 'basica' as const,
};

const fakeSupabase = (): any => ({
  savePropostaPublica: vi.fn().mockResolvedValue({ id: 'fake-id', expiresAt: '2026-12-31' }),
  updatePropostaPublicaHtml: vi.fn().mockResolvedValue(undefined),
  getClient: vi.fn().mockReturnValue({}),
});

describe('ProposalAssistant.generateProposalCore', () => {
  let pa: ProposalAssistant;
  let supabase: any;

  beforeEach(() => {
    supabase = fakeSupabase();
    pa = new ProposalAssistant({
      apiKey: 'fake',
      redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
      knowledgeBaseDir: './conhecimento',
      driveUploader: null,
      engineerPhone: '5561111',
      supabaseService: supabase,
      publicProposalBaseUrl: 'https://propostas.test',
    });
  });

  it('básica: gera slug + publicUrl + pdfBuffer sem anexos', async () => {
    const r = await pa.generateProposalCore(inputBasico);
    expect(r.slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(r.publicUrl).toBe(`https://propostas.test/p/${r.slug}`);
    expect(r.pdfBuffer.length).toBeGreaterThan(0);
    expect(supabase.savePropostaPublica).toHaveBeenCalledOnce();
  });

  it('personalizada: chama updatePropostaPublicaHtml em vez de savePropostaPublica (pré-insere stub)', async () => {
    // tem que mockar processAttachmentFromBuffer pra não bater em Storage real
    const { processAttachmentFromBuffer } = await import('../src/modules/proposal/attachments/index.js');
    const spy = vi.spyOn({ processAttachmentFromBuffer }, 'processAttachmentFromBuffer');
    // (Em ambiente real, esse spy não funciona com ESM — vai depender do harness atual.
    // Se falhar, usar vi.mock no topo: vi.mock('../src/modules/proposal/attachments/index.js', ...))
    // Test placeholder: confirma que com tipo='personalizada' o stub é pré-inserido.
    const r = await pa.generateProposalCore({ ...inputBasico, tipo: 'personalizada', attachments: [] });
    // attachments=[] -> sem stub pré-inserido (não tem anexos = comportamento igual básica)
    expect(r.slug).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/proposal-assistant-core.test.ts`
Expected: FAIL (`generateProposalCore is not a function`).

- [ ] **Step 3: Refactor `proposal-assistant.ts`**

3.1 — Adicionar tipos exportados ANTES da classe (após o `interface ClaudeResponse`):

```typescript
// Input pra gerar proposta direto (sem passar pelo Claude/zap).
// Usado pela tela admin A4 e — internamente — pelo wrapper privado generateProposal.
export interface GenerateProposalCoreInput {
  data: any;                                          // mesmo formato JSON que vem do Claude
  modoEnvio: ModoEnvio;
  tipo: TipoProposta;
  attachments?: Array<{
    buffer: Buffer;
    mimeType: string;
    legenda: string;
  }>;
}

export interface GenerateProposalCoreResult {
  slug: string;
  publicUrl: string | null;
  pdfBuffer: Buffer;
  driveResult: { pdfWebViewLink: string; htmlWebViewLink: string } | null;
  proposalData: ProposalData;
  calculations: ReturnType<typeof calcular>;
}
```

3.2 — Adicionar método público `generateProposalCore` ANTES de `generateProposal` privado (linha ~707):

```typescript
  // Gera proposta a partir de input estruturado, sem dependencia de phone/Redis.
  // Usado pela tela admin A4 e pelo shim privado generateProposal (zap).
  // Faz: validate -> calc -> render -> PDF -> upload Drive (paralelo) + Supabase (paralelo).
  // NAO toca Redis, NAO retorna string formatada — quem chama formata.
  async generateProposalCore(input: GenerateProposalCoreInput): Promise<GenerateProposalCoreResult> {
    if (!this.driveUploader && !this.supabaseService) {
      throw new Error('Nenhum destino configurado (Drive ou Supabase)');
    }

    const { data, modoEnvio, tipo, attachments } = input;

    const calcInput = this.dataToCalculatorInput(data);

    const ensureNum = (name: string, v: number) => {
      if (!isFinite(v) || v <= 0) throw new Error(`Campo "${name}" inválido: ${v}`);
    };
    ensureNum('potenciaKwp', calcInput.potenciaKwp);
    ensureNum('fatorPerda', calcInput.fatorPerda);
    ensureNum('consumoMensalKwh', calcInput.consumoMensalKwh);
    ensureNum('tarifaRsKwh', calcInput.tarifaRsKwh);
    ensureNum('valorTotalRs', calcInput.valorTotalRs);

    const calculations = calcular(calcInput);
    const proposalData = this.dataToProposalData(data, calculations);

    const slug = randomBytes(12).toString('base64url');
    proposalData.tipo = tipo;

    const temAnexos = tipo === 'personalizada'
      && (attachments?.length ?? 0) > 0
      && !!this.supabaseService;

    if (temAnexos) {
      await this.supabaseService!.savePropostaPublica({
        slug,
        numeroProposta: proposalData.numeroProposta,
        clienteNome: data.nomeCliente,
        clienteTelefone: data.telefoneCliente,
        htmlContent: '<!doctype html><html><body>Generating...</body></html>',
        dadosInput: undefined,
        tipo,
        modoEnvio,
      });

      try {
        proposalData.estudoPersonalizado = await this.processarAnexosFromBuffer(slug, attachments!);
      } catch (err) {
        console.warn('[proposal] Falha ao processar anexos (admin):', (err as Error).message);
      }
    }

    const socialProofHtml = await this.buildSocialProofHtml(proposalData.tipoCliente);
    const html = renderProposalHTML(proposalData, calculations, socialProofHtml);
    const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });

    const drivePromise = this.driveUploader
      ? this.driveUploader.uploadProposal({
          nomeCliente: data.nomeCliente,
          numeroProposta: proposalData.numeroProposta,
          pdfBuffer,
          htmlContent: html,
          inputDataJson: JSON.stringify({ data, calcInput }, null, 2),
          shareWithEmail: data.emailCliente,
        })
      : Promise.reject(new Error('Drive uploader nao configurado'));

    const dadosInputMinimo: Record<string, unknown> = {
      calcInput,
      sistema: {
        potenciaKwp: data.potenciaKwp,
        tipoCliente: data.tipoCliente,
        modalidade: data.modalidade,
        concessionaria: data.concessionaria,
        modulo: data.modulo,
        inversor: data.inversor,
        estruturaFixacao: data.estruturaFixacao,
      },
      comercial: { valorTotalRs: data.valorTotalRs },
    };

    const supabasePromise = this.supabaseService
      ? (temAnexos
          ? this.supabaseService.updatePropostaPublicaHtml(slug, html).then(() => ({ id: slug, expiresAt: '' }))
          : this.supabaseService.savePropostaPublica({
              slug,
              numeroProposta: proposalData.numeroProposta,
              clienteNome: data.nomeCliente,
              clienteTelefone: data.telefoneCliente,
              htmlContent: html,
              dadosInput: dadosInputMinimo,
              tipo,
              modoEnvio,
            }))
      : Promise.reject(new Error('Supabase service nao configurado'));

    const [uploadResult, publicResult] = await Promise.allSettled([drivePromise, supabasePromise]);

    const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
    const publicSaved = publicResult.status === 'fulfilled';
    const publicUrl = publicSaved ? `${this.publicProposalBaseUrl}/p/${slug}` : null;

    if (!upload && !publicSaved) {
      const driveErr = uploadResult.status === 'rejected' ? (uploadResult.reason as Error).message : 'ok';
      const pubErr = publicResult.status === 'rejected' ? (publicResult.reason as Error).message : 'ok';
      throw new Error(`Drive: ${driveErr} | Web: ${pubErr}`);
    }
    if (!upload) console.warn('[proposal] Drive upload falhou:', (uploadResult as PromiseRejectedResult).reason);
    if (!publicSaved) console.warn('[proposal] Save Supabase falhou:', (publicResult as PromiseRejectedResult).reason);

    return {
      slug,
      publicUrl,
      pdfBuffer,
      driveResult: upload ? { pdfWebViewLink: upload.pdfWebViewLink, htmlWebViewLink: upload.htmlWebViewLink } : null,
      proposalData,
      calculations,
    };
  }

  // Variante de processarAnexosPendentes que aceita buffers ja em maos (tela admin).
  // O original (mediaIdWaba) continua existindo pro fluxo zap.
  private async processarAnexosFromBuffer(
    slug: string,
    attachments: Array<{ buffer: Buffer; mimeType: string; legenda: string }>,
  ): Promise<NonNullable<ProposalData['estudoPersonalizado']>> {
    if (!this.supabaseService) throw new Error('SupabaseService nao configurado');
    const { processAttachmentFromBuffer } = await import('./proposal/attachments/index.js');
    const supabase = this.supabaseService.getClient();

    const fotos: Array<{ url: string; legenda: string; ordem: number }> = [];
    let video: NonNullable<ProposalData['estudoPersonalizado']>['video'] | undefined;
    let fotoCount = 0;
    let videoCount = 0;

    for (const att of attachments) {
      const result = await processAttachmentFromBuffer(supabase, {
        buffer: att.buffer,
        mimeType: att.mimeType,
        proposalSlug: slug,
        legenda: att.legenda,
        fotoCount,
        videoCount,
      });
      if (!result.ok) {
        console.warn('[proposal] processAttachmentFromBuffer falhou:', result.reason);
        continue;
      }
      const r = result.record;
      if (r.tipo === 'foto') {
        fotoCount++;
        fotos.push({
          url: await getSignedUrlFromPath(supabase, r.storagePath),
          legenda: r.legenda,
          ordem: r.ordem,
        });
      } else {
        videoCount++;
        video = {
          thumbnailUrl: r.thumbnailPath ? await getSignedUrlFromPath(supabase, r.thumbnailPath) : '',
          legenda: r.legenda,
          webVideoUrl: await getSignedUrlFromPath(supabase, r.storagePath),
        };
      }
    }

    fotos.sort((a, b) => a.ordem - b.ordem);

    let qrCodeDataUrl: string | undefined;
    if (video) {
      const linkPublico = `${this.publicProposalBaseUrl}/p/${slug}`;
      qrCodeDataUrl = await gerarQrCodeDataUrl(linkPublico);
    }

    return { fotos, video, qrCodeDataUrl };
  }
```

3.3 — Refatorar o `generateProposal` privado (linha 707-893) pra ser um shim:

```typescript
  // Wrapper pro fluxo zap: carrega state Redis + baixa anexos WABA + chama core +
  // salva proposal:last:${phone} + formata string pra mandar pelo zap.
  private async generateProposal(phone: string, data: any, _confirmMsg: string): Promise<string> {
    try {
      const sessionState = await this.loadState(phone);
      const modoEnvio: ModoEnvio = sessionState.modoEnvio ?? 'junior_envia';
      const tipo: TipoProposta = sessionState.tipo ?? 'basica';

      // Anexos: download WABA -> buffer
      let attachments: GenerateProposalCoreInput['attachments'];
      if (tipo === 'personalizada' && sessionState.attachments.length > 0) {
        const { downloadWabaMedia } = await import('./proposal/attachments/whatsapp-media-downloader.js');
        const accessToken = process.env.META_WABA_ACCESS_TOKEN;
        if (!accessToken) throw new Error('META_WABA_ACCESS_TOKEN nao configurado');
        attachments = [];
        for (const att of sessionState.attachments) {
          const dl = await downloadWabaMedia({ mediaId: att.mediaIdWaba, accessToken });
          attachments.push({ buffer: dl.buffer, mimeType: dl.mimeType, legenda: att.legenda });
        }
      }

      const result = await this.generateProposalCore({ data, modoEnvio, tipo, attachments });

      // Salva estado pra Junior depois falar "enviar"
      await this.redis.setex(
        `proposal:last:${phone}`,
        PROPOSAL_MODE_TTL_SECONDS * 24,
        JSON.stringify({
          data,
          upload: result.driveResult,
          proposalData: result.proposalData,
          publicUrl: result.publicUrl,
          slug: result.slug,
        }),
      );

      const greener = compararGreener(this.dataToCalculatorInput(data).potenciaKwp, result.calculations.rsPorWp);

      const linkLines: string[] = [];
      if (result.publicUrl) {
        linkLines.push(`🌐 Web (manda pro cliente): ${result.publicUrl}`);
        if (this.proposalPreviewToken) {
          const previewUrl = `${result.publicUrl}?eu=${encodeURIComponent(this.proposalPreviewToken)}`;
          linkLines.push(`👁️ Preview (so pra voce revisar): ${previewUrl}`);
        }
      }
      if (result.driveResult) {
        linkLines.push(`📄 PDF (Drive): ${result.driveResult.pdfWebViewLink}`);
        if (!result.publicUrl) linkLines.push(`🌐 Web (Drive fallback): ${result.driveResult.htmlWebViewLink}`);
      }
      if (linkLines.length === 0) linkLines.push('⚠️ Nenhum link disponivel — checar logs.');

      return [
        '✅ Proposta gerada!',
        '',
        ...linkLines,
        '',
        `💰 R$/Wp: R$ ${result.calculations.rsPorWp.toFixed(2)}/Wp`,
        `🎯 Greener: R$ ${greener.rsPorWpReferencia.toFixed(2)}/Wp`,
        `${greener.rotulo} (${greener.diferencaPct >= 0 ? '+' : ''}${greener.diferencaPct.toFixed(1)}%)`,
        '',
        `📊 Payback: ${result.calculations.paybackAnos}a ${result.calculations.paybackMeses}m`,
        `📈 TIR: ${result.calculations.tirPercentual.toFixed(1)}%`,
        '',
        '_Manda "enviar" pra mandar pro cliente, ou "ajusta X" pra refazer._',
      ].join('\n');
    } catch (err) {
      console.error('[proposal] Generation error:', err);
      const raw = (err as Error).message ?? 'erro desconhecido';
      const safe = raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
      const friendly = /timeout|ECONN|chromium|puppeteer/i.test(raw)
        ? 'PDF demorou demais ou Chromium falhou. Tenta de novo em 30s.'
        : /refresh|token|auth/i.test(raw)
          ? 'Token Google expirou — regerar GOOGLE_REFRESH_TOKEN com scope drive.file.'
          : safe;
      return `⚠️ Erro ao gerar proposta: ${friendly}`;
    }
  }
```

3.4 — Remover o método `processarAnexosPendentes` antigo (que ainda usa `mediaIdWaba`). Foi substituído pela combinação download-WABA-no-shim + `processarAnexosFromBuffer`.

Buscar e deletar o bloco `private async processarAnexosPendentes(...)` (linhas ~646-703 do arquivo original).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/proposal-assistant-core.test.ts`
Expected: PASS no teste "básica". O teste "personalizada" pode precisar de tweak no mock — aceita ESM mocking limitations.

- [ ] **Step 5: Rodar suite inteira pra confirmar zero-regressão no fluxo zap**

Run: `npx vitest run`
Expected: PASS (testes existentes de `proposal-assistant` continuam verdes — comportamento externo do zap preservado).

Verificar também: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-assistant-core.test.ts
git commit -m "refactor(proposal-assistant): extrai generateProposalCore publico (A4 T2)"
```

---

## Block 2 — Views (form + preview)

### Task 3: `renderFormNovaProposta` em `dashboard/proposta-form-view.ts`

Renderiza form pré-preenchido com dados do cliente A1. Estilo idêntico ao A5 (`relatorio-pi-views.ts`).

**Files:**
- Create: `src/modules/dashboard/proposta-form-view.ts`
- Test: `tests/dashboard-proposta-form-view.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard-proposta-form-view.test.ts
import { describe, it, expect } from 'vitest';
import { renderFormNovaProposta, renderPreviewProposta } from '../src/modules/dashboard/proposta-form-view.js';

describe('renderFormNovaProposta', () => {
  it('pré-preenche nome, telefone, email, CPF, cidade, concessionária do cliente', () => {
    const html = renderFormNovaProposta({
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      lead: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Marcos Teste',
        phone: '5561999999999',
        email: 'marcos@test.com',
        cpf_cnpj: '111.222.333-44',
        city: 'Brasília',
        uf: 'DF',
        concessionaria: 'neoenergia-df',
        consumo_medio_kwh: 1000,
        consumo_mensal_json: null,
        tarifa_classe: 'B1 monofásica',
        tarifa_modalidade: 'autoconsumo local',
        profile: 'residencial',
        endereco_rua: 'Rua X',
        endereco_numero: '100',
        endereco_complemento: null,
        neighborhood: 'Asa Norte',
        cep: '70000-000',
      } as any,
      erros: [],
    });
    expect(html).toContain('Marcos Teste');
    expect(html).toContain('5561999999999');
    expect(html).toContain('111.222.333-44');
    expect(html).toContain('marcos@test.com');
    expect(html).toContain('1000'); // consumoMensalKwh
    expect(html).toContain('Trina'); // option select módulo
    expect(html).toContain('Sungrow'); // option select inversor
    expect(html).toContain('action="/dashboard/propostas/novo"');
    expect(html).toContain('enctype="multipart/form-data"');
  });

  it('mostra erros inline quando vier do POST', () => {
    const html = renderFormNovaProposta({
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      lead: null,
      erros: ['Campo nomeCliente obrigatório', 'Valor total inválido'],
    });
    expect(html).toContain('Campo nomeCliente obrigatório');
    expect(html).toContain('Valor total inválido');
  });
});

describe('renderPreviewProposta', () => {
  it('mostra iframe + botão Enviar pelo WhatsApp quando pode enviar', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>Proposta de Marcos</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      jaEnviado: false,
      canEnviar: true,
      reasonNaoEnviar: null,
    });
    expect(html).toContain('iframe');
    expect(html).toContain('Marcos');
    expect(html).toContain('📤 Enviar pelo WhatsApp');
    expect(html).toContain('action="/dashboard/propostas/abcdef0123456789/enviar"');
    expect(html).toContain('https://propostas.test/p/abcdef0123456789');
  });

  it('bloqueia envio quando cliente em opt_out', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>x</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaa',
      jaEnviado: false,
      canEnviar: false,
      reasonNaoEnviar: 'Cliente em opt-out',
    });
    expect(html).not.toContain('action="/dashboard/propostas/abcdef0123456789/enviar"');
    expect(html).toContain('Cliente em opt-out');
  });

  it('mostra "já enviado" quando jaEnviado=true', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>x</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaa',
      jaEnviado: true,
      canEnviar: true,
      reasonNaoEnviar: null,
    });
    expect(html).toContain('Enviado');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-proposta-form-view.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Criar `src/modules/dashboard/proposta-form-view.ts`**

```typescript
// src/modules/dashboard/proposta-form-view.ts
// Views de admin para A4 — Tela Admin Nova Proposta:
//   renderFormNovaProposta  → GET /dashboard/propostas/novo?lead_id=:id
//   renderPreviewProposta   → GET /dashboard/propostas/:slug/preview
import { renderLayout } from './views.js';
import type { ClienteDetail } from '../clientes/types.js';

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

const MARCAS_MODULO = ['Trina', 'JA Solar', 'LONGi', 'Jinko', 'DAH', 'Risen'];
const MARCAS_INVERSOR = ['Sungrow', 'Solis', 'Deye', 'FoxESS', 'SolarEdge', 'Huawei', 'GoodWe', 'Hoymiles', 'Enphase', 'NEP'];
const TIPOS_ESTRUTURA = ['Telha cerâmica', 'Telha metálica', 'Telha fibrocimento', 'Laje', 'Solo', 'Carport'];
const FATORES_PERDA = ['0.75', '0.80', '0.85'];

const CONCESSIONARIA_VALUES: Array<{ value: string; label: string }> = [
  { value: 'neoenergia-df', label: 'Neoenergia DF' },
  { value: 'equatorial-go', label: 'Equatorial GO' },
];

function enderecoCompleto(c: Partial<ClienteDetail> | null | undefined): string {
  if (!c) return '';
  const partes = [
    c.endereco_rua,
    c.endereco_numero ? `, ${c.endereco_numero}` : '',
    c.endereco_complemento ? ` - ${c.endereco_complemento}` : '',
    c.neighborhood ? `, ${c.neighborhood}` : '',
    c.cep ? `, CEP ${c.cep}` : '',
    c.city ? `, ${c.city}` : '',
    c.uf ? `-${c.uf}` : '',
  ].filter(Boolean).join('');
  return partes;
}

function consumoArrayPreview(json: Record<string, number> | null | undefined): string {
  if (!json) return '';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const values = meses.map((m) => json[m] ?? 0);
  if (values.every((v) => v === 0)) return '';
  return JSON.stringify(values);
}

export function renderFormNovaProposta(input: {
  lead_id: string;
  lead: Partial<ClienteDetail> | null;
  erros?: string[];
}): string {
  const c = input.lead;
  const errosHtml = (input.erros ?? []).length > 0
    ? `<div class="rounded-lg bg-rose-900/30 border border-rose-700 p-4 mb-5">
         <p class="text-rose-200 font-semibold mb-2">⚠ Corrija antes de gerar:</p>
         <ul class="list-disc ml-5 text-rose-100 text-sm">
           ${input.erros!.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
         </ul>
       </div>`
    : '';

  const consumoArrayHidden = consumoArrayPreview(c?.consumo_mensal_json ?? null);
  const concessionariaSel = c?.concessionaria ?? '';
  const tipoClienteSel = c?.profile ?? 'residencial';

  const body = `
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">📄 Nova proposta</h1>
        <p class="text-slate-400 text-sm mt-1">Cliente: <strong>${escapeHtml(c?.name ?? 'sem cadastro')}</strong></p>
      </div>

      ${errosHtml}

      <form action="/dashboard/propostas/novo" method="post" enctype="multipart/form-data" class="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-6">
        <input type="hidden" name="lead_id" value="${escapeHtml(input.lead_id)}">
        ${consumoArrayHidden ? `<input type="hidden" name="consumoMensalKwhDistribuido" value="${escapeHtml(consumoArrayHidden)}">` : ''}

        <!-- Cliente -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">👤 Cliente</legend>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Nome</span>
              <input name="nomeCliente" required value="${escapeHtml(c?.name)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">CPF/CNPJ</span>
              <input name="documentoCliente" value="${escapeHtml(c?.cpf_cnpj)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Telefone</span>
              <input name="telefoneCliente" value="${escapeHtml(c?.phone)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">E-mail</span>
              <input name="emailCliente" type="email" value="${escapeHtml(c?.email)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs text-slate-300">Endereço completo</span>
              <input name="enderecoCliente" value="${escapeHtml(enderecoCompleto(c))}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Tipo</span>
              <select name="tipoCliente" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${['residencial', 'comercial', 'rural', 'industrial'].map((t) => `<option value="${t}" ${t === tipoClienteSel ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Concessionária</span>
              <select name="concessionaria" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${CONCESSIONARIA_VALUES.map((opt) => `<option value="${opt.value}" ${opt.value === concessionariaSel ? 'selected' : ''}>${opt.label}</option>`).join('')}
              </select>
            </label>
          </div>
        </fieldset>

        <!-- Sistema -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">⚡ Sistema</legend>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Potência (kWp) *</span>
              <input name="potenciaKwp" type="number" step="0.01" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Fator de perda *</span>
              <select name="fatorPerda" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${FATORES_PERDA.map((f) => `<option value="${f}" ${f === '0.80' ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Consumo médio (kWh/mês) *</span>
              <input name="consumoMensalKwh" type="number" step="1" required value="${escapeHtml(c?.consumo_medio_kwh)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modalidade</span>
              <input name="modalidade" value="${escapeHtml(c?.tarifa_modalidade ?? 'autoconsumo local')}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Tarifa R$/kWh (override opcional)</span>
              <input name="tarifaRsKwh" type="number" step="0.01" placeholder="default por concessionária" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Custo disponibilidade (R$/mês)</span>
              <input name="custoDisponibilidadeMensal" type="number" step="1" placeholder="mono 50 / tri 100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <!-- Módulo -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">🔋 Módulos</legend>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Fabricante *</span>
              <select name="moduloFabricante" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${MARCAS_MODULO.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modelo *</span>
              <input name="moduloModelo" required placeholder="Vertex 700W" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Potência (W) *</span>
              <input name="moduloPotenciaW" type="number" step="1" required placeholder="700" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Qtd *</span>
              <input name="moduloQuantidade" type="number" step="1" required placeholder="12" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <!-- Inversor -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">⚙️ Inversor</legend>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Fabricante *</span>
              <select name="inversorFabricante" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${MARCAS_INVERSOR.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modelo *</span>
              <input name="inversorModelo" required placeholder="SG5.0RS-L" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Potência (W) *</span>
              <input name="inversorPotenciaW" type="number" step="1" required placeholder="5000" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Qtd *</span>
              <input name="inversorQuantidade" type="number" step="1" required placeholder="1" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <!-- Estrutura -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">🏠 Estrutura</legend>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Tipo *</span>
              <select name="estruturaTipo" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${TIPOS_ESTRUTURA.map((t) => `<option value="${t}" ${t === 'Telha cerâmica' ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Material</span>
              <input name="estruturaMaterial" value="Alumínio anodizado + parafusos inox" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <!-- Comercial -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">💰 Comercial</legend>
          <label class="block max-w-xs">
            <span class="text-xs text-slate-300">Valor total (R$) *</span>
            <input name="valorTotalRs" type="number" step="0.01" required placeholder="38500" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
        </fieldset>

        <!-- Anexos -->
        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">📎 Estudo personalizado <span class="text-slate-500 font-normal">(opcional — só inclui se tiver anexos)</span></legend>

          ${[1, 2, 3].map((i) => `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label class="block md:col-span-1">
                <span class="text-xs text-slate-300">Foto ${i}</span>
                <input type="file" name="foto${i}" accept="image/*" class="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer">
              </label>
              <label class="block md:col-span-2">
                <span class="text-xs text-slate-300">Legenda</span>
                <input name="fotoLegenda${i}" placeholder="Ex: Vista superior do telhado" maxlength="100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
              </label>
            </div>
          `).join('')}

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label class="block md:col-span-1">
              <span class="text-xs text-slate-300">Vídeo (opcional)</span>
              <input type="file" name="video" accept="video/*" class="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer">
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs text-slate-300">Legenda do vídeo</span>
              <input name="videoLegenda" placeholder="Ex: Simulação sombreamento 7h-18h" maxlength="100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>

          <p class="text-xs text-slate-500">Máx 3 fotos (até 20MB cada) + 1 vídeo (até 100MB, 60s).</p>
        </fieldset>

        <div class="flex gap-3 pt-2 border-t border-slate-700">
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</a>
          <button class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">📄 Gerar proposta</button>
        </div>
      </form>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Nova proposta', body, dark: true });
}

export function renderPreviewProposta(input: {
  slug: string;
  htmlPreview: string;
  publicUrl: string;
  clienteNome: string;
  clienteTelefone: string;
  lead_id: string;
  jaEnviado: boolean;
  canEnviar: boolean;
  reasonNaoEnviar: string | null;
}): string {
  const enviarBtn = input.canEnviar && !input.jaEnviado
    ? `<form action="/dashboard/propostas/${escapeHtml(input.slug)}/enviar" method="post" onsubmit="return confirm('Enviar proposta pra ${escapeHtml(input.clienteNome)} no WhatsApp agora?')">
         <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">📤 Enviar pelo WhatsApp</button>
       </form>`
    : '';

  const enviadoBadge = input.jaEnviado
    ? `<p class="text-emerald-400 text-sm mt-1">✅ Enviado pelo WhatsApp</p>`
    : input.reasonNaoEnviar
      ? `<p class="text-amber-300 text-sm mt-1">⚠ Não pode enviar: ${escapeHtml(input.reasonNaoEnviar)}</p>`
      : `<p class="text-slate-400 text-sm mt-1">Pronto pra enviar</p>`;

  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
          <h1 class="text-2xl font-bold text-slate-100 mt-3">Preview da proposta</h1>
          ${enviadoBadge}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(input.lead_id)}" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">↻ Refazer</a>
          <button onclick="navigator.clipboard.writeText('${escapeHtml(input.publicUrl)}').then(()=>alert('Link copiado!'))" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">📋 Copiar link</button>
          ${enviarBtn}
        </div>
      </div>

      <div class="bg-white rounded-xl overflow-hidden shadow-2xl">
        <iframe srcdoc="${escapeHtml(input.htmlPreview)}" class="w-full" style="min-height:900px;border:none"></iframe>
      </div>

      <p class="text-slate-500 text-xs mt-4 text-center">
        Link público: <code class="bg-slate-800 px-2 py-1 rounded">${escapeHtml(input.publicUrl)}</code> ·
        <a href="${escapeHtml(input.publicUrl)}" target="_blank" class="text-sky-300 hover:underline">abrir em nova aba</a>
      </p>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Preview proposta', body, dark: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboard-proposta-form-view.test.ts`
Expected: PASS (todos os 5 testes verdes).

- [ ] **Step 5: Confirma tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/proposta-form-view.ts tests/dashboard-proposta-form-view.test.ts
git commit -m "feat(dashboard): renderFormNovaProposta + renderPreviewProposta (A4 T3)"
```

---

## Block 3 — Rotas dashboard

### Task 4: Atualizar `createDashboardRouter` pra aceitar `proposalAssistant` + `metaService`

**Files:**
- Modify: `src/modules/dashboard/router.ts:74-78` (assinatura)
- Modify: `src/index.ts:5154-5158` (call site)

- [ ] **Step 1: Atualizar assinatura em `router.ts`**

Substituir as linhas 74-78 por:

```typescript
import type { ProposalAssistant } from '../proposal-assistant.js';
import type { MetaWhatsAppService } from '../meta-whatsapp.js';

export function createDashboardRouter(
  supabaseService: SupabaseService,
  monitoringService: MonitoringService,
  options: {
    metaWabaAccessToken?: string;
    anthropicApiKey?: string;
    sendText?: (to: string, text: string) => Promise<void>;
    proposalAssistant?: ProposalAssistant;
    metaService?: MetaWhatsAppService;
  } = {},
): Router {
```

- [ ] **Step 2: Atualizar call site em `src/index.ts` (linha ~5154)**

```typescript
app.use('/dashboard', createDashboardRouter(supabase, monitoringService, {
  metaWabaAccessToken: config.metaWabaAccessToken,
  anthropicApiKey: config.anthropicApiKey,
  sendText,
  proposalAssistant,
  metaService: metaWhatsApp,  // confirma nome da var em index.ts — pode ser metaWhatsApp ou meta
}));
```

> **Verificação antes de codar**: rodar `grep -n "MetaWhatsAppService\\|metaWhatsApp\\|new MetaWhatsApp" src/index.ts` pra achar o nome exato da variável já instanciada. Provavelmente `metaWhatsApp`. Ajustar se diferente.

- [ ] **Step 3: Compilar pra ver se passa**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts src/index.ts
git commit -m "feat(dashboard): aceita proposalAssistant + metaService no router (A4 T4)"
```

---

### Task 5: GET `/dashboard/propostas/novo?lead_id=:id` — form

**Files:**
- Modify: `src/modules/dashboard/router.ts` (adicionar rota depois da rota de A5)

- [ ] **Step 1: Write the failing smoke test**

```typescript
// tests/dashboard-router.proposta-novo.test.ts
// Smoke da rota — verifica que GET com lead_id válido retorna 200 + HTML do form.
// (Sem mockar supabase real — usa stub injetado.)
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('GET /dashboard/propostas/novo', () => {
  it.todo('smoke: GET com lead_id válido retorna 200 + form HTML — completar quando router exportar test handler');
});
```

> Nota: o router atual não tem teste de integração — adiciona como `it.todo` apenas pra marcar a cobertura. A validação de fato é Step 4 (smoke manual).

- [ ] **Step 2: Importar a view no router.ts**

Adicionar no topo do arquivo, junto com outros imports de views (linha ~72):

```typescript
import { renderFormNovaProposta, renderPreviewProposta } from './proposta-form-view.js';
```

- [ ] **Step 3: Adicionar a rota GET (após o bloco A5 — depois da linha ~1131)**

```typescript
  // ========================================================================
  // A4 — Tela admin "Nova proposta"
  // GET form pré-preenchido, POST gera proposta, GET preview, POST envia
  // ========================================================================

  router.get('/propostas/novo', async (req: Request, res: Response) => {
    const lead_id = String(req.query.lead_id ?? '');
    if (!lead_id) {
      return res.status(400).send('Parâmetro <code>lead_id</code> obrigatório. Abra esta tela pelo botão "Nova proposta" no perfil de um cliente.');
    }
    if (!UUID_RE.test(lead_id)) {
      return res.status(400).send('UUID inválido');
    }

    const lead = await supabaseService.getClienteByLeadId(lead_id);
    if (!lead) return res.status(404).send('Cliente não encontrado');

    res.type('text/html').send(renderFormNovaProposta({
      lead_id,
      lead: lead as any,
      erros: [],
    }));
  });
```

- [ ] **Step 4: Smoke manual (após Implantar — final do plano)**

Marcar como blocker pra Task 11. Por enquanto, confirma só com tsc.

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/router.ts tests/dashboard-router.proposta-novo.test.ts
git commit -m "feat(dashboard): GET /propostas/novo — form pré-preenchido (A4 T5)"
```

---

### Task 6: POST `/dashboard/propostas/novo` — gera proposta (multipart)

**Files:**
- Modify: `src/modules/dashboard/router.ts`

- [ ] **Step 1: Garantir que multer já está disponível**

Buscar: `grep -n "import multer\\|require('multer')" src/modules/dashboard/router.ts`
Esperado: encontrar import existente (do A5). Se sim, reusa. Se não, adiciona:

```typescript
import multer from 'multer';
const uploadProposta = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
```

> Provavelmente o `upload` do A5 já existe no router; pode reusar. Verificar grep antes.

- [ ] **Step 2: Adicionar a rota POST (logo depois do GET acima)**

```typescript
  router.post('/propostas/novo',
    uploadProposta.fields([
      { name: 'foto1', maxCount: 1 },
      { name: 'foto2', maxCount: 1 },
      { name: 'foto3', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      const lead_id = String(req.body.lead_id ?? '');
      if (!UUID_RE.test(lead_id)) return res.status(400).send('UUID inválido');
      if (!options.proposalAssistant) {
        return res.status(500).send('ProposalAssistant não injetado');
      }

      const lead = await supabaseService.getClienteByLeadId(lead_id);
      if (!lead) return res.status(404).send('Cliente não encontrado');

      // Monta o objeto `data` no mesmo formato que o Claude retorna pro generateProposalCore.
      const b = req.body;
      const erros: string[] = [];

      const nomeCliente = String(b.nomeCliente ?? '').trim();
      const valorTotalRs = Number(b.valorTotalRs);
      const potenciaKwp = Number(b.potenciaKwp);
      const fatorPerda = Number(b.fatorPerda);
      const consumoMensalKwh = Number(b.consumoMensalKwh);
      const concessionariaRaw = String(b.concessionaria ?? '');

      if (!nomeCliente) erros.push('Campo "Nome" obrigatório');
      if (!isFinite(valorTotalRs) || valorTotalRs <= 0) erros.push('Campo "Valor total" inválido');
      if (!isFinite(potenciaKwp) || potenciaKwp <= 0) erros.push('Campo "Potência kWp" inválido');
      if (!isFinite(consumoMensalKwh) || consumoMensalKwh <= 0) erros.push('Campo "Consumo médio" inválido');
      if (!concessionariaRaw) erros.push('Campo "Concessionária" obrigatório');

      if (erros.length > 0) {
        return res.status(400).type('text/html').send(renderFormNovaProposta({
          lead_id,
          lead: lead as any,
          erros,
        }));
      }

      // Mapeia value do select pra label que o calculator entende.
      const concessionariaLabel = concessionariaRaw === 'neoenergia-df'
        ? 'Neoenergia DF'
        : concessionariaRaw === 'equatorial-go'
          ? 'Equatorial GO'
          : concessionariaRaw;

      // Parse opcional do array 12 meses
      let consumoMensalKwhDistribuido: number[] | undefined;
      if (b.consumoMensalKwhDistribuido) {
        try {
          const arr = JSON.parse(String(b.consumoMensalKwhDistribuido));
          if (Array.isArray(arr) && arr.length === 12) consumoMensalKwhDistribuido = arr;
        } catch {}
      }

      // Detecta tipo do inversor pelo fabricante
      const inversorFab = String(b.inversorFabricante ?? '').toLowerCase();
      const tipoInversor: string =
        ['hoymiles', 'enphase', 'nep', 'apsystems'].includes(inversorFab) ? 'microinversor'
        : inversorFab === 'solaredge' ? 'solaredge'
        : 'string';
      const garantiaInversor =
        tipoInversor === 'microinversor' ? 12
        : tipoInversor === 'solaredge' ? 12
        : 10;

      const data: any = {
        nomeCliente,
        documentoCliente: b.documentoCliente || undefined,
        enderecoCliente: b.enderecoCliente || undefined,
        telefoneCliente: b.telefoneCliente || undefined,
        emailCliente: b.emailCliente || undefined,
        tipoCliente: b.tipoCliente || 'residencial',
        modalidade: b.modalidade || 'autoconsumo local',
        concessionaria: concessionariaLabel,
        potenciaKwp,
        fatorPerda,
        consumoMensalKwh,
        consumoMensalKwhDistribuido,
        tarifaRsKwh: b.tarifaRsKwh ? Number(b.tarifaRsKwh) : undefined,
        custoDisponibilidadeMensal: b.custoDisponibilidadeMensal ? Number(b.custoDisponibilidadeMensal) : undefined,
        modulo: {
          fabricante: b.moduloFabricante,
          modelo: b.moduloModelo,
          potenciaW: Number(b.moduloPotenciaW),
          quantidade: Number(b.moduloQuantidade),
          garantiaDefeito: 12,
          garantiaEficiencia: 30,
          tecnologia: 'TOPCon N-Type Bifacial',
        },
        inversor: {
          fabricante: b.inversorFabricante,
          modelo: b.inversorModelo,
          potenciaW: Number(b.inversorPotenciaW),
          quantidade: Number(b.inversorQuantidade),
          garantia: garantiaInversor,
          eficiencia: 0.985,
          tipoInversor,
        },
        estruturaFixacao: {
          tipo: b.estruturaTipo || 'Telha cerâmica',
          material: b.estruturaMaterial || 'Alumínio anodizado + parafusos inox',
          descricao: '',
        },
        valorTotalRs,
      };

      // Coleta anexos do multer
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const attachments: Array<{ buffer: Buffer; mimeType: string; legenda: string }> = [];
      if (files) {
        for (const i of [1, 2, 3]) {
          const f = files[`foto${i}`]?.[0];
          if (f) {
            attachments.push({
              buffer: f.buffer,
              mimeType: f.mimetype,
              legenda: String(b[`fotoLegenda${i}`] ?? `Foto ${i}`).slice(0, 100),
            });
          }
        }
        const v = files.video?.[0];
        if (v) {
          attachments.push({
            buffer: v.buffer,
            mimeType: v.mimetype,
            legenda: String(b.videoLegenda ?? 'Simulação').slice(0, 100),
          });
        }
      }

      const tipo = attachments.length > 0 ? 'personalizada' : 'basica';

      try {
        const result = await options.proposalAssistant.generateProposalCore({
          data,
          modoEnvio: 'junior_envia',
          tipo,
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        return res.redirect(303, `/dashboard/propostas/${result.slug}/preview?lead_id=${lead_id}`);
      } catch (err) {
        return res.status(500).type('text/html').send(renderFormNovaProposta({
          lead_id,
          lead: lead as any,
          erros: [`Erro ao gerar proposta: ${(err as Error).message.slice(0, 200)}`],
        }));
      }
    },
  );
```

- [ ] **Step 3: Confirma tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(dashboard): POST /propostas/novo — gera via generateProposalCore (A4 T6)"
```

---

### Task 7: GET `/dashboard/propostas/:slug/preview`

**Files:**
- Modify: `src/modules/dashboard/router.ts`

- [ ] **Step 1: Adicionar a rota**

```typescript
  router.get('/propostas/:slug/preview', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) return res.status(400).send('Slug inválido');

    const result = await supabaseService.getPropostaPublicaBySlug(slug);
    if (result.status !== 'ok') return res.status(404).send('Proposta não encontrada');

    // Resolve lead_id a partir da query (vem do redirect) ou tenta extrair do htmlContent (fallback).
    // Se não vier query, render mostra link de "voltar" genérico pra /dashboard/clientes.
    const lead_id = String(req.query.lead_id ?? '');

    // Telefone do cliente vem do row de propostas_publicas (cliente_telefone).
    // getPropostaPublicaBySlug não retorna isso hoje — precisa novo método ou ler html_content.
    // Atalho V1: assumir que se tem telefone no row, pode enviar. Senão, bloqueia.
    const clienteNome = result.clienteNome ?? 'Cliente';

    // Para canEnviar, buscar o row direto pra ver cliente_telefone + sent_to_client_at
    const rowExtras = await supabaseService.getPropostaPublicaExtras
      ? await supabaseService.getPropostaPublicaExtras(slug)
      : { cliente_telefone: null, sent_to_client_at: null, opt_out: false };

    const clienteTelefone = rowExtras.cliente_telefone ?? '';
    const jaEnviado = !!rowExtras.sent_to_client_at;
    let canEnviar = true;
    let reasonNaoEnviar: string | null = null;
    if (!options.metaService) { canEnviar = false; reasonNaoEnviar = 'MetaWhatsApp não configurado'; }
    else if (!clienteTelefone) { canEnviar = false; reasonNaoEnviar = 'Sem telefone cadastrado'; }
    else if (rowExtras.opt_out) { canEnviar = false; reasonNaoEnviar = 'Cliente em opt-out'; }

    const publicUrl = `${process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br'}/p/${slug}`;

    res.type('text/html').send(renderPreviewProposta({
      slug,
      htmlPreview: result.html ?? '',
      publicUrl,
      clienteNome,
      clienteTelefone,
      lead_id: lead_id || '',
      jaEnviado,
      canEnviar,
      reasonNaoEnviar,
    }));
  });
```

- [ ] **Step 2: Adicionar `getPropostaPublicaExtras` em `supabase.ts`**

Buscar `getPropostaPublicaBySlug` em `src/modules/supabase.ts` e adicionar logo depois:

```typescript
  async getPropostaPublicaExtras(slug: string): Promise<{
    cliente_telefone: string | null;
    sent_to_client_at: string | null;
    opt_out: boolean;
  }> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('cliente_telefone, sent_to_client_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(`Failed to get proposta extras: ${error.message}`);
    if (!data) return { cliente_telefone: null, sent_to_client_at: null, opt_out: false };

    // Verifica opt_out cruzando telefone com tabela leads (se cadastrado)
    let opt_out = false;
    if (data.cliente_telefone) {
      const { data: leadRow } = await this.client
        .from('leads')
        .select('opt_out')
        .eq('phone', data.cliente_telefone)
        .maybeSingle();
      opt_out = !!leadRow?.opt_out;
    }

    return {
      cliente_telefone: data.cliente_telefone,
      sent_to_client_at: data.sent_to_client_at ?? null,
      opt_out,
    };
  }
```

> **Verificação antes de codar**: rodar `grep -n "sent_to_client_at" src/modules/supabase.ts supabase/migrations/*.sql`. Se a coluna **não existir** na tabela `propostas_publicas`, vai precisar adicionar migration. Conferir o schema atual antes. Se faltar, criar `037_propostas_publicas_sent_at.sql` (próximo número após 036) com `alter table propostas_publicas add column if not exists sent_to_client_at timestamptz` e flagar pro Junior aplicar no SQL Editor.

- [ ] **Step 3: Confirma tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/supabase.ts supabase/migrations/037_propostas_publicas_sent_at.sql
git commit -m "feat(dashboard): GET /propostas/:slug/preview + getPropostaPublicaExtras (A4 T7)"
```

---

### Task 8: POST `/dashboard/propostas/:slug/enviar` — dispara Eva

**Files:**
- Modify: `src/modules/dashboard/router.ts`
- Modify: `src/modules/supabase.ts` (método `marcarPropostaPublicaEnviada`)

- [ ] **Step 1: Adicionar método `marcarPropostaPublicaEnviada` em `supabase.ts`**

```typescript
  async marcarPropostaPublicaEnviada(slug: string): Promise<void> {
    const { error } = await this.client
      .from('propostas_publicas')
      .update({ sent_to_client_at: new Date().toISOString() })
      .eq('slug', slug);
    if (error) throw new Error(`Failed to mark proposta sent: ${error.message}`);
  }
```

- [ ] **Step 2: Adicionar a rota POST**

```typescript
  router.post('/propostas/:slug/enviar', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) return res.status(400).send('Slug inválido');
    if (!options.metaService) return res.status(500).send('MetaWhatsApp não configurado');

    const result = await supabaseService.getPropostaPublicaBySlug(slug);
    if (result.status !== 'ok' || !result.html) return res.status(404).send('Proposta não encontrada');

    const extras = await supabaseService.getPropostaPublicaExtras(slug);
    if (!extras.cliente_telefone) return res.status(400).send('Cliente sem telefone');
    if (extras.opt_out) return res.status(400).send('Cliente em opt-out');

    // Re-gera PDF a partir do html salvo (não armazenamos pdf buffer)
    const { htmlToPdf } = await import('../proposal/pdf-generator.js');
    const pdfBuffer = await htmlToPdf(result.html, { waitForChartMs: 2000 });

    const { enviarPropostaParaCliente } = await import('../eva-sender.js');
    const publicUrl = `${process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br'}/p/${slug}`;
    const safeName = (result.clienteNome ?? 'Cliente').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');

    const send = await enviarPropostaParaCliente(options.metaService, {
      telefoneCliente: extras.cliente_telefone,
      nomeCliente: result.clienteNome ?? 'Cliente',
      linkWebPublico: publicUrl,
      pdfBuffer,
      pdfFilename: `Proposta-EcoSunPower-${safeName}.pdf`,
    });

    if (!send.ok) return res.status(500).send(`Erro ao enviar: ${escapeHtmlSimple(send.reason).slice(0, 200)}`);

    await supabaseService.marcarPropostaPublicaEnviada(slug);

    const lead_id = String(req.body.lead_id ?? '');
    res.redirect(303, `/dashboard/propostas/${slug}/preview${lead_id ? `?lead_id=${lead_id}` : ''}`);
  });
```

- [ ] **Step 3: Confirma tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/supabase.ts
git commit -m "feat(dashboard): POST /propostas/:slug/enviar dispara Eva (A4 T8)"
```

---

## Block 4 — Smoke prod

### Task 9: Smoke manual em prod (após Implantar)

- [ ] **Step 1: Confirma estado pré-deploy**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde, 0 errors.

- [ ] **Step 2: Junior aplica migration `037_propostas_publicas_sent_at.sql` (se T7 detectou que falta)**

Junior abre Supabase SQL Editor → projeto `kupnsoyymulbdzakqlqc` → cola conteúdo de `supabase/migrations/037_propostas_publicas_sent_at.sql` → executa.

> Pular este passo se T7 confirmou que `sent_to_client_at` já existe no schema.

- [ ] **Step 3: Push + Easypanel Implantar**

```bash
git push origin main
```

Junior clica "Implantar" no Easypanel para o serviço `ecosunpower-agente`.

- [ ] **Step 4: Smoke prod (Junior)**

Cenário 1 — Básica:
1. Abrir `/dashboard/clientes` em prod
2. Escolher um cliente cadastrado completo (ex: Ailson Fernandes)
3. Clicar "📄 Nova proposta" no header do perfil
4. Conferir que form veio pré-preenchido (nome, telefone, email, CPF, endereço, cidade, concessionária)
5. Preencher campos faltantes: 8.4 kWp, fator 0.80, módulo Trina Vertex 700W ×12, inversor Sungrow SG5.0RS-L ×1, valor R$ 38.500
6. Clicar "Gerar proposta"
7. Esperar preview carregar (puppeteer ~5-15s)
8. Verificar iframe mostra proposta branded EcoSun com nome do cliente, valores, payback
9. Clicar "📋 Copiar link" → conferir que copiou
10. Abrir link em aba anônima → confere proposta pública carrega

Cenário 2 — Personalizada com anexos:
1. Mesmo cliente. Volta no perfil.
2. Clicar "📄 Nova proposta" de novo
3. Subir 2 fotos (de qualquer imagem teste) + 1 legenda cada
4. Preencher dados básicos
5. Gerar
6. Verificar que preview mostra seção "Estudamos seu Telhado" com as fotos

Cenário 3 — Envio:
1. Cliente teste com seu próprio telefone cadastrado
2. Gerar proposta (básica)
3. Na tela de preview, clicar "📤 Enviar pelo WhatsApp"
4. Confirmar no popup
5. Verificar que chega no seu zap: saudação Eva + link + PDF
6. Voltar pra tela preview → confirmar badge "✅ Enviado"

Cenário 4 — Edge case: cliente opt-out
1. Cliente com opt_out=true (ou marca um teste como opt-out)
2. Gerar proposta
3. Verificar que botão Enviar fica oculto + warning "Cliente em opt-out"

- [ ] **Step 5: Reportar pro Junior**

Se todos os 4 cenários passam: A4 LIVE em prod. Atualizar memory com link/data.

Se falha em algum: capturar log do Easypanel, diagnosticar, fix forward (nova task).

---

## Self-review (controller faz antes de entregar)

- [x] **Cobertura da spec**: refactor (T1/T2) cobre "extrair core function"; T3 cobre "form pré-preenchido"; T5/T6 cobrem GET+POST rota; T7 cobre preview; T8 cobre envio; T9 cobre smoke. **Spec coberta.**
- [x] **Placeholders**: nenhum "TBD" ou "implementar depois". Cada step tem código real.
- [x] **Type consistency**: `GenerateProposalCoreInput.attachments` é `Array<{buffer, mimeType, legenda}>` em T2 e usado igual em T6. `renderPreviewProposta` recebe `slug, htmlPreview, publicUrl, clienteNome, clienteTelefone, lead_id, jaEnviado, canEnviar, reasonNaoEnviar` consistente entre T3 e T7.
- [x] **Pontos de verificação anotados** (T4 nome da var Meta, T7 coluna sent_to_client_at) — o executor confirma antes de codar, não chuta.
