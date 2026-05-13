// Preview local — gera 4 variantes do banner-kits pra Junior escolher.

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { renderBannerTabelaKitsHtml, type BannerVariant } from '../src/modules/marketing/banner-tabela-kits-html.js';

const KITS = [
  { kwp: 5.67,  modulos: 9,  microinversores: 3, geracao_kwh_mes: 700,  preco_brl: 15800.61 },
  { kwp: 7.56,  modulos: 12, microinversores: 3, geracao_kwh_mes: 900,  preco_brl: 18476.35 },
  { kwp: 10.08, modulos: 16, microinversores: 4, geracao_kwh_mes: 1200, preco_brl: 22985.00 },
  { kwp: 12.60, modulos: 20, microinversores: 5, geracao_kwh_mes: 1500, preco_brl: 28038.54 },
  { kwp: 16.38, modulos: 26, microinversores: 7, geracao_kwh_mes: 2000, preco_brl: 33766.60 },
  { kwp: 20.79, modulos: 33, microinversores: 9, geracao_kwh_mes: 2500, preco_brl: 42039.77 },
];

const VARIANTS: BannerVariant[] = ['white-corporate', 'azul-degrade'];
const ts = Date.now();

mkdirSync('tmp', { recursive: true });
const generated: string[] = [];

for (const v of VARIANTS) {
  const t0 = Date.now();
  const buf = await renderBannerTabelaKitsHtml({ kits: KITS, variant: v });
  const ms = Date.now() - t0;
  const out = join('tmp', `banner-${v}-${ts}.png`);
  writeFileSync(out, buf);
  generated.push(out);
  console.log(`✅ ${v}: ${ms}ms · ${(buf.length / 1024).toFixed(0)} KB · ${out}`);
}

console.log('\n📁 Todos gerados:');
generated.forEach((p) => console.log('  ' + p));
