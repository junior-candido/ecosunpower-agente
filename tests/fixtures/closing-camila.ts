// tests/fixtures/closing-camila.ts
// Fixture canônica usada em vários testes do módulo closing.
// Reflete o caso real Camila Cardoso (contrato em tmp/contrato-camila.html).

import type { DadosFechamento } from '../../src/modules/closing/types.js';

export const leadCamilaRow = {
  id: '11111111-1111-1111-1111-111111111111',
  nome: 'Camila Barbosa Costa Cardoso',
  telefone: '5561992891958',
  email: 'acmanutencaodf@hotmail.com',
  cpf_cnpj: '028.876.121-90',
  data_nascimento: '1989-06-21',
  estado_civil: 'casado(a)',
  cep: '72910-000',
  endereco_rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
  endereco_numero: 'S/N',
  endereco_complemento: null,
  uf: 'GO',
  concessionaria: 'Equatorial-GO',
  uc_numero: '10005936703',
  forma_pagamento: 'à vista PIX',
};

export const propostaPublicaCamilaRow = {
  id: '22222222-2222-2222-2222-222222222222',
  slug: 'cam7Lqx9P',
  numero_proposta: 'P-2026-0428-001',
  cliente_nome: 'Camila Barbosa Costa Cardoso',
  cliente_telefone: '5561992891958',
  html_content: '<html>...</html>',
  dados_input: {
    potencia_kwp: 8.4,
    modalidade: 'autoconsumo_local',
    modulos: { marca: 'Trina Vertex', potencia_w: 700, quantidade: 12 },
    inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
    valor_total: 38500,
  },
  created_at: '2026-04-28T15:42:00Z',
};

export const dadosFechamentoCamilaMesmaPessoa: DadosFechamento = {
  titular_uc: {
    tipo: 'PF',
    nome: 'Camila Barbosa Costa Cardoso',
    cpf: '028.876.121-90',
    rg: '26163',
    orgao_emissor_rg: 'MTE-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresária',
    data_nascimento: '1989-06-21',
    endereco: {
      rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
      numero: 'S/N',
      bairro: 'Jardim Guaíra II',
      cidade: 'Águas Lindas de Goiás',
      uf: 'GO',
      cep: '72910-000',
    },
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  uc_numero: '10005936703',
  concessionaria: 'Equatorial-GO',
  endereco_instalacao: {
    rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
    numero: 'S/N',
    bairro: 'Jardim Guaíra II',
    cidade: 'Águas Lindas de Goiás',
    uf: 'GO',
    cep: '72910-000',
  },
  contratante: {
    tipo: 'PF',
    nome: 'Camila Barbosa Costa Cardoso',
    cpf: '028.876.121-90',
    rg: '26163',
    orgao_emissor_rg: 'MTE-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresária',
    endereco: {
      rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
      numero: 'S/N',
      bairro: 'Jardim Guaíra II',
      cidade: 'Águas Lindas de Goiás',
      uf: 'GO',
      cep: '72910-000',
    },
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  contratante_eh_titular: true,
  sistema: {
    kwp: 8.4,
    modalidade: 'autoconsumo_local',
    modulos: { marca: 'Trina Vertex', potencia_w: 700, quantidade: 12 },
    inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
  },
  comercial: {
    valor_total_brl: 38500,
    forma_pagamento: 'à vista PIX',
  },
  docs_pedidos: ['contrato', 'procuracao'],
};

export const dadosFechamentoCamilaToninhoContrato: DadosFechamento = {
  ...dadosFechamentoCamilaMesmaPessoa,
  contratante: {
    tipo: 'PF',
    nome: 'Antônio Carlos "Toninho"',
    cpf: '444.555.666-77',
    rg: '9876543',
    orgao_emissor_rg: 'SSP-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresário',
    endereco: dadosFechamentoCamilaMesmaPessoa.titular_uc.endereco!,
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  contratante_eh_titular: false,
  relacao_contratante: 'conjuge',
  observacao_partes:
    'A negociação comercial foi conduzida com o cônjuge da titular da UC, Sr. Antônio Carlos "Toninho", que atua como CONTRATANTE no presente contrato.',
};
