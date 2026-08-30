// tests/agenda-executor.test.ts — executor de agenda (marcar/desfazer/
// substituir + listagens formatadas) da Eva Agenda A1. AgendaEscrita é
// mockado localmente (interface estreita) — nunca bate no Google Calendar
// de verdade. O CalendarService real (src/modules/calendar.ts) satisfaz a
// interface estruturalmente (createEvent/deleteEvent/listarEventos já
// existem lá com essa assinatura).
import { describe, it, expect } from 'vitest';
import {
  marcar,
  desfazer,
  substituir,
  anexarLocalizacao,
  listarDiaFormatado,
  listarSemanaFormatado,
  ehDiaInteiro,
  coordsParaLink,
  COR_EMPRESA,
  COR_PESSOAL,
  type AgendaEscrita,
  type EventoAgendaListado,
} from '../src/modules/agenda/executor.js';
import type { Interpretacao } from '../src/modules/agenda/interpretar.js';

// Mock gravador: registra as chamadas feitas pra inspecionar nos asserts.
function mockAgenda(opts?: {
  eventos?: EventoAgendaListado[];
  falharCriar?: boolean;
}): AgendaEscrita & {
  chamadasCriar: Array<Parameters<AgendaEscrita['createEvent']>[0]>;
  chamadasExcluir: string[];
  chamadasAtualizar: Array<{ eventId: string; updates: { location?: string } }>;
} {
  const chamadasCriar: Array<Parameters<AgendaEscrita['createEvent']>[0]> = [];
  const chamadasExcluir: string[] = [];
  const chamadasAtualizar: Array<{ eventId: string; updates: { location?: string } }> = [];
  return {
    chamadasCriar,
    chamadasExcluir,
    chamadasAtualizar,
    async createEvent(input) {
      chamadasCriar.push(input);
      if (opts?.falharCriar) throw new Error('Google Calendar fora do ar');
      return { eventId: 'novo-id', htmlLink: 'https://calendar.google.com/novo-id' };
    },
    async deleteEvent(eventId) {
      chamadasExcluir.push(eventId);
    },
    async listarEventos() {
      return opts?.eventos ?? [];
    },
    async updateEvent(eventId, updates) {
      chamadasAtualizar.push({ eventId, updates });
      return { eventId, htmlLink: `https://calendar.google.com/${eventId}` };
    },
  };
}

function interp(over?: Partial<Interpretacao>): Interpretacao {
  return {
    titulo: 'Visita Cyntia',
    inicioISO: '2026-08-31T09:00:00-03:00',
    fimISO: '2026-08-31T10:00:00-03:00',
    diaInteiro: false,
    ambito: null,
    confianca: 'alta',
    ...over,
  };
}

