import { describe, it, expect } from 'vitest';
import { validarDocumento, acharMarcadores } from '../src/modules/closing/validar-documento.js';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { dadosFechamentoCamilaMesmaPessoa as COMPLETO } from './fixtures/closing-camila.js';
import type { DadosFechamento } from '../src/modules/closing/types.js';

// A trava da contenção: documento incompleto NUNCA sai (PDF, zap, Drive).
// A prévia continua mostrando — com os problemas num aviso vermelho.

const clone = (d: DadosFechamento): DadosFechamento => JSON.parse(JSON.stringify(d));

describe('acharMarcadores — o que não pode aparecer no documento pronto', () => {
  it('documento limpo → nada', () => {
    expect(acharMarcadores('<html><body><p>Contrato de Camila, CPF 028.876.121-90.</p></body></html>')).toEqual([]);
  });

  it.each([
    ['<p>Nome: ___</p>', '___'],
    ['<p>RG: _______________________</p>', '___'],
    ['<p>CPF [[cpf]]</p>', '[['],
    ['<p>fim ]]</p>', ']]'],
    ['<p>kWp: undefined</p>', 'undefined'],
    ['<p>UC null</p>', 'null'],
    ['<p>R$ NaN</p>', 'NaN'],
  ])('%s → acusa', (html, marca) => {
    const achados = acharMarcadores(html);
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.join(' ')).toContain(marca);
  });

  it('não acusa o que está dentro de <style> nem nomes de tag/atributo', () => {
    expect(acharMarcadores('<html><head><style>.a__b{x:1} /* null */</style></head><body data-x="null"><p>ok</p></body></html>')).toEqual([]);
  });

  it('não confunde palavra que só CONTÉM "null"/"nan" (ex.: "anulada", "Nancy")', () => {
    expect(acharMarcadores('<p>cláusula anulada · Nancy · nullidade</p>')).toEqual([]);
  });
});

describe('validarDocumento — contrato (fv)', () => {
  it('dados completos e HTML real renderizado → ok (sem falso positivo no template)', () => {
    const html = renderContrato(COMPLETO);
    const r = validarDocumento({ tipo: 'fv', dados: COMPLETO, html });
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('o preenchimento automático com "____" (prévia) é BLOQUEADO na saída', () => {
    const dados = completarComPlaceholders({});
    const r = validarDocumento({ tipo: 'fv', dados, html: renderContrato(dados) });
    expect(r.ok).toBe(false);
    const txt = r.problemas.join(' | ');
    for (const campo of ['Nome', 'CPF', 'RG', 'Endereço', 'Unidade consumidora', 'Potência', 'Módulos', 'Inversor', 'Valor total', 'Forma de pagamento']) {
      expect(txt).toContain(campo);
    }
  });

  it('CPF com dígito errado → bloqueia com o motivo', () => {
    const d = clone(COMPLETO);
    (d.titular_uc as any).cpf = '028.876.121-91';
    (d.contratante as any).cpf = '028.876.121-91';
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(d) });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/CPF.*inválido/i);
  });

  it('UC "a confirmar" (o que o autopreenchimento põe) conta como faltando', () => {
    const d = clone(COMPLETO);
    d.uc_numero = 'a confirmar';
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(d) });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toContain('Unidade consumidora');
  });

  it('ligação nova: UC ainda não existe → não é exigida', () => {
    const d = clone(COMPLETO);
    d.uc_numero = undefined;
    d.ligacao_nova = true;
    const r = validarDocumento({ tipo: 'procuracao', dados: d, html: renderProcuracao(d) });
    expect(r.problemas.join(' ')).not.toContain('Unidade consumidora');
  });

  it('módulos: falta quantidade ou potência → acusa', () => {
    const d = clone(COMPLETO);
    d.sistema.modulos.quantidade = 0;
    d.sistema.modulos.potencia_w = 0;
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(d) });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toContain('Módulos');
  });

  it('valor zerado → acusa', () => {
    const d = clone(COMPLETO);
    d.comercial.valor_total_brl = 0;
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(d) });
    expect(r.problemas.join(' ')).toContain('Valor total');
  });

  it('concessionária ausente (dado cru, sem o padrão "Neoenergia") → acusa', () => {
    const d = clone(COMPLETO) as Partial<DadosFechamento>;
    delete d.concessionaria;
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(COMPLETO) });
    expect(r.problemas.join(' ')).toContain('Concessionária');
  });

  it('marcador sobrando no HTML bloqueia mesmo com os campos preenchidos', () => {
    const r = validarDocumento({ tipo: 'fv', dados: COMPLETO, html: '<p>ok ___ </p>' });
    expect(r.ok).toBe(false);
  });

  it('quem assina é OUTRA pessoa: o CPF dela também é conferido', () => {
    const d = clone(COMPLETO);
    d.contratante_eh_titular = false;
    (d.contratante as any).cpf = '444.555.666-77'; // dígito não confere
    const r = validarDocumento({ tipo: 'fv', dados: d, html: renderContrato(d) });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toMatch(/CPF de quem assina.*inválido/i);
  });
});

describe('validarDocumento — procuração', () => {
  it('completa → ok', () => {
    const r = validarDocumento({ tipo: 'procuracao', dados: COMPLETO, html: renderProcuracao(COMPLETO) });
    expect(r.problemas).toEqual([]);
  });

  it('não exige dado de venda (valor, módulos) na procuração', () => {
    const d = clone(COMPLETO);
    d.comercial.valor_total_brl = 0;
    d.sistema.kwp = 0;
    const r = validarDocumento({ tipo: 'procuracao', dados: d, html: renderProcuracao(d) });
    expect(r.problemas).toEqual([]);
  });

  it('sem RG e sem UC → lista os dois', () => {
    const d = clone(COMPLETO);
    (d.titular_uc as any).rg = '';
    d.uc_numero = '';
    const r = validarDocumento({ tipo: 'procuracao', dados: d, html: '<p>ok</p>' });
    expect(r.problemas.join(' ')).toContain('RG');
    expect(r.problemas.join(' ')).toContain('Unidade consumidora');
  });
});

describe('validarDocumento — outros tipos (aditivo)', () => {
  it('só a varredura do HTML + CPF (sem lista de obrigatórios do contrato)', () => {
    const d = clone(COMPLETO);
    d.comercial.valor_total_brl = 0;
    expect(validarDocumento({ tipo: 'aditivo', dados: d, html: '<p>ok</p>' }).ok).toBe(true);
    expect(validarDocumento({ tipo: 'aditivo', dados: d, html: '<p>data ____/____</p>' }).ok).toBe(false);
  });
});
