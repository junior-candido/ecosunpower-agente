// tests/pasta-envio-auto.test.ts
import { describe, it, expect, vi } from 'vitest';
import { secoesFaltando, pastaCompleta, textoFaltando } from '../src/modules/relatorios/pasta/completude.js';
import {
  precisaAvisar, proximoLembrete9h, montarAviso, tickEnvioAutoPasta, MAX_LEMBRETES, type PastaCandidata,
} from '../src/modules/relatorios/pasta/envio-auto.js';
import { gerouDiasSeguidos, tickDetectarMedidor, textoAvisoMedidor } from '../src/modules/monitoring/detectar-medidor.js';

const TODAS = ['fotos', 'projeto', 'art', 'homologacao', 'manuais', 'garantia', 'contrato'] as const;
const arq = (secoes: readonly string[]) => secoes.map((s) => ({ secao: s as any }));

describe('completude da pasta (R2)', () => {
  it('7 seções com arquivo → nada falta, completa', () => {
    expect(secoesFaltando(arq(TODAS))).toEqual([]);
    expect(pastaCompleta(arq(TODAS))).toBe(true);
  });
  it('monitoramento é opcional', () => {
    expect(secoesFaltando(arq([...TODAS, 'monitoramento']))).toEqual([]);
    expect(secoesFaltando(arq(['monitoramento']))).toHaveLength(7);
  });
  it('falta contrato → lista só contrato, na ordem, com texto legível', () => {
    const f = secoesFaltando(arq(TODAS.filter((s) => s !== 'contrato')));
    expect(f).toEqual(['contrato']);
    expect(textoFaltando(f)).toBe('falta: 📄 Contrato');
    expect(textoFaltando([])).toBe('');
  });
  it('pasta vazia / null → faltam as 7', () => {
    expect(secoesFaltando([])).toHaveLength(7);
    expect(secoesFaltando(null)).toHaveLength(7);
  });
});

const AGORA = new Date('2026-08-26T14:00:00Z'); // 11h BRT, dentro da janela
function cand(o: Partial<PastaCandidata> = {}): PastaCandidata {
  return {
    id: 'pasta-1', lead_id: 'lead-1', slug: 'abc123', aviso_envio_em: null, aviso_segurado_ate: null, avisos_enviados: 0,
    lead: { name: 'Tatiane Bonfim', phone: '5561999990000', meter_swapped_at: '2026-08-25T13:00:00Z' }, ...o,
  };
}

describe('precisaAvisar (R6/R8)', () => {
  it('1º aviso quando nunca avisou', () => expect(precisaAvisar(cand(), AGORA)).toBe(true));
  it('avisado e sem segurar → espera o botão (não repete)', () =>
    expect(precisaAvisar(cand({ aviso_envio_em: '2026-08-26T12:00:00Z', avisos_enviados: 1 }), AGORA)).toBe(false));
  it('segurou até ontem → lembra', () =>
    expect(precisaAvisar(cand({ aviso_envio_em: '2026-08-25T12:00:00Z', aviso_segurado_ate: '2026-08-26T12:00:00Z', avisos_enviados: 1 }), AGORA)).toBe(true));
  it('segurou até amanhã → ainda não', () =>
    expect(precisaAvisar(cand({ aviso_envio_em: '2026-08-25T12:00:00Z', aviso_segurado_ate: '2026-08-27T12:00:00Z', avisos_enviados: 1 }), AGORA)).toBe(false));
  it(`desiste depois de ${MAX_LEMBRETES} lembretes`, () =>
    expect(precisaAvisar(cand({ aviso_envio_em: '2026-08-20T12:00:00Z', aviso_segurado_ate: '2026-08-26T12:00:00Z', avisos_enviados: MAX_LEMBRETES }), AGORA)).toBe(false));
});

describe('proximoLembrete9h', () => {
  it('11h BRT → amanhã 9h BRT (12:00Z)', () => {
    expect(proximoLembrete9h(new Date('2026-08-26T14:00:00Z')).toISOString()).toBe('2026-08-27T12:00:00.000Z');
  });
  it('23h BRT (02Z do dia seguinte) → ainda amanhã 9h BRT, não pula 2 dias', () => {
    expect(proximoLembrete9h(new Date('2026-08-27T02:00:00Z')).toISOString()).toBe('2026-08-27T12:00:00.000Z');
  });
});