describe('agenda/executor: marcar()', () => {
  it('1) âmbito empresa → colorId 9 (azul)', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'empresa');
    expect(cal.chamadasCriar[0].colorId).toBe(COR_EMPRESA);
    expect(COR_EMPRESA).toBe('9');
  });

  it('2) âmbito pessoal → colorId 10 (verde)', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'pessoal');
    expect(cal.chamadasCriar[0].colorId).toBe(COR_PESSOAL);
    expect(COR_PESSOAL).toBe('10');
  });

  it('3) descrição sempre traz a marca "criado pela Eva" (é o que listarEventos usa pra reconhecer)', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'empresa');
    expect(cal.chamadasCriar[0].description).toContain('criado pela Eva');
  });

  it('4) location do WhatsApp (pin) é repassado quando informado', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'empresa', { location: 'Rua das Flores, 123' });
    expect(cal.chamadasCriar[0].location).toBe('Rua das Flores, 123');
  });

  it('5) sem location → não quebra e não manda location pro Calendar', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'pessoal');
    expect(cal.chamadasCriar[0].location).toBeUndefined();
  });

  it('BUG 2 (revisão adversarial 30/08, belt+braces): fimISO <= inicioISO e não é dia inteiro → lança erro claro em PT, NÃO cria nada', async () => {
    const cal = mockAgenda();
    const invertido = interp({ inicioISO: '2026-08-31T15:00:00-03:00', fimISO: '2026-08-31T09:00:00-03:00' });
    await expect(marcar(cal, invertido, 'empresa')).rejects.toThrow(/Horário inválido/i);
    expect(cal.chamadasCriar).toHaveLength(0);
  });

  it('BUG 2: fimISO === inicioISO (duração zero) também é rejeitado', async () => {
    const cal = mockAgenda();
    const duracaoZero = interp({ inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T09:00:00-03:00' });
    await expect(marcar(cal, duracaoZero, 'empresa')).rejects.toThrow(/Horário inválido/i);
  });

  it('BUG 2: dia inteiro com fim "antes" do início (00:00→23:59 do MESMO dia é normal, mas a guarda não se aplica a diaInteiro) — não lança', async () => {
    const cal = mockAgenda();
    const diaTodo = interp({ diaInteiro: true, inicioISO: '2026-08-31T00:00:00-03:00', fimISO: '2026-08-31T23:59:00-03:00' });
    await expect(marcar(cal, diaTodo, 'empresa')).resolves.not.toThrow();
  });

  it('6) usa título/horário da interpretação e devolve eventId/htmlLink', async () => {
    const cal = mockAgenda();
    const r = await marcar(cal, interp({ titulo: 'Dentista' }), 'pessoal');
    expect(cal.chamadasCriar[0].summary).toBe('Dentista');
    expect(cal.chamadasCriar[0].startISO).toBe('2026-08-31T09:00:00-03:00');
    expect(cal.chamadasCriar[0].endISO).toBe('2026-08-31T10:00:00-03:00');
    expect(r).toEqual({ eventId: 'novo-id', htmlLink: 'https://calendar.google.com/novo-id' });
  });

  it('A1.1 (7b): "detalhes" (tarefas/materiais/contexto) entra na descrição JUNTO com a marca da Eva', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp({ detalhes: 'Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela' }), 'empresa');
    expect(cal.chamadasCriar[0].description).toContain('Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela');
    expect(cal.chamadasCriar[0].description).toContain('criado pela Eva');
  });

  it('A1.1 (7c): sem "detalhes" → descrição só com a marca da Eva (não sobra linha em branco/undefined)', async () => {
    const cal = mockAgenda();
    await marcar(cal, interp(), 'empresa');
    expect(cal.chamadasCriar[0].description).not.toContain('undefined');
    expect(cal.chamadasCriar[0].description).toContain('criado pela Eva');
  });
});

describe('agenda/executor: desfazer()', () => {
  it('7) chama excluir com o eventId passado', async () => {
    const cal = mockAgenda();
    await desfazer(cal, 'abc-123');
    expect(cal.chamadasExcluir).toEqual(['abc-123']);
  });

  it('A1.1 (7d): exclusão normal (sem erro) → jaEstava:false', async () => {
    const cal = mockAgenda();
    const r = await desfazer(cal, 'abc-123');
    expect(r).toEqual({ jaEstava: false });
  });

  it('A1.1 (7e): erro 404 (evento já não existe) → tratado como sucesso, jaEstava:true', async () => {
    const cal = mockAgenda();
    cal.deleteEvent = async () => { const err = new Error('Not Found') as Error & { code: number }; err.code = 404; throw err; };
    const r = await desfazer(cal, 'ja-sumiu');
    expect(r).toEqual({ jaEstava: true });
  });

  it('A1.1 (7f): erro 410 ("Resource has been deleted") → tratado como sucesso, jaEstava:true', async () => {
    const cal = mockAgenda();
    cal.deleteEvent = async () => {
      const err = new Error('Resource has been deleted') as Error & { response: { status: number } };
      err.response = { status: 410 };
      throw err;
    };
    const r = await desfazer(cal, 'ja-sumiu-410');
    expect(r).toEqual({ jaEstava: true });
  });

  it('A1.1 (7g): qualquer OUTRO erro (ex.: rede fora do ar) → propaga normalmente', async () => {
    const cal = mockAgenda();
    cal.deleteEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    await expect(desfazer(cal, 'x')).rejects.toThrow('Google Calendar fora do ar');
  });
});

