// banner-renderer.ts
// Renderiza banners promocionais EcoSunPower (estilo Mega Oferta de Fevereiro)
// usando satori (JSX -> SVG) + @resvg/resvg-js (SVG -> PNG).
//
// Sem Chrome, sem Puppeteer. Memoria ~50MB, render ~200-500ms.
// Fontes via Google Fonts CDN, cache em memoria (1 fetch na vida do container).

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

// =========================================================================
// FONTES — cache em memoria (fetch 1x do Google Fonts CDN)
// =========================================================================

interface FontCache {
  regular: ArrayBuffer | null;
  bold: ArrayBuffer | null;
  black: ArrayBuffer | null;
}
const fontCache: FontCache = { regular: null, bold: null, black: null };

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch fonte ${url} falhou: HTTP ${r.status}`);
  return await r.arrayBuffer();
}

async function loadFonts(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 900; style: 'normal' }[]> {
  if (!fontCache.regular || !fontCache.bold || !fontCache.black) {
    // Montserrat via jsdelivr @fontsource — CDN estavel, sem 404
    const BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.18/files';
    const [r, b, k] = await Promise.all([
      fetchFont(`${BASE}/montserrat-latin-400-normal.woff`),
      fetchFont(`${BASE}/montserrat-latin-700-normal.woff`),
      fetchFont(`${BASE}/montserrat-latin-900-normal.woff`),
    ]);
    fontCache.regular = r;
    fontCache.bold = b;
    fontCache.black = k;
    console.log('[banner-renderer] fontes Montserrat carregadas e cacheadas');
  }
  return [
    { name: 'Montserrat', data: fontCache.regular!, weight: 400, style: 'normal' },
    { name: 'Montserrat', data: fontCache.bold!, weight: 700, style: 'normal' },
    { name: 'Montserrat', data: fontCache.black!, weight: 900, style: 'normal' },
  ];
}

// =========================================================================
// ASSETS LOCAIS — fallback gracioso se arquivo nao existir
// =========================================================================

const ASSETS_DIR = path.resolve(process.cwd(), 'assets/banner');
const assetCache = new Map<string, string | null>(); // filename -> data URL ou null se nao existe

function loadAssetAsDataUrl(filename: string): string | null {
  if (assetCache.has(filename)) return assetCache.get(filename) ?? null;
  const full = path.join(ASSETS_DIR, filename);
  try {
    const buf = fs.readFileSync(full);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    assetCache.set(filename, dataUrl);
    console.log(`[banner-renderer] asset carregado: ${filename} (${Math.round(buf.length / 1024)}KB)`);
    return dataUrl;
  } catch (err) {
    assetCache.set(filename, null);
    console.log(`[banner-renderer] asset NAO encontrado (fallback gracioso): ${filename}`);
    return null;
  }
}

// =========================================================================
// PARAMETROS DO BANNER
// =========================================================================

export interface BannerMegaOfertaInput {
  titulo: string;              // ex: "MEGA OFERTA DE FEVEREIRO"
  subtitulo?: string;          // ex: "Aproveite essas unidades com preço baixo!"
  descricao?: string;          // ex: "Garanta já a sua energia solar de qualidade por preço baixo!"
  kit_placas: number;          // ex: 12
  kwh_mes: number;             // ex: 900
  preco_brl: number;           // ex: 17354.32
  cta_text?: string;           // ex: "Faça já o seu orçamento GRÁTIS"
  marca_modulo?: string;       // ex: "LONGi Hi-MO X10"
  marca_inversor?: string;     // ex: "Sungrow SG10RT"
  tipo_inversor?: 'micro' | 'string' | 'otimizado' | string;  // microinversor / string / otimizado (SolarEdge)
  tipo_estrutura?: string;     // ex: "Telhado cerâmico", "Solo", "Laje", "Carport"
  width?: number;              // default 1080 (feed Instagram/Facebook)
  height?: number;             // default 1350 (4:5 vertical)
}

// =========================================================================
// HELPER: formata preco BRL
// =========================================================================

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =========================================================================
// TEMPLATE JSX -> SVG -> PNG
// =========================================================================

export async function renderBannerMegaOferta(input: BannerMegaOfertaInput): Promise<Buffer> {
  const {
    titulo,
    subtitulo = 'Aproveite essas unidades com preço baixo!',
    descricao = 'Garanta já a sua energia solar de qualidade por preço baixo!',
    kit_placas,
    kwh_mes,
    preco_brl,
    cta_text = 'Faça já o seu orçamento GRÁTIS',
    marca_modulo,
    marca_inversor,
    tipo_inversor,
    tipo_estrutura,
    width = 1080,
    height = 1350,
  } = input;

  // Linha tecnica abaixo do kit (ex: "LONGi · Sungrow string · Telhado cerâmico")
  const techParts: string[] = [];
  if (marca_modulo) techParts.push(marca_modulo);
  if (marca_inversor) {
    const tipoLabel = tipo_inversor === 'micro' ? 'micro' :
                       tipo_inversor === 'otimizado' ? 'otimizado' :
                       tipo_inversor === 'string' ? 'string' :
                       tipo_inversor ?? '';
    techParts.push(tipoLabel ? `${marca_inversor} ${tipoLabel}` : marca_inversor);
  }
  if (tipo_estrutura) techParts.push(tipo_estrutura);
  const techLine = techParts.join(' · ');

  const fonts = await loadFonts();
  const inversorPng = loadAssetAsDataUrl('inversor.png');
  const logoPng = loadAssetAsDataUrl('logo-ecosunpower.png');

  // Bolinhas amarelas decorativas (estilo "moedas/sol" do banner original).
  // 10 bolinhas em tamanhos variados pra dar mais profundidade visual.
  const decorativeDots = [
    { top: 80,   left: 60,   size: 78, opacity: 0.95 },
    { top: 200,  left: 950,  size: 42, opacity: 0.7 },
    { top: 360,  left: 50,   size: 32, opacity: 0.6 },
    { top: 480,  left: 960,  size: 28, opacity: 0.55 },
    { top: 720,  left: 70,   size: 52, opacity: 0.8 },
    { top: 820,  left: 1000, size: 36, opacity: 0.65 },
    { top: 1080, left: 920,  size: 62, opacity: 0.9 },
    { top: 1180, left: 100,  size: 46, opacity: 0.8 },
    { top: 1260, left: 700,  size: 24, opacity: 0.5 },
    { top: 1290, left: 280,  size: 32, opacity: 0.6 },
  ];

  // Layout JSX — replica o banner Mega Oferta:
  // - Fundo: gradiente navy escuro
  // - Decoracao: bolinhas amarelas espalhadas
  // - Faixa amarela no topo com titulo gigante
  // - Subtitulo + descricao em branco
  // - Card branco central: kit + kWh + preco
  // - Rodape: marca + CTA
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a1f3d 0%, #1a3a5c 100%)',
          fontFamily: 'Montserrat',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Decoracao: bolinhas amarelas (moedas/sol)
          ...decorativeDots.map((d, idx) => ({
            type: 'div',
            key: `dot-${idx}`,
            props: {
              style: {
                position: 'absolute',
                top: d.top,
                left: d.left,
                width: d.size,
                height: d.size,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #ffd23f 0%, #f59e0b 100%)',
                opacity: d.opacity,
                boxShadow: `0 0 ${d.size}px rgba(255, 210, 63, 0.4)`,
                display: 'flex',
              },
            },
          })),


          // FAIXA AMARELA com titulo (parte de cima do card amarelo)
          {
            type: 'div',
            props: {
              style: {
                margin: '60px 50px 0 50px',
                background: 'linear-gradient(180deg, #ffd23f 0%, #fbbf24 100%)',
                borderRadius: 24,
                padding: '40px 40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                zIndex: 2,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 900,
                      fontSize: 92,
                      lineHeight: 1,
                      color: '#0a1f3d',
                      textAlign: 'center',
                      letterSpacing: '-2px',
                      textTransform: 'uppercase',
                      display: 'flex',
                    },
                    children: titulo,
                  },
                },
              ],
            },
          },

          // SUBTITULO + DESCRICAO (em branco, abaixo da faixa)
          {
            type: 'div',
            props: {
              style: {
                margin: '30px 60px 0 60px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                zIndex: 2,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 700,
                      fontSize: 42,
                      lineHeight: 1.15,
                      color: '#ffffff',
                      display: 'flex',
                    },
                    children: subtitulo,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 400,
                      fontSize: 26,
                      lineHeight: 1.3,
                      color: '#cbd5e1',
                      display: 'flex',
                    },
                    children: descricao,
                  },
                },
              ],
            },
          },

          // CARD BRANCO CENTRAL: foto inversor + kit + kWh + preco
          {
            type: 'div',
            props: {
              style: {
                margin: '40px 80px 0 80px',
                background: '#ffffff',
                borderRadius: 28,
                padding: '30px 50px 40px 50px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
                zIndex: 2,
              },
              children: [
                // Foto do inversor (protagonista) — topo do card, centralizada
                ...(inversorPng ? [{
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      height: 260,
                    },
                    children: {
                      type: 'img',
                      props: {
                        src: inversorPng,
                        height: 260,
                        style: { objectFit: 'contain', display: 'flex' },
                      },
                    },
                  },
                }] : []),
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 700,
                      fontSize: 38,
                      color: '#0a1f3d',
                      textAlign: 'center',
                      lineHeight: 1.1,
                      display: 'flex',
                      justifyContent: 'center',
                    },
                    children: `Kit ${kit_placas} placas Fotovoltaicas`,
                  },
                },
                ...(techLine ? [{
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 400,
                      fontSize: 22,
                      color: '#475569',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      display: 'flex',
                      justifyContent: 'center',
                    },
                    children: techLine,
                  },
                }] : []),
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 900,
                      fontSize: 80,
                      color: '#fbbf24',
                      textAlign: 'center',
                      lineHeight: 1,
                      letterSpacing: '-2px',
                      display: 'flex',
                      justifyContent: 'center',
                    },
                    children: `${kwh_mes} kWh/mês`,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '100%',
                      height: 2,
                      background: '#e5e7eb',
                      display: 'flex',
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 400,
                      fontSize: 28,
                      color: '#64748b',
                      textAlign: 'center',
                      display: 'flex',
                      justifyContent: 'center',
                    },
                    children: 'Por apenas:',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 900,
                      fontSize: 72,
                      color: '#0a1f3d',
                      textAlign: 'center',
                      lineHeight: 1,
                      letterSpacing: '-1px',
                      display: 'flex',
                      justifyContent: 'center',
                    },
                    children: `R$ ${formatBRL(preco_brl)}`,
                  },
                },
              ],
            },
          },

          // RODAPE: marca + CTA
          {
            type: 'div',
            props: {
              style: {
                marginTop: 'auto',
                marginBottom: 50,
                marginLeft: 80,
                marginRight: 80,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                zIndex: 2,
              },
              children: [
                logoPng
                  ? {
                      type: 'img',
                      props: {
                        src: logoPng,
                        height: 80,
                        style: { objectFit: 'contain', display: 'flex' },
                      },
                    }
                  : {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Montserrat',
                          fontWeight: 900,
                          fontSize: 44,
                          color: '#fbbf24',
                          letterSpacing: '1px',
                          display: 'flex',
                        },
                        children: 'EcoSunPower',
                      },
                    },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 700,
                      fontSize: 30,
                      color: '#ffffff',
                      textAlign: 'center',
                      display: 'flex',
                    },
                    children: cta_text,
                  },
                },
              ],
            },
          },

          // Cifrao "$" gigante no canto superior esquerdo — POR ULTIMO pra
          // renderizar por cima da faixa amarela (satori ignora z-index).
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 30,
                left: 30,
                width: 130,
                height: 130,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #ffd23f 0%, #f59e0b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 60px rgba(255, 210, 63, 0.6), inset 0 -8px 16px rgba(0,0,0,0.15)',
              },
              children: {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Montserrat',
                    fontWeight: 900,
                    fontSize: 90,
                    color: '#0a1f3d',
                    lineHeight: 1,
                    display: 'flex',
                  },
                  children: '$',
                },
              },
            },
          },
        ],
      },
    },
    { width, height, fonts },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}
