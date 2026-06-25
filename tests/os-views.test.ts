import { describe, it, expect } from 'vitest';
import { renderOSPage, renderOSLaudoHtml } from '../src/modules/dashboard/os-views.js';
import { hidratarChecklist, resumoOS } from '../src/modules/dashboard/os-checklist.js';
import type { OSRow } from '../src/modules/dashboard/os-queries.js';

const os = (over: Partial<OSRow> = {}): OSRow => ({
  id: 'os1', sistema_id: 's1', lead_id: 'l1', manutencao_id: 'm1', tipo: 'limpeza',
  status: 'aberta', checklist: {}, observacoes: null, executor: null,
  aberta_em: '2026-06-25T00:00:00Z', concluida_em: null, apelido: 'Casa Antônio', clienteNome: 'Antônio', ...over,
});

describe('renderOSPage', () => {
  it('mostra a usina, os itens do checklist e o campo de upload', () => {
    const itens = hidratarChecklist('limpeza', {}, {});
    const html = renderOSPage(os(), itens, [], undefined);
    expect(html).toContain('Casa Antônio');
    expect(html).toContain('Limpeza das placas');
    expect(html).toContain('Fotos de todos os módulos');
    expect(html).toContain('type="file"');
  });
  it('escapa HTML do cliente', () => {
    const html = renderOSPage(os({ apelido: '<b>x</b>' }), hidratarChecklist('limpeza', {}, {}), [], undefined);
    expect(html).not.toContain('<b>x</b>');
  });
  it('OS concluída mostra estado travado (sem botão Concluir)', () => {
    const html = renderOSPage(os({ status: 'concluida' }), hidratarChecklist('limpeza', {}, {}), [], undefined);
    expect(html).toMatch(/conclu[ií]da/i);
    expect(html).not.toContain('Concluir OS');
  });
});

describe('renderOSLaudoHtml', () => {
  it('é um doc HTML com a empresa, checks e medições', () => {
    const itens = hidratarChecklist('revisao_inversor', { erros_alarmes: true, medicao_ca: '220V/5A' }, {});
    const html = renderOSLaudoHtml(os({ tipo: 'revisao_inversor' }), resumoOS(itens), [], 'Responsável Técnico CREA/CFT');
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('Leitura de erros/alarmes');
    expect(html).toContain('220V/5A');
    expect(html).toContain('Responsável Técnico');
  });
  it('não fala "engenheiro"', () => {
    const html = renderOSLaudoHtml(os(), resumoOS(hidratarChecklist('limpeza', {}, {})), [], 'Responsável Técnico CREA/CFT');
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });
});
