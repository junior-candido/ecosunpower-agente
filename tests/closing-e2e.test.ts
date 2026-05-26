// tests/closing-e2e.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  ClosingAssistant,
  ClosingDriveUploader,
  renderContrato,
  renderProcuracao,
  findMissingRequired,
  buildInitialData,
  type LlmCaller,
} from '../src/modules/closing/index.js';
import {
  leadCamilaRow,
  propostaPublicaCamilaRow,
  dadosFechamentoCamilaMesmaPessoa,
} from './fixtures/closing-camila.js';

const okLlm: LlmCaller = async () => ({
  action: 'ready_to_generate',
  updates: {},
  message: '✅ ready',
});

function fakeDrive() {
  return {
    files: {
      list: async () => ({ data: { files: [] } }),
      create: vi.fn(async ({ requestBody }: any) => ({
        data: { id: `id-${Math.random()}`, webViewLink: 'http://drive/fake' },
      })),
      get: async () => ({ data: { webViewLink: 'http://drive/folder' } }),
    },
  } as any;
}

describe('closing e2e (sem rede)', () => {
  it('fluxo: lead → buildInitialData → assistant → render → drive', async () => {
    // 1. dados iniciais do lead + proposta
    const initial = buildInitialData(leadCamilaRow as any, propostaPublicaCamilaRow as any);
    expect(initial.titular_uc).toBeTruthy();

    // 2. assistant processa
    const assistant = new ClosingAssistant({ llm: okLlm });
    const r1 = await assistant.processMessage('manda', {
      stage: 'collecting',
      data: initial,
      pending_questions: [],
    });
    expect(r1.newState.stage).toBeDefined();

    // 3. com dados completos (fixture), valida que tá ok
    const dataCompleta = dadosFechamentoCamilaMesmaPessoa;
    expect(findMissingRequired(dataCompleta)).toEqual([]);

    // 4. render HTML
    const htmlContrato = renderContrato(dataCompleta);
    const htmlProcuracao = renderProcuracao(dataCompleta);
    expect(htmlContrato).toContain('Camila Barbosa Costa Cardoso');
    expect(htmlProcuracao).toContain('INSTRUMENTO PARTICULAR DE PROCURAÇÃO');

    // 5. drive upload (PDFs stub — não invoca Puppeteer aqui)
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoPdf: Buffer.from('%PDF'),
      procuracaoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeTruthy();
  });
});
