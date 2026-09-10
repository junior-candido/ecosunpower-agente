// tests/declaracao-execucao.test.ts
//
// A DECLARAÇÃO DE EXECUÇÃO — o atestado que o cliente assina.
//
// Junior, 10/09/2026: "vamos implementar esse atestado, que vou pedir para
// assinarem após a troca do medidor" · "vamos fazer isso virar rotina mesmo".
//
// POR QUE ISSO EXISTE: pra entrar em licitação grande (a Rede SARAH convidou a
// EcoSunPower pra uma usina de 145 kWp e pedia 3 atestados de capacidade
// técnica COM ART) não basta a TRT — que o Junior sempre tem, porque é
// obrigatória pra homologar. Falta a DECLARAÇÃO DO CLIENTE. E ela só se
// consegue no calor da entrega: dois anos depois, com contato frio, ninguém
// assina.
//
// 🚨 A REGRA QUE FAZ O CLIENTE ASSINAR: o texto é DECLARATÓRIO PURO. Constata
// um fato passado e não cria obrigação nenhuma — sem valor, sem prazo, sem
// quitação, sem renúncia. O Sebastião é advogado e recusou assinar o contrato
// ("confia e deixa essa bexiga de lado"); um documento que não o obriga a nada
// ele assina. Se alguém acrescentar uma cláusula de obrigação aqui, o
// documento para de funcionar — por isso tem teste.
import { describe, it, expect } from 'vitest';
import {
  montarDeclaracaoHtml,
  camposFaltando,
  type DadosDeclaracao,
} from '../src/modules/relatorios/pasta/declaracao.js';

const CHEIO: DadosDeclaracao = {
  cliente: 'Sebastião Pereira de Souza',
  qualificacao: 'brasileiro, advogado inscrito na OAB/DF sob o nº 20.702',
  cpf: '223.990.111-04',
  endereco: 'QRI 23, Lote 22, Santa Maria — Brasília/DF',
  empresaRazao: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  empresaCnpj: '33.020.459/0001-06',
  rtNome: 'Antonio Cândido Rodrigues Júnior',
  rtRegistro: 'CREA/CFT 98940457153',
  potenciaKwp: 5.68,
  modulos: '8 × Hanersun HN21N-66HT710W — 710 Wp',
  inversores: '2 × GoodWe GW2000-MIS',
  uc: '564611',
  distribuidora: 'Neoenergia Distribuição Brasília',
  padraoEntrada: 'Bifásico 127/220 V · disjuntor geral 50 A',
  conclusaoEm: '2026-08-31',
  parecer: '2608124961',
  parecerEm: '2026-08-19',
  trt: 'CFT2606128607',
  cidade: 'Brasília/DF',
  logoDataUri: 'data:image/png;base64,AAAA',
};

describe('montarDeclaracaoHtml — o documento que o cliente lê', () => {
  it('nomeia o cliente e a empresa que executou', () => {
    const h = montarDeclaracaoHtml(CHEIO);
    expect(h).toContain('Sebastião Pereira de Souza');
    expect(h).toContain('ECOSUNPOWER ENERGIA SOLAR LTDA');
    expect(h).toContain('33.020.459/0001-06');
  });

  it('traz o que a licitação pede: potência, equipamentos, TRT e homologação', () => {
    const h = montarDeclaracaoHtml(CHEIO);
    expect(h).toContain('5,68 kWp');
    expect(h).toContain('Hanersun');
    expect(h).toContain('GW2000-MIS');
    expect(h).toContain('CFT2606128607');
    expect(h).toContain('2608124961');
    expect(h).toContain('564611');
  });

  it('escreve as datas em português, não em ISO', () => {
    const h = montarDeclaracaoHtml(CHEIO);
    expect(h).toContain('31 de agosto de 2026');
    expect(h).not.toContain('2026-08-31');
  });

  it('potência sai com vírgula decimal, como se escreve aqui', () => {
    expect(montarDeclaracaoHtml({ ...CHEIO, potenciaKwp: 12.81 })).toContain('12,81 kWp');
    expect(montarDeclaracaoHtml({ ...CHEIO, potenciaKwp: 100 })).toContain('100 kWp');
  });

  it('🚨 NÃO cria obrigação nenhuma pro cliente — é o que o faz assinar', () => {
    const h = montarDeclaracaoHtml(CHEIO).toLowerCase();
    for (const proibido of [
      'quitação', 'quito', 'dou plena', 'renuncio', 'renúncia',
      'obrigo', 'compromete-se', 'multa', 'juros', 'r$', 'pagamento',
    ]) {
      expect(h).not.toContain(proibido);
    }
  });

  it('diz que foi executado a contento — é a frase que serve de atestado', () => {
    expect(montarDeclaracaoHtml(CHEIO)).toContain('executados a contento');
  });

  it('escapa o nome do cliente — nome não pode virar HTML', () => {
    const h = montarDeclaracaoHtml({ ...CHEIO, cliente: '<script>x</script>' });
    expect(h).not.toContain('<script>x');
    expect(h).toContain('&lt;script&gt;');
  });

  it('sem logo, o documento sai mesmo assim', () => {
    const h = montarDeclaracaoHtml({ ...CHEIO, logoDataUri: undefined });
    expect(h).toContain('Sebastião');
    expect(h).not.toContain('undefined');
  });

  it('campo opcional vazio não deixa linha órfã na tabela', () => {
    const h = montarDeclaracaoHtml({ ...CHEIO, padraoEntrada: '', parecer: '' });
    expect(h).not.toContain('Padrão de entrada');
    expect(h).not.toContain('Homologação');
  });

  it('deixa a data em branco pro cliente preencher ao assinar', () => {
    expect(montarDeclaracaoHtml(CHEIO)).toContain('____');
  });
});

describe('camposFaltando — avisa antes de gerar um documento capenga', () => {
  it('nada falta quando está tudo preenchido', () => {
    expect(camposFaltando(CHEIO)).toEqual([]);
  });

  it('cobra os que a licitação exige', () => {
    const faltando = camposFaltando({ ...CHEIO, trt: '', potenciaKwp: 0, cpf: '' });
    expect(faltando).toContain('TRT');
    expect(faltando).toContain('potência');
    expect(faltando).toContain('CPF');
  });

  it('não cobra o que é opcional', () => {
    const faltando = camposFaltando({ ...CHEIO, padraoEntrada: '', qualificacao: '' });
    expect(faltando).toEqual([]);
  });
});
