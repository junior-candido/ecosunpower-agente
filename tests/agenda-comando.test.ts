// tests/agenda-comando.test.ts — handler da Eva Agenda A1 (comando-agenda.ts).
// Cola interpretar/classificar/conflito/executor pra uma conversa de zap.
// Tudo mockado (IA canned, AgendaEscrita em memória) — nunca bate em rede/banco.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  tratarMensagemAgenda, tratarBotaoAgenda, tratarLocalizacaoAgenda, resetEstadoAgenda,
  type DepsAgenda,
} from '../src/modules/agenda/comando-agenda.js';
import { interpretar, resolverData, type ExtratorIA } from '../src/modules/agenda/interpretar.js';
import type { AgendaEscrita, EventoAgendaListado } from '../src/modules/agenda/executor.js';

// -----------------------------------------------------------------------
// Test doubles
// -----------------------------------------------------------------------

function iaCanned(campos: {
  titulo?: string | null; detalhes?: string | null; dataTexto?: string | null; horaTexto?: string | null;
  duracaoTexto?: string | null; diaInteiro?: boolean; ambito?: 'empresa' | 'pessoal' | null;
} | null): ExtratorIA {
  const json = campos === null
    ? { compromisso: false, titulo: null, detalhes: null, dataTexto: null, horaTexto: null, duracaoTexto: null, diaInteiro: false, ambito: null }
    : {
      compromisso: true,
      titulo: campos.titulo ?? 'Compromisso',
      detalhes: campos.detalhes ?? null,
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
  atualizados: Array<{ eventId: string; updates: { location?: string } }>;
} {
  const criados: Array<Parameters<AgendaEscrita['createEvent']>[0]> = [];
  const excluidos: string[] = [];
  const atualizados: Array<{ eventId: string; updates: { location?: string } }> = [];
  let n = 0;
  return {
    criados, excluidos, atualizados,
    async createEvent(input) {
      criados.push(input);
      n++;
      return { eventId: `evt-${n}`, htmlLink: `https://calendar.google.com/evt-${n}` };
    },
    async deleteEvent(eventId) { excluidos.push(eventId); },
    async listarEventos() { return eventos; },
    async updateEvent(eventId, updates) {
      atualizados.push({ eventId, updates });
      return { eventId, htmlLink: `https://calendar.google.com/${eventId}` };
    },
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
  it('6) sem data nem hora reconhecível → pergunta curta dizendo o que ENTENDEU, não cria nada', async () => {
    const deps = depsBase({ ia: iaCanned({ titulo: 'Reunião', dataTexto: null, horaTexto: null }) });
    const r = await tratarMensagemAgenda(deps, 'marca uma reunião');
    expect(r!.texto).toBe('Anotei "Reunião" 📝 — só me confirma o dia e a hora (ex.: amanhã 9h)');
    expect(r!.botoes).toBeUndefined();
    expect((deps.cal as ReturnType<typeof mockCal>).criados).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// A1.1 — completar o pendente "que dia e hora?" em vez de reiniciar o loop
// -----------------------------------------------------------------------

describe('tratarMensagemAgenda: A1.1 completa o pendente "que dia e hora?" (mata o loop)', () => {
  it('36) "dentista" (sem dia/hora) → pergunta; "amanhã 9h" na sequência → cria "Dentista" amanhã 9h', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Dentista', dataTexto: null, horaTexto: null }) });
    const r1 = await tratarMensagemAgenda(deps, 'dentista');
    expect(r1!.texto).toContain('Anotei "Dentista"');
    expect(cal.criados).toHaveLength(0);

    const r2 = await tratarMensagemAgenda(deps, 'amanhã 9h');
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].summary).toBe('Dentista');
    expect(cal.criados[0].startISO).toBe(`${resolverData('amanhã', AGORA).dateISO}T09:00:00-03:00`);
    expect(r2!.texto).toContain('📅 Marquei: Dentista');
  });

  it('43 (BUG 1, revisão adversarial 30/08): mensagem seguinte é um COMPROMISSO NOVO COMPLETO ("visita na Ana quinta 10h") → NÃO rouba o pendente "dentista"; o assunto novo vence', async () => {
    const cal = mockCal([]);
    const ia: ExtratorIA = {
      async extrairAgenda(prompt: string) {
        if (prompt.includes('"dentista"')) {
          return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Dentista', detalhes: null, dataTexto: null, horaTexto: null, duracaoTexto: null, diaInteiro: false, ambito: null }) + '\n```';
        }
        if (prompt.includes('visita na Ana quinta 10h')) {
          return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Visita Ana', detalhes: null, dataTexto: 'quinta', horaTexto: '10h', duracaoTexto: null, diaInteiro: false, ambito: null }) + '\n```';
        }
        return '```json\n{"compromisso": false}\n```';
      },
    };
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'dentista'); // fica pendente aguardando data/hora
    const r2 = await tratarMensagemAgenda(deps, 'visita na Ana quinta 10h');
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].summary).toBe('Visita Ana'); // NÃO "Dentista"
    expect(r2!.texto).toContain('📅 Marquei: Visita Ana');
  });

  it('44 (BUG 1): "quinta que vem lá pelas 10" (bare-ish — só dia/hora com fillers de aproximação) → COMPLETA "Dentista"', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Dentista', dataTexto: null, horaTexto: null }) });
    await tratarMensagemAgenda(deps, 'dentista');
    const r2 = await tratarMensagemAgenda(deps, 'quinta que vem lá pelas 10');
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].summary).toBe('Dentista');
    expect(r2!.texto).toContain('📅 Marquei: Dentista');
  });

  it('37) mensagem seguinte que NÃO é só dia/hora → não completa (segue fluxo normal, não cria nada errado)', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Dentista', dataTexto: null, horaTexto: null }) });
    await tratarMensagemAgenda(deps, 'dentista');
    // Segunda mensagem não tem pista de dia/hora nenhuma — a IA (canned, sem
    // ambito/data/hora de novo) mantém confiança baixa: segue perguntando.
    const r2 = await tratarMensagemAgenda(deps, 'sei lá, depois eu vejo');
    expect(cal.criados).toHaveLength(0);
    expect(r2!.texto).toContain('Anotei');
  });

  it('38) pendente expira (10min) → completude NÃO acontece; a mensagem seguinte passa pelo fluxo normal (interpretar) do zero', async () => {
    const clock = criarClock(AGORA);
    const cal = mockCal([]);
    // IA que responde de acordo com a frase recebida (o prompt embute a
    // frase crua) — assim dá pra distinguir "usou o pendente antigo" de
    // "processou a mensagem nova do zero via interpretar()".
    const ia: ExtratorIA = {
      async extrairAgenda(prompt: string) {
        if (prompt.includes('"dentista"')) {
          return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Dentista', detalhes: null, dataTexto: null, horaTexto: null, duracaoTexto: null, diaInteiro: false, ambito: null }) + '\n```';
        }
        if (prompt.includes('"amanhã 9h"')) {
          return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Compromisso', detalhes: null, dataTexto: 'amanhã', horaTexto: '9h', duracaoTexto: null, diaInteiro: false, ambito: null }) + '\n```';
        }
        return '```json\n{"compromisso": false}\n```';
      },
    };
    const deps: DepsAgenda = { cal, ia, agoraISO: clock.agoraISO, nomesDeLeads: async () => [] };
    await tratarMensagemAgenda(deps, 'dentista'); // fica pendente aguardando data/hora
    clock.avancar(11 * 60 * 1000); // passa do TTL de 10min — pendente expirou
    const r2 = await tratarMensagemAgenda(deps, 'amanhã 9h');
    // Criou um compromisso NOVO com título "Compromisso" (default) — não
    // reaproveitou o título "Dentista" do pendente expirado.
    expect(cal.criados).toHaveLength(1);
    expect(cal.criados[0].summary).toBe('Compromisso');
    expect(r2!.texto).toContain('📅 Marquei: Compromisso');
  });

  it('39) pin de localização chega JUNTO com a mensagem que completa o pendente → anexado ao evento final', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Dentista', dataTexto: null, horaTexto: null }) });
    await tratarMensagemAgenda(deps, 'dentista');
    const r2 = await tratarMensagemAgenda(deps, 'amanhã 9h', '-15.793889,-47.882778');
    expect(cal.criados[0].location).toBe('-15.793889,-47.882778');
    expect(r2!.texto).toContain('📍 com localização');
  });

  it('40) pin chegou JUNTO com a 1ª mensagem (sem dia/hora ainda) → carrega pro evento quando completar depois', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal, ia: iaCanned({ titulo: 'Dentista', dataTexto: null, horaTexto: null }) });
    await tratarMensagemAgenda(deps, 'dentista', '-15.793889,-47.882778');
    const r2 = await tratarMensagemAgenda(deps, 'amanhã 9h');
    expect(cal.criados[0].location).toBe('-15.793889,-47.882778');
    expect(r2!.texto).toContain('📍 com localização');
  });
});

