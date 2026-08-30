// tests/agenda-comando.test.ts — handler da Eva Agenda A1 (comando-agenda.ts).
// Cola interpretar/classificar/conflito/executor pra uma conversa de zap.
// Tudo mockado (IA canned, AgendaEscrita em memória) — nunca bate em rede/banco.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  tratarMensagemAgenda, tratarBotaoAgenda, resetEstadoAgenda,
  type DepsAgenda,
} from '../src/modules/agenda/comando-agenda.js';
import { interpretar, type ExtratorIA } from '../src/modules/agenda/interpretar.js';
import type { AgendaEscrita, EventoAgendaListado } from '../src/modules/agenda/executor.js';

// -----------------------------------------------------------------------
// Test doubles
// -----------------------------------------------------------------------

function iaCanned(campos: {
  titulo?: string | null; dataTexto?: string | null; horaTexto?: string | null;
  duracaoTexto?: string | null; diaInteiro?: boolean; ambito?: 'empresa' | 'pessoal' | null;
} | null): ExtratorIA {
  const json = campos === null
    ? { compromisso: false, titulo: null, dataTexto: null, horaTexto: null, duracaoTexto: null, diaInteiro: false, ambito: null }
    : {
      compromisso: true,
      titulo: campos.titulo ?? 'Compromisso',
      dataTexto: campos.dataTexto ?? null,
      horaTexto: campos.horaTexto ?? null,
      duracaoTexto: campos.duracaoTexto ?? null,
      diaInteiro: campos.diaInteiro ?? false,
      ambito: campos.ambito ?? null,
    };
  return { async extrairAgenda() { return '```json\n' + JSON.stringify(json) + '\n```'; } };
}

function iaNuncaChamada(): ExtratorIA {
  return { async extrairAgenda() { throw new Error('IA não deveria ser chamada — consulta é regex barata'); } };
}

function criarClock(inicialISO: string) {
  let atual = inicialISO;
  return { agoraISO: () => atual, avancar: (ms: number) => { atual = new Date(Date.parse(atual) + ms).toISOString(); } };
}

function mockCal(eventos: EventoAgendaListado[] = []): AgendaEscrita & {
  criados: Array<Parameters<AgendaEscrita['createEvent']>[0]>;
  excluidos: string[];
} {
  const criados: Array<Parameters<AgendaEscrita['createEvent']>[0]> = [];
  const excluidos: string[] = [];
  let n = 0;
  return {
    criados, excluidos,
    async createEvent(input) {
      criados.push(input);
      n++;
      return { eventId: `evt-${n}`, htmlLink: `https://calendar.google.com/evt-${n}` };
    },
    async deleteEvent(eventId) { excluidos.push(eventId); },
    async listarEventos() { return eventos; },
  };
}

const AGORA = '2026-08-30T08:00:00-03:00'; // domingo — fora do fluxo, só uma referência estável

function depsBase(over?: Partial<DepsAgenda>): DepsAgenda {
  const clock = criarClock(AGORA);
  return {
    cal: mockCal(),
    ia: iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' }),
    agoraISO: clock.agoraISO,
    nomesDeLeads: async () => [],
    ...over,
  };
}

beforeEach(() => {
  resetEstadoAgenda();
});

// -----------------------------------------------------------------------
// CONSULTAS — prioridade, regex barata, nunca chama IA
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: consultas (prioridade, sem IA)', () => {
  it('1) "agenda" pelado → hoje', async () => {
    const eventos: EventoAgendaListado[] = [{ id: '1', titulo: 'Reunião', inicioISO: `${AGORA.slice(0, 10)}T10:00:00-03:00`, fimISO: `${AGORA.slice(0, 10)}T11:00:00-03:00`, criadoPelaEva: true }];
    const deps = depsBase({ cal: mockCal(eventos), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'agenda');
    expect(r).not.toBeNull();
    expect(r!.texto).toContain('Hoje');
    expect(r!.texto).toContain('Reunião');
  });

  it('2) "o que tenho hoje" → hoje, dia vazio → "Nada marcado"', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'o que tenho hoje?');
    expect(r!.texto).toContain('Hoje');
    expect(r!.texto).toContain('Nada marcado');
  });

  it('3) "compromissos amanhã" → amanhã', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'compromissos amanhã');
    expect(r!.texto).toContain('Amanhã');
  });

  it('4) "agenda da semana" → semana', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'agenda da semana');
    expect(r!.texto).toContain('Nada marcado essa semana');
  });
});

