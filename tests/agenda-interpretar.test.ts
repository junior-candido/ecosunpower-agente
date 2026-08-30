// tests/agenda-interpretar.test.ts — interpretador de frases de compromisso
// (Eva Agenda A1). IA injetada (ExtratorIA) devolve JSON canned — nunca bate
// na rede. A resolução de data/hora é 100% determinística (testada aqui).
import { describe, it, expect } from 'vitest';
import {
  interpretar, resolverData, resolverHora, resolverDuracaoMin,
  type ExtratorIA,
} from '../src/modules/agenda/interpretar.js';

// Mock simples de ExtratorIA: devolve sempre o mesmo bloco ```json``` cru,
// como a IA real devolveria (mesmo formato de extrator-lancamento.ts).
function iaQueDevolve(raw: string): ExtratorIA {
  return { extrairAgenda: async () => raw };
}

function jsonCompromisso(campos: Record<string, unknown>): string {
  return '```json\n' + JSON.stringify({
    compromisso: true,
    titulo: null,
    dataTexto: null,
    horaTexto: null,
    duracaoTexto: null,
    diaInteiro: false,
    ambito: null,
    ...campos,
  }) + '\n```';
}

describe('agenda/interpretar: interpretar() — orquestração completa', () => {
  it('1) "visita na Cyntia quinta 9h", agora sexta 2026-08-28T10:00 → próxima quinta 2026-09-03 09h, confiança alta', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Visita Cyntia', dataTexto: 'quinta', horaTexto: '9h' }));
    const r = await interpretar('visita na Cyntia quinta 9h', '2026-08-28T10:00:00-03:00', ia);
    expect(r).not.toBeNull();
    expect(r!.titulo).toBe('Visita Cyntia');
    expect(r!.inicioISO).toBe('2026-09-03T09:00:00-03:00');
    expect(r!.fimISO).toBe('2026-09-03T10:00:00-03:00');
    expect(r!.diaInteiro).toBe(false);
    expect(r!.confianca).toBe('alta');
  });

  it('2) "dentista amanhã de tarde" → dia seguinte às 14h, fim 15h', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Dentista', dataTexto: 'amanhã', horaTexto: 'de tarde' }));
    const r = await interpretar('dentista amanhã de tarde', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-08-29T14:00:00-03:00');
    expect(r!.fimISO).toBe('2026-08-29T15:00:00-03:00');
    expect(r!.confianca).toBe('alta');
  });

  it('3) mesmo dia da semana de hoje mas com hora que já passou → pula pra semana que vem', async () => {
    // agora = quinta 2026-09-03 às 14h; frase fala "quinta 9h" (já passou hoje às 9h) → próxima quinta 2026-09-10.
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Reunião', dataTexto: 'quinta', horaTexto: '9h' }));
    const r = await interpretar('reunião quinta 9h', '2026-09-03T14:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-09-10T09:00:00-03:00');
  });

  it('4) "dia 15 às 10h" quando hoje é dia 20 → dia 15 do MÊS QUE VEM', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Vistoria', dataTexto: 'dia 15', horaTexto: '10h' }));
    const r = await interpretar('vistoria dia 15 às 10h', '2026-09-20T08:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-10-15T10:00:00-03:00');
  });

  it('5) "instalação do Udson quarta o dia todo" → evento de dia inteiro (00:00–23:59)', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Instalação Udson', dataTexto: 'quarta', diaInteiro: true }));
    const r = await interpretar('instalação do Udson quarta o dia todo', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.diaInteiro).toBe(true);
    expect(r!.inicioISO).toBe('2026-09-02T00:00:00-03:00');
    expect(r!.fimISO).toBe('2026-09-02T23:59:00-03:00');
  });

  it('6) "das 9 às 12" → usa o intervalo explícito (3h), não o padrão de 1h', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Obra', dataTexto: 'amanhã', horaTexto: 'das 9 às 12' }));
    const r = await interpretar('obra amanhã das 9 às 12', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-08-29T09:00:00-03:00');
    expect(r!.fimISO).toBe('2026-08-29T12:00:00-03:00');
  });

  it('6b) duração em palavras ("duas horas") quando não há intervalo explícito', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Curso', dataTexto: 'amanhã', horaTexto: '9h', duracaoTexto: 'duas horas' }));
    const r = await interpretar('curso amanhã 9h, duas horas', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-08-29T09:00:00-03:00');
    expect(r!.fimISO).toBe('2026-08-29T11:00:00-03:00');
  });

  it('7) sem data nem hora → confiança baixa (mesmo assim devolve um horário default)', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Ligar pro fornecedor' }));
    const r = await interpretar('preciso ligar pro fornecedor', '2026-08-28T10:00:00-03:00', ia);
    expect(r).not.toBeNull();
    expect(r!.confianca).toBe('baixa');
    expect(r!.inicioISO).toBe('2026-08-28T09:00:00-03:00');
  });

  it('8) frase que claramente não é compromisso → IA devolve compromisso:false → null', async () => {
    const ia = iaQueDevolve('```json\n{"compromisso": false}\n```');
    const r = await interpretar('quanto eu gastei esse mês?', '2026-08-28T10:00:00-03:00', ia);
    expect(r).toBeNull();
  });

  it('resposta da IA sem JSON válido → null (nunca explode)', async () => {
    const ia = iaQueDevolve('não entendi nada disso');
    const r = await interpretar('oi eva', '2026-08-28T10:00:00-03:00', ia);
    expect(r).toBeNull();
  });

  it('ambito empresa/pessoal repassado quando a IA cravar', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Visita', dataTexto: 'hoje', horaTexto: '9h', ambito: 'empresa' }));
    const r = await interpretar('visita hoje 9h', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.ambito).toBe('empresa');
  });

  it('IA falha (rejeita a promise) → interpretar devolve null, nunca propaga o erro', async () => {
    const ia: ExtratorIA = { extrairAgenda: async () => { throw new Error('timeout'); } };
    const r = await interpretar('visita amanhã 9h', '2026-08-28T10:00:00-03:00', ia);
    expect(r).toBeNull();
  });
});

