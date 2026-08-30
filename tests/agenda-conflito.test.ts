// tests/agenda-conflito.test.ts — detector de conflito + sugestão de horário
// (Eva Agenda A1). LeitorAgenda é mockado localmente (interface estreita) —
// nunca importa o CalendarService real nem bate na rede.
import { describe, it, expect } from 'vitest';
import { acharConflitos, sugerirHorario, type LeitorAgenda, type EventoAgenda } from '../src/modules/agenda/conflito.js';

// Mock simples: devolve sempre a mesma lista de eventos, ignorando o período
// pedido (os testes já passam o período certo pra cada caso).
function calendarioCom(eventos: EventoAgenda[]): LeitorAgenda {
  return { listarEventos: async () => eventos };
}

describe('agenda/conflito: acharConflitos()', () => {
  it('1) sem eventos → sem conflito', async () => {
    const cal = calendarioCom([]);
    const r = await acharConflitos(cal, '2026-08-31T09:00:00-03:00', '2026-08-31T10:00:00-03:00');
    expect(r).toEqual([]);
  });

  it('2) sobreposição total (evento existente cobre o novo por completo) → conflito', async () => {
    const evento: EventoAgenda = {
      id: '1', titulo: 'Visita Cyntia',
      inicioISO: '2026-08-31T08:00:00-03:00', fimISO: '2026-08-31T12:00:00-03:00',
      criadoPelaEva: true,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T09:00:00-03:00', '2026-08-31T10:00:00-03:00');
    expect(r).toEqual([evento]);
  });

  it('3) sobreposição parcial — novo começa antes e termina no meio do existente → conflito', async () => {
    const evento: EventoAgenda = {
      id: '2', titulo: 'Obra',
      inicioISO: '2026-08-31T10:00:00-03:00', fimISO: '2026-08-31T12:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T09:00:00-03:00', '2026-08-31T11:00:00-03:00');
    expect(r).toEqual([evento]);
  });

  it('4) sobreposição parcial — novo começa no meio e termina depois do existente → conflito', async () => {
    const evento: EventoAgenda = {
      id: '3', titulo: 'Dentista',
      inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T09:30:00-03:00', '2026-08-31T11:00:00-03:00');
    expect(r).toEqual([evento]);
  });

  it('5) bordas se tocando (novo termina exatamente quando existente começa) → NÃO é conflito', async () => {
    const evento: EventoAgenda = {
      id: '4', titulo: 'Reunião',
      inicioISO: '2026-08-31T10:00:00-03:00', fimISO: '2026-08-31T11:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T09:00:00-03:00', '2026-08-31T10:00:00-03:00');
    expect(r).toEqual([]);
  });

  it('6) bordas se tocando (novo começa exatamente quando existente termina) → NÃO é conflito', async () => {
    const evento: EventoAgenda = {
      id: '5', titulo: 'Reunião',
      inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T10:00:00-03:00', '2026-08-31T11:00:00-03:00');
    expect(r).toEqual([]);
  });

  it('7) evento de dia inteiro conflita com qualquer horário daquele dia', async () => {
    const evento: EventoAgenda = {
      id: '6', titulo: 'Feriado',
      inicioISO: '2026-08-31T00:00:00-03:00', fimISO: '2026-08-31T23:59:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await acharConflitos(cal, '2026-08-31T15:00:00-03:00', '2026-08-31T16:00:00-03:00');
    expect(r).toEqual([evento]);
  });

  it('8) vários eventos → devolve só os que realmente conflitam', async () => {
    const semConflito: EventoAgenda = {
      id: '7', titulo: 'Manhã livre depois',
      inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T08:00:00-03:00',
      criadoPelaEva: false,
    };
    const comConflito: EventoAgenda = {
      id: '8', titulo: 'Choca',
      inicioISO: '2026-08-31T09:30:00-03:00', fimISO: '2026-08-31T10:30:00-03:00',
      criadoPelaEva: true,
    };
    const cal = calendarioCom([semConflito, comConflito]);
    const r = await acharConflitos(cal, '2026-08-31T09:00:00-03:00', '2026-08-31T10:00:00-03:00');
    expect(r).toEqual([comConflito]);
  });
});

describe('agenda/conflito: sugerirHorario()', () => {
  it('1) dia vazio → sugere 07:00', async () => {
    const cal = calendarioCom([]);
    const r = await sugerirHorario(cal, '2026-08-31', 60);
    expect(r).toEqual({ inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T08:00:00-03:00' });
  });

  it('2) manhã ocupada até 09h → pula pro primeiro horário livre depois', async () => {
    const evento: EventoAgenda = {
      id: '1', titulo: 'Ocupado',
      inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T09:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await sugerirHorario(cal, '2026-08-31', 60);
    expect(r).toEqual({ inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00' });
  });

  it('3) dia lotado do início ao fim → null', async () => {
    const evento: EventoAgenda = {
      id: '1', titulo: 'Dia todo ocupado',
      inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T20:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    const r = await sugerirHorario(cal, '2026-08-31', 30);
    expect(r).toBeNull();
  });

  it('4) slot que terminaria depois das 20h é rejeitado (duração grande no fim do dia)', async () => {
    const evento: EventoAgenda = {
      id: '1', titulo: 'Ocupado até 19h30',
      inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T19:30:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([evento]);
    // livre só 19:30-20:00 (30min) — pedir 60min não cabe → null
    const r = await sugerirHorario(cal, '2026-08-31', 60);
    expect(r).toBeNull();
  });

  it('5) encontra o slot exato de 30min livre entre dois eventos', async () => {
    const antes: EventoAgenda = {
      id: '1', titulo: 'Antes',
      inicioISO: '2026-08-31T07:00:00-03:00', fimISO: '2026-08-31T09:00:00-03:00',
      criadoPelaEva: false,
    };
    const depois: EventoAgenda = {
      id: '2', titulo: 'Depois',
      inicioISO: '2026-08-31T09:30:00-03:00', fimISO: '2026-08-31T20:00:00-03:00',
      criadoPelaEva: false,
    };
    const cal = calendarioCom([antes, depois]);
    const r = await sugerirHorario(cal, '2026-08-31', 30);
    expect(r).toEqual({ inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T09:30:00-03:00' });
  });
});
