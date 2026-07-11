import { describe, it, expect } from 'vitest';
import { responderComoElo, montarFalasElo } from '../src/modules/dashboard/cerebro-elo.js';

const snap: any = { comercial:{leads:42,negociacao:8,ganhos:5,propostas:12}, atendimento:{conversas:15}, marketing:{emailsEnviados:0,emailsAbertos:0,leadsQuentes:0}, operacao:{usinas:30}, relacionamento:{clientes:24,manutencoes:2}, financeiro:{vendas:5}, elo:{totalEventos:120} };

function fakeAnthropic(texto: string, capture?: (sys: string) => void) {
  return { messages: { create: async (args: any) => { capture?.(args.system); return { content: [{ type: 'text', text: texto }] }; } } };
}

describe('responderComoElo', () => {
  it('poe o snapshot no contexto e devolve a resposta da IA', async () => {
    let sys = '';
    const a = fakeAnthropic('Voce tem 42 leads no momento.', (s) => { sys = s; });
    const r = await responderComoElo(a as any, 'quantos leads?', snap);
    expect(r).toContain('42');
    expect(sys).toContain('42');                        // dado real foi pro contexto
    expect(sys.toLowerCase()).toContain('nunca invente'); // regra anti-alucinacao
  });

  it('trava de preco: se a IA cravar valor, cai pra saida segura', async () => {
    const a = fakeAnthropic('Fica por R$ 19.900 o sistema');
    const r = await responderComoElo(a as any, 'preco?', snap);
    expect(r).not.toContain('19.900');
  });

  it('best-effort: se a IA lanca, devolve mensagem gentil (nao quebra)', async () => {
    const a = { messages: { create: async () => { throw new Error('x'); } } };
    const r = await responderComoElo(a as any, 'oi', snap);
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  it('nao bloqueia resposta com contagem real (>= 100)', async () => {
    const a = fakeAnthropic('Monitoro 300 usinas gerando energia agora.');
    const r = await responderComoElo(a as any, 'quantas usinas?', snap);
    expect(r).toContain('300');
  });

  it('nao bloqueia total de eventos', async () => {
    const a = fakeAnthropic('O Elo ja registrou 120 eventos conectados.');
    const r = await responderComoElo(a as any, 'quantos eventos?', snap);
    expect(r).toContain('120');
  });
});

describe('montarFalasElo', () => {
  it('gera frases com numeros reais do snapshot', () => {
    const falas = montarFalasElo(snap);
    expect(Array.isArray(falas)).toBe(true);
    expect(falas.join(' ')).toContain('42');
  });
});