describe('agenda/interpretar: resolverData (puro)', () => {
  const AGORA = '2026-08-28T10:00:00-03:00'; // sexta-feira

  it('"hoje" → hoje, confiável', () => {
    expect(resolverData('hoje', AGORA)).toEqual({ dateISO: '2026-08-28', confiavel: true });
  });
  it('"amanhã" (com e sem acento) → dia seguinte', () => {
    expect(resolverData('amanhã', AGORA)).toEqual({ dateISO: '2026-08-29', confiavel: true });
    expect(resolverData('amanha', AGORA)).toEqual({ dateISO: '2026-08-29', confiavel: true });
  });
  it('"depois de amanhã" → +2 dias', () => {
    expect(resolverData('depois de amanhã', AGORA)).toEqual({ dateISO: '2026-08-30', confiavel: true });
  });
  it('"quinta" a partir de sexta → próxima quinta (2026-09-03)', () => {
    expect(resolverData('quinta', AGORA)).toEqual({ dateISO: '2026-09-03', confiavel: true });
  });
  it('"quinta-feira que vem" força pular a semana', () => {
    // A partir de sexta 28/08, a próxima quinta já é 03/09; "que vem" pula mais uma → 10/09.
    expect(resolverData('quinta-feira que vem', AGORA).dateISO).toBe('2026-09-10');
  });
  it('mesmo dia da semana + hora ainda não passou → resolve para HOJE', () => {
    // agora quinta 14h, hora pedida 15h (ainda não passou) → hoje mesmo.
    const r = resolverData('quinta', '2026-09-03T14:00:00-03:00', { hour: 15, minute: 0 });
    expect(r).toEqual({ dateISO: '2026-09-03', confiavel: true });
  });
  it('mesmo dia da semana + hora já passou → pula pra semana que vem', () => {
    const r = resolverData('quinta', '2026-09-03T14:00:00-03:00', { hour: 9, minute: 0 });
    expect(r.dateISO).toBe('2026-09-10');
  });
  it('"dia 15" quando hoje é dia 10 → dia 15 do mês atual', () => {
    expect(resolverData('dia 15', '2026-09-10T08:00:00-03:00')).toEqual({ dateISO: '2026-09-15', confiavel: true });
  });
  it('"dia 15" quando hoje é dia 20 → dia 15 do mês seguinte', () => {
    expect(resolverData('dia 15', '2026-09-20T08:00:00-03:00')).toEqual({ dateISO: '2026-10-15', confiavel: true });
  });
  it('sem texto nenhum → hoje, não confiável', () => {
    expect(resolverData(null, AGORA)).toEqual({ dateISO: '2026-08-28', confiavel: false });
  });
  it('texto não reconhecido → hoje, não confiável (nunca explode)', () => {
    expect(resolverData('semana que vem sei lá quando', AGORA).confiavel).toBe(false);
  });
});

describe('agenda/interpretar: resolverHora (puro)', () => {
  it('"9h" → 09:00', () => {
    expect(resolverHora('9h')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('"15h30" → 15:30', () => {
    expect(resolverHora('15h30')).toEqual({ hour: 15, minute: 30, confiavel: true });
  });
  it('"9:30" → 09:30', () => {
    expect(resolverHora('9:30')).toEqual({ hour: 9, minute: 30, confiavel: true });
  });
  it('"às 14" → 14:00', () => {
    expect(resolverHora('às 14')).toEqual({ hour: 14, minute: 0, confiavel: true });
  });
  it('"de manhã" → 09:00 · "de tarde" → 14:00 · "de noite" → 19:00', () => {
    expect(resolverHora('de manhã')).toEqual({ hour: 9, minute: 0, confiavel: true });
    expect(resolverHora('de tarde')).toEqual({ hour: 14, minute: 0, confiavel: true });
    expect(resolverHora('de noite')).toEqual({ hour: 19, minute: 0, confiavel: true });
  });
  it('"das 9 às 12" → início 9:00 com fim 12:00 explícitos', () => {
    expect(resolverHora('das 9 às 12')).toEqual({ hour: 9, minute: 0, confiavel: true, fimHour: 12, fimMinute: 0 });
  });
  it('sem hora nenhuma → 09:00 default, não confiável', () => {
    expect(resolverHora(null)).toEqual({ hour: 9, minute: 0, confiavel: false });
  });
});

describe('agenda/interpretar: resolverDuracaoMin (puro)', () => {
  it('sem texto → 60 (default)', () => expect(resolverDuracaoMin(null)).toBe(60));
  it('"duas horas" → 120', () => expect(resolverDuracaoMin('duas horas')).toBe(120));
  it('"meia hora" → 30', () => expect(resolverDuracaoMin('meia hora')).toBe(30));
  it('"1h30" → 90', () => expect(resolverDuracaoMin('1h30')).toBe(90));
});
