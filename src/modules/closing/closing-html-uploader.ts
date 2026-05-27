// src/modules/closing/closing-html-uploader.ts
// Funcao pura: sobe HTML no Drive forcando conversao pra Google Doc.
// O Drive auto-converte HTML em Doc preservando h1/h2/p/strong/ul.
// Usada pelo closing-drive.ts pra gerar Doc eSignature-ready.

import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface UploadHtmlAsGoogleDocInput {
  html: string;
  name: string;        // nome do arquivo no Drive (sem extensao)
  parentId: string;    // id da pasta destino
  drive: drive_v3.Drive;
}

export interface UploadHtmlAsGoogleDocResult {
  id: string;
  link: string;
}

export async function uploadHtmlAsGoogleDoc(input: UploadHtmlAsGoogleDocInput): Promise<UploadHtmlAsGoogleDocResult> {
  const res = await input.drive.files.create({
    requestBody: {
      name: input.name,
      // requestBody.mimeType = google-apps.document FORCA conversao.
      // media.mimeType = text/html descreve o que enviamos.
      mimeType: 'application/vnd.google-apps.document',
      parents: [input.parentId],
    },
    media: {
      mimeType: 'text/html',
      body: Readable.from(Buffer.from(input.html, 'utf-8')),
    },
    fields: 'id, webViewLink',
  });
  if (!res.data.id) throw new Error('uploadHtmlAsGoogleDoc: Drive nao retornou id');
  return { id: res.data.id, link: res.data.webViewLink ?? '' };
}
