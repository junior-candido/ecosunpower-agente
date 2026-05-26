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
      contratoPdf: Buffer.from('%PDF-fake-contrato'),
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
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeUndefined();
  });
});