// -----------------------------------------------------------------------
// NÃO É AGENDA / CONFIANÇA BAIXA
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: não é assunto de agenda', () => {
  it('5) IA diz compromisso:false → null (outro fluxo da Eva cuida)', async () => {
    const deps = depsBase({ ia: iaCanned(null) });
    const r = await tratarMensagemAgenda(deps, 'quanto vendi esse mês?');
    expect(r).toBeNull();
  });
});

describe('tratarMensagemAgenda: confiança baixa', () => {
  it('6) sem data nem hora reconhecível → pergunta curta, não cria nada', async () => {
    const deps = depsBase({ ia: iaCanned({ titulo: 'Reunião', dataTexto: null, horaTexto: null }) });
    const r = await tratarMensagemAgenda(deps, 'marca uma reunião');
    expect(r!.texto).toMatch(/que dia e hora/i);
    expect(r!.botoes).toBeUndefined();
    expect((deps.cal as ReturnType<typeof mockCal>).criados).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// MARCAR SEM CONFLITO
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: marcar sem conflito', () => {
  it('7) ambito explícito da IA → cria direto, resposta com botões Desfazer/É pessoal', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' }) });
    const r = await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].colorId).toBe('9');
    expect(r!.texto).toContain('📅 Marquei: Visita Cyntia');
    expect(r!.texto).toContain('🔵 empresa');
    expect(r!.botoes).toEqual([
      { id: 'ag_desf_evt-1', rotulo: 'Desfazer' },
      { id: 'ag_cor_evt-1', rotulo: 'É pessoal' },
    ]);
  });

  it('8) sem ambito da IA → classificar() decide usando nomesDeLeads (só chamado quando precisa)', async () => {
    let chamouLeads = false;
    const cal = mockCal([]);
    const deps = depsBase({
      cal,
      ia: iaCanned({ titulo: 'Cyntia', dataTexto: 'amanhã', horaTexto: '21h', ambito: null }), // 21h fora do horário comercial → fallback seria pessoal
      nomesDeLeads: async () => { chamouLeads = true; return ['Cyntia Alves']; },
    });
    const r = await tratarMensagemAgenda(deps, 'Cyntia amanhã 21h');
    expect(chamouLeads).toBe(true);
    expect(cal.criados[0].colorId).toBe('9'); // achou o lead → empresa (não caiu no fallback pessoal)
    expect(r!.texto).toContain('🔵 empresa');
  });

  it('9) nomesDeLeads NÃO é chamado quando a IA já crava o âmbito', async () => {
    let chamouLeads = false;
    const deps = depsBase({
      ia: iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'pessoal' }),
      nomesDeLeads: async () => { chamouLeads = true; return []; },
    });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    expect(chamouLeads).toBe(false);
  });

  it('10) location (pin do WhatsApp) é repassado pro evento', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h', '-15.793889,-47.882778');
    expect(cal.criados[0].location).toBe('-15.793889,-47.882778');
  });
});

// -----------------------------------------------------------------------
// CONFLITO
// -----------------------------------------------------------------------

async function interpDeReferencia(ia: ExtratorIA) {
  const interp = await interpretar('visita Cyntia amanhã 9h', AGORA, ia);
  if (!interp) throw new Error('setup de teste inválido: interp nulo');
  return interp;
}

describe('tratarMensagemAgenda: conflito', () => {
  it('11) evento já ocupa o horário → NÃO cria, avisa e oferece 3 botões', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = {
      id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true,
    };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    const r = await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    expect(cal.criados).toHaveLength(0);
    expect(r!.texto).toContain('⚠️ Você já tem Dentista');
    expect(r!.botoes).toEqual([
      { id: 'ag_junto', rotulo: 'Marcar junto' },
      { id: 'ag_subst', rotulo: 'Substituir' },
      { id: 'ag_sugerir', rotulo: 'Sugerir horário' },
    ]);
  });
});

// -----------------------------------------------------------------------
// BOTÕES
// -----------------------------------------------------------------------

describe('tratarBotaoAgenda: ag_desf (desfazer)', () => {
  it('12) chama desfazer com o eventId do próprio botão, funciona mesmo sem estado pendente', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-77');
    expect(cal.excluidos).toEqual(['evt-77']);
    expect(r!.texto).toBe('Desfeito ✔');
  });
});

