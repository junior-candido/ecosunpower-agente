// Renovação do miolo — TETO do Tailwind (R1, 28/09/2026).
//
// Cada tela renovada entra em TELAS_RENOVADAS e, dali em diante, o miolo dela
// não pode voltar a ter utilitário Tailwind (bg-white, text-slate-500, px-3,
// rounded, grid-cols-2…): o visual é o do design system `cc-`.
// Formato: 'arquivo.ts' (arquivo inteiro) ou 'arquivo.ts#funcao' (só o corpo
// daquela função — para arquivos que têm telas renovadas e telas antigas).
// Exceção só com comentário `// tailwind-ok: <motivo>` na MESMA linha
// (ex.: classe que um teste antigo exige). Detector em helpers/teto-tailwind.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { corpoDaFuncao, linhasComTailwind } from './helpers/teto-tailwind.js';

const TELAS_RENOVADAS: string[] = [
  // R2 — Leads (lista)
  'leads-views.ts#renderLeadsListPage',
  'leads-views.ts#slaCc',
  'leads-views.ts#evaCc',
  'leads-views.ts#alertaCc',
];

describe('teto do Tailwind nas telas renovadas', () => {
  it('o detector pega utilitário Tailwind e deixa passar classe cc-', () => {
    expect(linhasComTailwind('<div class="bg-white rounded-xl p-6">')).toHaveLength(1);
    expect(linhasComTailwind('<span class="text-slate-500">')).toHaveLength(1);
    expect(linhasComTailwind('<div class="grid grid-cols-2 gap-4">')).toHaveLength(1);
    expect(linhasComTailwind('<div class="cc-panel"><span class="cc-pill cc-s-ok">')).toHaveLength(0);
    expect(linhasComTailwind('<b class="bg-white">x</b> // tailwind-ok: teste antigo exige')).toHaveLength(0);
    expect(linhasComTailwind('.cc-x{border-radius:10px;gap:8px;padding:0 14px}')).toHaveLength(0);
  });

  it('recorte por função pega só o corpo pedido', () => {
    const f = 'function a(x: { y: string }): string {\n  return `<i class="cc-a">`;\n}\nfunction b() {\n  return "<i class=\\"bg-white\\">";\n}';
    expect(linhasComTailwind(corpoDaFuncao(f, 'a'))).toHaveLength(0);
    expect(linhasComTailwind(corpoDaFuncao(f, 'b'))).toHaveLength(1);
  });

  for (const alvo of TELAS_RENOVADAS) {
    it(`${alvo} sem Tailwind no miolo`, () => {
      const [arq, fn] = alvo.split('#');
      const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', arq), 'utf-8');
      const trecho = fn ? corpoDaFuncao(fonte, fn) : fonte;
      expect(linhasComTailwind(trecho)).toEqual([]);
    });
  }
});