describe('montarAviso', () => {
  it('1º aviso: nome, data do medidor em pt-BR e 3 botões com ids evabt', () => {
    const m = montarAviso(cand(), false);
    expect(m.body).toContain('Tatiane Bonfim');
    expect(m.body).toContain('25/08/2026');
    expect(m.buttons.map((b) => b.id)).toEqual(['evabt:pasta-enviar:pasta-1', 'evabt:pasta-segurar:pasta-1', 'evabt:pasta-ver:pasta-1']);
    expect(m.body).not.toContain('Lembrete');
  });
  it('lembrete: prefixo e contador no rodapé', () => {
    const m = montarAviso(cand({ avisos_enviados: 2 }), true);
    expect(m.body).toMatch(/^⏰ Lembrete/);
    expect(m.footer).toBe(`lembrete 2/${MAX_LEMBRETES}`);
  });
});

describe('tickEnvioAutoPasta', () => {
  function ctx(cands: PastaCandidata[], agora = AGORA) {
    const db = {
      listarCandidatas: vi.fn().mockResolvedValue(cands),
      marcarAvisado: vi.fn().mockResolvedValue(undefined),
      segurar: vi.fn().mockResolvedValue(undefined),
    };
    const enviarComBotoes = vi.fn().mockResolvedValue(undefined);
    return { db, enviarComBotoes, adminPhone: '5561999880000', agora: () => agora };
  }
  it('fora da janela (3h BRT) não avisa ninguém', async () => {
    const c = ctx([cand()], new Date('2026-08-26T06:00:00Z'));
    const r = await tickEnvioAutoPasta(c);
    expect(r).toEqual({ avisados: 0, janelaAberta: false });
    expect(c.enviarComBotoes).not.toHaveBeenCalled();
  });
  it('avisa 1× e marca; 2º tick com aviso já registrado não repete', async () => {
    const c = ctx([cand()]);
    const r1 = await tickEnvioAutoPasta(c);
    expect(r1.avisados).toBe(1);
    expect(c.enviarComBotoes).toHaveBeenCalledTimes(1);
    expect(c.enviarComBotoes.mock.calls[0][0]).toBe('5561999880000');
    expect(c.db.marcarAvisado).toHaveBeenCalledWith('pasta-1', AGORA.toISOString());
    // simula o banco já com aviso
    c.db.listarCandidatas.mockResolvedValue([cand({ aviso_envio_em: AGORA.toISOString(), avisos_enviados: 1 })]);
    const r2 = await tickEnvioAutoPasta(c);
    expect(r2.avisados).toBe(0);
    expect(c.enviarComBotoes).toHaveBeenCalledTimes(1);
  });
  it('falha no zap não marca como avisado (tenta de novo no próximo tick)', async () => {
    const c = ctx([cand()]);
    c.enviarComBotoes.mockRejectedValueOnce(new Error('waba down'));
    const r = await tickEnvioAutoPasta(c);
    expect(r.avisados).toBe(0);
    expect(c.db.marcarAvisado).not.toHaveBeenCalled();
  });
});

describe('detectar medidor pelo monitoramento (R1)', () => {
  it('3 dias ≥ 1 kWh → gerou; 2 dias → não; dia zerado no meio → não', () => {
    expect(gerouDiasSeguidos([12.4, 30.1, 28.9])).toBe(true);
    expect(gerouDiasSeguidos([30.1, 28.9])).toBe(false);
    expect(gerouDiasSeguidos([12.4, 0, 28.9])).toBe(false);
    expect(gerouDiasSeguidos([0.4, 0.6, 0.9])).toBe(false);
  });
  it('tick marca só quem gerou e chama onMarcado com os kWh', async () => {
    const db = {
      listarLeadsAguardandoMedidor: vi.fn().mockResolvedValue([
        { leadId: 'l1', nome: 'Joel', sistemaId: 's1', apelido: 'Joel sítio' },
        { leadId: 'l2', nome: 'Nelson', sistemaId: 's2', apelido: null },
      ]),
      geracaoUltimosDias: vi.fn().mockImplementation(async (sid: string) => (sid === 's1' ? [20, 22, 25] : [0, 0, 18])),
      marcarMedidorTrocado: vi.fn().mockResolvedValue(undefined),
    };
    const onMarcado = vi.fn().mockResolvedValue(undefined);
    const r = await tickDetectarMedidor({ db, onMarcado, agora: () => AGORA });
    expect(r.marcados).toEqual(['l1']);
    expect(db.marcarMedidorTrocado).toHaveBeenCalledTimes(1);
    expect(db.marcarMedidorTrocado).toHaveBeenCalledWith('l1', AGORA.toISOString());
    expect(onMarcado).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l1' }), [20, 22, 25]);
    expect(textoAvisoMedidor({ leadId: 'l1', nome: 'Joel', sistemaId: 's1', apelido: 'Joel sítio' }, [20, 22, 25]))
      .toContain('há 3 dias (67 kWh)');
  });
});
