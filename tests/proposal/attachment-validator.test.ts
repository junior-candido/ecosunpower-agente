import { describe, it, expect } from 'vitest';
import {
  validateFotoUpload,
  validateVideoUpload,
  validateAttachmentCount,
} from '../../src/modules/proposal/attachments/attachment-validator.js';

describe('attachment-validator', () => {
  describe('validateFotoUpload', () => {
    it('aceita JPG dentro do limite', () => {
      const r = validateFotoUpload({ mimeType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 });
      expect(r.ok).toBe(true);
    });

    it('aceita PNG e WEBP', () => {
      expect(validateFotoUpload({ mimeType: 'image/png', sizeBytes: 1024 }).ok).toBe(true);
      expect(validateFotoUpload({ mimeType: 'image/webp', sizeBytes: 1024 }).ok).toBe(true);
    });

    it('rejeita PDF', () => {
      const r = validateFotoUpload({ mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/formato/i);
    });

    it('rejeita JPG > 10MB', () => {
      const r = validateFotoUpload({ mimeType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/10MB|tamanho/i);
    });
  });

  describe('validateVideoUpload', () => {
    it('aceita MP4 30MB e 60s', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 30 * 1024 * 1024,
        durationSeconds: 60,
      });
      expect(r.ok).toBe(true);
    });

    it('rejeita vídeo 61s', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 10 * 1024 * 1024,
        durationSeconds: 61,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/60s|duração/i);
    });

    it('rejeita vídeo > 30MB', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 31 * 1024 * 1024,
        durationSeconds: 30,
      });
      expect(r.ok).toBe(false);
    });

    it('rejeita formato MOV', () => {
      const r = validateVideoUpload({
        mimeType: 'video/quicktime',
        sizeBytes: 1024 * 1024,
        durationSeconds: 10,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('validateAttachmentCount', () => {
    it('aceita 3ª foto quando há 2', () => {
      const r = validateAttachmentCount({ fotoCount: 2, videoCount: 0, novoTipo: 'foto' });
      expect(r.ok).toBe(true);
    });

    it('rejeita 4ª foto', () => {
      const r = validateAttachmentCount({ fotoCount: 3, videoCount: 0, novoTipo: 'foto' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/3 fotos/i);
    });

    it('aceita 1º vídeo', () => {
      const r = validateAttachmentCount({ fotoCount: 0, videoCount: 0, novoTipo: 'video' });
      expect(r.ok).toBe(true);
    });

    it('rejeita 2º vídeo', () => {
      const r = validateAttachmentCount({ fotoCount: 0, videoCount: 1, novoTipo: 'video' });
      expect(r.ok).toBe(false);
    });
  });
});
