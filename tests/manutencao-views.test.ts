import { describe, it, expect } from 'vitest';
import { renderManutencaoPage, seloSemApi } from '../src/modules/dashboard/manutencao-views.js';
import type { AgendaItem, LeituraPendente } from '../src/modules/dashboard/manutencao-queries.js';

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  id: 'm1', sistemaId: 's1', apelido: 'Casa Antônio', leadId: 'l1', clienteNome: 'Antônio',
  tipo: 'limpeza', origem: 'regra', data_agendada: '2026-06-01', semApi: false, ...over,
});

describe('seloSemApi', () => {
  it('mostra o selo quando sem API', () => { expect(seloSemApi(true)).toContain('Sem API'); });
  it('vazio quando tem API', () => { expect(seloSemApi(false)).toBe(''); });
});

describe('renderManutencaoPage', () => {
  it('lista item da agenda com usina e tipo', () => {
    const html = renderManutencaoPage({ agenda: [item()], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).toContain('Casa Antônio');
    expect(html).toContain('data-manut-id="m1"');
  });
  it('escapa HTML (não injeta)', () => {
    const html = renderManutencaoPage({ agenda: [item({ apelido: '<b>x</b>' })], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).not.toContain('<b>x</b>');
  });
  it('mostra o selo sem-API na linha da usina manual', () => {
    const html = renderManutencaoPage({ agenda: [item({ semApi: true })], leiturasPendentes: [], usinas: [] }, undefined);
    expect(html).toContain('Sem API');
  });
  it('bloco de leituras pendentes aparece quando há', () => {
    const lp: LeituraPendente = { sistemaId: 's2', apelido: 'Sítio', leadId: 'l2', clienteNome: 'Maria' };
    const html = renderManutencaoPage({ agenda: [], leiturasPendentes: [lp], usinas: [] }, undefined);
    expect(html).toMatch(/leitura/i);
    expect(html).toContain('Sítio');
  });
});
