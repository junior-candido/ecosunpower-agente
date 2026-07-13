// Upload de contrato + procuração no Google Drive.
// Estrutura: EcoSunPower / Contratos / <ano> / <nome titular> - <CPF curto> / arquivos
//
// Reusa autenticação OAuth do proposal/drive-uploader (mesmo cliente Google).

import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { uploadHtmlAsGoogleDoc } from './closing-html-uploader.js';

export interface UploadFechamentoInput {
  nomeTitular: string;
  cpfTitular: string;
  ano: string;
  version: number; // 1, 2, 3... incrementa se refazer
  contratoHtml?: string;
  contratoPdf?: Buffer;
  procuracaoHtml?: string;
  procuracaoPdf?: Buffer;
  /** Outros documentos da central (termo aditivo, etc.) — arquivados na mesma pasta. */
  extras?: Array<{ nome: string; pdf: Buffer }>;
  dadosInputJson: string;
}

export interface UploadFechamentoResult {
  folderId: string;
  folderWebViewLink: string;
  contratoDriveId?: string;
  contratoDriveLink?: string;
  procuracaoDriveId?: string;
  procuracaoDriveLink?: string;
}

export class ClosingDriveUploader {
  constructor(private drive: drive_v3.Drive) {}

  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
      parentId ? `'${parentId}' in parents` : `'root' in parents`,
    ].join(' and ');
    const list = await this.drive.files.list({ q, fields: 'files(id, name)', pageSize: 1 });
    const found = list.data.files?.[0];
    if (found?.id) return found.id;
    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, webViewLink',
    });
    if (!created.data.id) throw new Error(`Falha ao criar pasta ${name}`);
    return created.data.id;
  }

  private async uploadPdf(name: string, buffer: Buffer, parentId: string): Promise<{ id: string; link: string }> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/pdf', parents: [parentId] },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id, webViewLink',
    });
    if (!res.data.id) throw new Error(`Falha ao subir PDF ${name}`);
    return { id: res.data.id, link: res.data.webViewLink ?? '' };
  }

  private async uploadJson(name: string, content: string, parentId: string): Promise<void> {
    await this.drive.files.create({
      requestBody: { name, mimeType: 'application/json', parents: [parentId] },
      media: { mimeType: 'application/json', body: Readable.from(Buffer.from(content)) },
      fields: 'id',
    });
  }

  async uploadFechamento(input: UploadFechamentoInput): Promise<UploadFechamentoResult> {
    const cpfCurto = input.cpfTitular.replace(/\D+/g, '').slice(0, 6);
    const clienteFolderName = `${input.nomeTitular} - ${cpfCurto}`;

    const rootId = await this.getOrCreateFolder('EcoSunPower');
    const contratosId = await this.getOrCreateFolder('Contratos', rootId);
    const anoId = await this.getOrCreateFolder(input.ano, contratosId);
    const clienteId = await this.getOrCreateFolder(clienteFolderName, anoId);

    const folderMeta = await this.drive.files.get({ fileId: clienteId, fields: 'webViewLink' });
    const folderLink = folderMeta.data.webViewLink ?? '';

    const result: UploadFechamentoResult = {
      folderId: clienteId,
      folderWebViewLink: folderLink,
    };

    // Procuracao: Doc (eSignature) + PDF backup
    if (input.procuracaoHtml) {
      const { id, link } = await uploadHtmlAsGoogleDoc({
        html: input.procuracaoHtml,
        name: `procuracao-v${input.version}`,
        parentId: clienteId,
        drive: this.drive,
      });
      result.procuracaoDriveId = id;
      result.procuracaoDriveLink = link;
    }
    if (input.procuracaoPdf) {
      // PDF backup; link Doc e o que volta no zap, mas mantemos PDF como historico imutavel
      await this.uploadPdf(`procuracao-v${input.version}.pdf`, input.procuracaoPdf, clienteId);
    }

    // Outros documentos da central (aditivo, ...): PDF na pasta do cliente. Sem
    // isso, o documento que ALTERA o contrato era o único que não ficava arquivado.
    for (const extra of input.extras ?? []) {
      await this.uploadPdf(`${extra.nome}-v${input.version}.pdf`, extra.pdf, clienteId);
    }

    // Contrato: idem
    if (input.contratoHtml) {
      const { id, link } = await uploadHtmlAsGoogleDoc({
        html: input.contratoHtml,
        name: `contrato-v${input.version}`,
        parentId: clienteId,
        drive: this.drive,
      });
      result.contratoDriveId = id;
      result.contratoDriveLink = link;
    }
    if (input.contratoPdf) {
      await this.uploadPdf(`contrato-v${input.version}.pdf`, input.contratoPdf, clienteId);
    }

    await this.uploadJson(`dados-input-v${input.version}.json`, input.dadosInputJson, clienteId);

    return result;
  }
}
