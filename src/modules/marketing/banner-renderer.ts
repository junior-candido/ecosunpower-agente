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

// Sharp eh opcional — usado so pra converter WebP/GIF -> PNG no banner.
// Se nao disponivel (binario Linux ausente em alguns Dockers), banner ainda
// funciona desde que assets sejam PNG/JPEG reais.
type SharpFn = (input: Buffer) => { png(): { toBuffer(): Promise<Buffer> } };
let sharpFn: SharpFn | null = null;
let sharpAttempted = false;

async function getSharp(): Promise<SharpFn | null> {
  if (sharpAttempted) return sharpFn;
  sharpAttempted = true;
  try {
    const mod = await import('sharp');
    sharpFn = (mod.default ?? mod) as unknown as SharpFn;
    console.log('[banner-renderer] sharp disponivel — converte WebP/GIF -> PNG');
  } catch (err) {
    console.warn('[banner-renderer] sharp NAO disponivel — WebP/GIF nao serao convertidos:', (err as Error).message);
    sharpFn = null;
  }
  return sharpFn;
}

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
const assetCache = new Map<string, string | null>(); // basename (sem ext) -> data URL ou null

// Detecta o mime real do arquivo pelos magic bytes do header (nao confia na extensao).
function detectMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  // WebP: RIFF????WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  // GIF: GIF8
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { mime: 'image/gif', ext: 'gif' };
  return null;
}

// Extrai TODAS palavras alfabeticas com 2+ letras da marca, em ordem.
// Ex: "JA Solar 590W" -> ["ja", "solar"]; "Risen 700W HJT" -> ["risen", "hjt"].
function extractMarcaKeys(marca: string | undefined): string[] {
  if (!marca) return [];
  const normalized = marca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return normalized.match(/[a-z]{2,}/g) ?? [];
}

// Resolve qual arquivo carregar baseado em (categoria, marca).
// Tenta cada "palavra" da marca como key, com separador hifen OU ponto:
//   "Hoymiles 2,25 kW" -> tenta inversor-hoymiles.png, inversor.hoymiles.png
//   "JA Solar 590W" -> tenta inversor-ja.png, inversor.ja.png, depois solar...
// Fallback pro arquivo generico (modulo.png ou inversor.png).
async function findAssetByMarca(categoria: 'modulo' | 'inversor' | 'logo', marca?: string): Promise<string | null> {
  const keys = extractMarcaKeys(marca);
  for (const key of keys) {
    // Tenta separador hifen (recomendado) primeiro, depois ponto (tolerancia)
    const hyphen = await loadAssetAsDataUrl(`${categoria}-${key}.png`);
    if (hyphen) return hyphen;
    const dot = await loadAssetAsDataUrl(`${categoria}.${key}.png`);
    if (dot) return dot;
  }
  // Fallback pro arquivo generico
  return await loadAssetAsDataUrl(`${categoria}.png`);
}

