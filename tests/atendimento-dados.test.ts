// Atendimento (Leads › Conversas) — dados do lead em PORTUGUÊS, nunca JSON cru.
import { describe, it, expect } from 'vitest';
import {
  dadosDeEnergia, dadosDoLead, interessesDoLead, rotuloOrigem, rotuloPerfil, comoNumero, humanizarChave,
} from '../src/modules/dashboard/atendimento-dados.js';

describe('dadosDeEnergia', () => {
  it('chaves da Eva viram rótulo e unidade em português, na ordem de leitura', () => {
    const d = dadosDeEnergia({ consumption_kwh: 700, monthly_bill: 900, group: 'b', tariff_type: 'convencional' });
    expect(d).toEqual([
      { rotulo: 'Conta de luz', valor: 'R$ 900' },
      { rotulo: 'Consumo', valor: '700 kWh/mês' },
      { rotulo: 'Grupo tarifário', valor: 'Grupo B' },
      { rotulo: 'Modalidade tarifária', valor: 'convencional' },
    ]);
  });

  it('respostas do formulário do anúncio (faixa e tipo de imóvel); "fonte" não aparece', () => {
    const d = dadosDeEnergia({ conta_faixa: 'R$ 500 a R$ 800', tipo_imovel: 'residencial', fonte: 'meta_form' });
    expect(d).toEqual([
      { rotulo: 'Faixa da conta', valor: 'R$ 500 a R$ 800' },
      { rotulo: 'Tipo de imóvel', valor: 'Residencial' },
    ]);
  });

  it('valor em texto pt-BR vira número; chave nova é humanizada; objeto aninhado não vira JSON', () => {
    const d = dadosDeEnergia({ monthly_bill: '1.234,50', consumo_ponta_kwh: 120, detalhe: { a: 1 } });
    expect(d).toContainEqual({ rotulo: 'Conta de luz', valor: 'R$ 1.234,5' });
    expect(d).toContainEqual({ rotulo: 'Consumo ponta kwh', valor: '120' });
    expect(JSON.stringify(d)).not.toContain('{"a"');
    expect(d.map((x) => x.rotulo)).not.toContain('Detalhe');
  });

  it('sem dado / formato estranho → lista vazia (nunca quebra)', () => {
    expect(dadosDeEnergia(null)).toEqual([]);
    expect(dadosDeEnergia({})).toEqual([]);
    expect(dadosDeEnergia([1, 2])).toEqual([]);
    expect(dadosDeEnergia('texto')).toEqual([]);
    expect(dadosDeEnergia({ monthly_bill: null, consumption_kwh: '' })).toEqual([]);
  });
});

describe('interessesDoLead', () => {
  it('traduz as oportunidades e ignora "não" e datas de controle', () => {
    expect(interessesDoLead({ ev_charging: true, battery: 'talvez', solar: false, free_market: 'não', last_reactivation_sent_at: '2026-09-01' }))
      .toEqual(['Carro elétrico / carregador', 'Bateria (talvez)']);
  });
  it('chave nova é humanizada; vazio/estranho → []', () => {
    expect(interessesDoLead({ piscina_aquecida: 'sim' })).toEqual(['Piscina aquecida']);
    expect(interessesDoLead(null)).toEqual([]);
    expect(interessesDoLead({ x: { y: 1 } })).toEqual([]);
  });
});

describe('rotuloOrigem / rotuloPerfil / utilitários', () => {
  it('origem técnica vira português', () => {
    expect(rotuloOrigem('campanha_1_meta_lead_ads')).toBe('Anúncio Meta');
    expect(rotuloOrigem('google_ads')).toBe('Google');
    expect(rotuloOrigem('Indicação')).toBe('Indicação');
    expect(rotuloOrigem('manual_dashboard')).toBe('Cadastro manual');
    expect(rotuloOrigem('')).toBeNull();
    expect(rotuloOrigem(null)).toBeNull();
    expect(rotuloOrigem('feira_solar')).toBe('Feira solar');
  });
  it('perfil', () => {
    expect(rotuloPerfil('residencial')).toBe('Residencial');
    expect(rotuloPerfil(' ')).toBeNull();
  });
  it('comoNumero e humanizarChave', () => {
    expect(comoNumero('R$ 780')).toBe(780);
    expect(comoNumero('abc')).toBeNull();
    expect(comoNumero(Infinity)).toBeNull();
    expect(humanizarChave('tipoTelhado')).toBe('Tipo telhado');
  });
});

describe('dadosDoLead (cadastro + energy_data)', () => {
  it('coluna do cadastro vale mais; energy_data completa; localização/controle não aparecem', () => {
    const d = dadosDoLead({
      conta_media_brl: 950, concessionaria: 'Neoenergia',
      energy_data: { monthly_bill: 900, consumption_kwh: 700, distributor: 'Outra', shared_coordinates: '-15.8,-47.9', shared_maps_url: 'https://maps', reengagement_sent_at: 'x' },
    });
    expect(d).toEqual([
      { rotulo: 'Conta de luz', valor: 'R$ 950' },
      { rotulo: 'Concessionária', valor: 'Neoenergia' },
      { rotulo: 'Consumo', valor: '700 kWh/mês' },
    ]);
  });
  it('sem nada → []', () => {
    expect(dadosDoLead({})).toEqual([]);
  });
});
