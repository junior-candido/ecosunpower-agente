// tests/agenda-interpretar.test.ts — interpretador de frases de compromisso
// (Eva Agenda A1). IA injetada (ExtratorIA) devolve JSON canned — nunca bate
// na rede. A resolução de data/hora é 100% determinística (testada aqui).
import { describe, it, expect } from 'vitest';
import {
  interpretar, resolverData, resolverHora, resolverDuracaoMin, parseExtracaoAgenda,
  parseExtracaoSegundaChance, montarPromptInterpretarAgenda, montarPromptSegundaChanceAgenda,
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

  it('BUG 1 (regressão): "dia 15 às 10h" no MESMO DIA à noite não marca no passado — vai pro mês seguinte', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Vistoria', dataTexto: 'dia 15', horaTexto: '10h' }));
    const r = await interpretar('vistoria dia 15 às 10h', '2026-09-15T22:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-10-15T10:00:00-03:00');
    expect(r!.confianca).toBe('alta');
  });

  it('A1.1: "entendido" traz o título extraído, mesmo com confiança alta', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Visita Cyntia', dataTexto: 'amanhã', horaTexto: '9h' }));
    const r = await interpretar('visita Cyntia amanhã 9h', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.entendido).toBe('Visita Cyntia');
  });

  it('A1.1: "detalhes" (tarefas/materiais/contexto) passa direto pra Interpretacao', async () => {
    const ia = iaQueDevolve(jsonCompromisso({
      titulo: 'Visita João', dataTexto: 'amanhã', horaTexto: '9h',
      detalhes: 'Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela',
    }));
    const r = await interpretar('visita no João amanhã 9h — levar a escada, trocar o disjuntor da piscina e cobrar a segunda parcela', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.detalhes).toBe('Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela');
  });

  it('A1.1: sem "detalhes" → campo fica undefined (não string vazia)', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Visita', dataTexto: 'amanhã', horaTexto: '9h' }));
    const r = await interpretar('visita amanhã 9h', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.detalhes).toBeUndefined();
  });

  it('A1.1: "hoje à noite" sem horaTexto separado → hora cai pro fallback dentro do dataTexto (19h, confiança alta)', async () => {
    const ia = iaQueDevolve(jsonCompromisso({ titulo: 'Culto', dataTexto: 'hoje à noite', horaTexto: null }));
    const r = await interpretar('culto hoje à noite', '2026-08-28T10:00:00-03:00', ia);
    expect(r!.inicioISO).toBe('2026-08-28T19:00:00-03:00');
    expect(r!.confianca).toBe('alta');
  });

  describe('A1.1: 2ª chance — frase coloquial sem data/hora clara na 1ª extração', () => {
    // Mock que responde de forma diferente a cada chamada — simula a 1ª
    // extração (crua, ambígua) e a 2ª chamada (resolução explícita).
    function iaSequencia(respostas: string[]): ExtratorIA & { chamadas: number } {
      let i = 0;
      const obj = {
        chamadas: 0,
        async extrairAgenda() {
          obj.chamadas++;
          const r = respostas[Math.min(i, respostas.length - 1)];
          i++;
          return r;
        },
      };
      return obj;
    }

    it('resolução explícita válida (dataISO/hora) na 2ª chamada → confiança alta, chama a IA só 2x', async () => {
      const primeira = jsonCompromisso({ titulo: 'Visita Cyntia', dataTexto: 'lá pelo meio da semana que vem sei lá', horaTexto: null });
      const segunda = '```json\n' + JSON.stringify({
        compromisso: true, titulo: 'Visita Cyntia', detalhes: null,
        dataTexto: 'lá pelo meio da semana que vem sei lá', horaTexto: null, duracaoTexto: null,
        diaInteiro: false, ambito: null,
        resolucaoDataISO: '2026-09-02', resolucaoHora: '09:00',
      }) + '\n```';
      const ia = iaSequencia([primeira, segunda]);
      const r = await interpretar('marca aí a visita da Cyntia lá pelo meio da semana que vem sei lá umas nove', '2026-08-28T10:00:00-03:00', ia);
      expect(r).not.toBeNull();
      expect(r!.confianca).toBe('alta');
      expect(r!.inicioISO).toBe('2026-09-02T09:00:00-03:00');
      expect(ia.chamadas).toBe(2);
    });

    it('sem resolução explícita, mas a 2ª extração de texto já é reconhecível → confiança alta pela camada determinística', async () => {
      const primeira = jsonCompromisso({ titulo: 'Dentista', dataTexto: null, horaTexto: null });
      const segunda = jsonCompromisso({ titulo: 'Dentista', dataTexto: 'amanhã', horaTexto: '9h' });
      const ia = iaSequencia([primeira, segunda]);
      const r = await interpretar('marca dentista amanhã de manhã cedo', '2026-08-28T10:00:00-03:00', ia);
      expect(r!.confianca).toBe('alta');
      expect(r!.inicioISO).toBe('2026-08-29T09:00:00-03:00');
    });

    it('resolução explícita NO PASSADO → rejeitada (validação determinística), cai pro fallback de texto', async () => {
      const primeira = jsonCompromisso({ titulo: 'Reunião', dataTexto: null, horaTexto: null });
      const segunda = '```json\n' + JSON.stringify({
        compromisso: true, titulo: 'Reunião', detalhes: null,
        dataTexto: null, horaTexto: null, duracaoTexto: null, diaInteiro: false, ambito: null,
        resolucaoDataISO: '2020-01-01', resolucaoHora: '09:00', // no passado — inválido
      }) + '\n```';
      const ia = iaSequencia([primeira, segunda]);
      const r = await interpretar('reunião não sei quando', '2026-08-28T10:00:00-03:00', ia);
      expect(r!.confianca).toBe('baixa');
    });

    it('2ª chamada falha (rejeita a promise) → não derruba, confiança fica baixa com o melhor palpite', async () => {
      let chamou = 0;
      const ia: ExtratorIA = {
        async extrairAgenda() {
          chamou++;
          if (chamou === 1) return jsonCompromisso({ titulo: 'Ligar fornecedor', dataTexto: null, horaTexto: null });
          throw new Error('Anthropic fora do ar');
        },
      };
      const r = await interpretar('preciso ligar pro fornecedor', '2026-08-28T10:00:00-03:00', ia);
      expect(r).not.toBeNull();
      expect(r!.confianca).toBe('baixa');
      expect(r!.titulo).toBe('Ligar fornecedor');
    });

    it('confiança já alta na 1ª extração → NUNCA faz a 2ª chamada (economia)', async () => {
      const ia = iaSequencia([jsonCompromisso({ titulo: 'Visita', dataTexto: 'amanhã', horaTexto: '9h' })]);
      await interpretar('visita amanhã 9h', '2026-08-28T10:00:00-03:00', ia);
      expect(ia.chamadas).toBe(1);
    });
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
    expect(resolverData('não sei quando, vamos ver', AGORA).confiavel).toBe(false);
  });

  // --- BUG 1 (revisão adversarial): "dia N" ignorava a hora do dia -----------
  it('"dia 15" no mesmo dia de hoje, hora AINDA NÃO passou → fica hoje', () => {
    const r = resolverData('dia 15', '2026-09-15T08:00:00-03:00', { hour: 10, minute: 0 });
    expect(r).toEqual({ dateISO: '2026-09-15', confiavel: true });
  });
  it('"dia 15" no mesmo dia de hoje, hora JÁ passou → dia 15 do mês seguinte (nunca no passado)', () => {
    const r = resolverData('dia 15', '2026-09-15T22:00:00-03:00', { hour: 10, minute: 0 });
    expect(r).toEqual({ dateISO: '2026-10-15', confiavel: true });
  });

  // --- BUG 2 (revisão adversarial): "dia N" não validava tamanho do mês ------
  // Comportamento escolhido: quando o mês candidato não TEM esse dia (ex.: 31
  // em setembro, 30 em fevereiro), avança pro PRÓXIMO mês que tenha — nunca
  // deixa o overflow nativo do Date estourar pro mês seguinte sozinho.
  it('"dia 31" num mês sem dia 31 (setembro tem 30) → avança pro próximo mês que tem esse dia', () => {
    const r = resolverData('dia 31', '2026-09-05T08:00:00-03:00');
    expect(r).toEqual({ dateISO: '2026-10-31', confiavel: true });
  });
  it('"dia 30" caindo em fevereiro (28 dias em 2027) → avança pra março', () => {
    // hoje = 31/01/2027; dia 30 < dia 31 de hoje → mês seguinte candidato = fevereiro/2027 (28 dias, sem dia 30).
    const r = resolverData('dia 30', '2027-01-31T08:00:00-03:00');
    expect(r).toEqual({ dateISO: '2027-03-30', confiavel: true });
  });

  // --- A1.1: frases coloquiais/áudio — resolverData mais tolerante ----------
  it('A1.1: "semana que vem" (sem dia da semana específico) → hoje + 7 dias corridos', () => {
    expect(resolverData('semana que vem', AGORA)).toEqual({ dateISO: '2026-09-04', confiavel: true });
  });
  it('A1.1: "daqui a 3 dias" → soma direta a partir de hoje', () => {
    expect(resolverData('daqui a 3 dias', AGORA)).toEqual({ dateISO: '2026-08-31', confiavel: true });
  });
  it('A1.1: "daqui a 1 dia" (singular) → +1 dia', () => {
    expect(resolverData('daqui a 1 dia', AGORA)).toEqual({ dateISO: '2026-08-29', confiavel: true });
  });
  it('A1.1: "depois do almoço" → ainda hoje, confiável', () => {
    expect(resolverData('depois do almoço', AGORA)).toEqual({ dateISO: '2026-08-28', confiavel: true });
  });
  it('A1.1: "hoje à noite" → hoje (o "à noite" não atrapalha o \\bhoje\\b)', () => {
    expect(resolverData('hoje à noite', AGORA)).toEqual({ dateISO: '2026-08-28', confiavel: true });
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

  // --- A1.1: frases coloquiais/áudio — resolverHora bem mais tolerante -----
  it('A1.1: "9" (número seco) → 09:00', () => {
    expect(resolverHora('9')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "9 horas" (com espaço) → 09:00', () => {
    expect(resolverHora('9 horas')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "9hrs" → 09:00', () => {
    expect(resolverHora('9hrs')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "9 e meia" → 09:30', () => {
    expect(resolverHora('9 e meia')).toEqual({ hour: 9, minute: 30, confiavel: true });
  });
  it('A1.1: "nove" (extenso) → 09:00', () => {
    expect(resolverHora('nove')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "nove e meia" (extenso) → 09:30', () => {
    expect(resolverHora('nove e meia')).toEqual({ hour: 9, minute: 30, confiavel: true });
  });
  it('A1.1: "duas da tarde" (extenso + período) → 14:00', () => {
    expect(resolverHora('duas da tarde')).toEqual({ hour: 14, minute: 0, confiavel: true });
  });
  it('A1.1: "sete da noite" (extenso + período) → 19:00', () => {
    expect(resolverHora('sete da noite')).toEqual({ hour: 19, minute: 0, confiavel: true });
  });
  it('A1.1: "meio dia" e "meio-dia" → 12:00', () => {
    expect(resolverHora('meio dia')).toEqual({ hour: 12, minute: 0, confiavel: true });
    expect(resolverHora('meio-dia')).toEqual({ hour: 12, minute: 0, confiavel: true });
  });
  it('A1.1: "umas 9" e "lá pelas 9" (aproximadores) → 09:00', () => {
    expect(resolverHora('umas 9')).toEqual({ hour: 9, minute: 0, confiavel: true });
    expect(resolverHora('lá pelas 9')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "perto das 9" e "por volta das 9" (aproximadores) → 09:00', () => {
    expect(resolverHora('perto das 9')).toEqual({ hour: 9, minute: 0, confiavel: true });
    expect(resolverHora('por volta das 9')).toEqual({ hour: 9, minute: 0, confiavel: true });
  });
  it('A1.1: "fim da tarde" → 17:00 (não confunde com "tarde" genérico=14h)', () => {
    expect(resolverHora('fim da tarde')).toEqual({ hour: 17, minute: 0, confiavel: true });
  });
  it('A1.1: "de manhãzinha" e "cedo" → 08:00 (não confunde com "manhã" genérico=9h)', () => {
    expect(resolverHora('de manhãzinha')).toEqual({ hour: 8, minute: 0, confiavel: true });
    expect(resolverHora('cedo')).toEqual({ hour: 8, minute: 0, confiavel: true });
  });
  it('A1.1: "na hora do almoço" → 12:00', () => {
    expect(resolverHora('na hora do almoço')).toEqual({ hour: 12, minute: 0, confiavel: true });
  });
  it('A1.1: "à noite" → 19:00 (mesmo sem o "de")', () => {
    expect(resolverHora('à noite')).toEqual({ hour: 19, minute: 0, confiavel: true });
  });
});

describe('agenda/interpretar: resolverDuracaoMin (puro)', () => {
  it('sem texto → 60 (default)', () => expect(resolverDuracaoMin(null)).toBe(60));
  it('"duas horas" → 120', () => expect(resolverDuracaoMin('duas horas')).toBe(120));
  it('"meia hora" → 30', () => expect(resolverDuracaoMin('meia hora')).toBe(30));
  it('"1h30" → 90', () => expect(resolverDuracaoMin('1h30')).toBe(90));
});

describe('agenda/interpretar: parseExtracaoAgenda (puro)', () => {
  it('aceita fence \`\`\`json\`\`\` (com tag)', () => {
    const raw = '```json\n{"compromisso": true, "titulo": "Visita", "dataTexto": null, "horaTexto": null, "duracaoTexto": null, "diaInteiro": false, "ambito": null}\n```';
    expect(parseExtracaoAgenda(raw)?.titulo).toBe('Visita');
  });
  it('MINOR (revisão adversarial): aceita fence \`\`\`  \`\`\` SEM a tag "json"', () => {
    const raw = '```\n{"compromisso": true, "titulo": "Visita", "dataTexto": "amanhã", "horaTexto": "9h", "duracaoTexto": null, "diaInteiro": false, "ambito": null}\n```';
    const e = parseExtracaoAgenda(raw);
    expect(e).not.toBeNull();
    expect(e!.titulo).toBe('Visita');
    expect(e!.dataTexto).toBe('amanhã');
  });

  it('A1.1: campo "detalhes" (tarefas/materiais/contexto) é lido', () => {
    const raw = '```json\n{"compromisso": true, "titulo": "Visita João", "detalhes": "Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela", "dataTexto": "amanhã", "horaTexto": "9h", "duracaoTexto": null, "diaInteiro": false, "ambito": "empresa"}\n```';
    const e = parseExtracaoAgenda(raw);
    expect(e?.detalhes).toBe('Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela');
  });

  it('A1.1: "detalhes" ausente/null → null (nunca quebra)', () => {
    const raw = '```json\n{"compromisso": true, "titulo": "Visita", "dataTexto": null, "horaTexto": null, "duracaoTexto": null, "diaInteiro": false, "ambito": null}\n```';
    expect(parseExtracaoAgenda(raw)?.detalhes).toBeNull();
  });
});

describe('agenda/interpretar: parseExtracaoSegundaChance (puro)', () => {
  it('lê a extração + resolução explícita (dataISO/hora) quando presentes', () => {
    const raw = '```json\n{"compromisso": true, "titulo": "Visita", "detalhes": null, "dataTexto": "lá pelas nove", "horaTexto": null, "duracaoTexto": null, "diaInteiro": false, "ambito": null, "resolucaoDataISO": "2026-09-01", "resolucaoHora": "09:00"}\n```';
    const r = parseExtracaoSegundaChance(raw);
    expect(r).not.toBeNull();
    expect(r!.extracao.titulo).toBe('Visita');
    expect(r!.resolucaoDataISO).toBe('2026-09-01');
    expect(r!.resolucaoHora).toBe('09:00');
  });

  it('resolucaoDataISO/resolucaoHora ausentes → null (não quebra)', () => {
    const raw = '```json\n{"compromisso": true, "titulo": "Visita", "detalhes": null, "dataTexto": null, "horaTexto": null, "duracaoTexto": null, "diaInteiro": false, "ambito": null}\n```';
    const r = parseExtracaoSegundaChance(raw);
    expect(r).not.toBeNull();
    expect(r!.resolucaoDataISO).toBeNull();
    expect(r!.resolucaoHora).toBeNull();
  });

  it('compromisso:false → null (mesma regra de sempre)', () => {
    expect(parseExtracaoSegundaChance('```json\n{"compromisso": false}\n```')).toBeNull();
  });

  it('JSON inválido → null (nunca explode)', () => {
    expect(parseExtracaoSegundaChance('não é json nenhum')).toBeNull();
  });
});

describe('agenda/interpretar: prompts (contêm as peças certas)', () => {
  it('montarPromptInterpretarAgenda inclui a frase, o campo "detalhes" e exemplos coloquiais/áudio', () => {
    const p = montarPromptInterpretarAgenda('marca aí uma visita segunda que vem lá pelas nove');
    expect(p).toContain('marca aí uma visita segunda que vem lá pelas nove');
    expect(p).toContain('detalhes');
    expect(p).toContain('ÁUDIO TRANSCRITO');
    expect(p).toContain('lá pelas nove');
  });

  it('montarPromptSegundaChanceAgenda inclui a frase, "agora" e pede resolucaoDataISO/resolucaoHora', () => {
    const p = montarPromptSegundaChanceAgenda('dentista', '2026-08-28T10:00:00-03:00');
    expect(p).toContain('dentista');
    expect(p).toContain('2026-08-28T10:00:00-03:00');
    expect(p).toContain('resolucaoDataISO');
    expect(p).toContain('resolucaoHora');
  });
});
