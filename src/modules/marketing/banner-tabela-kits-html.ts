// banner-tabela-kits-html.ts
// V2: renderiza banner-tabela-kits via Puppeteer (HTML/CSS real).
// Qualidade ANUNCIO. Imagens nos tamanhos certos, sombras, gradientes,
// objectFit funciona, web fonts CDN. 100% controle pixel-perfect.

import fs from 'fs';
import path from 'path';
import { empresa, nomeTituloCase } from '../empresa-config.js';

export interface KitItem {
  kwp: number;
  modulos: number;
  microinversores: number;
  geracao_kwh_mes: number;
  preco_brl: number;
}

export type BannerVariant = 'dark-premium' | 'white-corporate' | 'bold-yellow' | 'forest-green' | 'azul-degrade';

export interface BannerTabelaKitsHtmlInput {
  kits: KitItem[];
  variant?: BannerVariant;
  width?: number;
  height?: number;
}

interface ThemeColors {
  bgGradient: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;        // dourado/principal
  accentSoft: string;
  highlight: string;     // verde/destaque numeros
  cardBg: string;
  cardBorder: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  zebraBg: string;
  rowBorder: string;
  ctaGradient: string;
  ctaText: string;
  shadowOmbre: string;
  hudBorder: string;
}

const THEMES: Record<BannerVariant, ThemeColors> = {
  // V1 — Dark Premium (atual)
  'dark-premium': {
    bgGradient: 'radial-gradient(ellipse at top left, rgba(251,191,36,0.10) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(34,197,94,0.08) 0%, transparent 50%), linear-gradient(180deg, #0a1929 0%, #050a14 100%)',
    textPrimary: '#ffffff',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    accent: '#fbbf24',
    accentSoft: '#fde68a',
    highlight: '#22c55e',
    cardBg: '#ffffff',
    cardBorder: '#fbbf24',
    tableHeaderBg: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
    tableHeaderText: '#0a1929',
    zebraBg: 'rgba(255,255,255,0.05)',
    rowBorder: 'rgba(251,191,36,0.18)',
    ctaGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #f97316 100%)',
    ctaText: '#0a1929',
    shadowOmbre: 'rgba(0,0,0,0.5)',
    hudBorder: '#fbbf24',
  },
  // V2 — White Corporate, fundo "fim de tarde" — gradiente céu pôr do sol com névoa
  'white-corporate': {
    bgGradient: 'radial-gradient(ellipse at 50% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 60%), linear-gradient(180deg, #dbeafe 0%, #fde68a 30%, #fed7aa 60%, #fbcfe8 100%)',
    textPrimary: '#0a1929',
    textSecondary: '#334155',
    textMuted: '#64748b',
    accent: '#0a4d8c',          // navy Ecosun
    accentSoft: '#1e6cb8',
    highlight: '#0a8c4d',       // verde escuro pros numeros
    cardBg: '#ffffff',
    cardBorder: '#0a4d8c',
    tableHeaderBg: 'linear-gradient(90deg, #0a1929 0%, #0a4d8c 100%)',
    tableHeaderText: '#fbbf24',
    zebraBg: '#f1f5f9',
    rowBorder: '#cbd5e1',
    ctaGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    ctaText: '#0a1929',
    shadowOmbre: 'rgba(10,25,41,0.15)',
    hudBorder: '#fbbf24',
  },
  // V3 — Bold Yellow (alto contraste, chamativo Meta Ads)
  'bold-yellow': {
    bgGradient: 'radial-gradient(ellipse at top, #fcd34d 0%, #f59e0b 70%, #ea580c 100%)',
    textPrimary: '#0a0a0a',
    textSecondary: '#1f2937',
    textMuted: '#4b5563',
    accent: '#0a0a0a',
    accentSoft: '#1f2937',
    highlight: '#dc2626',       // vermelho pra destaque
    cardBg: '#ffffff',
    cardBorder: '#0a0a0a',
    tableHeaderBg: 'linear-gradient(90deg, #0a0a0a 0%, #1f2937 100%)',
    tableHeaderText: '#fbbf24',
    zebraBg: 'rgba(255,255,255,0.5)',
    rowBorder: 'rgba(0,0,0,0.2)',
    ctaGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)',
    ctaText: '#fbbf24',
    shadowOmbre: 'rgba(0,0,0,0.35)',
    hudBorder: '#0a0a0a',
  },
  // V5 — Azul Degradê (céu de manhã limpo, profissional moderno)
  'azul-degrade': {
    bgGradient: 'radial-gradient(ellipse at 50% 25%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.0) 60%), linear-gradient(180deg, #dbeafe 0%, #93c5fd 25%, #3b82f6 55%, #1e40af 100%)',
    textPrimary: '#ffffff',
    textSecondary: '#e0f2fe',
    textMuted: '#bfdbfe',
    accent: '#fbbf24',          // dourado pra destacar nos azuis
    accentSoft: '#fde68a',
    highlight: '#fef3c7',       // amarelo claro pros kWh (alto contraste no azul)
    cardBg: '#ffffff',
    cardBorder: '#fbbf24',
    tableHeaderBg: 'linear-gradient(90deg, #1e40af 0%, #1e3a8a 100%)',
    tableHeaderText: '#fbbf24',
    zebraBg: 'rgba(255,255,255,0.10)',
    rowBorder: 'rgba(255,255,255,0.25)',
    ctaGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #f97316 100%)',
    ctaText: '#1e3a8a',
    shadowOmbre: 'rgba(30,58,138,0.45)',
    hudBorder: '#fbbf24',
  },
  // V4 — Forest Green (natureza, sustentabilidade)
  'forest-green': {
    bgGradient: 'radial-gradient(ellipse at top right, rgba(251,191,36,0.12) 0%, transparent 55%), linear-gradient(180deg, #022c22 0%, #052e16 50%, #021610 100%)',
    textPrimary: '#ffffff',
    textSecondary: '#d1fae5',
    textMuted: '#86efac',
    accent: '#facc15',          // amarelo solar
    accentSoft: '#fde047',
    highlight: '#4ade80',       // verde claro
    cardBg: '#ffffff',
    cardBorder: '#facc15',
    tableHeaderBg: 'linear-gradient(90deg, #facc15 0%, #eab308 100%)',
    tableHeaderText: '#022c22',
    zebraBg: 'rgba(74,222,128,0.06)',
    rowBorder: 'rgba(250,204,21,0.2)',
    ctaGradient: 'linear-gradient(135deg, #facc15 0%, #eab308 50%, #ca8a04 100%)',
    ctaText: '#022c22',
    shadowOmbre: 'rgba(0,0,0,0.5)',
    hudBorder: '#facc15',
  },
};