describe('agenda/executor: substituir()', () => {
  it('8) exclui o conflitante e DEPOIS cria o novo, nessa ordem', async () => {
    const cal = mockAgenda();
    const ordem: string[] = [];
    cal.deleteEvent = async (id: string) => {
      ordem.push('excluir');
      cal.chamadasExcluir.push(id);
    };
    const criarOriginal = cal.createEvent.bind(cal);
    cal.createEvent = async (input) => {
      ordem.push('criar');
      return criarOriginal(input);
    };
    await substituir(cal, 'conflitante-1', interp(), 'empresa');
    expect(ordem).toEqual(['excluir', 'criar']);
    expect(cal.chamadasExcluir).toEqual(['conflitante-1']);
    expect(cal.chamadasCriar).toHaveLength(1);
  });

  it('9) se a criação falhar depois da exclusão, propaga erro com mensagem clara em PT', async () => {
    const cal = mockAgenda({ falharCriar: true });
    await expect(substituir(cal, 'conflitante-2', interp(), 'empresa')).rejects.toThrow(/excluíd[oa]/i);
    expect(cal.chamadasExcluir).toEqual(['conflitante-2']);
  });

  it('A1.1 (9b): conflitante já não existe (404) → não trava, cria o novo mesmo assim', async () => {
    const cal = mockAgenda();
    cal.deleteEvent = async () => { const err = new Error('Not Found') as Error & { code: number }; err.code = 404; throw err; };
    const r = await substituir(cal, 'ja-sumiu', interp(), 'empresa');
    expect(cal.chamadasCriar).toHaveLength(1);
    expect(r.eventId).toBe('novo-id');
  });

  it('A1.1 (9c): repassa location pro novo evento quando informado', async () => {
    const cal = mockAgenda();
    await substituir(cal, 'conflitante-3', interp(), 'empresa', { location: 'Rua das Flores, 123' });
    expect(cal.chamadasCriar[0].location).toBe('Rua das Flores, 123');
  });
});

describe('agenda/executor: anexarLocalizacao()', () => {
  it('A) chama updateEvent só com { location }, preservando o eventId', async () => {
    const cal = mockAgenda();
    await anexarLocalizacao(cal, 'evt-123', 'Rua das Flores, 123');
    expect(cal.chamadasAtualizar).toEqual([{ eventId: 'evt-123', updates: { location: 'Rua das Flores, 123' } }]);
  });

  it('B) erro no patch propaga normalmente (quem chama decide a mensagem amigável)', async () => {
    const cal = mockAgenda();
    cal.updateEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    await expect(anexarLocalizacao(cal, 'evt-1', 'Rua das Flores, 123')).rejects.toThrow('Google Calendar fora do ar');
  });
});

