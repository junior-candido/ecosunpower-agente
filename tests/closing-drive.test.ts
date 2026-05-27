import { describe, it, expect, vi } from 'vitest';
import { ClosingDriveUploader } from '../src/modules/closing/closing-drive.js';

function fakeDrive() {
  const created: any[] = [];
  return {
    files: {
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      create: vi.fn().mockImplementation(async ({ requestBody, fields }: any) => {
        const id = `id-${created.length + 1}`;
        const f = { id, name: requestBody.name, mimeType: requestBody.mimeType, webViewLink: `https://drive.google.com/file/d/${id}/view` };
        created.push(f);
        return { data: f };
      }),
      get: vi.fn().mockImplementation(async ({ fileId }: any) => ({
        data: { webViewLink: `https://drive.google.com/file/d/${fileId}/view` },
      })),
    },
    _created: created,
  };
}

describe('ClosingDriveUploader', () => {
  it('cria estrutura EcoSunPower/Contratos/<ano>/<cliente> e sobe arquivos', async () => {
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive as any);

    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoHtml: '<h1>contrato</h1>',
      contratoPdf: Buffer.from('%PDF-fake-contrato'),
      procuracaoHtml: '<h1>procuracao</h1>',
      procuracaoPdf: Buffer.from('%PDF-fake-procuracao'),
      dadosInputJson: '{"x":1}',
    });

    expect(res.folderId).toMatch(/^id-/);
    expect(res.contratoDriveLink).toContain('https://drive.google.com');
    expect(res.procuracaoDriveLink).toContain('https://drive.google.com');

    const folderNames = drive._created.filter((c: any) => c.mimeType === 'application/vnd.google-apps.folder').map((c: any) => c.name);
    expect(folderNames).toContain('EcoSunPower');
    expect(folderNames).toContain('Contratos');
    expect(folderNames).toContain('2026');
    expect(folderNames).toContain('Camila Barbosa Costa Cardoso - 028876');

    const pdfs = drive._created.filter((c: any) => c.mimeType === 'application/pdf');
    expect(pdfs.length).toBe(2);
    expect(pdfs.map((p: any) => p.name)).toEqual(expect.arrayContaining([
      'contrato-v1.pdf',
      'procuracao-v1.pdf',
    ]));
  });

  it('só sobe contrato se procuração não vier', async () => {
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive as any);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'X',
      cpfTitular: '12345678901',
      ano: '2026',
      version: 1,
      contratoHtml: '<h1>contrato</h1>',
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeUndefined();
  });
});

describe('ClosingDriveUploader.uploadFechamento — HTML+PDF (Doc eSignature-ready)', () => {
  function makeFullMockDrive() {
    const calls: any[] = [];
    const drive: any = {
      files: {
        list: vi.fn(async () => ({ data: { files: [] } })),  // pasta sempre nova
        create: vi.fn(async (args: any) => {
          calls.push(args);
          const isFolder = args.requestBody?.mimeType === 'application/vnd.google-apps.folder';
          const isDoc = args.requestBody?.mimeType === 'application/vnd.google-apps.document';
          const id = isFolder ? `folder-${calls.length}` : isDoc ? `doc-${calls.length}` : `file-${calls.length}`;
          return { data: { id, webViewLink: `https://link/${id}` } };
        }),
        get: vi.fn(async () => ({ data: { webViewLink: 'https://link/cliente' } })),
      },
      __calls: calls,
    };
    return drive;
  }

  it('procuracao: sobe Doc (procuracaoHtml) + PDF backup + JSON, retorna ID do Doc', async () => {
    const drive = makeFullMockDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Fernanda Silva',
      cpfTitular: '83134743191',
      ano: '2026',
      version: 1,
      procuracaoHtml: '<h1>oi</h1>',
      procuracaoPdf: Buffer.from('%PDF-fake'),
      dadosInputJson: '{}',
    });
    expect(res.procuracaoDriveId).toMatch(/^doc-/);
    expect(res.procuracaoDriveLink).toContain('link/doc-');
    const docCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/vnd.google-apps.document');
    const pdfCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/pdf');
    expect(docCreates).toHaveLength(1);
    expect(pdfCreates).toHaveLength(1);
  });

  it('contrato: mesma logica, ID do Doc retorna em contratoDriveId', async () => {
    const drive = makeFullMockDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Roberto X',
      cpfTitular: '12345678901',
      ano: '2026',
      version: 1,
      contratoHtml: '<h1>contrato</h1>',
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveId).toMatch(/^doc-/);
  });

  it('so HTML (sem PDF): sobe so Doc, sem upload de PDF', async () => {
    const drive = makeFullMockDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'X', cpfTitular: '12345678901', ano: '2026', version: 1,
      procuracaoHtml: '<h1>x</h1>',
      dadosInputJson: '{}',
    });
    expect(res.procuracaoDriveId).toBeTruthy();
    const pdfCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/pdf');
    expect(pdfCreates).toHaveLength(0);
  });

  it('ambos os docs juntos: 2 Docs + 2 PDFs na mesma pasta', async () => {
    const drive = makeFullMockDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila',
      cpfTitular: '11122233344',
      ano: '2026',
      version: 1,
      procuracaoHtml: '<h1>p</h1>',
      procuracaoPdf: Buffer.from('%PDF1'),
      contratoHtml: '<h1>c</h1>',
      contratoPdf: Buffer.from('%PDF2'),
      dadosInputJson: '{}',
    });
    expect(res.procuracaoDriveId).toMatch(/^doc-/);
    expect(res.contratoDriveId).toMatch(/^doc-/);
    const docCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/vnd.google-apps.document');
    const pdfCreates = drive.__calls.filter((c: any) => c.requestBody?.mimeType === 'application/pdf');
    expect(docCreates).toHaveLength(2);
    expect(pdfCreates).toHaveLength(2);
  });
});