describe('tratarBotaoAgenda: ag_cor (recolorir)', () => {
  it('13) desfaz e recria com a cor oposta', async () => {
    const cal = mockCal([]);
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // cria evt-1, ambito empresa
    const r = await tratarBotaoAgenda(deps, 'ag_cor_evt-1');
    expect(cal.excluidos).toEqual(['evt-1']);
    expect(cal.criados).toHaveLength(2);
    expect(cal.criados[1].colorId).toBe('10'); // pessoal
    expect(r!.texto).toContain('agora é 🟢 pessoal');
  });

  it('14) eventId que não bate com o último criado → expirou', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // cria evt-1
    const r = await tratarBotaoAgenda(deps, 'ag_cor_evt-outro');
    expect(r!.texto).toBe('Esse pedido expirou — me manda de novo 😉');
    expect(cal.excluidos).toHaveLength(0);
  });
});

describe('tratarBotaoAgenda: ag_junto', () => {
  it('15) cria o novo mesmo com o conflito (ignora de propósito)', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // vira pendente de conflito
    const r = await tratarBotaoAgenda(deps, 'ag_junto');
    expect(cal.criados).toHaveLength(1);
    expect(r!.texto).toContain('📅 Marquei: Visita Cyntia');
    expect(r!.botoes?.[0].id).toBe('ag_desf_evt-1');
  });
});

describe('tratarBotaoAgenda: ag_subst', () => {
  it('16) exclui o conflitante e cria o novo', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    const r = await tratarBotaoAgenda(deps, 'ag_subst');
    expect(cal.excluidos).toEqual(['conflito-1']);
    expect(cal.criados).toHaveLength(1);
    expect(r!.texto).toContain('📅 Marquei: Visita Cyntia');
  });
});

describe('tratarBotaoAgenda: ag_sugerir', () => {
  it('17) acha o primeiro horário livre e pergunta Sim/Não', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    // Só o próprio horário (9h-10h) está ocupado — 07:00 fica livre.
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    const r = await tratarBotaoAgenda(deps, 'ag_sugerir');
    expect(r!.texto).toMatch(/Que tal 07:00\?/);
    expect(r!.botoes).toEqual([{ id: 'ag_sim', rotulo: 'Sim' }, { id: 'ag_nao', rotulo: 'Não' }]);
  });

  it('18) dia inteiro lotado → sem sugestão, avisa e some com o pendente', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const diaLotado: EventoAgendaListado = {
      id: 'conflito-1', titulo: 'Bloqueado', criadoPelaEva: true,
      inicioISO: `${interp.inicioISO.slice(0, 10)}T00:00:00-03:00`,
      fimISO: `${interp.inicioISO.slice(0, 10)}T23:59:00-03:00`,
    };
    const cal = mockCal([diaLotado]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    const r = await tratarBotaoAgenda(deps, 'ag_sugerir');
    expect(r!.texto).toMatch(/não achei horário livre/i);
    // pendente foi limpo — um "sim" depois disso não faz mais sentido
    const r2 = await tratarBotaoAgenda(deps, 'ag_sim');
    expect(r2!.texto).toBe('Esse pedido expirou — me manda de novo 😉');
  });
});

describe('tratarBotaoAgenda: ag_sim / ag_nao', () => {
  it('19) ag_sim marca no horário sugerido', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    await tratarBotaoAgenda(deps, 'ag_sugerir');
    const r = await tratarBotaoAgenda(deps, 'ag_sim');
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].startISO).toBe(`${interp.inicioISO.slice(0, 10)}T07:00:00-03:00`);
    expect(r!.texto).toContain('📅 Marquei: Visita Cyntia');
  });

  it('20) ag_nao limpa o pendente e devolve o convite pra outro horário', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    await tratarBotaoAgenda(deps, 'ag_sugerir');
    const r = await tratarBotaoAgenda(deps, 'ag_nao');
    expect(r!.texto).toBe('Ok, me diga outro horário 👍');
    const r2 = await tratarBotaoAgenda(deps, 'ag_junto');
    expect(r2!.texto).toBe('Esse pedido expirou — me manda de novo 😉');
  });
});

describe('tratarBotaoAgenda: TTL de 10 minutos', () => {
  it('21) passado o prazo, o botão de conflito expira', async () => {
    const clock = criarClock(AGORA);
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps: DepsAgenda = { cal, ia, agoraISO: clock.agoraISO, nomesDeLeads: async () => [] };
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    clock.avancar(11 * 60 * 1000); // 11 minutos — passou dos 10min de TTL
    const r = await tratarBotaoAgenda(deps, 'ag_junto');
    expect(r!.texto).toBe('Esse pedido expirou — me manda de novo 😉');
    expect(cal.criados).toHaveLength(0);
  });
});