describe('agenda/executor: listarDiaFormatado()', () => {
  it('10) dia vazio → "Nada marcado 🎉"', async () => {
    const cal = mockAgenda({ eventos: [] });
    const r = await listarDiaFormatado(cal, '2026-08-31', 'Amanhã');
    expect(r).toContain('Nada marcado 🎉');
    expect(r).toContain('Amanhã');
  });

  it('11) formata hora HH:mm–HH:mm, bolinha por cor, título — e ordena por horário', async () => {
    const eventos: EventoAgendaListado[] = [
      { id: '2', titulo: 'Dentista', inicioISO: '2026-08-31T15:00:00-03:00', fimISO: '2026-08-31T16:00:00-03:00', criadoPelaEva: true, colorId: COR_PESSOAL },
      { id: '1', titulo: 'Visita Cyntia', inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00', criadoPelaEva: true, colorId: COR_EMPRESA },
    ];
    const cal = mockAgenda({ eventos });
    const r = await listarDiaFormatado(cal, '2026-08-31', 'Amanhã');
    const linhas = r.split('\n');
    // cabeçalho com o dia da semana (dom 31/08)
    expect(linhas[0]).toContain('Amanhã');
    expect(linhas[0]).toContain('31/08');
    // ordenado: Visita Cyntia (09h) antes de Dentista (15h)
    const idxCyntia = r.indexOf('Visita Cyntia');
    const idxDentista = r.indexOf('Dentista');
    expect(idxCyntia).toBeGreaterThan(-1);
    expect(idxDentista).toBeGreaterThan(idxCyntia);
    expect(r).toContain('🔵 09:00–10:00 Visita Cyntia');
    expect(r).toContain('🟢 15:00–16:00 Dentista');
  });

  it('12) evento de dia inteiro aparece como "dia todo"', async () => {
    const eventos: EventoAgendaListado[] = [
      { id: '1', titulo: 'Feriado', inicioISO: '2026-08-31T00:00:00-03:00', fimISO: '2026-08-31T23:59:00-03:00', criadoPelaEva: true, colorId: COR_EMPRESA },
    ];
    const cal = mockAgenda({ eventos });
    const r = await listarDiaFormatado(cal, '2026-08-31', 'Amanhã');
    expect(r).toContain('dia todo');
    expect(r).toContain('Feriado');
  });

  it('13) sem colorId reconhecido → bolinha azul (default)', async () => {
    const eventos: EventoAgendaListado[] = [
      { id: '1', titulo: 'Reunião externa', inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00', criadoPelaEva: false },
    ];
    const cal = mockAgenda({ eventos });
    const r = await listarDiaFormatado(cal, '2026-08-31', 'Amanhã');
    expect(r).toContain('🔵 09:00–10:00 Reunião externa');
  });

  it('16) evento all-day NATIVO do Google (fim exclusivo, 00:00 do dia SEGUINTE) também aparece como "dia todo"', async () => {
    // Shape real que sai de calendar.ts listarEventos pra um evento all-day
    // nativo do Google: start.date='2026-09-07' → '2026-09-07T00:00:00-03:00',
    // end.date='2026-09-08' (exclusivo) → '2026-09-08T00:00:00-03:00'.
    const eventos: EventoAgendaListado[] = [
      { id: '1', titulo: 'Feriado', inicioISO: '2026-09-07T00:00:00-03:00', fimISO: '2026-09-08T00:00:00-03:00', criadoPelaEva: false },
    ];
    const cal = mockAgenda({ eventos });
    const r = await listarDiaFormatado(cal, '2026-09-07', 'Hoje');
    expect(r).toContain('dia todo');
    expect(r).toContain('Feriado');
    expect(r).not.toContain('00:00–00:00');
  });
});

describe('agenda/executor: ehDiaInteiro() — guarda defensiva', () => {
  it('17) inicioISO/fimISO vazios ou inválidos → NUNCA classifica como dia todo', () => {
    expect(ehDiaInteiro({ id: 'x', titulo: 'Malformado', inicioISO: '', fimISO: '', criadoPelaEva: false })).toBe(false);
    expect(ehDiaInteiro({ id: 'x', titulo: 'Só início', inicioISO: '2026-09-07T00:00:00-03:00', fimISO: '', criadoPelaEva: false })).toBe(false);
  });
});

describe('agenda/executor: listarSemanaFormatado()', () => {
  it('14) agrupa por dia e pula dias sem eventos', async () => {
    // Segunda 2026-08-31 tem evento; terça (01/09) não tem; quarta (02/09) tem.
    const cal: AgendaEscrita = {
      async createEvent() { throw new Error('não usado neste teste'); },
      async deleteEvent() { /* não usado */ },
      async updateEvent(eventId) { return { eventId, htmlLink: '' }; /* não usado */ },
      async listarEventos(inicioISO: string) {
        if (inicioISO.startsWith('2026-08-31')) {
          return [
            { id: '1', titulo: 'Visita Cyntia', inicioISO: '2026-08-31T09:00:00-03:00', fimISO: '2026-08-31T10:00:00-03:00', criadoPelaEva: true, colorId: COR_EMPRESA },
          ];
        }
        if (inicioISO.startsWith('2026-09-02')) {
          return [
            { id: '2', titulo: 'Dentista', inicioISO: '2026-09-02T15:00:00-03:00', fimISO: '2026-09-02T16:00:00-03:00', criadoPelaEva: true, colorId: COR_PESSOAL },
          ];
        }
        return [];
      },
    };
    const r = await listarSemanaFormatado(cal, '2026-08-31');
    expect(r).toContain('Visita Cyntia');
    expect(r).toContain('Dentista');
    expect(r).toContain('31/08');
    expect(r).toContain('02/09');
    expect(r).not.toContain('01/09'); // dia vazio (terça) não aparece
    // ordem: segunda antes de quarta
    expect(r.indexOf('31/08')).toBeLessThan(r.indexOf('02/09'));
  });

  it('15) semana inteira vazia → mensagem única', async () => {
    const cal = mockAgenda({ eventos: [] });
    const r = await listarSemanaFormatado(cal, '2026-08-31');
    expect(r).toContain('Nada marcado');
  });
});

describe('coordsParaLink (link clicável do Google Maps a partir do pin)', () => {
  it('monta a URL com 6 casas decimais a partir de numbers', () => {
    expect(coordsParaLink(-22.63, -47.2)).toBe('https://www.google.com/maps?q=-22.630000,-47.200000');
  });

  it('lida com coordenadas positivas', () => {
    expect(coordsParaLink(22.63, 47.2)).toBe('https://www.google.com/maps?q=22.630000,47.200000');
  });

  it('aceita lat/lng vindos como string (trim + parse)', () => {
    expect(coordsParaLink(' -22.63 ', ' -47.20 ')).toBe('https://www.google.com/maps?q=-22.630000,-47.200000');
  });

  it('arredonda pra 6 casas decimais mesmo com mais precisão de entrada', () => {
    expect(coordsParaLink(-22.6300001234, -47.1999999)).toBe('https://www.google.com/maps?q=-22.630000,-47.200000');
  });

  it('nunca devolve as coordenadas cruas sem link — sempre um link clicável', () => {
    const link = coordsParaLink(-22.63, -47.2);
    expect(link.startsWith('https://www.google.com/maps?q=')).toBe(true);
  });
});
