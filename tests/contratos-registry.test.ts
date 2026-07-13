import { describe, it, expect } from 'vitest';
import {
  CONTRATOS,
  getContrato,
  camposFaltando,
  idEstadoCivil,
  gruposDoContrato,
  valoresDoFormulario,
  parseFormulario,
  limparTexto,
  numeroBR,
} from '../src/modules/closing/contratos-registry.js';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';

describe('registro de contratos (central de contratos de energia)', () => {
  it('tem pelo menos os 2 tipos que já existiam: sistema FV e procuração', () => {
    const tipos = CONTRATOS.map((c) => c.tipo);
    expect(tipos).toContain('fv');
    expect(tipos).toContain('procuracao');
  });

  it('todo tipo registrado sabe se renderizar e tem campos', () => {
    for (const c of CONTRATOS) {
      expect(c.nome.length).toBeGreaterThan(2);
      expect(c.campos.length).toBeGreaterThan(0);
      const html = c.render(completarComPlaceholders({}));
      expect(html.length).toBeGreaterThan(300); // gera até vazio — nunca trava
    }
  });

  it('todo campo tem id único dentro do seu tipo', () => {
    for (const c of CONTRATOS) {
      const ids = c.campos.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('getContrato acha pelo tipo e devolve undefined pra tipo inventado', () => {
    expect(getContrato('fv')?.nome).toBeTruthy();
    expect(getContrato('nao-existe')).toBeUndefined();
  });

  it('o contrato de FV pergunta os campos que o Junior sentiu falta', () => {
    const ids = getContrato('fv')!.campos.map((c) => c.id);
    for (const esperado of [
      'titular_nome', 'titular_cpf', 'titular_rg', 'titular_estado_civil',
      'end_rua', 'end_cidade', 'end_cep',
      'uc_numero', 'concessionaria',
      'sis_kwp', 'sis_mod_marca', 'sis_mod_qtd', 'sis_inv_marca', 'sis_inv_modelo',
      'com_valor', 'com_forma_pagamento',
    ]) {
      expect(ids, `faltou o campo ${esperado}`).toContain(esperado);
    }
  });
});

describe('valoresDoFormulario — mostra o que já veio do cadastro/proposta/IA', () => {
  it('preenche os campos com o que existe e deixa vazio o que falta', () => {
    const fv = getContrato('fv')!;
    const vals = valoresDoFormulario(fv, {
      titular_uc: { tipo: 'PF', nome: 'Fernanda', cpf: '123.456.789-00' } as any,
      sistema: { kwp: 19.6, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 590, quantidade: 34 }, inversor: { marca: 'GoodWe', modelo: 'GW20K', potencia_kw: 20 } },
      comercial: { valor_total_brl: 65000, forma_pagamento: 'à vista' },
    });
    expect(vals.titular_nome).toBe('Fernanda');
    expect(vals.titular_cpf).toBe('123.456.789-00');
    expect(vals.sis_mod_qtd).toBe('34');
    expect(vals.titular_rg).toBe(''); // faltou → branco (não vem "_____")
  });

  // O campo mostrava "6.215" (formato de programador) e, ao salvar, o ponto era
  // lido como separador de milhar: 6,215 kWp virava 6215 kWp sem ninguém digitar
  // nada. Mostrando em português (6,215) o valor volta inteiro.
  it('mostra número em português — e o que sai do campo volta igual ao salvar', () => {
    const fv = getContrato('fv')!;
    const vals = valoresDoFormulario(fv, {
      sistema: { kwp: 6.215, modalidade: 'autoconsumo_local', modulos: { marca: 'x', potencia_w: 565, quantidade: 11 }, inversor: { marca: 'y', modelo: 'z', potencia_kw: 8.325 } },
      comercial: { valor_total_brl: 65000, forma_pagamento: 'à vista' },
    } as any);
    expect(vals.sis_kwp).toBe('6,215');
    expect(vals.sis_inv_potencia_kw).toBe('8,325');
    expect(vals.com_valor).toBe('65.000');

    // ida e volta: o que a tela mostrou, salvo sem tocar em nada, continua igual
    const { rascunho } = parseFormulario(fv, { sis_kwp: vals.sis_kwp, com_valor: vals.com_valor });
    expect((rascunho.sistema as any).kwp).toBe(6.215);
    expect((rascunho.comercial as any).valor_total_brl).toBe(65000);
  });

  it('NUNCA mostra placeholder de underline no formulário', () => {
    const fv = getContrato('fv')!;
    const vals = valoresDoFormulario(fv, {});
    for (const v of Object.values(vals)) expect(v).not.toContain('___');
  });
});

describe('camposFaltando — os brancos que o Junior tem que completar', () => {
  it('aponta os obrigatórios vazios', () => {
    const fv = getContrato('fv')!;
    const faltando = camposFaltando(fv, {});
    const ids = faltando.map((c) => c.id);
    expect(ids).toContain('titular_nome');
    expect(ids).toContain('titular_cpf');
    expect(ids).toContain('com_valor');
  });

  it('lista vazia quando tudo está preenchido', () => {
    const fv = getContrato('fv')!;
    const dados = {
      titular_uc: {
        tipo: 'PF', nome: 'Fernanda', cpf: '123.456.789-00', rg: '1234567', orgao_emissor_rg: 'SSP/DF',
        estado_civil: 'casada', telefone: '5561999', email: 'f@x.com',
        endereco: { rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Brasília', uf: 'DF', cep: '70000-000' },
      },
      uc_numero: '123456',
      concessionaria: 'Neoenergia-DF',
      sistema: { kwp: 19.6, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 590, quantidade: 34 }, inversor: { marca: 'GoodWe', modelo: 'GW20K', potencia_kw: 20 } },
      comercial: { valor_total_brl: 65000, forma_pagamento: 'à vista' },
    } as any;
    expect(camposFaltando(fv, dados)).toEqual([]);
  });
});

describe('parseFormulario — dado de cadastro vai pro CLIENTE, dado do negócio vai pro contrato', () => {
  it('separa os dois pacotes: o cadastro (vale pro ecossistema) e o rascunho (só desse contrato)', () => {
    const fv = getContrato('fv')!;
    const { cadastro, rascunho } = parseFormulario(fv, {
      titular_nome: 'Antonio Ricardo',
      titular_cpf: '111.222.333-44',
      titular_estado_civil: 'solteiro',
      end_rua: 'Quadra 5',
      end_cidade: 'Samambaia',
      end_uf: 'DF',
      uc_numero: '9988776',
      sis_kwp: '5,72',
      sis_mod_qtd: '13',
      com_valor: 'R$ 15.528,00',
      com_forma_pagamento: '24x no cartão',
    });

    // cadastro → colunas do lead (as MESMAS que a IA preenche lendo conta+CNH)
    expect(cadastro).toEqual({
      name: 'Antonio Ricardo',
      cpf_cnpj: '111.222.333-44',
      estado_civil: 'solteiro',
      endereco_rua: 'Quadra 5',
      city: 'Samambaia',
      uf: 'DF',
      uc_numero: '9988776',
      forma_pagamento: '24x no cartão',
    });

    // rascunho → só o que é daquele contrato
    expect((rascunho.sistema as any).kwp).toBe(5.72);
    expect((rascunho.sistema as any).modulos.quantidade).toBe(13);
    expect((rascunho.comercial as any).valor_total_brl).toBe(15528);
    expect(rascunho.titular_uc).toBeUndefined(); // pessoa NÃO fica presa no contrato
  });

  it('o que é cadastro serve pros DOIS tipos — o CPF preenchido no contrato vale na procuração', () => {
    const contrato = parseFormulario(getContrato('fv')!, { titular_cpf: '111.222.333-44' });
    const proc = parseFormulario(getContrato('procuracao')!, { titular_cpf: '111.222.333-44' });
    expect(contrato.cadastro.cpf_cnpj).toBe('111.222.333-44');
    expect(proc.cadastro.cpf_cnpj).toBe('111.222.333-44'); // mesma coluna, mesmo cliente
  });

  it('campo em branco NÃO vira dado (não apaga o cadastro nem o que veio da proposta)', () => {
    const fv = getContrato('fv')!;
    const { cadastro, rascunho } = parseFormulario(fv, { titular_nome: 'Antonio', titular_cpf: '   ', sis_kwp: '' });
    expect(cadastro).toEqual({ name: 'Antonio' });
    expect(rascunho.sistema).toBeUndefined();
  });

  it('não deixa o telefone ser trocado pela tela (é a chave do WhatsApp)', () => {
    const fv = getContrato('fv')!;
    const { cadastro } = parseFormulario(fv, { titular_telefone: '5561000000000' });
    expect(cadastro).toEqual({});
  });

  it('ignora campo que não é do tipo (nada de lixo entrando pelo formulário)', () => {
    const fv = getContrato('fv')!;
    const p = parseFormulario(fv, { campo_inventado: 'xxx', phone: '999', titular_nome: 'Antonio' });
    expect(JSON.stringify(p)).not.toContain('xxx');
    expect(JSON.stringify(p)).not.toContain('999');
  });

  it('select só aceita opção da lista (POST forjado não entra)', () => {
    const fv = getContrato('fv')!;
    const { cadastro } = parseFormulario(fv, { concessionaria: 'Enel-SP', end_uf: 'DF' });
    expect(cadastro.concessionaria).toBeUndefined();
    expect(cadastro.uf).toBe('DF');
  });

  it('não deixa passar HTML — o PDF é montado num navegador de verdade no servidor', () => {
    const fv = getContrato('fv')!;
    const { rascunho } = parseFormulario(fv, {
      disposicoes_especiais: '<img src=x onerror="alert(1)">combinado: brinde',
    });
    expect(rascunho.disposicoes_especiais).not.toContain('<');
    expect(rascunho.disposicoes_especiais).toContain('combinado: brinde');
  });
});

describe('forma de pagamento — sugere as de sempre, mas aceita o que foi acordado', () => {
  it('vem com uma lista de sugestões pra escolher', () => {
    const campo = getContrato('fv')!.campos.find((c) => c.id === 'com_forma_pagamento')!;
    expect(campo.tipo).toBe('texto_sugerido');
    expect(campo.sugestoes!.length).toBeGreaterThan(3);
    expect(campo.sugestoes).toContain('À vista no PIX');
    expect(campo.sugestoes).toContain('Cartão de crédito — parcelado');
    expect(campo.sugestoes).toContain('Financiamento bancário');
  });

  // O contrato é o documento mais cliente-facing que existe, e o sistema já tinha a
  // regra de que o nome do parceiro do cartão não aparece pro cliente (ele pode
  // mudar de fornecedor). A lista tinha furado essa regra.
  it('NUNCA sugere nome de parceiro (o cliente não pode ver isso no contrato)', () => {
    const campo = getContrato('fv')!.campos.find((c) => c.id === 'com_forma_pagamento')!;
    const tudo = campo.sugestoes!.join(' ').toLowerCase();
    expect(tudo).not.toContain('belenus');
    expect(tudo).not.toContain('solfácil');
    expect(tudo).not.toContain('sol fácil');
    expect(tudo).not.toContain('fort lev');
  });

  it('escolher uma da lista funciona', () => {
    const { cadastro } = parseFormulario(getContrato('fv')!, { com_forma_pagamento: 'Financiamento bancário' });
    expect(cadastro.forma_pagamento).toBe('Financiamento bancário');
  });

  // O ponto: NÃO é um select. O que o Junior combinou na unha entra igual.
  it('escrever qualquer coisa fora da lista TAMBÉM funciona', () => {
    const combinado = '10 mil de entrada no PIX e 20x de R$ 647 no cartão, 1ª parcela só em setembro';
    const { cadastro } = parseFormulario(getContrato('fv')!, { com_forma_pagamento: combinado });
    expect(cadastro.forma_pagamento).toBe(combinado);
  });
});

describe('gruposDoContrato', () => {
  it('devolve os grupos na ordem dos campos (tipo novo não precisa mexer na tela)', () => {
    expect(gruposDoContrato(getContrato('fv')!)).toEqual([
      'Quem assina', 'Endereço', 'Unidade consumidora', 'A usina', 'O negócio',
    ]);
    expect(gruposDoContrato(getContrato('procuracao')!)).toEqual([
      'Quem assina', 'Endereço', 'Unidade consumidora',
    ]);
  });
});

describe('estado civil — entende o cadastro antigo, escrito à mão', () => {
  it.each([
    ['casada', 'casado'],
    ['Solteiro(a)', 'solteiro'],
    ['solteira', 'solteiro'],
    ['União estável', 'uniao_estavel'],
    ['uniao_estavel', 'uniao_estavel'],
    ['viúva', 'viuvo'],
    ['casado', 'casado'],
    ['', ''],
  ])('%s → %s', (entrada, esperado) => {
    expect(idEstadoCivil(entrada)).toBe(esperado);
  });

  it('o campo da tela mostra o que já está no cadastro, mesmo escrito torto', () => {
    const fv = getContrato('fv')!;
    const vals = valoresDoFormulario(fv, { titular_uc: { tipo: 'PF', estado_civil: 'casada' } as any });
    expect(vals.titular_estado_civil).toBe('casado'); // casa com a opção da lista
  });
});

describe('limparTexto', () => {
  it('tira sinal de HTML e corta texto gigante', () => {
    expect(limparTexto('  <script>x</script>  ')).toBe('scriptx/script');
    expect(limparTexto('a'.repeat(5000)).length).toBe(2000);
  });
});

describe('numeroBR — o Junior digita como brasileiro', () => {
  it.each([
    ['R$ 65.000,00', 65000],
    ['65.000,00', 65000],
    ['15528', 15528],
    ['5,72', 5.72],
    ['19.6', 19.6],
    ['35.000', 35000],
    ['590', 590],
  ])('%s → %s', (entrada, esperado) => {
    expect(numeroBR(entrada as string)).toBe(esperado);
  });

  it('vazio/bobagem → undefined (não vira 0, senão zerava o valor da proposta)', () => {
    expect(numeroBR('')).toBeUndefined();
    expect(numeroBR('   ')).toBeUndefined();
    expect(numeroBR('abc')).toBeUndefined();
  });
});
