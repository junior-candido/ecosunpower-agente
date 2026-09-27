import { describe, it, expect } from 'vitest';
import { renderDocBloqueadoPage, renderContratoFormPage } from '../src/modules/dashboard/contrato-form-views.js';
import { inserirAvisoNaPrevia } from '../src/modules/closing/documento-final.js';
import { getContrato, CONTRATOS } from '../src/modules/closing/contratos-registry.js';

// O que o operador vê quando o documento está incompleto: nunca um envio mudo
// com "___" — uma página dizendo O QUE falta e o caminho de volta pro formulário.
describe('página "documento travado"', () => {
  const html = renderDocBloqueadoPage({
    leadId: 'abc-123',
    nome: 'Maria <script>',
    acao: 'enviar',
    tipoForm: 'fv',
    blocos: [
      { documento: 'Contrato — Sistema fotovoltaico', problemas: ['CPF do titular', 'Forma de pagamento'] },
      { documento: 'Procuração', problemas: ['RG do titular <b>'] },
    ],
  });

  it('diz que NÃO foi enviado e lista o que falta, por documento', () => {
    expect(html).toContain('não foi enviado');
    expect(html).toContain('Contrato — Sistema fotovoltaico');
    expect(html).toContain('CPF do titular');
    expect(html).toContain('Forma de pagamento');
    expect(html).toContain('Procuração');
  });

  it('link de volta pro formulário do tipo certo', () => {
    expect(html).toContain('/dashboard/leads/abc-123/contrato-form?tipo=fv');
  });

  it('escapa o que vem de fora (nome, problemas)', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>');
  });

  it('cada ação tem o seu verbo (PDF / Drive)', () => {
    const pdf = renderDocBloqueadoPage({ leadId: 'x', nome: 'A', acao: 'pdf', tipoForm: 'procuracao', blocos: [{ documento: 'P', problemas: ['UC'] }] });
    expect(pdf).toContain('PDF não foi gerado');
    const drive = renderDocBloqueadoPage({ leadId: 'x', nome: 'A', acao: 'drive', tipoForm: 'fv', blocos: [{ documento: 'P', problemas: ['UC'] }] });
    expect(drive).toContain('não foi salvo no Drive');
  });

  it('documento congelado: explica que precisa corrigir e CONGELAR DE NOVO', () => {
    const h = renderDocBloqueadoPage({
      leadId: 'x', nome: 'A', acao: 'pdf', tipoForm: 'fv',
      blocos: [{ documento: 'Contrato', problemas: ['RG do titular'], congeladoEm: '2026-07-13T12:00:00Z' }],
    });
    expect(h).toContain('congelad');
    expect(h).toMatch(/congel[a-z]* de novo/i);
  });
});

describe('prévia com aviso vermelho (a prévia continua funcionando)', () => {
  const doc = '<!DOCTYPE html><html><head><style>p{}</style></head><body class="x"><p>Contrato</p></body></html>';

  it('com problemas → faixa vermelha logo no começo do <body>, listando tudo', () => {
    const out = inserirAvisoNaPrevia(doc, { problemas: ['CPF do titular', 'Valor <total>'], congelado: null });
    expect(out.indexOf('<body class="x">')).toBeLessThan(out.indexOf('CPF do titular'));
    expect(out.indexOf('CPF do titular')).toBeLessThan(out.indexOf('<p>Contrato</p>'));
    expect(out).toContain('Valor &lt;total&gt;');
    expect(out).toMatch(/não pode sair/i);
  });

  it('sem problemas e sem congelar → documento intacto', () => {
    expect(inserirAvisoNaPrevia(doc, { problemas: [], congelado: null })).toBe(doc);
  });

  it('congelado → avisa que é a versão congelada (data + versão) que sai', () => {
    const out = inserirAvisoNaPrevia(doc, { problemas: [], congelado: { congeladoEm: '2026-07-13T12:00:00Z', versao: 2 } });
    expect(out).toContain('13/07/2026');
    expect(out).toContain('v2');
  });

  it('HTML sem <body> → aviso vai no começo', () => {
    const out = inserirAvisoNaPrevia('<p>x</p>', { problemas: ['CPF'], congelado: null });
    expect(out.startsWith('<div')).toBe(true);
  });
});

describe('formulário: o texto não promete mais que "gera do mesmo jeito"', () => {
  it('com campo em branco, avisa que Gerar/Mandar/Drive ficam travados', () => {
    const def = getContrato('fv')!;
    const html = renderContratoFormPage({
      leadId: 'L1', nome: 'Maria', def,
      tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
      valores: {}, faltando: def.campos.filter((c) => c.obrigatorio), temProposta: true,
    });
    expect(html).not.toContain('o PDF gera do mesmo jeito');
    expect(html).toMatch(/travad/i);
  });

  it('congelado: diz que é a versão congelada que sai (e que mudança pede congelar de novo)', () => {
    const def = getContrato('fv')!;
    const html = renderContratoFormPage({
      leadId: 'L1', nome: 'Maria', def,
      tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
      valores: {}, faltando: [], temProposta: true,
      vigente: { congeladoEm: '2026-07-13T12:00:00Z', valor: 38500, formaPagamento: 'PIX' },
    });
    expect(html).toMatch(/sai (desta|a) versão congelada|usam a versão congelada/i);
  });
});