// Carrega asset por basename (sem extensao). Tenta .png, .jpg, .jpeg, .webp na pasta.
// Detecta mime real pelos magic bytes. Converte WebP/GIF -> PNG via sharp pq
// satori nao suporta WebP. Cacheia resultado convertido em memoria.
async function loadAssetAsDataUrl(basenameOrFile: string): Promise<string | null> {
  const baseKey = basenameOrFile.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '');
  if (assetCache.has(baseKey)) return assetCache.get(baseKey) ?? null;

  const candidates = [basenameOrFile, `${baseKey}.png`, `${baseKey}.jpg`, `${baseKey}.jpeg`, `${baseKey}.webp`];
  for (const filename of candidates) {
    const full = path.join(ASSETS_DIR, filename);
    try {
      let buf: Buffer = fs.readFileSync(full);
      let detected = detectMime(buf);
      if (!detected) continue;
      // Satori suporta PNG e JPEG. WebP/GIF nao — converte pra PNG via sharp.
      // Sharp e opcional (optionalDependencies). Se ausente, retorna o WebP sem
      // converter e satori vai falhar — fallback: pular asset.
      if (detected.mime === 'image/webp' || detected.mime === 'image/gif') {
        const s = await getSharp();
        if (!s) {
          console.warn(`[banner-renderer] sharp indisponivel, pulando ${filename} (WebP/GIF nao convertido)`);
          continue;
        }
        // Buffer.from normaliza Buffer<NonSharedBufferLike> de sharp pra Buffer
        // generico (evita erro TS de SharedArrayBuffer vs ArrayBuffer).
        const converted = await s(buf).png().toBuffer();
        buf = Buffer.from(converted);
        detected = { mime: 'image/png', ext: 'png' };
        console.log(`[banner-renderer] convertido WebP/GIF -> PNG: ${filename}`);
      }
      const dataUrl = `data:${detected.mime};base64,${buf.toString('base64')}`;
      assetCache.set(baseKey, dataUrl);
      console.log(`[banner-renderer] asset carregado: ${filename} -> ${detected.mime} (${Math.round(buf.length / 1024)}KB)`);
      return dataUrl;
    } catch {
      // tenta proxima candidata
    }
  }
  assetCache.set(baseKey, null);
  console.log(`[banner-renderer] asset NAO encontrado (fallback gracioso): ${baseKey}`);
  return null;
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
  financiamento?: string;      // default "BV ou Santander · 24x no cartao". String vazia esconde.
  parcelamento?: string;       // default "Fale com a gente pra melhor taxa". String vazia esconde.
  inclui_projeto?: string;     // default "Projeto + homologação na concessionária". String vazia esconde.
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
    financiamento = 'BV · Santander · Solfácil · 24x no cartão',
    parcelamento = 'Fale com a gente pra melhor taxa',
    inclui_projeto = 'Projeto + homologação na concessionária',
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

  const [fonts, inversorPng, moduloPng, logoPng] = await Promise.all([
    loadFonts(),
    findAssetByMarca('inversor', marca_inversor),
    findAssetByMarca('modulo', marca_modulo),
    loadAssetAsDataUrl('logo-ecosunpower.png'),
  ]);

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
                // Fotos: placa + inversor lado a lado no topo do card
                ...((moduloPng || inversorPng) ? [{
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'space-around',
                      alignItems: 'center',
                      width: '100%',
                      height: 240,
                      gap: 20,
                    },
                    children: [
                      ...(moduloPng ? [{
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            flex: 1,
                          },
                          children: [
                            {
                              type: 'img',
                              props: {
                                src: moduloPng,
                                height: 200,
                                style: { objectFit: 'contain', display: 'flex' },
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontFamily: 'Montserrat',
                                  fontWeight: 700,
                                  fontSize: 18,
                                  color: '#0a1f3d',
                                  letterSpacing: '0.5px',
                                  display: 'flex',
                                  textAlign: 'center',
                                },
                                children: marca_modulo ?? 'Módulo',
                              },
                            },
                          ],
                        },
                      }] : []),
                      ...(inversorPng ? [{
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            flex: 1,
                          },
                          children: [
                            {
                              type: 'img',
                              props: {
                                src: inversorPng,
                                height: 200,
                                style: { objectFit: 'contain', display: 'flex' },
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontFamily: 'Montserrat',
                                  fontWeight: 700,
                                  fontSize: 18,
                                  color: '#0a1f3d',
                                  letterSpacing: '0.5px',
                                  display: 'flex',
                                  textAlign: 'center',
                                },
                                children: marca_inversor ?? 'Inversor',
                              },
                            },
                          ],
                        },
                      }] : []),
                    ],
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
                      fontSize: 88,
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
                ...(financiamento ? [{
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: 10,
                    },
                    children: {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Montserrat',
                          fontWeight: 800,
                          fontSize: 22,
                          color: '#ffffff',
                          background: 'linear-gradient(180deg, #0c4a6e 0%, #075985 100%)',
                          padding: '12px 24px',
                          borderRadius: 999,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          boxShadow: '0 4px 12px rgba(12, 74, 110, 0.4)',
                        },
                        children: `💳 ${financiamento}`,
                      },
                    },
                  },
                }] : []),
                ...(parcelamento ? [{
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: 8,
                    },
                    children: {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Montserrat',
                          fontWeight: 900,
                          fontSize: 24,
                          color: '#0a1f3d',
                          background: 'linear-gradient(180deg, #ffd23f 0%, #f59e0b 100%)',
                          padding: '14px 28px',
                          borderRadius: 999,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          boxShadow: '0 6px 18px rgba(245, 158, 11, 0.5)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                        },
                        children: `📞 ${parcelamento}`,
                      },
                    },
                  },
                }] : []),
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
                        height: 140,
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
                top: 25,
                left: 25,
                width: 160,
                height: 160,
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
                    fontSize: 110,
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
