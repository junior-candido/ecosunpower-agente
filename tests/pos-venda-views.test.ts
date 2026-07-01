import { describe, it, expect } from 'vitest';
import { renderPosVendaPage } from '../src/modules/dashboard/pos-venda-views.js';
import type { PosVendaLinha } from '../src/modules/dashboard/pos-venda-queries.js';
import type { AgendaAgrupada } from '../src/modules/dashboard/pos-venda-agenda.js';

const linha = (over: Partial<PosVendaLinha> = {}): PosVendaLinha => ({
  leadId: 'l1', sistemaId: 's1', nome: 'Antonio Carlos', telefone: '5561999990000',
  cidade: 'Brasília', potenciaKwp: 5.2, marcaInversor: 'deye', dataInstalacao: '2024-06-25',
  saude: 'verde', ultimoContatoEm: '2026-06-20T00:00:00Z', jaTeveDepoimento: false, elegivelUpgrade: false,
  gerouBem: false, ultimoContatoPositivoEm: null, snoozedTipos: new Set<string>(), semApi: false,
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

describe('termômetro e sugestão no card', () => {
  const recente = new Date(Date.now() - 5 * 86400000).toISOString();
  const antigo = new Date(Date.now() - 200 * 86400000).toISOString();

  it('mostra termômetro quente pra contato recente e saúde verde', () => {
    const html = renderPosVendaPage([linha({ ultimoContatoEm: recente, saude: 'verde' })], undefined);
    expect(html).toContain('🔥');
  });
  it('mostra chip de sugestão de reativação pra quem sumiu', () => {
    const html = renderPosVendaPage([linha({ ultimoContatoEm: antigo, saude: 'verde' })], undefined);
    expect(html).toContain('🧊');
    expect(html).toMatch(/sem falar/i);
  });
});

describe('agenda lateral', () => {
  it('renderiza a coluna da agenda com os grupos', () => {
    const agenda: AgendaAgrupada = {
      atrasados: [{ id: 't1', leadId: 'l1', nomeCliente: 'João', titulo: 'Ligar pro João', dueAt: '2026-06-20T00:00:00Z' }],
      hoje: [], semana: [],
    };
    const html = renderPosVendaPage([linha()], undefined, agenda);
    expect(html).toMatch(/Agenda/i);
    expect(html).toContain('Ligar pro João');
    expect(html).toMatch(/Atrasados/i);
  });
  it('funciona sem agenda (compatível com chamada antiga)', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toContain('Antonio Carlos');
  });
});

describe('notas/histórico e lembrete no card', () => {
  it('card tem botão de notas e de lembrete', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toMatch(/Notas/i);
    expect(html).toMatch(/Lembrete/i);
  });
});
