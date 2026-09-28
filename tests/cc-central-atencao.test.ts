// Motor da Central de Atenção (fase B): ordem por severidade → impacto em R$ →
// mais antigo; a Home mostra só o topo; ações recomendadas saem dos mesmos avisos.
import { describe, it, expect } from 'vitest';
import {
  priorizar, contarPorSeveridade, topoDaHome, acoesRecomendadas, filtrarEventos, ehSeveridade, ehAreaEvento,
  type EventoAtencao,
} from '../src/modules/dashboard/central-atencao.js';

let seq = 0;
const ev = (p: Partial<EventoAtencao>): EventoAtencao => ({
  id: p.id ?? `e${seq++}`, severidade: 'info', area: 'usinas', titulo: 't', contexto: 'c',
  acao: { rotulo: 'Ver', href: '/dashboard/monitoramento' }, ...p,
});

describe('priorizar', () => {
  it('ordena por severidade, depois impacto em R$ (maior primeiro), depois o mais antigo', () => {
    const r = priorizar([
      ev({ id: 'a', severidade: 'atencao', impactoRs: 10 }),
      ev({ id: 'b', severidade: 'critico', impactoRs: 5 }),
      ev({ id: 'c', severidade: 'critico', impactoRs: 164 }),
      ev({ id: 'd', severidade: 'atencao', impactoRs: 10, desde: '2026-09-01T00:00:00Z' }),
      ev({ id: 'e', severidade: 'info' }),
    ]);
    expect(r.map((e) => e.id)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });

  it('sem impacto vai depois de quem tem impacto na mesma severidade', () => {
    expect(priorizar([ev({ id: 'x', severidade: 'critico' }), ev({ id: 'y', severidade: 'critico', impactoRs: 1 })]).map((e) => e.id))
      .toEqual(['y', 'x']);
  });

  it('remove duplicado pelo id (fica o de maior severidade)', () => {
    const r = priorizar([ev({ id: 'u1', severidade: 'atencao' }), ev({ id: 'u1', severidade: 'critico' })]);
    expect(r).toHaveLength(1);
    expect(r[0].severidade).toBe('critico');
  });

  it('não muda a lista de entrada', () => {
    const lista = [ev({ id: 'a', severidade: 'info' }), ev({ id: 'b', severidade: 'critico' })];
    priorizar(lista);
    expect(lista.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('data inválida conta como "sem data" (não quebra a ordem)', () => {
    const r = priorizar([ev({ id: 'x', severidade: 'atencao', desde: 'lixo' }), ev({ id: 'y', severidade: 'atencao', desde: '2026-09-01T00:00:00Z' })]);
    expect(r.map((e) => e.id)).toEqual(['y', 'x']);
  });
});

describe('contarPorSeveridade / topoDaHome', () => {
  it('conta as 5 severidades (zero quando não há)', () => {
    expect(contarPorSeveridade([ev({ severidade: 'critico' }), ev({ severidade: 'critico' }), ev({ severidade: 'info' })]))
      .toEqual({ critico: 2, atencao: 0, acompanhar: 0, oportunidade: 0, info: 1 });
  });

  it('a Home mostra só os N primeiros já priorizados', () => {
    const evs = Array.from({ length: 12 }, (_, i) => ev({ id: String(i), severidade: i % 2 ? 'info' : 'critico' }));
    const top = topoDaHome(evs, 8);
    expect(top).toHaveLength(8);
    expect(top.slice(0, 6).every((e) => e.severidade === 'critico')).toBe(true);
  });
});

describe('acoesRecomendadas', () => {
  it('as 3 de maior impacto; "info" nunca vira ação', () => {
    const r = acoesRecomendadas([
      ev({ id: 'i', severidade: 'info' }),
      ev({ id: 'a', severidade: 'acompanhar' }),
      ev({ id: 'c', severidade: 'critico' }),
      ev({ id: 't', severidade: 'atencao' }),
      ev({ id: 'o', severidade: 'oportunidade' }),
    ], 3);
    expect(r.map((e) => e.id)).toEqual(['c', 't', 'a']);
  });

  it('só info → nenhuma ação', () => {
    expect(acoesRecomendadas([ev({ severidade: 'info' })])).toEqual([]);
  });
});

describe('filtrarEventos', () => {
  const lista = [
    ev({ id: '1', area: 'usinas', severidade: 'critico' }),
    ev({ id: '2', area: 'comercial', severidade: 'atencao' }),
    ev({ id: '3', area: 'usinas', severidade: 'atencao' }),
  ];
  it('por área e por severidade', () => {
    expect(filtrarEventos(lista, { area: 'usinas' }).map((e) => e.id)).toEqual(['1', '3']);
    expect(filtrarEventos(lista, { severidade: 'atencao' }).map((e) => e.id)).toEqual(['2', '3']);
    expect(filtrarEventos(lista, { area: 'usinas', severidade: 'atencao' }).map((e) => e.id)).toEqual(['3']);
  });
  it('valor desconhecido é ignorado (não esvazia a lista)', () => {
    expect(filtrarEventos(lista, { area: 'xss<script>', severidade: 'nada' })).toHaveLength(3);
  });
  it('guardas de tipo', () => {
    expect(ehSeveridade('critico')).toBe(true);
    expect(ehSeveridade('x')).toBe(false);
    expect(ehAreaEvento('om')).toBe(true);
    expect(ehAreaEvento(undefined)).toBe(false);
  });
});
