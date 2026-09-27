import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Guarda estática da contenção: no router do dashboard, contrato/procuração só
// viram PDF dentro de gerarDocBuffer (que passa pela trava de documento-final.ts).
// Se alguém voltar a renderizar direto (def.render(r.dados) → PDF), o "___"
// volta a chegar no cliente — este teste pega.
describe('router — a saída de contrato passa sempre pela trava', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

  it('nada de renderizar o documento cru do autopreenchimento', () => {
    expect(src).not.toMatch(/def\.render\(r\.dados\)/);
  });

  it('gerarDocBuffer usa montarDocumentoFinal e não gera PDF quando !doc.ok', () => {
    const ini = src.indexOf('async function gerarDocBuffer(');
    expect(ini).toBeGreaterThan(0);
    const corpo = src.slice(ini, src.indexOf('\n  }', ini));
    expect(corpo).toContain('montarDocumentoFinal');
    expect(corpo.indexOf('if (!doc.ok)')).toBeLessThan(corpo.indexOf('renderHtmlToPdf('));
  });

  it('Drive não usa mais a versão fixa 1', () => {
    expect(src).not.toMatch(/version:\s*1,/);
  });
});
