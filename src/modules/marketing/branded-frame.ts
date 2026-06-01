// Aplica a logo EcoSunPower numa imagem (canto inferior direito, grande).
// Usa @resvg/resvg-js (já no projeto) compondo um SVG com a foto de fundo + a logo
// sobreposta. Sem depender de `sharp` (que é opcional/instável no Docker).
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const DEFAULT_W = 1080;
const DEFAULT_H = 1350; // 4:5 (feed Instagram/Facebook)
const LOGO_PATH = path.resolve(process.cwd(), 'assets/banner/logo-ecosunpower-1024-transparente.png');

// Lê width/height do header IHDR de um PNG (offsets 16 e 20, big-endian).
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Detecta mime pela assinatura (magic bytes) — não confia em extensão.
function detectMime(buf: Buffer): 'image/png' | 'image/jpeg' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  return 'image/jpeg'; // FF D8 (JPEG) e fallback
}

let logoCache: { dataUrl: string; w: number; h: number } | null = null;
function loadLogo(): { dataUrl: string; w: number; h: number } {
  if (logoCache) return logoCache;
  const buf = fs.readFileSync(LOGO_PATH);
  const { width, height } = pngSize(buf);
  logoCache = { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w: width, h: height };
  return logoCache;
}

export interface BrandLogoOptions {
  width?: number;       // canvas final (default 1080)
  height?: number;      // canvas final (default 1350)
  logoWidth?: number;   // largura da logo (default 460)
  padding?: number;     // margem da logo até a borda (default 50)
}

// Recebe a imagem (Buffer JPG/PNG) e devolve PNG com a logo aplicada no canto.
export function applyBrandLogo(image: Buffer, opts: BrandLogoOptions = {}): Buffer {
  const W = opts.width ?? DEFAULT_W;
  const H = opts.height ?? DEFAULT_H;
  const logoW = opts.logoWidth ?? 460;
  const pad = opts.padding ?? 50;

  const logo = loadLogo();
  const logoH = Math.round((logoW * logo.h) / logo.w);
  const imgDataUrl = `data:${detectMime(image)};base64,${image.toString('base64')}`;

  // preserveAspectRatio="xMidYMid slice" = objectFit cover (preenche sem distorcer).
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<image x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" href="${imgDataUrl}"/>` +
    `<image x="${W - logoW - pad}" y="${H - logoH - pad}" width="${logoW}" height="${logoH}" href="${logo.dataUrl}"/>` +
    `</svg>`;

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return Buffer.from(png);
}
