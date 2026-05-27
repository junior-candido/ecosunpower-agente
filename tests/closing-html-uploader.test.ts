import { describe, it, expect, vi } from 'vitest';
import { uploadHtmlAsGoogleDoc } from '../src/modules/closing/closing-html-uploader.js';

function makeMockDrive(returnId: string, returnLink: string) {
  const createCalls: any[] = [];
  return {
    files: {
      create: vi.fn(async (args: any) => {
        createCalls.push(args);
        return { data: { id: returnId, webViewLink: returnLink } };
      }),
    },
    __createCalls: createCalls,
  };
}

describe('uploadHtmlAsGoogleDoc', () => {
  it('faz upload com mimeType text/html e forca conversao pra Google Doc', async () => {
    const drive: any = makeMockDrive('doc-id-123', 'https://docs.google.com/document/d/doc-id-123/edit');
    const result = await uploadHtmlAsGoogleDoc({
      html: '<h1>Hello</h1>',
      name: 'Procuracao Fernanda - v1',
      parentId: 'folder-abc',
      drive,
    });
    expect(result).toEqual({ id: 'doc-id-123', link: 'https://docs.google.com/document/d/doc-id-123/edit' });
    expect(drive.__createCalls).toHaveLength(1);
    const call = drive.__createCalls[0];
    expect(call.media.mimeType).toBe('text/html');
    expect(call.requestBody.name).toBe('Procuracao Fernanda - v1');
    expect(call.requestBody.parents).toEqual(['folder-abc']);
    expect(call.requestBody.mimeType).toBe('application/vnd.google-apps.document');
  });

  it('lanca erro se Drive nao retornar id', async () => {
    const drive: any = {
      files: { create: vi.fn(async () => ({ data: {} })) },
    };
    await expect(uploadHtmlAsGoogleDoc({
      html: '<p>x</p>', name: 'x', parentId: 'p', drive,
    })).rejects.toThrow(/upload/i);
  });
});
