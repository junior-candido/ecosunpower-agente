// Upload de propostas pro Google Drive.
// Reusa OAuth do CalendarService (mesmo refresh_token, mesma conta).
// IMPORTANTE: o refresh_token precisa incluir scope drive.file alem de calendar.
// Se faltar, regenerar via OAuth Playground adicionando https://www.googleapis.com/auth/drive.file.

import { google, drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';

export interface UploadProposalInput {
  nomeCliente: string;
  numeroProposta: string;
  pdfBuffer: Buffer;
  htmlContent: string;
  inputDataJson: string; // dados de input pra regerar depois
  rootFolderName?: string; // default "EcoSunPower / Propostas"
  shareWithEmail?: string; // se setado, compartilha read-only com este email
}

export interface UploadProposalResult {
  folderId: string;
  pdfId: string;
  pdfWebViewLink: string;
  htmlId: string;
  htmlWebViewLink: string;
}

export class DriveUploader {
  private oauth: OAuth2Client;
  private drive: drive_v3.Drive;

  constructor(opts: { clientId: string; clientSecret: string; refreshToken: string }) {
    this.oauth = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
    this.oauth.setCredentials({ refresh_token: opts.refreshToken });
    this.drive = google.drive({ version: 'v3', auth: this.oauth });
  }

  // Encontra ou cria pasta com nome dado. Retorna ID.
  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    // Procura primeiro
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
      fields: 'id',
    });
    if (!created.data.id) throw new Error(`Falha ao criar pasta ${name}`);
    return created.data.id;
  }

  async uploadProposal(input: UploadProposalInput): Promise<UploadProposalResult> {
    const root = input.rootFolderName ?? 'EcoSunPower';

    // Cria estrutura de pastas: EcoSunPower / Propostas / 2026 / [Nome Cliente]
    const ano = new Date().getFullYear().toString();
    const rootFolderId = await this.getOrCreateFolder(root);
    const propostasFolderId = await this.getOrCreateFolder('Propostas', rootFolderId);
    const anoFolderId = await this.getOrCreateFolder(ano, propostasFolderId);
    const clienteFolderId = await this.getOrCreateFolder(input.nomeCliente, anoFolderId);

    // Pasta separada _internal pra dados sensiveis (input JSON com tarifa/custo/fator).
    // Cliente NUNCA recebe acesso a essa pasta — fica so pro Junior.
    const internalFolderId = await this.getOrCreateFolder('_internal', clienteFolderId);

    // Nome dos arquivos
    const dataStr = new Date().toISOString().slice(0, 10);
    const pdfName = `Proposta-${input.numeroProposta}-${dataStr}.pdf`;
    const htmlName = `Proposta-${input.numeroProposta}-${dataStr}.html`;
    const dataName = `dados-${input.numeroProposta}.json`;

    // Uploads em paralelo (PDF cliente + HTML cliente + JSON interno).
    const [pdfRes, htmlRes] = await Promise.all([
      this.drive.files.create({
        requestBody: { name: pdfName, parents: [clienteFolderId] },
        media: { mimeType: 'application/pdf', body: Readable.from(input.pdfBuffer) },
        fields: 'id, webViewLink',
      }),
      this.drive.files.create({
        requestBody: { name: htmlName, parents: [clienteFolderId] },
        media: { mimeType: 'text/html', body: input.htmlContent },
        fields: 'id, webViewLink',
      }),
      // JSON com dados internos vai pra pasta _internal, NAO compartilhada com cliente
      this.drive.files.create({
        requestBody: { name: dataName, parents: [internalFolderId] },
        media: { mimeType: 'application/json', body: input.inputDataJson },
        fields: 'id',
      }),
    ]);

    // Compartilhamento granular: APENAS PDF e HTML com o cliente, nunca a pasta.
    // Pasta tem dados sensiveis (_internal/dados-*.json) que cliente NAO pode ver.
    if (input.shareWithEmail) {
      const sharePromises = [
        this.drive.permissions.create({
          fileId: pdfRes.data.id!,
          requestBody: { type: 'user', role: 'reader', emailAddress: input.shareWithEmail },
          sendNotificationEmail: false,
        }),
        this.drive.permissions.create({
          fileId: htmlRes.data.id!,
          requestBody: { type: 'user', role: 'reader', emailAddress: input.shareWithEmail },
          sendNotificationEmail: false,
        }),
      ];
      const results = await Promise.allSettled(sharePromises);
      results.forEach(r => {
        if (r.status === 'rejected') {
          console.warn(`[drive-uploader] Falha ao compartilhar arquivo com ${input.shareWithEmail}:`, r.reason);
        }
      });
    }

    // Tenta disponibilizar PDF e HTML por link publico (anyone with link).
    // Se Workspace tem politica DLP que bloqueia, falha silenciosamente — fallback eh
    // o share direto com email (acima) OU acesso interno via Junior.
    const anyonePromises = [
      this.drive.permissions.create({
        fileId: pdfRes.data.id!,
        requestBody: { type: 'anyone', role: 'reader' },
      }),
      this.drive.permissions.create({
        fileId: htmlRes.data.id!,
        requestBody: { type: 'anyone', role: 'reader' },
      }),
    ];
    const anyoneResults = await Promise.allSettled(anyonePromises);
    anyoneResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        const tipo = i === 0 ? 'PDF' : 'HTML';
        console.warn(`[drive-uploader] Falha ao tornar ${tipo} publico (DLP do Workspace?):`, r.reason);
      }
    });

    return {
      folderId: clienteFolderId,
      pdfId: pdfRes.data.id!,
      pdfWebViewLink: pdfRes.data.webViewLink!,
      htmlId: htmlRes.data.id!,
      htmlWebViewLink: htmlRes.data.webViewLink!,
    };
  }
}
