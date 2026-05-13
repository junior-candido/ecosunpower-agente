// Preview local — gera 2 tamanhos pra Junior escolher: feed (1080x1350) e stories (1080x1920)

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { renderBannerTabelaKitsHtml } from '../src/modules/marketing/banner-tabela-kits-html.js';

const KITS = [
  { kwp: 5.67,  modulos: 9,  microinversores: 3, geracao_kwh_mes: 700,  preco_brl: 15800.61 },
  { kwp: 7.56,  modulos: 12, microinversores: 3, geracao_kwh_mes: 900,  preco_brl: 18476.35 },
  { kwp: 10.08, modulos: 16, microinversores: 4, geracao_kwh_mes: 1200, preco_brl: 22985.00 },
  { kwp: 12.60, modulos: 20, microinversores: 5, geracao_kwh_mes: 1500, preco_brl: 28038.54 },
  { kwp: 16.38, modulos: 26, microinversores: 7, geracao_kwh_mes: 2000, preco_brl: 33766.60 },
  { kwp: 20.79, modulos: 33, microinversores: 9, geracao_kwh_mes: 2500, preco_brl: 42039.77 },
];

const ts = Date.now();
mkdirSync('tmp', { recursive: true });

// Variant: white-corporate (aprovada). Tamanhos: stories (1920) e feed (1350)
const VARIANTS = ['white-corporate', 'azul-degrade'] as const;
const SIZES: Array<{ label: string; w: number; h: number }> = [
  { label: 'stories', w: 1080, h: 1920 },
  { label: 'feed',    w: 1080, h: 1350 },
];

for (const v of VARIANTS) {
  for (const s of SIZES) {
    const t0 = Date.now();
    const buf = await renderBannerTabelaKitsHtml({ kits: KITS, variant: v, width: s.w, height: s.h });
    const ms = Date.now() - t0;
    const out = join('tmp', `banner-${v}-${s.label}-${s.w}x${s.h}-${ts}.png`);
    writeFileSync(out, buf);
    console.log(`✅ ${v} ${s.label} (${s.w}x${s.h}): ${ms}ms · ${(buf.length / 1024).toFixed(0)} KB`);
    console.log(`   ${out}`);
  }
}
