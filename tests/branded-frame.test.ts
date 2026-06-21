import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { applyBrandLogo } from '../src/modules/marketing/branded-frame.js';

// Gera um PNG sólido (sem depender de sharp) pra servir de "foto" de entrada.
function solidPng(w: number, h: number, color: string): Buffer {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function isPng(buf: Buffer) {
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

describe('branded-frame', () => {
  it('devolve PNG válido nas dimensões 4:5 padrão (1080x1350)', () => {
    const foto = solidPng(800, 1000, '#3366cc');
    const out = applyBrandLogo(foto);
    expect(isPng(out)).toBe(true);
    expect(pngSize(out)).toEqual({ width: 1080, height: 1350 });
  });

  it('respeita dimensões customizadas', () => {
    const foto = solidPng(500, 500, '#222222');
    const out = applyBrandLogo(foto, { width: 1080, height: 1080 });
    expect(pngSize(out)).toEqual({ width: 1080, height: 1080 });
  });

  it('aceita JPEG de entrada (detecção por magic bytes)', () => {
    // resvg só exporta PNG; simulamos um "buffer JPEG" começando com FF D8.
    // applyBrandLogo deve montar o data URL como image/jpeg sem quebrar a montagem do SVG.
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), solidPng(10, 10, '#fff')]);
    const out = applyBrandLogo(fakeJpeg);
    expect(isPng(out)).toBe(true);
    expect(pngSize(out)).toEqual({ width: 1080, height: 1350 });
  });

  // Blindagem: se o asset da logo faltar (ex: não shippado no container), a geração
  // do post NÃO pode quebrar — sai a imagem normalizada SEM logo, em vez de lançar.
  it('logo ausente: devolve a imagem 4:5 sem logo, sem lançar', () => {
    const foto = solidPng(800, 1000, '#3366cc');
    expect(() => applyBrandLogo(foto, { logoPath: '/nao/existe/logo-x.png' })).not.toThrow();
    const out = applyBrandLogo(foto, { logoPath: '/nao/existe/logo-x.png' });
    expect(isPng(out)).toBe(true);
    expect(pngSize(out)).toEqual({ width: 1080, height: 1350 });
  });
});