const ASSETS_DIR = path.resolve(process.cwd(), 'assets/banner');

function loadAssetAsDataUrl(basename: string): string | null {
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

let _puppeteer: any | null = null;
async function getPuppeteer(): Promise<any> {
  if (_puppeteer) return _puppeteer;
  const mod = await import('puppeteer');
  _puppeteer = (mod as any).default ?? mod;
  return _puppeteer;
}

export function buildBannerHtml(kits: KitItem[], variant: BannerVariant = 'dark-premium', width = 1080, height = 1350): string {
  const sortedKits = [...kits].sort((a, b) => a.kwp - b.kwp);
  const T = THEMES[variant];
  const logoDataUrl = loadAssetAsDataUrl('logo-ecosunpower-1024-transparente')
    ?? loadAssetAsDataUrl('logo-ecosunpower');
  const moduloDataUrl = loadAssetAsDataUrl('modulo.longi');
  const solaxDataUrl = loadAssetAsDataUrl('inversor.solax');

  const linhas = sortedKits.map((k, i) => `
    <tr class="${i % 2 === 0 ? 'zebra' : ''}">
      <td class="col-kwp">
        <div class="kwp-num">${formatKwp(k.kwp)}</div>
        <div class="kwp-unit">kWp</div>
      </td>
      <td class="col-equip">
        <span class="equip-num">${k.modulos}</span> LONGi
        <span class="equip-plus">+</span>
        <span class="equip-num">${k.microinversores}</span> Solax
      </td>
      <td class="col-ger">
        <div class="ger-num">${formatKwh(k.geracao_kwh_mes)}</div>
        <div class="ger-unit">kWh/mês</div>
      </td>
      <td class="col-preco">
        <div class="preco-pre">R$</div>
        <div class="preco-num">${formatBRL(k.preco_brl)}</div>
      </td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${width}px; height: ${height}px;
    background: ${T.bgGradient};
    color: ${T.textPrimary};
    font-family: 'Montserrat', sans-serif;
    padding: 50px 70px;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  body::before, body::after {
    content: '';
    position: absolute;
    width: 80px; height: 80px;
    border: 3px solid ${T.hudBorder};
    pointer-events: none;
  }
  body::before { top: 24px; left: 24px; border-right: none; border-bottom: none; }
  body::after { bottom: 24px; right: 24px; border-left: none; border-top: none; }

  .header { display: flex; justify-content: space-between; align-items: center; }
  .logo { height: 110px; width: auto; }

  /* Hero da OFERTA — destaque principal */
  .oferta-hero {
    background: linear-gradient(90deg, #dc2626 0%, #f97316 50%, #dc2626 100%);
    color: #ffffff;
    padding: 22px 30px;
    text-align: center;
    margin: 0 -60px 22px -60px;
    box-shadow: 0 8px 24px rgba(220,38,38,0.4);
  }
  .oferta-hero-title {
    font-weight: 900;
    font-size: 72px;
    color: #ffffff;
    line-height: 1;
    letter-spacing: -1px;
  }
  .oferta-hero-title span { color: #fef3c7; }
  .oferta-hero-sub {
    font-weight: 700;
    font-size: 22px;
    color: #fef3c7;
    margin-top: 6px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .badge { text-align: right; }
  .badge-tier { font-weight: 800; font-size: 20px; color: ${T.accent}; letter-spacing: 2px; }
  .badge-region { font-weight: 400; font-size: 16px; color: ${T.textMuted}; margin-top: 4px; }

  .hero { text-align: center; margin-bottom: 36px; }
  .hero-title {
    font-weight: 900; font-size: 78px;
    color: ${T.textPrimary};
    letter-spacing: -2px; line-height: 1.0;
    text-shadow: 0 4px 30px ${T.shadowOmbre};
  }
  .hero-title span { color: ${T.accent}; }
  .hero-subtitle {
    font-weight: 500; font-size: 26px;
    color: ${T.textSecondary};
    margin-top: 14px; letter-spacing: 0.5px;
  }

  .marcas { display: flex; justify-content: center; align-items: center; gap: 36px; margin-bottom: 24px; }
  .marca-card {
    background: ${T.cardBg};
    border-radius: 22px;
    padding: 18px;
    width: 230px; height: 230px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    box-shadow: 0 12px 36px ${T.shadowOmbre}, 0 0 0 4px ${T.cardBorder};
  }
  .marca-card img { width: 180px; height: 170px; object-fit: contain; }
  .marca-card .label {
    font-size: 14px; font-weight: 800;
    color: #0a1929;
    margin-top: 8px; letter-spacing: 0.5px; text-align: center;
    line-height: 1.2;
  }
  .marca-plus {
    font-weight: 900; font-size: 72px;
    color: ${T.accent};
    text-shadow: 0 0 28px ${T.shadowOmbre};
  }

  table.kits {
    width: 100%; border-collapse: collapse; margin-bottom: 24px;
    border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 60px ${T.shadowOmbre};
  }
  table.kits thead th {
    background: ${T.tableHeaderBg};
    color: ${T.tableHeaderText};
    font-weight: 900; font-size: 17px;
    letter-spacing: 1.5px; padding: 16px 18px; text-align: left; text-transform: uppercase;
  }
  table.kits thead th.ger, table.kits thead th.preco { text-align: right; }
  table.kits tbody tr {
    border-bottom: 1px solid ${T.rowBorder};
    background: transparent;
  }
  table.kits tbody tr.zebra { background: ${T.zebraBg}; }
  table.kits tbody tr:last-child { border-bottom: none; }
  table.kits td { padding: 18px 18px; vertical-align: middle; }

  .col-kwp { width: 22%; }
  .col-equip { width: 36%; }
  .col-ger { width: 19%; text-align: right; }
  .col-preco { width: 23%; text-align: right; }

  .kwp-num {
    font-weight: 900; font-size: 38px;
    color: ${T.textPrimary};
    line-height: 1;
    font-family: 'Inter', 'Montserrat', sans-serif;
    letter-spacing: -1px;
  }
  .kwp-unit { font-size: 14px; color: ${T.textMuted}; margin-top: 2px; font-weight: 700; letter-spacing: 1px; }

  .col-equip {
    font-size: 22px;
    color: ${T.textSecondary};
    font-weight: 600;
    line-height: 1.2;
  }
  .col-equip .equip-num {
    font-weight: 900;
    color: ${T.accent};
    font-size: 28px;
    font-family: 'Inter', 'Montserrat', sans-serif;
  }
  .col-equip .equip-plus {
    color: ${T.textMuted};
    font-weight: 700;
    margin: 0 4px;
  }

  .ger-num {
    font-weight: 900; font-size: 38px;
    color: ${T.highlight}; line-height: 1;
    font-family: 'Inter', 'Montserrat', sans-serif;
    letter-spacing: -1px;
  }
  .ger-unit { font-size: 13px; color: ${T.textMuted}; margin-top: 2px; font-weight: 700; letter-spacing: 1px; }

  .preco-pre { font-size: 14px; color: ${T.textMuted}; font-weight: 700; line-height: 1; }
  .preco-num {
    font-weight: 900; font-size: 38px;
    color: ${T.accent}; line-height: 1;
    font-family: 'Inter', 'Montserrat', sans-serif;
    letter-spacing: -1.5px;
    margin-top: 4px;
  }

  /* Info grid compacta — 4 destaques visuais com numero grande + label curto */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .info-cell {
    background: ${T.zebraBg};
    border-top: 3px solid ${T.accent};
    border-radius: 12px;
    padding: 14px 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .info-num {
    font-family: 'Inter', 'Montserrat', sans-serif;
    font-weight: 900;
    font-size: 42px;
    color: ${T.accent};
    line-height: 1;
    letter-spacing: -1px;
  }
  .info-num small { font-size: 26px; }
  .info-label {
    font-size: 13px;
    font-weight: 700;
    color: ${T.textSecondary};
    margin-top: 6px;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .beneficios {
    background: rgba(74,222,128,0.10);
    border-left: 4px solid ${T.highlight};
    padding: 14px 22px;
    margin-bottom: 14px;
    border-radius: 0 12px 12px 0;
  }
  .ben-item {
    display: flex; align-items: center; gap: 12px;
    font-size: 17px; font-weight: 500;
    color: ${T.textPrimary};
    margin: 3px 0;
  }
  .ben-check {
    color: ${T.highlight};
    font-weight: 900; font-size: 20px;
  }

  .pagamento {
    background: rgba(251,191,36,0.12);
    border-left: 4px solid ${T.accent};
    padding: 14px 22px;
    margin-bottom: 22px;
    border-radius: 0 12px 12px 0;
  }
  .pag-title {
    font-weight: 900; font-size: 14px;
    color: ${T.accent};
    letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase;
  }
  .pag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .pag-item {
    display: flex; align-items: center; gap: 10px;
    font-size: 17px; font-weight: 600;
    color: ${T.textPrimary};
  }
  .pag-icon { font-size: 20px; width: 24px; text-align: center; }

  .cta {
    background: ${T.ctaGradient};
    border-radius: 18px;
    padding: 26px 40px;
    text-align: center;
    margin-bottom: 18px;
    box-shadow: 0 20px 50px ${T.shadowOmbre}, inset 0 -3px 0 rgba(0,0,0,0.15);
  }
  .cta-text {
    font-weight: 900; font-size: 44px;
    color: ${T.ctaText};
    letter-spacing: 1px; line-height: 1;
  }
  .cta-link {
    font-weight: 700; font-size: 22px;
    color: ${T.ctaText};
    margin-top: 8px;
  }

  .footer { text-align: center; }
  .footer-rt {
    font-weight: 800; font-size: 14px;
    color: ${T.accent};
    letter-spacing: 2px;
  }
  .footer-name {
    font-weight: 500; font-size: 15px;
    color: ${T.textSecondary};
    margin-top: 4px;
  }
</style>
</head>
<body>
  <div class="header">
    ${logoDataUrl
      ? `<img src="${logoDataUrl}" class="logo" alt="Ecosunpower">`
      : `<div style="font-weight:900;font-size:42px;color:#fbbf24;letter-spacing:2px;">ECOSUNPOWER</div>`}
    <div class="badge">
      <div class="badge-tier">★ TIER 1 PREMIUM</div>
      <div class="badge-region">Brasília · Goiás</div>
    </div>
  </div>

  <div class="oferta-hero">
    <div class="oferta-hero-title">OFERTA DE <span>MAIO</span></div>
    <div class="oferta-hero-sub">Válida até 31/05/2026</div>
  </div>

  <div class="marcas">
    ${moduloDataUrl ? `
      <div class="marca-card">
        <img src="${moduloDataUrl}" alt="LONGi">
        <div class="label">LONGi Hi-MO X10<br>630W</div>
      </div>
    ` : ''}
    <div class="marca-plus">+</div>
    ${solaxDataUrl ? `
      <div class="marca-card">
        <img src="${solaxDataUrl}" alt="Solax">
        <div class="label">Solax Microinversor<br>2,25kW</div>
      </div>
    ` : ''}
  </div>

  <table class="kits">
    <thead>
      <tr>
        <th>Potência</th>
        <th>Equipamento</th>
        <th class="ger">Geração</th>
        <th class="preco">Investimento</th>
      </tr>
    </thead>
    <tbody>
      ${linhas}
    </tbody>
  </table>

  <div class="info-grid">
    <div class="info-cell">
      <div class="info-num">25/15</div>
      <div class="info-label">anos garantia<br>módulo / micro</div>
    </div>
    <div class="info-cell">
      <div class="info-num">24×</div>
      <div class="info-label">cartão<br>sem juros</div>
    </div>
    <div class="info-cell">
      <div class="info-num">60×</div>
      <div class="info-label">Solfácil · BV<br>Santander</div>
    </div>
    <div class="info-cell">
      <div class="info-num">✓</div>
      <div class="info-label">projeto +<br>homologação</div>
    </div>
  </div>

  <div class="cta">
    <div class="cta-text">QUERO MEU ORÇAMENTO</div>
  </div>

  <div class="footer">
    <div class="footer-rt">${empresa().rtTitulo.toUpperCase()}</div>
    <div class="footer-name">${nomeTituloCase(empresa().rtNome)}</div>
  </div>
</body>
</html>`;
}

export async function renderBannerTabelaKitsHtml(input: BannerTabelaKitsHtmlInput): Promise<Buffer> {
  const { kits, variant = 'dark-premium', width = 1080, height = 1350 } = input;
  if (kits.length === 0 || kits.length > 8) {
    throw new Error(`renderBannerTabelaKitsHtml: precisa de 1 a 8 kits (recebido ${kits.length})`);
  }

  const html = buildBannerHtml(kits, variant);
  const puppeteer = await getPuppeteer();
  const launchOptions: any = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    try { await page.evaluate(() => (document as any).fonts?.ready); } catch { /* ignora */ }
    await new Promise((r) => setTimeout(r, 600));
    const buf = await page.screenshot({ type: 'png', fullPage: false, omitBackground: false });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
