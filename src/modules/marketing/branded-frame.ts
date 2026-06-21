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

type Logo = { dataUrl: string; w: number; h: number };
let logoCache: Logo | null = null;
let defaultLogoFailed = false; // evita logar/reler toda hora se a logo padrão sumir

// Carrega a logo. Devolve null (em vez de lançar) se o arquivo não existir, pra
// não derrubar a geração do post por causa de um asset faltando no container.
// O caminho é injetável pra teste; só o caminho padrão é cacheado.
function loadLogo(logoPath: string = LOGO_PATH): Logo | null {
  const isDefault = logoPath === LOGO_PATH;
  if (isDefault && logoCache) return logoCache;
  if (isDefault && defaultLogoFailed) return null;
  try {
    const buf = fs.readFileSync(logoPath);
    const { width, height } = pngSize(buf);
    const logo: Logo = { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w: width, h: height };
    if (isDefault) logoCache = logo;
    return logo;
  } catch (err) {
    if (isDefault) defaultLogoFailed = true;
    console.warn(`[branded-frame] logo não carregada (${logoPath}): ${(err as Error).message}; o post sai SEM logo`);
    return null;
  }
}

export interface BrandLogoOptions {
  width?: number;       // canvas final (default 1080)
  height?: number;      // canvas final (default 1350)
  logoWidth?: number;   // largura da logo (default 460)
  padding?: number;     // margem da logo até a borda (default 50)
  logoPath?: string;    // override do caminho da logo (default LOGO_PATH; usado em teste)
}

// Recebe a imagem (Buffer JPG/PNG) e devolve PNG com a logo aplicada no canto.
export function applyBrandLogo(image: Buffer, opts: BrandLogoOptions = {}): Buffer {
  const W = opts.width ?? DEFAULT_W;
  const H = opts.height ?? DEFAULT_H;
  const logoW = opts.logoWidth ?? 460;
  const pad = opts.padding ?? 50;

  const logo = loadLogo(opts.logoPath);
  const imgDataUrl = `data:${detectMime(image)};base64,${image.toString('base64')}`;

  // Camada da logo (canto inferior direito). Se a logo não carregou, sai vazia —
  // o post ainda sai, só sem a marca, em vez de quebrar a geração inteira.
  let logoLayer = '';
  if (logo) {
    const logoH = Math.round((logoW * logo.h) / logo.w);
    logoLayer = `<image x="${W - logoW - pad}" y="${H - logoH - pad}" width="${logoW}" height="${logoH}" href="${logo.dataUrl}"/>`;
  }

  // preserveAspectRatio="xMidYMid slice" = objectFit cover (preenche sem distorcer).
  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<image x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" href="${imgDataUrl}"/>` +
    logoLayer +
    `</svg>`;

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return Buffer.from(png);
}
