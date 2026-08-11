// Radar de propostas do SITE (beacon GIF) — testes da lógica pura.
// Página estática carrega GET /sp/:token.gif → registramos a visita e
// avisamos o Junior no zap (1ª abertura na hora; revisitas com folga).
import { describe, it, expect } from 'vitest';
import {
  processarBatida,
  criarEstado,
  resumirDispositivo,
  GIF_1PX,
} from '../src/modules/site-proposta-beacon.js';

const REGISTRO_TESTE = {
  tok_augusto: { slug: 'augusto-costa', nome: 'Augusto' },
  tok_pedro: { slug: 'pedro-henrique', nome: 'Pedro Henrique' },
};

const T0 = 1_700_000_000_000;
const UA_CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126';

function batida(estado: ReturnType<typeof criarEstado>, extra?: Partial<{
  token: string; ip: string; userAgent: string | null; agoraMs: number;
}>) {
  return processarBatida(
    {
      token: 'tok_augusto',
      ip: '1.2.3.4',
      userAgent: UA_CEL,
      agoraMs: T0,
      ...extra,
    },
    estado,
    REGISTRO_TESTE,
  );
}

describe('site-proposta-beacon', () => {
  it('token desconhecido: ignora sem zap (e sem vazar validade)', () => {
    const estado = criarEstado();
    const r = batida(estado, { token: 'nao-existe' });
    expect(r.status).toBe('desconhecida');
    expect(r.zap).toBeUndefined();
  });

  it('1ª abertura: registra e manda zap na hora com nome e dispositivo', () => {
    const estado = criarEstado();
    const r = batida(estado);
    expect(r.status).toBe('ok');
    expect(r.slug).toBe('augusto-costa');
    expect(r.zap).toContain('Augusto');
    expect(r.zap).toContain('ABRIU');
    expect(r.zap).toContain('celular');
  });

  it('revisita dentro da folga de 5 min: conta mas NÃO manda zap de novo', () => {
    const estado = criarEstado();
    batida(estado);
    const r = batida(estado, { agoraMs: T0 + 60_000 });
    expect(r.status).toBe('ok');
    expect(r.zap).toBeUndefined();
  });

  it('revisita após a folga: zap de "voltou" com nº da visita', () => {
    const estado = criarEstado();
    batida(estado);
    batida(estado, { agoraMs: T0 + 60_000 });
    const r = batida(estado, { agoraMs: T0 + 6 * 60_000, userAgent: UA_PC });
    expect(r.status).toBe('ok');
    expect(r.zap).toContain('voltou');
    expect(r.zap).toContain('3ª');
    expect(r.zap).toContain('computador');
  });

  it('propostas diferentes têm contadores e folgas independentes', () => {
    const estado = criarEstado();
    batida(estado);
    const r = batida(estado, { token: 'tok_pedro', agoraMs: T0 + 1000 });
    expect(r.status).toBe('ok');
    expect(r.zap).toContain('Pedro Henrique');
    expect(r.zap).toContain('ABRIU');
  });

  it('rate limit por IP: para de contar após o teto na janela de 1h', () => {
    const estado = criarEstado();
    for (let i = 0; i < 30; i++) {
      expect(batida(estado, { agoraMs: T0 + i * 1000 }).status).toBe('ok');
    }
    const r = batida(estado, { agoraMs: T0 + 31_000 });
    expect(r.status).toBe('limitada');
    // e a janela expira: 1h depois volta a aceitar
    const r2 = batida(estado, { agoraMs: T0 + 61 * 60_000 });
    expect(r2.status).toBe('ok');
  });

  it('resumirDispositivo: celular × computador × desconhecido', () => {
    expect(resumirDispositivo(UA_CEL)).toContain('celular');
    expect(resumirDispositivo(UA_PC)).toContain('computador');
    expect(resumirDispositivo(null)).toContain('desconhecido');
  });

  it('GIF de 1px é um GIF de verdade', () => {
    expect(GIF_1PX.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  });
});
