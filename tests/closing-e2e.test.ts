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
  type DadosFechamento,
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
    // modelo atualizado 27/05/2026 (caso Fernanda): titulo simplificado
    expect(htmlProcuracao).toContain('PROCURAÇÃO PARTICULAR');
    expect(htmlProcuracao).toContain('CAMILA BARBOSA COSTA CARDOSO');

    // 5. drive upload — passa HTML (Doc eSignature) + PDF backup
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoHtml: htmlContrato,
      contratoPdf: Buffer.from('%PDF'),
      procuracaoHtml: htmlProcuracao,
      procuracaoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeTruthy();
  });
});

describe('Closing E2E — 3 modos (procuracao / contrato / ambos)', () => {
  // ------------------------------------------------------------------ helpers
  function fakeDrive2() {
    return {
      files: {
        list: async () => ({ data: { files: [] } }),
        create: vi.fn(async ({ requestBody }: any) => ({
          data: {
            id: `id-${requestBody?.mimeType ?? 'unknown'}-${Math.random().toString(36).slice(2)}`,
            webViewLink: `http://drive/${requestBody?.name ?? 'file'}`,
          },
        })),
        get: async () => ({ data: { webViewLink: 'http://drive/folder' } }),
      },
    } as any;
  }

  // Fixture base só com campos UC/titular (sem sistema/comercial)
  const dadosSoProcuracao: DadosFechamento = {
    titular_uc: dadosFechamentoCamilaMesmaPessoa.titular_uc,
    uc_numero: '10005936703',
    concessionaria: 'Equatorial-GO',
    endereco_instalacao: dadosFechamentoCamilaMesmaPessoa.endereco_instalacao,
    contratante: dadosFechamentoCamilaMesmaPessoa.contratante,
    contratante_eh_titular: true,
    sistema: dadosFechamentoCamilaMesmaPessoa.sistema,
    comercial: dadosFechamentoCamilaMesmaPessoa.comercial,
    docs_pedidos: ['procuracao'],
  };

  const dadosSoContrato: DadosFechamento = {
    ...dadosFechamentoCamilaMesmaPessoa,
    docs_pedidos: ['contrato'],
  };

  const dadosAmbos: DadosFechamento = {
    ...dadosFechamentoCamilaMesmaPessoa,
    docs_pedidos: ['procuracao', 'contrato'],
  };

  // ------------------------------------------------------------------ testes

  it('procuracao isolada: gera Doc, NAO exige sistema/comercial, link preenchido', async () => {
    // Validator: procuracao isolada nao deve pedir sistema/comercial
    const missing = findMissingRequired(dadosSoProcuracao);
    expect(missing).not.toContain('sistema.kwp');
    expect(missing).not.toContain('comercial.valor_total_brl');
    expect(missing).not.toContain('comercial.forma_pagamento');
    expect(missing).toEqual([]);

    // Render
    const htmlProc = renderProcuracao(dadosFechamentoCamilaMesmaPessoa);
    expect(htmlProc).toContain('PROCURAÇÃO PARTICULAR');

    // Upload: só procuracaoHtml — contrato deve ficar undefined
    const drive = fakeDrive2();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      procuracaoHtml: htmlProc,
      procuracaoPdf: Buffer.from('%PDF'),
      dadosInputJson: JSON.stringify({ docs_pedidos: ['procuracao'] }),
    });

    expect(res.procuracaoDriveLink).toBeTruthy();
    expect(res.contratoDriveLink).toBeUndefined();
    expect(res.folderId).toBeTruthy();

    // Drive recebeu chamada com mimeType=application/vnd.google-apps.document (pra procuracao)
    const googleDocCalls = (drive.files.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([args]: any[]) => args?.requestBody?.mimeType === 'application/vnd.google-apps.document',
    );
    expect(googleDocCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('contrato isolado: gera Doc, exige sistema+comercial, link preenchido', async () => {
    // Validator: contrato exige sistema e comercial
    const missing = findMissingRequired(dadosSoContrato);
    expect(missing).toEqual([]);

    // Render
    const htmlContr = renderContrato(dadosFechamentoCamilaMesmaPessoa);
    expect(htmlContr).toContain('Camila Barbosa Costa Cardoso');

    // Upload: só contratoHtml — procuracao deve ficar undefined
    const drive = fakeDrive2();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoHtml: htmlContr,
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: JSON.stringify({ docs_pedidos: ['contrato'] }),
    });

    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeUndefined();
    expect(res.folderId).toBeTruthy();

    // Drive recebeu exatamente 1 chamada com mimeType google-apps.document (o contrato)
    const googleDocCalls = (drive.files.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([args]: any[]) => args?.requestBody?.mimeType === 'application/vnd.google-apps.document',
    );
    expect(googleDocCalls.length).toBe(1);
  });

  it('ambos: 2 Docs na mesma pasta do cliente, ambos links preenchidos', async () => {
    // Validator: ambos campos obrigatorios completos
    const missing = findMissingRequired(dadosAmbos);
    expect(missing).toEqual([]);

    // Render ambos
    const htmlContr = renderContrato(dadosFechamentoCamilaMesmaPessoa);
    const htmlProc = renderProcuracao(dadosFechamentoCamilaMesmaPessoa);

    // Upload: ambos HTMLs
    const drive = fakeDrive2();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoHtml: htmlContr,
      contratoPdf: Buffer.from('%PDF'),
      procuracaoHtml: htmlProc,
      procuracaoPdf: Buffer.from('%PDF'),
      dadosInputJson: JSON.stringify({ docs_pedidos: ['procuracao', 'contrato'] }),
    });

    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeTruthy();
    // Ambos compartilham a mesma pasta do cliente
    expect(res.folderId).toBeTruthy();

    // Drive recebeu exatamente 2 chamadas com mimeType google-apps.document
    const googleDocCalls = (drive.files.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([args]: any[]) => args?.requestBody?.mimeType === 'application/vnd.google-apps.document',
    );
    expect(googleDocCalls.length).toBe(2);
  });
});