describe('tratarMensagemAgenda: A1.1 confirmação avisa quando há detalhes/localização', () => {
  it('41) compromisso com "detalhes" (tarefas/materiais) → confirmação diz "com anotações"', async () => {
    const cal = mockCal([]);
    const deps = depsBase({
      cal,
      ia: iaCanned({
        titulo: 'Visita João', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa',
        detalhes: 'Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela',
      }),
    });
    const r = await tratarMensagemAgenda(deps, 'visita no João amanhã 9h — levar a escada, trocar o disjuntor da piscina e cobrar a segunda parcela');
    expect(cal.criados[0].description).toContain('Levar a escada');
    expect(r!.texto).toContain('📝 com anotações');
  });

  it('42) sem detalhes/localização → confirmação NÃO menciona anotações nem localização', async () => {
    const deps = depsBase();
    const r = await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    expect(r!.texto).not.toContain('📝 com anotações');
    expect(r!.texto).not.toContain('📍 com localização');
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
  it('29) ag_desf: cal.deleteEvent lança exceção NÃO relacionada a 404/410 → mensagem específica de desfazer (não a genérica)', async () => {
    const cal = mockCal([]);
    cal.deleteEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-1');
    expect(r).not.toBeNull();
    expect(r!.texto).toBe('Não consegui desfazer — confere na agenda se o evento ainda está lá.');
  });

  it('29b) ag_cor: erro genérico (não desfazer) continua caindo na mensagem amigável de sempre', async () => {
    const cal = mockCal([]);
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // cria evt-1
    cal.createEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    const r = await tratarBotaoAgenda(deps, 'ag_cor_evt-1');
    expect(r).not.toBeNull();
    expect(r!.texto).toBe('❌ Deu ruim aqui na agenda agora — tenta de novo em instantes. Se repetir, me chama.');
  });
});

describe('tratarBotaoAgenda: ag_desf — 404/410 tratados como sucesso idempotente (A1.1)', () => {
  it('30) evento já não existe (404) → "Já estava desfeito ✔" em vez do erro genérico', async () => {
    const cal = mockCal([]);
    cal.deleteEvent = async () => { const err = new Error('Not Found') as Error & { code: number }; err.code = 404; throw err; };
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-sumiu');
    expect(r!.texto).toBe('Já estava desfeito ✔');
  });

  it('31) evento já não existe (410 "Resource has been deleted") → "Já estava desfeito ✔"', async () => {
    const cal = mockCal([]);
    cal.deleteEvent = async () => {
      const err = new Error('Resource has been deleted') as Error & { response: { status: number } };
      err.response = { status: 410 };
      throw err;
    };
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-sumiu-410');
    expect(r!.texto).toBe('Já estava desfeito ✔');
  });

  it('32) double-press no mesmo botão → 1ª vez "Desfeito ✔", 2ª vez "Já estava desfeito ✔"', async () => {
    let existe = true;
    const cal = mockCal([]);
    cal.deleteEvent = async () => {
      if (!existe) { const err = new Error('Not Found') as Error & { code: number }; err.code = 404; throw err; }
      existe = false;
    };
    const deps = depsBase({ cal });
    const r1 = await tratarBotaoAgenda(deps, 'ag_desf_evt-dbl');
    const r2 = await tratarBotaoAgenda(deps, 'ag_desf_evt-dbl');
    expect(r1!.texto).toBe('Desfeito ✔');
    expect(r2!.texto).toBe('Já estava desfeito ✔');
  });
});

describe('tratarBotaoAgenda: fallback de extração do id decorado (A1.1)', () => {
  it('33) "1. Desfazer (ag_desf_abc123)" (modo numerado/texto puro) ainda roteia pro handler certo', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, '1. Desfazer (ag_desf_abc123)');
    expect(cal.excluidos).toEqual(['abc123']);
    expect(r!.texto).toBe('Desfeito ✔');
  });

  it('34) id puro sem decoração continua funcionando normalmente (regressão)', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    const r = await tratarBotaoAgenda(deps, 'ag_desf_evt-77');
    expect(cal.excluidos).toEqual(['evt-77']);
    expect(r!.texto).toBe('Desfeito ✔');
  });

  it('35) texto sem nenhum "ag_" embutido → continua null (não hijacka outro handler)', async () => {
    const deps = depsBase();
    const r = await tratarBotaoAgenda(deps, 'oi, tudo bem?');
    expect(r).toBeNull();
  });
});

