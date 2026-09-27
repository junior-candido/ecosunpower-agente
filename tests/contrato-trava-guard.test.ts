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

// A Eva também entrega contrato (comando de admin "contrato <nome>"): o mesmo
// documento final, a mesma trava. Nada de PDF do autopreenchimento cru.
describe('index.ts (Eva) — a saída de contrato passa sempre pela trava', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
  const corpoDe = (assinatura: string) => {
    const ini = src.indexOf(assinatura);
    expect(ini).toBeGreaterThan(0);
    return src.slice(ini, src.indexOf('\n  }\n', ini));
  };

  it('nada de renderizar o documento cru do autopreenchimento', () => {
    expect(src).not.toMatch(/def\.render\(r\.dados\)/);
  });

  it('"contrato <nome>" usa montarDocumentoFinal e só gera PDF de doc.html quando doc.ok', () => {
    const corpo = corpoDe('async function tryHandleContratoRapido(');
    expect(corpo).toContain('montarDocumentoFinal(');
    const trava = corpo.indexOf('if (!doc.ok)');
    expect(trava).toBeGreaterThan(0);
    expect(trava).toBeLessThan(corpo.indexOf('renderHtmlToPdf('));
    expect(corpo).toContain('renderHtmlToPdf(doc.html)');
  });
});

// PII: o evento "bloqueado" (vai pro Elo/fluxo de eventos) guarda só o rótulo
// genérico do problema — nunca o CPF que o operador digitou errado.
describe('router — evento de bloqueio sem CPF', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  it('responderBloqueado passa os problemas por problemasSemDados antes do evento', () => {
    const ini = src.indexOf('async function responderBloqueado(');
    expect(ini).toBeGreaterThan(0);
    const corpo = src.slice(ini, src.indexOf('\n  }\n', ini));
    const evento = corpo.slice(corpo.indexOf("'bloqueado'"), corpo.indexOf('res.status(422)'));
    expect(evento).toContain('problemasSemDados(');
  });
});

// Congelar só o que pode sair — e com os dados crus guardados junto.
describe('router — congelar passa pela trava', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  it('valida o CRU antes de congelar e guarda o cru no retrato', () => {
    const ini = src.indexOf("router.post('/leads/:id/contrato-congelar'");
    expect(ini).toBeGreaterThan(0);
    const corpo = src.slice(ini, src.indexOf('\n  });\n', ini));
    const trava = corpo.indexOf('validarParaCongelar(');
    expect(trava).toBeGreaterThan(0);
    expect(trava).toBeLessThan(corpo.indexOf('congelarContrato('));
    expect(corpo).toMatch(/congelarContrato\([^)]*r\.cru\)/);
  });
});
