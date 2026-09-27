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
  // Arquivo em CRLF (Windows) — normaliza pra "\n  }\n" achar o fim da função certo.
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8').replace(/\r\n/g, '\n');
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

  // Review: proposta vencida continua valendo pro contrato, mas quem manda o
  // documento pelo zap tem que avisar "conferir valores" — o dashboard já mostra
  // esse aviso na tela; a Eva não avisava nada na legenda do PDF.
  it('"contrato <nome>": avisa "proposta expirada" na legenda quando doc.propostaExpiradaEm existe', () => {
    const corpo = corpoDe('async function tryHandleContratoRapido(');
    expect(corpo).toContain('doc.propostaExpiradaEm');
    expect(corpo).toMatch(/proposta expirada/i);
    // o aviso entra na MESMA chamada que manda a legenda do documento
    const idxAviso = corpo.search(/proposta expirada/i);
    const idxSend = corpo.indexOf('sendDocumentById(');
    expect(idxAviso).toBeGreaterThan(0);
    expect(idxAviso).toBeLessThan(idxSend + 400); // aviso é montado perto do envio
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

// Review: vincular proposta órfã só auditava o SUCESSO — uma tentativa rejeitada
// (proposta já vinculada, de outra empresa, ou inexistente) não deixava rastro
// nenhum no audit_log. Agora audita os dois casos, mas a rejeição carrega só o
// MOTIVO (texto genérico) — nunca nome, CPF, e-mail ou qualquer dado do cliente.
describe('router — vincular proposta audita sucesso E rejeição, sem dado pessoal', () => {
  // Arquivo em CRLF (Windows) — normaliza pra "\n  });\n" achar o fim da rota certo.
  const src = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const ini = src.indexOf("router.post('/leads/:id/contrato-vincular-proposta'");
  const corpo = src.slice(ini, src.indexOf('\n  });\n', ini));

  it('a rota existe e chama vincularPropostaAoLead', () => {
    expect(ini).toBeGreaterThan(0);
    expect(corpo).toContain('vincularPropostaAoLead(');
  });

  it('audita tanto ok=true quanto ok=false (não só o sucesso)', () => {
    // conta quantas vezes "audit(" aparece FORA de um "if (ok" isolado — a forma
    // mais simples de garantir cobertura dos dois casos é: ou uma única chamada
    // fora de "if (ok && viewer)", ou duas chamadas (uma por ramo).
    const somenteSucesso = /if\s*\(\s*ok\s*&&\s*viewer\s*\)\s*await audit\(/.test(corpo);
    expect(somenteSucesso).toBe(false);
    expect(corpo).toMatch(/audit\(/);
  });

  it('a rejeição grava só o MOTIVO — nunca nome/e-mail/CPF do cliente ou da proposta', () => {
    // nenhum dos campos de dado pessoal do lead/proposta aparece dentro do bloco da rota
    expect(corpo).not.toMatch(/cliente_nome/);
    expect(corpo).not.toMatch(/\bnome\b\s*[:,]/);
    expect(corpo).not.toMatch(/\bcpf\b/i);
    expect(corpo).not.toMatch(/\bemail\b/i);
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
