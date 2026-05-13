// banner-tabela-kits.ts
// Banner PREMIUM tabela de kits OnGrid (criativo Meta Ads). Layout dark
// neon/dourado, 6 kits em linhas densas, fotos de LONGi + Solax no topo,
// lista de benefícios, CTA forte. 1080x1350 (4:5 Instagram feed).

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { loadFonts } from './banner-renderer.js';

export interface KitItem {
  kwp: number;          // 5.67
  modulos: number;       // 9
  microinversores: number; // 3
  geracao_kwh_mes: number; // 700
  preco_brl: number;       // 15800.61
}

export interface BannerTabelaKitsInput {
  kits: KitItem[];
  titulo?: string;        // default "TABELA OFICIAL 2026"
  subtitulo?: string;     // default "Sistema solar premium · LONGi + Solax"
  cta_text?: string;      // default "QUERO MEU ORÇAMENTO"
  responsavel_tecnico?: string; // default "Antonio Candido Rodrigues Junior"
  wa_link?: string;       // default wa.me/+556196978781
  width?: number;
  height?: number;
}

const ASSETS_DIR = path.resolve(process.cwd(), 'assets/banner');

function loadAssetAsDataUrl(basename: string): string | null {
  // Tenta .png primeiro, depois .jpeg
  for (const ext of ['png', 'jpeg', 'jpg']) {
    const p = path.join(ASSETS_DIR, `${basename}.${ext}`);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatKwp(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatKwh(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/**
 * Renderiza banner tabela de kits OnGrid. 6 kits dispostos verticalmente
 * em linhas com kWp + módulos + micros + geração + preço.
 */
export async function renderBannerTabelaKits(input: BannerTabelaKitsInput): Promise<Buffer> {
  const {
    kits,
    titulo = 'TABELA OFICIAL 2026',
    subtitulo = 'Sistema solar premium · LONGi + Solax',
    cta_text = 'QUERO MEU ORÇAMENTO',
    responsavel_tecnico = 'Antonio Candido Rodrigues Junior',
    wa_link = 'wa.me/+556196978781',
    width = 1080,
    height = 1620,
  } = input;

  if (kits.length === 0 || kits.length > 8) {
    throw new Error(`renderBannerTabelaKits: precisa de 1 a 8 kits (recebido ${kits.length})`);
  }

  // Ordena crescente por kWp (segurança)
  const sortedKits = [...kits].sort((a, b) => a.kwp - b.kwp);

  // Assets
  const fonts = await loadFonts();
  const moduloPng = loadAssetAsDataUrl('modulo.longi');
  const solaxPng = loadAssetAsDataUrl('inversor.solax');
  const logoPng = loadAssetAsDataUrl('ecosun png');

  // Cores premium
  const COR_BG_TOP = '#0a1929';        // deep navy
  const COR_BG_BOTTOM = '#020617';     // quase preto
  const COR_OURO = '#fbbf24';          // dourado pros preços
  const COR_OURO_FRACO = '#fde68a';
  const COR_VERDE = '#22c55e';         // verde kWh
  const COR_BRANCO = '#ffffff';
  const COR_CINZA = '#cbd5e1';
  const COR_DIVISOR = 'rgba(251,191,36,0.25)';

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${COR_BG_TOP} 0%, ${COR_BG_BOTTOM} 100%)`,
          fontFamily: 'Montserrat',
          padding: 50,
          color: COR_BRANCO,
          position: 'relative',
        },
        children: [
          // === HEADER: logo + título =========================================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                width: '100%',
                marginBottom: 20,
              },
              children: [
                // Esquerda: logo Ecosun
                logoPng
                  ? {
                      type: 'img',
                      props: {
                        src: logoPng,
                        style: { width: 180, height: 'auto', objectFit: 'contain' },
                      },
                    }
                  : {
                      type: 'div',
                      props: {
                        style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 36, color: COR_OURO, display: 'flex' },
                        children: 'ECOSUNPOWER',
                      },
                    },
                // Direita: badge tier 1
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontFamily: 'Montserrat',
                            fontWeight: 700,
                            fontSize: 18,
                            color: COR_OURO,
                            letterSpacing: '2px',
                            display: 'flex',
                          },
                          children: '★ TIER 1 PREMIUM',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontFamily: 'Montserrat',
                            fontWeight: 400,
                            fontSize: 14,
                            color: COR_CINZA,
                            display: 'flex',
                          },
                          children: 'Brasília · Goiás',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },

          // === TÍTULO PRINCIPAL ============================================
          {
            type: 'div',
            props: {
              style: {
                fontFamily: 'Montserrat',
                fontWeight: 900,
                fontSize: 56,
                color: COR_BRANCO,
                letterSpacing: '-1px',
                lineHeight: 1.0,
                textAlign: 'center',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                marginTop: 10,
              },
              children: titulo,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontFamily: 'Montserrat',
                fontWeight: 400,
                fontSize: 22,
                color: COR_CINZA,
                textAlign: 'center',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                marginTop: 8,
                marginBottom: 20,
              },
              children: subtitulo,
            },
          },

          // === FOTOS LONGI + SOLAX (mini, lado a lado) =====================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 30,
                marginBottom: 24,
              },
              children: [
                moduloPng
                  ? {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
                        children: [
                          {
                            type: 'img',
                            props: {
                              src: moduloPng,
                              style: { width: 110, height: 110, objectFit: 'contain' },
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 14, color: COR_OURO_FRACO, display: 'flex' },
                              children: 'LONGi Hi-MO X10 630W',
                            },
                          },
                        ],
                      },
                    }
                  : { type: 'div', props: { style: { display: 'flex' }, children: '' } },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Montserrat',
                      fontWeight: 900,
                      fontSize: 32,
                      color: COR_OURO,
                      display: 'flex',
                    },
                    children: '+',
                  },
                },
                solaxPng
                  ? {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
                        children: [
                          {
                            type: 'img',
                            props: {
                              src: solaxPng,
                              style: { width: 110, height: 110, objectFit: 'contain' },
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 14, color: COR_OURO_FRACO, display: 'flex' },
                              children: 'Solax Micro 2,25kW',
                            },
                          },
                        ],
                      },
                    }
                  : { type: 'div', props: { style: { display: 'flex' }, children: '' } },
              ],
            },
          },

          // === HEADER DA TABELA =============================================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(251,191,36,0.08)',
                borderTop: `2px solid ${COR_OURO}`,
                borderBottom: `2px solid ${COR_OURO}`,
                marginBottom: 4,
              },
              children: [
                { type: 'div', props: { style: { flex: 1.5, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 16, color: COR_OURO, letterSpacing: '1px', display: 'flex' }, children: 'POTÊNCIA' } },
                { type: 'div', props: { style: { flex: 1.6, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 16, color: COR_OURO, letterSpacing: '1px', display: 'flex' }, children: 'EQUIPAMENTO' } },
                { type: 'div', props: { style: { flex: 1.3, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 16, color: COR_OURO, letterSpacing: '1px', display: 'flex', justifyContent: 'flex-end' }, children: 'GERAÇÃO' } },
                { type: 'div', props: { style: { flex: 1.5, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 16, color: COR_OURO, letterSpacing: '1px', display: 'flex', justifyContent: 'flex-end' }, children: 'INVESTIMENTO' } },
              ],
            },
          },

          // === LINHAS DA TABELA =============================================
          ...sortedKits.map((kit, i) => ({
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                padding: '14px 16px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: `1px solid ${COR_DIVISOR}`,
                alignItems: 'center',
              },
              children: [
                // Coluna 1: Potência (kWp)
                {
                  type: 'div',
                  props: {
                    style: { flex: 1.5, display: 'flex', flexDirection: 'column' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 28, color: COR_BRANCO, lineHeight: 1, display: 'flex' },
                          children: `${formatKwp(kit.kwp)} kWp`,
                        },
                      },
                    ],
                  },
                },
                // Coluna 2: Equipamento (módulos + micros)
                {
                  type: 'div',
                  props: {
                    style: { flex: 1.6, display: 'flex', flexDirection: 'column', gap: 2 },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 17, color: COR_CINZA, lineHeight: 1.2, display: 'flex' },
                          children: `${kit.modulos} módulos LONGi`,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 15, color: COR_CINZA, lineHeight: 1.2, display: 'flex' },
                          children: `${kit.microinversores} micro Solax 2,25kW`,
                        },
                      },
                    ],
                  },
                },
                // Coluna 3: Geração (kWh/mês)
                {
                  type: 'div',
                  props: {
                    style: { flex: 1.3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 30, color: COR_VERDE, lineHeight: 1, display: 'flex' },
                          children: formatKwh(kit.geracao_kwh_mes),
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 13, color: COR_CINZA, marginTop: 2, display: 'flex' },
                          children: 'kWh/mês',
                        },
                      },
                    ],
                  },
                },
                // Coluna 4: Preço (R$)
                {
                  type: 'div',
                  props: {
                    style: { flex: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 12, color: COR_CINZA, display: 'flex' },
                          children: 'R$',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 30, color: COR_OURO, lineHeight: 1, letterSpacing: '-1px', display: 'flex' },
                          children: formatBRL(kit.preco_brl),
                        },
                      },
                    ],
                  },
                },
              ],
            },
          })),

          // === BENEFÍCIOS / GARANTIAS =======================================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginTop: 20,
                padding: '14px 18px',
                background: 'rgba(34,197,94,0.06)',
                borderLeft: `3px solid ${COR_VERDE}`,
                gap: 5,
              },
              children: [
                { type: 'div', props: { style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 16, color: COR_BRANCO, display: 'flex' }, children: '✓ Projeto + homologação na concessionária' } },
                { type: 'div', props: { style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 16, color: COR_BRANCO, display: 'flex' }, children: '✓ Garantia 12 meses de mão de obra' } },
                { type: 'div', props: { style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 16, color: COR_BRANCO, display: 'flex' }, children: '✓ Equipamentos Tier 1 LONGi + Solax (até 25 anos)' } },
                { type: 'div', props: { style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 16, color: COR_BRANCO, display: 'flex' }, children: '✓ Financiamento BV · Santander · Solfácil · até 60x' } },
              ],
            },
          },

          // === SPACER ========================================================
          { type: 'div', props: { style: { flex: 1, display: 'flex' } } },

          // === CTA FORTE ====================================================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '20px 30px',
                background: `linear-gradient(90deg, ${COR_OURO} 0%, #f59e0b 100%)`,
                borderRadius: 12,
                marginTop: 16,
                gap: 4,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 36, color: '#0a1929', letterSpacing: '1px', display: 'flex' },
                    children: cta_text,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 18, color: '#0a1929', display: 'flex' },
                    children: wa_link,
                  },
                },
              ],
            },
          },

          // === FOOTER: Responsável Técnico ==================================
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: 16,
                gap: 2,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 13, color: COR_OURO_FRACO, letterSpacing: '1px', display: 'flex' },
                    children: 'RESPONSÁVEL TÉCNICO CREA/CFT',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontFamily: 'Montserrat', fontWeight: 400, fontSize: 13, color: COR_CINZA, display: 'flex' },
                    children: responsavel_tecnico,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width,
      height,
      fonts,
    },
  );

  const resvg = new Resvg(svg, {
    background: COR_BG_BOTTOM,
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  });
  return Buffer.from(resvg.render().asPng());
}
