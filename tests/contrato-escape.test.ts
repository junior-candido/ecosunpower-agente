import { describe, it, expect } from 'vitest';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { escaparDadosFechamento } from '../src/modules/closing/escapar-dados.js';

// O nome do lead vem do PERFIL DO WHATSAPP: quem manda mensagem pro número da
// empresa escolhe o próprio nome. Também vem da IA que lê a CNH e do formulário
// do Meta. Nada disso é confiável. E o documento aparece DENTRO do painel (a
// prévia), na sessão logada do operador — então texto de fora não pode virar código.
const VENENO = '<img src=x onerror="fetch(\'/dashboard/usuarios\')">';

function dadosEnvenenados() {
  return completarComPlaceholders({
    titular_uc: {
      tipo: 'PF',
      nome: VENENO,
      cpf: '111.222.333-44',
      rg: '<script>roubar()</script>',
      endereco: { rua: '<b>Rua</b>', numero: '1', bairro: 'x', cidade: 'y', uf: 'DF', cep: '70000-000' },
    } as any,
    disposicoes_especiais: '<script>alert(1)</script>',
    comercial: { valor_total_brl: 1000, forma_pagamento: '<i>PIX</i>' },
  });
}

describe('o documento nunca deixa texto de fora virar código', () => {
  it('contrato: nome envenenado sai como TEXTO, não como tag', () => {
    const html = renderContrato(dadosEnvenenados());
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x'); // aparece escrito, inofensivo
  });

  it('procuração: mesma blindagem', () => {
    const html = renderProcuracao(dadosEnvenenados());
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });

  it('o contrato continua legível — o texto normal não é estragado', () => {
    const html = renderContrato(completarComPlaceholders({
      titular_uc: { tipo: 'PF', nome: 'Antonio Ricardo', cpf: '111.222.333-44' } as any,
      sistema: { kwp: 6.215, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 565, quantidade: 11 }, inversor: { marca: 'Deye', modelo: 'SUN-5K', potencia_kw: 8 } },
      comercial: { valor_total_brl: 15528, forma_pagamento: '24x no cartão' },
    }));
    expect(html).toContain('Antonio Ricardo');
    expect(html).toContain('24x no cartão');
    expect(html).toContain('6.215'); // a potência segue lá
  });

  it('escaparDadosFechamento não mexe em número (o valor não vira texto)', () => {
    const d = escaparDadosFechamento(completarComPlaceholders({
      comercial: { valor_total_brl: 65000, forma_pagamento: 'PIX' },
    }));
    expect(d.comercial.valor_total_brl).toBe(65000);
  });
});
