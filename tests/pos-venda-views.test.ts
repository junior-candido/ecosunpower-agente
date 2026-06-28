import { describe, it, expect } from 'vitest';
import { renderPosVendaPage } from '../src/modules/dashboard/pos-venda-views.js';
import type { PosVendaLinha } from '../src/modules/dashboard/pos-venda-queries.js';

const linha = (over: Partial<PosVendaLinha> = {}): PosVendaLinha => ({
  leadId: 'l1', sistemaId: 's1', nome: 'Antonio Carlos', telefone: '5561999990000',
  cidade: 'Brasília', potenciaKwp: 5.2, marcaInversor: 'deye', dataInstalacao: '2024-06-25',
  saude: 'verde', ultimoContatoEm: '2026-06-20T00:00:00Z', jaTeveDepoimento: false, elegivelUpgrade: false, semApi: false,
  proximaAcao: { tipo: 'parabens', label: '🎉 Aniversário em 0 dia(s)', urgencia: 'media' },
  ...over,
});

describe('renderPosVendaPage', () => {
  it('lista o cliente com nome, usina e o semáforo de saúde', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toContain('Antonio Carlos');
    expect(html).toContain('deye');
    expect(html).toContain('data-lead-id="l1"');
  });
  it('escapa HTML do nome (não injeta)', () => {
    const html = renderPosVendaPage([linha({ nome: '<script>x</script>' })], undefined);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('estado vazio quando não há clientes', () => {
    const html = renderPosVendaPage([], undefined);
    expect(html).toMatch(/nenhum cliente|sem clientes|nenhuma usina/i);
  });
  it('vermelho ganha destaque de atenção', () => {
    const html = renderPosVendaPage([linha({ saude: 'vermelho' })], undefined);
    expect(html).toContain('pv-urgent');
  });
});
