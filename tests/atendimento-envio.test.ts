// Atendimento Parte 2 — regras do envio pelo painel (funções puras + a
// orquestração com dublês: nada sai de verdade).
import { describe, it, expect, vi } from 'vitest';
import {
  ultimaDoCliente, janelaAtendimento, horaDaJanela, avisoCusto, motivoBloqueio, validarTexto, chaveValida,
  LimiteDeEnvio, enviarDoPainel, custoDoModelo, INICIO_COBRANCA_MS,
} from '../src/modules/dashboard/atendimento-envio.js';
import { modelosDaTela, corpoDaMeta, parametroNome, previaDoModelo, CATALOGO_MODELOS } from '../src/modules/dashboard/modelos-atendimento.js';
import { juntarComPainel, linhaDoPainelParaChat, normalizarMensagens } from '../src/modules/dashboard/conversas-queries.js';

const H = 3600_000;
const agora = Date.parse('2026-09-28T17:00:00Z'); // 14:00 em Brasília

describe('janela de 24 h (número da Eva)', () => {
  it('última do CLIENTE no canal da Eva abre; a do número pessoal não conta', () => {
    const msgs = [
      { role: 'user', content: 'a', timestamp: '2026-09-28T10:00:00Z' },
      { role: 'assistant', content: 'b', timestamp: '2026-09-28T16:00:00Z' },
      { role: 'user', content: 'c', timestamp: '2026-09-28T16:30:00Z', canal: 'whatsapp_business' as const },
    ];
    expect(ultimaDoCliente(msgs, 'eva_oficial')).toBe('2026-09-28T10:00:00Z');
    expect(ultimaDoCliente(msgs, 'whatsapp_business')).toBe('2026-09-28T16:30:00Z');
    expect(ultimaDoCliente([], 'eva_oficial')).toBeNull();
  });

  it('aberta até 23 h depois (1 h de margem); fechada depois disso ou sem mensagem', () => {
    const j = janelaAtendimento(new Date(agora - 2 * H).toISOString(), agora);
    expect(j.aberta).toBe(true);
    expect(j.ateIso).toBe(new Date(agora - 2 * H + 23 * H).toISOString());
    expect(janelaAtendimento(new Date(agora - 23 * H - 1000).toISOString(), agora).aberta).toBe(false);
    expect(janelaAtendimento(null, agora)).toEqual({ aberta: false, ateIso: null });
    expect(janelaAtendimento('lixo', agora).aberta).toBe(false);
  });

  it('hora da janela: hoje → HH:MM; outro dia → DD/MM HH:MM (Brasília)', () => {
    expect(horaDaJanela('2026-09-28T20:32:00Z', agora)).toBe('17:32');
    expect(horaDaJanela('2026-09-29T15:00:00Z', agora)).toBe('29/09 12:00');
  });
});

describe('custo', () => {
  it('só o número oficial da Eva mostra aviso; muda o texto a partir de 01/10', () => {
    expect(avisoCusto('evolution', agora)).toBeNull();
    expect(avisoCusto('waba', agora)).toMatch(/grátis até 30\/09/);
    expect(avisoCusto('waba', INICIO_COBRANCA_MS)).toBe('Custo: ≈ R$ 0,035 por mensagem (marketing ≈ R$ 0,32).');
    expect(custoDoModelo({ categoria: 'marketing' })).toMatch(/0,32/);
    expect(custoDoModelo({ categoria: 'utilidade' })).toBe('≈ R$ 0,035');
  });
});

describe('motivoBloqueio (o servidor usa a mesma regra da tela)', () => {
  const ok = { optOut: false, telefone: '5561999990001', via: 'waba' as const, lgpdBloqueado: false, tipo: 'texto' as const, janelaAberta: true };
  it('libera texto na janela aberta', () => expect(motivoBloqueio(ok)).toBeNull());
  it('texto com janela FECHADA no número da Eva → só modelo', () => {
    expect(motivoBloqueio({ ...ok, janelaAberta: false })).toBe('janela_fechada');
    expect(motivoBloqueio({ ...ok, janelaAberta: false, tipo: 'modelo' })).toBeNull();
  });
  it('opt-out e LGPD bloqueiam; sem canal; modelo só no oficial; QR não tem janela', () => {
    expect(motivoBloqueio({ ...ok, optOut: true })).toBe('opt_out');
    expect(motivoBloqueio({ ...ok, lgpdBloqueado: true })).toBe('bloqueado_lgpd');
    expect(motivoBloqueio({ ...ok, via: 'nenhum' })).toBe('sem_canal');
    expect(motivoBloqueio({ ...ok, telefone: null })).toBe('sem_telefone');
    expect(motivoBloqueio({ ...ok, via: 'evolution', tipo: 'modelo' })).toBe('modelo_so_no_oficial');
    expect(motivoBloqueio({ ...ok, via: 'evolution', janelaAberta: false })).toBeNull();
  });
});