describe('tratarBotaoAgenda: botão desconhecido', () => {
  it('22) id que não é nosso ("finlan:...") → null, deixa outro handler tratar', async () => {
    const deps = depsBase();
    const r = await tratarBotaoAgenda(deps, 'finlan:pf:abc-123');
    expect(r).toBeNull();
  });
});

// -----------------------------------------------------------------------
// REGRESSÃO: detectarConsulta ANCORADA — só é consulta quando a mensagem
// INTEIRA é uma pergunta de agenda. Sem âncora, "agenda a visita da Cyntia
// amanhã 9h" batia em \bagenda\b + \bamanhã\b e virava LISTAGEM em vez de
// marcar — bug real encontrado em revisão.
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: consulta ancorada não sequestra marcar', () => {
  it('23) "agenda a visita da Cyntia amanhã 9h" → vai pro MARCAR (interpretar chamado, não é listagem)', async () => {
    let iaChamada = false;
    const cal = mockCal([]);
    const ia: ExtratorIA = {
      async extrairAgenda(prompt: string) {
        iaChamada = true;
        return '```json\n' + JSON.stringify({
          compromisso: true, titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h',
          duracaoTexto: null, diaInteiro: false, ambito: 'empresa',
        }) + '\n```';
      },
    };
    const deps = depsBase({ cal, ia });
    const r = await tratarMensagemAgenda(deps, 'agenda a visita da Cyntia amanhã 9h');
    expect(iaChamada).toBe(true); // não foi tratado como consulta (regex barata) — passou pra IA
    expect(cal.criados).toHaveLength(1); // marcou de verdade
    expect(r!.texto).toContain('📅 Marquei: Visita Cyntia');
    expect(r!.texto).not.toContain('Nada marcado');
  });

  it('24) "minha agenda de amanhã?" → consulta amanhã', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'minha agenda de amanhã?');
    expect(r!.texto).toContain('Amanhã');
  });

  it('25) "o que tenho essa semana" → consulta semana', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'o que tenho essa semana');
    expect(r!.texto).toContain('Nada marcado essa semana');
  });

  it('26) "agenda" pelado continua consulta hoje (regressão da âncora)', async () => {
    const deps = depsBase({ cal: mockCal([]), ia: iaNuncaChamada() });
    const r = await tratarMensagemAgenda(deps, 'agenda');
    expect(r!.texto).toContain('Hoje');
  });
});

// -----------------------------------------------------------------------
// TRATAMENTO DE ERRO: qualquer exceção (IA, Google Calendar) vira resposta
// amigável em vez de derrubar o handler — MAS só depois de sabermos que é
// assunto de agenda (senão hijacka mensagem que nem era pra ela).
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: erro vira resposta amigável (não derruba)', () => {
  it('27) ia.extrairAgenda lança exceção → null (não sequestra mensagem comum)', async () => {
    const iaQuebrada: ExtratorIA = { async extrairAgenda() { throw new Error('Anthropic API fora do ar'); } };
    // interpretar() já engole esse erro internamente e devolve null — o
    // handler não deve virar erro amigável pra um texto que pode nem ser agenda.
    const deps = depsBase({ ia: iaQuebrada });
    const r = await tratarMensagemAgenda(deps, 'quanto vendi esse mês?');
    expect(r).toBeNull();
  });

  it('28) cal.createEvent lança exceção depois de um interp bom → resposta de erro amigável (não lança)', async () => {
    const cal = mockCal([]);
    cal.createEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    const deps = depsBase({ cal });
    const r = await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    expect(r).not.toBeNull();
    expect(r!.texto).toBe('❌ Deu ruim aqui na agenda agora — tenta de novo em instantes. Se repetir, me chama.');
  });
});

describe('tratarBotaoAgenda: erro vira resposta amigável (não derruba)', () => {
  it('29) cal.deleteEvent lança exceção → resposta de erro amigável (não lança)', async () => {
    const cal = mockCal([]);
    cal.deleteEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-1');
    expect(r).not.toBeNull();
    expect(r!.texto).toBe('❌ Deu ruim aqui na agenda agora — tenta de novo em instantes. Se repetir, me chama.');
  });
});
