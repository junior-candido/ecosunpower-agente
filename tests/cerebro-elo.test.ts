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

  it('sabe a identidade: empresa de Brasilia e quem e o CEO no contexto', async () => {
    let sys = '';
    await responderComoElo(fakeAnthropic('ok', (s) => { sys = s; }) as any, 'oi', snap, { isCeo: true });
    expect(sys.toLowerCase()).toContain('bras'); // Brasília-DF (via descricaoCurta da empresa)
    expect(sys.toLowerCase()).toContain('ceo');  // sabe que a empresa tem um CEO
  });

  it('reconhece quem fala: CEO libera tudo; equipe recebe so o necessario', async () => {
    let sysCeo = '';
    await responderComoElo(fakeAnthropic('ok', (s) => { sysCeo = s; }) as any, 'como vai?', snap, { isCeo: true, nome: 'Junior' });
    expect(sysCeo).toContain('CEO');
    expect(sysCeo).toContain('Junior');

    let sysEquipe = '';
    await responderComoElo(fakeAnthropic('ok', (s) => { sysEquipe = s; }) as any, 'como vai?', snap, { isCeo: false, nome: 'Maria' });
    expect(sysEquipe).toContain('Maria');
    expect(sysEquipe.toLowerCase()).toContain('so com a direcao'); // barra detalhe profundo
  });

  it('instrui a IA a responder em texto simples, sem markdown/asteriscos/emojis (a resposta e falada)', async () => {
    let sys = '';
    const a = fakeAnthropic('Voce tem 42 leads no momento.', (s) => { sys = s; });
    await responderComoElo(a as any, 'quantos leads?', snap);
    const sysLower = sys.toLowerCase();
    expect(sysLower).toContain('sem markdown');
    expect(sysLower).toContain('asteriscos');
    expect(sysLower).toContain('emojis');
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