describe('validações', () => {
  it('texto: vazio / longo / ok', () => {
    expect(validarTexto('   ')).toEqual({ ok: false, motivo: 'vazio' });
    expect(validarTexto('x'.repeat(4097))).toEqual({ ok: false, motivo: 'longo' });
    expect(validarTexto('  oi\r\ntudo bem? ')).toEqual({ ok: true, texto: 'oi\ntudo bem?' });
  });
  it('chave do clique é um uuid', () => {
    expect(chaveValida('8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00')).toBe(true);
    expect(chaveValida('x')).toBe(false);
    expect(chaveValida(undefined)).toBe(false);
  });
  it('limite: 20 por minuto por pessoa e 1 a cada 2 s pro mesmo contato', () => {
    const l = new LimiteDeEnvio(3, 2000);
    expect(l.permitir('u', 'A', 0)).toBe(true);
    expect(l.permitir('u', 'A', 1000)).toBe(false);
    expect(l.permitir('u', 'B', 1000)).toBe(true);
    expect(l.permitir('u', 'C', 1500)).toBe(true);
    expect(l.permitir('u', 'D', 1600)).toBe(false);
    expect(l.permitir('u', 'D', 61_000)).toBe(true);
    expect(l.permitir('outra', 'E', 1600)).toBe(true);
  });
});