// -----------------------------------------------------------------------
// tratarLocalizacaoAgenda — pin do WhatsApp chegando DEPOIS de um compromisso
// já criado: anexa nele em vez de virar um compromisso NOVO (bug ao vivo do
// Junior: marcou "visita" pela Eva, mandou o pin em seguida, o pin virou um
// pedido de compromisso novo → conflito → "Marcar junto" → visita duplicada).
// -----------------------------------------------------------------------

describe('tratarLocalizacaoAgenda: anexar a compromisso recém-criado (ultimoCriado fresco)', () => {
  it('45) pin chega com ultimoCriado fresco (≤10min) → pergunta com o título + botões ag_loc_sim/ag_loc_outro', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // cria evt-1, guarda ultimoCriado
    const r = await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    expect(r).not.toBeNull();
    expect(r!.texto).toContain('Visita Cyntia');
    expect(r!.botoes).toEqual([
      { id: 'ag_loc_sim', rotulo: 'Sim, anexar' },
      { id: 'ag_loc_outro', rotulo: 'É outro compromisso' },
    ]);
  });

  it('46) ag_loc_sim → chama updateEvent com o eventId certo + location, responde ✔ com o título', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    const r = await tratarBotaoAgenda(deps, 'ag_loc_sim');
    expect(cal.atualizados).toEqual([{ eventId: 'evt-1', updates: { location: '-15.793889,-47.882778' } }]);
    expect(r!.texto).toContain('Visita Cyntia');
    expect(r!.texto).toContain('✔');
  });

  it('47) ag_loc_outro → cai no fallback (mesmo texto do caso "sem ultimoCriado") e a localização vale pro PRÓXIMO marcar', async () => {
    const cal = mockCal([]);
    const ia: ExtratorIA = {
      async extrairAgenda(prompt: string) {
        if (prompt.includes('dentista')) {
          return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Dentista', detalhes: null, dataTexto: 'amanhã', horaTexto: '14h', duracaoTexto: null, diaInteiro: false, ambito: 'pessoal' }) + '\n```';
        }
        return '```json\n' + JSON.stringify({ compromisso: true, titulo: 'Visita Cyntia', detalhes: null, dataTexto: 'amanhã', horaTexto: '9h', duracaoTexto: null, diaInteiro: false, ambito: 'empresa' }) + '\n```';
      },
    };
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // cria evt-1
    await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    const r = await tratarBotaoAgenda(deps, 'ag_loc_outro');
    expect(r!.texto).toBe('📍 Peguei a localização! Me diz o compromisso que eu já marco com esse endereço (ex.: "visita amanhã 9h")');
    expect(cal.atualizados).toHaveLength(0); // NÃO anexou no evento anterior

    // 2ª mensagem SEM passar location explícito — a Eva usa a que ficou pendente
    await tratarMensagemAgenda(deps, 'dentista amanhã 14h');
    expect(cal.criados).toHaveLength(2);
    expect(cal.criados[1].summary).toBe('Dentista');
    expect(cal.criados[1].location).toBe('-15.793889,-47.882778');
  });

  it('48) pin SEM ultimoCriado (nenhum compromisso recém-criado) → comportamento atual: mensagem fixa, sem botões', async () => {
    const deps = depsBase();
    const r = await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    expect(r!.texto).toBe('📍 Peguei a localização! Me diz o compromisso que eu já marco com esse endereço (ex.: "visita amanhã 9h")');
    expect(r!.botoes).toBeUndefined();
  });

  it('49) ultimoCriado expirado (>10min) → não pergunta "anexar", cai no comportamento atual', async () => {
    const clock = criarClock(AGORA);
    const cal = mockCal([]);
    const deps: DepsAgenda = {
      cal, ia: iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' }),
      agoraISO: clock.agoraISO, nomesDeLeads: async () => [],
    };
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    clock.avancar(11 * 60 * 1000);
    const r = await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    expect(r!.botoes).toBeUndefined();
    expect(r!.texto).toBe('📍 Peguei a localização! Me diz o compromisso que eu já marco com esse endereço (ex.: "visita amanhã 9h")');
  });

  it('50) erro no updateEvent (ag_loc_sim) → mensagem de erro específica, NÃO a genérica de agenda', async () => {
    const cal = mockCal([]);
    const deps = depsBase({ cal });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h');
    await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    cal.updateEvent = async () => { throw new Error('Google Calendar fora do ar'); };
    const r = await tratarBotaoAgenda(deps, 'ag_loc_sim');
    expect(r!.texto).not.toBe('❌ Deu ruim aqui na agenda agora — tenta de novo em instantes. Se repetir, me chama.');
    expect(r!.texto.toLowerCase()).toContain('anexar');
  });

  it('51) ultimoCriado é atualizado também depois de "Substituir" (ag_subst) — pin depois aponta pro evento NOVO, não pro conflitante excluído', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // vira pendente de conflito
    await tratarBotaoAgenda(deps, 'ag_subst'); // exclui conflitante, cria evt-1
    const r = await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    expect(r!.botoes).toEqual([
      { id: 'ag_loc_sim', rotulo: 'Sim, anexar' },
      { id: 'ag_loc_outro', rotulo: 'É outro compromisso' },
    ]);
    await tratarBotaoAgenda(deps, 'ag_loc_sim');
    expect(cal.atualizados).toEqual([{ eventId: 'evt-1', updates: { location: '-15.793889,-47.882778' } }]);
  });

  it('52) ultimoCriado é atualizado também depois de "Marcar junto" (ag_junto)', async () => {
    const ia = iaCanned({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h', ambito: 'empresa' });
    const interp = await interpDeReferencia(ia);
    const conflitante: EventoAgendaListado = { id: 'conflito-1', titulo: 'Dentista', inicioISO: interp.inicioISO, fimISO: interp.fimISO, criadoPelaEva: true };
    const cal = mockCal([conflitante]);
    const deps = depsBase({ cal, ia });
    await tratarMensagemAgenda(deps, 'visita Cyntia amanhã 9h'); // vira pendente de conflito
    await tratarBotaoAgenda(deps, 'ag_junto'); // cria evt-1 mesmo com conflito
    const r = await tratarLocalizacaoAgenda(deps, '-15.793889,-47.882778');
    expect(r!.texto).toContain('Visita Cyntia');
    expect(r!.botoes).not.toBeUndefined();
  });
});
