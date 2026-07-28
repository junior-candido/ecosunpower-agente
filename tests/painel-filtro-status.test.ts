// tests/painel-filtro-status.test.ts
// Pedido do Thiago (Sabion) 28/07, print com os cabeçalhos circulados:
// "Tem como criar um botão específico? Ao clicar, entra somente no status."
// Cabeçalhos das colunas e chips da Órbita viram links ?painel=; com o filtro
// ativo o board mostra SÓ aquela coluna (+ link "ver tudo").
import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u1', apelido: 'Usina A', marca_inversor: 'deye', ativo: true,
  potencia_kwp: 5, uf: 'DF', cidade: 'Brasília', nivel: 'urgente',
  alertaTexto: 'Sem geração há 7 dias.', geracao_hoje_kwh: 0,
  geracao_mes_kwh: 0, geracao_7d_kwh: 0,
  ultima_sincronizacao: new Date().toISOString(),
  ...over,
}) as any;

describe('board filtrado por ?painel= (pedido do Thiago)', () => {
  const colunas = (html: string) => (html.match(/class="coluna-status"/g) ?? []).length;

  it('painel=falha renderiza SÓ a coluna Falha + link ver tudo', () => {
    const html = renderMonitoramentoPage([row()], { painel: 'falha' } as any);
    expect(colunas(html)).toBe(1);
    expect(html).toContain('🔴 Falha');
    expect(html).toContain('ver tudo');
  });

  it('sem painel (ou inválido) renderiza as 4 colunas', () => {
    for (const q of [{}, { painel: 'xyz' }]) {
      const html = renderMonitoramentoPage([row()], q as any);
      expect(colunas(html)).toBe(4);
      expect(html).not.toContain('ver tudo');
    }
  });

  it('cabeçalhos e chips da órbita são links com ?painel=', () => {
    const html = renderMonitoramentoPage([row()], {} as any);
    for (const chave of ['falha', 'atencao', 'ok', 'aguardando']) {
      expect(html).toContain(`?painel=${chave}`);
    }
  });
});