describe('enviarDoPainel (dublês)', () => {
  function deps(over: Record<string, unknown> = {}) {
    const ordem: string[] = [];
    const d = {
      reservar: vi.fn(async () => { ordem.push('reservar'); return { ok: true as const, id: 'm1' }; }),
      concluir: vi.fn(async (_id: string, r: { status: string }) => { ordem.push(`concluir:${r.status}`); }),
      assumir: vi.fn(async () => { ordem.push('assumir'); }),
      enviar: vi.fn(async () => { ordem.push('enviar'); return { messageId: 'wamid.X' }; }),
      copiarParaMemoria: vi.fn(async () => { ordem.push('memoria'); }),
      registrar: vi.fn(async () => { ordem.push('registrar'); }),
      ...over,
    };
    return { d, ordem };
  }

  it('reserva → assume → envia → conclui com o wamid → memória → registro', async () => {
    const { d, ordem } = deps();
    const r = await enviarDoPainel(d as any);
    expect(r).toEqual({ resultado: 'enviada', id: 'm1' });
    expect(ordem).toEqual(['reservar', 'assumir', 'enviar', 'concluir:enviada', 'memoria', 'registrar']);
    expect(d.concluir).toHaveBeenCalledWith('m1', { status: 'enviada', wamid: 'wamid.X' });
  });

  it('clique repetido (chave já reservada): NÃO envia de novo', async () => {
    const { d } = deps({ reservar: vi.fn(async () => ({ ok: false, motivo: 'duplicado' })) });
    expect((await enviarDoPainel(d as any)).resultado).toBe('duplicado');
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.assumir).not.toHaveBeenCalled();
  });

  it('banco fora (sem reserva): NÃO envia (falha fechada)', async () => {
    const { d } = deps({ reservar: vi.fn(async () => ({ ok: false, motivo: 'erro' })) });
    expect((await enviarDoPainel(d as any)).resultado).toBe('erro_banco');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('WhatsApp recusou: fica gravado como "falhou" com o motivo, sem memória nem registro', async () => {
    const { d } = deps({ enviar: vi.fn(async () => { throw new Error('131047 re-engagement'); }) });
    const r = await enviarDoPainel(d as any);
    expect(r.resultado).toBe('falhou');
    expect(d.concluir).toHaveBeenCalledWith('m1', { status: 'falhou', erro: '131047 re-engagement' });
    expect(d.copiarParaMemoria).not.toHaveBeenCalled();
  });
});

describe('modelos aprovados', () => {
  it('sem a Meta: catálogo local (não conferido), todos com {{1}} = nome', () => {
    const m = modelosDaTela(null);
    expect(m.map((x) => x.nome)).toEqual(CATALOGO_MODELOS.map((x) => x.nome));
    expect(m.every((x) => !x.conferido)).toBe(true);
  });
  it('com a Meta: só APROVADOS em pt_BR, texto e categoria de lá; sai quem tem 2+ variáveis', () => {
    const m = modelosDaTela([
      { name: 'reativacao_lead_v1', status: 'APPROVED', language: 'pt_BR', category: 'MARKETING', components: [{ type: 'BODY', text: 'Oi {{1}}, tudo bem?' }] },
      { name: 'lembrete_manutencao', status: 'PENDING', language: 'pt_BR', category: 'UTILITY' },
      { name: 'eva_proposta_aberta_v1', status: 'APPROVED', language: 'pt_BR', category: 'UTILITY', components: [{ type: 'BODY', text: '{{1}} e {{2}}' }] },
      { name: 'pedido_depoimento', status: 'APPROVED', language: 'en_US' },
    ]);
    expect(m).toEqual([{ nome: 'reativacao_lead_v1', rotulo: 'Retomar a conversa', categoria: 'marketing', texto: 'Oi {nome}, tudo bem?', conferido: true }]);
  });
  it('corpo da Meta e prévia com o nome', () => {
    expect(corpoDaMeta({ name: 'x', status: 'APPROVED', language: 'pt_BR', components: [{ type: 'BODY', text: 'Olá {{ 1 }}!' }] })).toBe('Olá {nome}!');
    expect(previaDoModelo({ nome: 'x', texto: 'Olá {nome}!' }, 'Ana')).toBe('Olá Ana!');
    expect(previaDoModelo({ nome: 'x', texto: null }, 'Ana')).toBe('[modelo x · nome: Ana]');
  });
  it('parâmetro sem quebra de linha (a Meta recusa), cortado e com padrão', () => {
    expect(parametroNome('Ana\nMaria\t  Silva')).toBe('Ana Maria Silva');
    expect(parametroNome('')).toBe('tudo bem');
    expect(parametroNome('x'.repeat(100))).toHaveLength(60);
  });
});

describe('chat = memória da Eva + histórico do painel', () => {
  const painel = [
    { id: 'p1', company_id: 'c', lead_id: 'L', direcao: 'saida', autor: 'humano', autor_nome: 'Junior', canal: 'eva_oficial', tipo: 'texto', texto: 'Oi Ana, aqui é o Junior', status: 'enviada', criado_em: '2026-09-28T12:00:00Z', enviada_em: '2026-09-28T12:00:01Z' },
    { id: 'p2', company_id: 'c', lead_id: 'L', direcao: 'evento', autor: 'humano', autor_nome: 'Junior', evento: 'assumiu', tipo: 'evento', status: 'registrada', criado_em: '2026-09-28T11:59:59Z' },
  ] as any[];

  it('eventos e envios do painel entram em ordem; a cópia na memória da Eva (painel_id) não duplica', () => {
    const conversa = normalizarMensagens([
      { role: 'user', content: 'oi', timestamp: '2026-09-28T11:00:00Z' },
      { role: 'assistant', content: 'Oi Ana, aqui é o Junior', timestamp: '2026-09-28T12:00:01Z', painel_id: 'p1' },
      { role: 'user', content: 'opa', timestamp: '2026-09-28T12:05:00Z' },
    ]);
    const j = juntarComPainel(conversa, painel, 'eva_oficial');
    expect(j.map((m) => `${m.autor}:${m.content || m.evento}`)).toEqual(['cliente:oi', 'evento:assumiu', 'humano:Oi Ana, aqui é o Junior', 'cliente:opa']);
    expect(j[0].canal).toBe('eva_oficial');
    expect(j[2]).toMatchObject({ autorNome: 'Junior', status: 'enviada', canal: 'eva_oficial' });
  });

  it('linha inválida não vira balão; modelo sem texto mostra o nome do modelo', () => {
    expect(linhaDoPainelParaChat({ ...painel[1], evento: null } as any)).toBeNull();
    expect(linhaDoPainelParaChat({ ...painel[0], texto: '', modelo: 'reativacao_lead_v1' } as any)!.content).toBe('[modelo reativacao_lead_v1]');
  });
});

describe('lista: de qual número veio a conversa', () => {
  it('sem o dado na linha, vale o número da assistente da empresa (Eva na casa, QR no tenant)', async () => {
    const { montarLista, canalDaAssistente } = await import('../src/modules/dashboard/conversas-queries.js');
    const leads = [{ id: 'L1', name: 'Ana', phone: '5561999990001', status: 'novo', city: null, eva_active: true, opt_out: false, claimed_by: null }];
    const l = montarLista([{ lead_id: 'L1', messages: [] }], leads, {}, 'u', canalDaAssistente('00000000-0000-0000-0000-000000000001'));
    expect(l.itens[0].canal).toBe('eva_oficial');
    expect(canalDaAssistente('aaaa1111-2222-3333-4444-555566667777')).toBe('qr_code');
    expect(montarLista([{ lead_id: 'L1', messages: [], canal: 'business' }], leads, {}, 'u', 'eva_oficial').itens[0].canal).toBe('whatsapp_business');
  });
});
