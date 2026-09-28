// Histórico do WhatsApp pessoal (Parte 2b, 28/09/2026): o que chega no
// messages.set (ao ler o QR com a sincronização completa) e o que a Evolution
// já guardou (chat/findMessages) vira linha em mensagens_whatsapp — só conversa
// individual, só 90 dias, sem duplicar, em lotes, ligada ao lead, só o dono vê.
// Banco em memória e Evolution dublê: nada sai de verdade.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  segundosDe, telefoneDaConversa, mensagensDoEvento, linhaDoHistorico, criarImportadorHistorico, resumoDoPessoal, DIAS_HISTORICO,
} from '../src/modules/numero-pessoal-historico.js';
import { definirNumerosInternos, limparCacheInternos, receberNoNumeroPessoal } from '../src/modules/numero-pessoal.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const agora = Date.parse('2026-09-28T17:00:00Z');
const seg = (diasAtras: number) => Math.floor((agora - diasAtras * 86_400_000) / 1000);
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: '5561998805002', ativo: true };

let n = 0;
function msg(o: { jid?: string; fromMe?: boolean; dias?: number; texto?: string; id?: string; push?: string; message?: Record<string, unknown>; key?: Record<string, unknown> } = {}) {
  return {
    key: { remoteJid: o.jid ?? '5561999990001@s.whatsapp.net', fromMe: !!o.fromMe, id: o.id ?? `WA${++n}`, ...o.key },
    pushName: o.push ?? 'Ana',
    message: o.message ?? { conversation: o.texto ?? 'oi' },
    messageTimestamp: seg(o.dias ?? 1),
  };
}

function cenario(extra: Record<string, any[]> = {}) {
  const b = bancoMemoria({
    mensagens_whatsapp: [],
    leads: [{ id: 'lead-ana', company_id: CASA, phone: '61999990001', created_at: '2026-01-01' }],
    contatos_internos: [{ id: 'ci1', company_id: CASA, telefone: '61988880000', ativo: true }],
    ...extra,
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const imp = criarImportadorHistorico({ client: b.client, agora: () => agora, lote: 3, pausa: async () => {} });
  return { b, imp };
}

beforeEach(() => {
  limparCacheInternos();
  // Eva/negócio + dono + admin extra (o index.ts define no boot)
  definirNumerosInternos(['5561993077140', '5561998805002']);
});

describe('peças puras', () => {
  it('segundosDe: número, texto, Long do protobuf e milissegundos', () => {
    expect(segundosDe(1759000000)).toBe(1759000000);
    expect(segundosDe('1759000000')).toBe(1759000000);
    expect(segundosDe({ low: 1759000000, high: 0 })).toBe(1759000000);
    expect(segundosDe(1759000000123)).toBe(1759000000);
    expect(segundosDe('x')).toBeNull();
    expect(segundosDe(null)).toBeNull();
  });

  it('telefoneDaConversa: só individual (sem grupo, status, transmissão, canal); @lid usa o número alternativo', () => {
    expect(telefoneDaConversa({ remoteJid: '5561999990001@s.whatsapp.net' })).toBe('5561999990001');
    expect(telefoneDaConversa({ remoteJid: '120363000000@g.us' })).toBeNull();
    expect(telefoneDaConversa({ remoteJid: 'status@broadcast' })).toBeNull();
    expect(telefoneDaConversa({ remoteJid: '1234567890@broadcast' })).toBeNull();
    expect(telefoneDaConversa({ remoteJid: '1203630000@newsletter' })).toBeNull();
    expect(telefoneDaConversa({ remoteJid: '99887766@lid', remoteJidAlt: '5561999990001@s.whatsapp.net' })).toBe('5561999990001');
    expect(telefoneDaConversa({ remoteJid: '99887766@lid' })).toBeNull();
  });

  it('mensagensDoEvento: lista direta ou { messages }', () => {
    expect(mensagensDoEvento([1, 2])).toEqual([1, 2]);
    expect(mensagensDoEvento({ messages: [3] })).toEqual([3]);
    expect(mensagensDoEvento({})).toEqual([]);
  });

  it('linhaDoHistorico: data ORIGINAL, autor contato x dono, só o dono vê, mídia vira marcador', () => {
    const e = linhaDoHistorico(NP, msg({ dias: 10, texto: 'quero orçamento', id: 'A1' }), agora)!;
    expect(e).toMatchObject({
      company_id: CASA, contato_telefone: '5561999990001', contato_nome: 'Ana', direcao: 'entrada', autor: 'cliente',
      canal: 'whatsapp_business', numero: 'pessoal-junior', tipo: 'texto', texto: 'quero orçamento', origem: 'webhook',
      wamid: 'A1', status: 'recebida', visivel_so_para: 'u-junior', lead_id: null,
    });
    expect(e.criado_em).toBe(new Date(seg(10) * 1000).toISOString());
    expect(e.enviada_em).toBe(e.criado_em);
    const s = linhaDoHistorico(NP, msg({ fromMe: true, push: 'Você' }), agora)!;
    expect(s).toMatchObject({ direcao: 'saida', autor: 'humano', user_id: 'u-junior', autor_nome: 'Junior', origem: 'celular', status: 'enviada', contato_nome: null });
    expect(linhaDoHistorico(NP, msg({ message: { imageMessage: { url: 'https://mmg/x', caption: 'telhado' } } }), agora)).toMatchObject({ tipo: 'imagem', texto: '[imagem] telhado' });
    expect(linhaDoHistorico(NP, msg({ message: { audioMessage: { url: 'https://mmg/a' } } }), agora)).toMatchObject({ tipo: 'audio', texto: '[áudio]' });
    // nome que é só o número = sem nome
    expect(linhaDoHistorico(NP, msg({ push: '5561999990001' }), agora)!.contato_nome).toBeNull();
  });

  it(`linhaDoHistorico: fora — mais de ${DIAS_HISTORICO} dias, grupo, figurinha/reação, sem id`, () => {
    expect(linhaDoHistorico(NP, msg({ dias: 91 }), agora)).toBeNull();
    expect(linhaDoHistorico(NP, msg({ dias: 89 }), agora)).not.toBeNull();
    expect(linhaDoHistorico(NP, msg({ jid: '1203@g.us', key: { participant: '5561999990001@s.whatsapp.net' } }), agora)).toBeNull();
    expect(linhaDoHistorico(NP, msg({ message: { stickerMessage: {} } }), agora)).toBeNull();
    expect(linhaDoHistorico(NP, msg({ message: { reactionMessage: { text: '👍' } } }), agora)).toBeNull();
    expect(linhaDoHistorico(NP, msg({ id: '' }), agora)).toBeNull();
  });
});

describe('importador — fila em lotes, sem duplicar, ligado ao lead', () => {
  it('grava em lotes, liga ao lead pelo telefone (qualquer formato) e conta o progresso', async () => {
    const { b, imp } = cenario();
    const lote = [
      msg({ id: 'A', dias: 30, texto: 'oi' }),
      msg({ id: 'D', jid: '1203@g.us', key: { participant: '5561999990001@s.whatsapp.net' } }),
      msg({ id: 'B', dias: 29, fromMe: true, texto: 'olá!' }),
      msg({ id: 'E', jid: 'status@broadcast' }),
      msg({ id: 'C', jid: '5562988887777@s.whatsapp.net', dias: 5, push: 'Zé', texto: 'e aí' }),
      msg({ id: 'F', dias: 120 }),
      msg({ id: 'G', jid: '5561993077140@s.whatsapp.net', texto: '🔔 Lead novo: ...' }), // aviso da Eva
      msg({ id: 'H', jid: '5561988880000@s.whatsapp.net', texto: 'recado da equipe' }), // contato interno
    ];
    // grupo, status e a de 120 dias já ficam de fora na entrada da fila (só a linha enxuta entra)
    expect(imp.enfileirar(NP, lote)).toBe(5);
    await imp.esperar();
    const linhas = b.tabelas.mensagens_whatsapp;
    expect(linhas.map((l) => l.wamid).sort()).toEqual(['A', 'B', 'C']);
    expect(linhas.find((l) => l.wamid === 'A')).toMatchObject({ lead_id: 'lead-ana', visivel_so_para: 'u-junior', company_id: CASA });
    expect(linhas.find((l) => l.wamid === 'C')).toMatchObject({ lead_id: null, contato_nome: 'Zé' });
    const p = imp.progresso('pessoal-junior')!;
    expect(p).toMatchObject({ recebidas: 8, gravadas: 3, ignoradas: 5, conversas: 2, naFila: 0, emAndamento: false, falhas: 0 });
    expect(p.maisAntiga).toBe(new Date(seg(30) * 1000).toISOString());
    // lotes de 3: [A,B,C] num insert só; [Eva, equipe] → nada a gravar
    expect(b.escritas.filter((e) => e.tabela === 'mensagens_whatsapp' && e.op === 'insert')).toHaveLength(1);
  });

  it('reprocessar o MESMO histórico não duplica (chave = id da mensagem no WhatsApp)', async () => {
    const { b, imp } = cenario();
    const lote = [msg({ id: 'X1' }), msg({ id: 'X2' }), msg({ id: 'X1' })];
    imp.enfileirar(NP, lote);
    await imp.esperar();
    imp.enfileirar(NP, lote);
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp.map((l) => l.wamid).sort()).toEqual(['X1', 'X2']);
    expect(imp.progresso('pessoal-junior')).toMatchObject({ gravadas: 2, repetidas: 4 });
  });

  it('a mesma mensagem já gravada pelo tempo real (ou pelo painel) não duplica', async () => {
    const { b, imp } = cenario({ mensagens_whatsapp: [{ id: 'm0', company_id: CASA, wamid: 'RT1', visivel_so_para: 'u-junior', texto: 'oi' }] });
    imp.enfileirar(NP, [msg({ id: 'RT1' }), msg({ id: 'NOVA' })]);
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp.filter((l) => l.wamid === 'RT1')).toHaveLength(1);
    expect(b.tabelas.mensagens_whatsapp.find((l) => l.wamid === 'NOVA')).toBeTruthy();
  });

  it('mensagem antiga do contato sem lead passa pro lead quando ele já é lead', async () => {
    const { b, imp } = cenario({ mensagens_whatsapp: [{ id: 'velha', company_id: CASA, contato_telefone: '5561999990001', lead_id: null, visivel_so_para: 'u-junior', wamid: 'V0' }] });
    imp.enfileirar(NP, [msg({ id: 'N1' })]);
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp.find((l) => l.id === 'velha')!.lead_id).toBe('lead-ana');
  });

  it('lead de OUTRA empresa com o mesmo telefone não é ligado (fica "Não é lead")', async () => {
    const { b, imp } = cenario({ leads: [{ id: 'lead-tenant', company_id: TENANT, phone: '5561999990001', created_at: '2026-01-01' }] });
    imp.enfileirar(NP, [msg({ id: 'T1' })]);
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp[0].lead_id).toBeNull();
  });

  it('número pessoal desligado ou fora da casa: nada é gravado', async () => {
    const { b, imp } = cenario();
    imp.enfileirar({ ...NP, ativo: false }, [msg({ id: 'Z1' })]);
    imp.enfileirar({ ...NP, instancia: 'outra', company_id: TENANT }, [msg({ id: 'Z2' })]);
    await imp.esperar();
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(0);
  });

  it('banco falhou num lote: conta a falha, segue com os próximos, não derruba nada', async () => {
    const { b, imp } = cenario();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    b.falharEm('mensagens_whatsapp', 'timeout');
    imp.enfileirar(NP, [msg({ id: 'F1' }), msg({ id: 'F2' }), msg({ id: 'F3' }), msg({ id: 'F4' })]);
    await imp.esperar();
    expect(imp.progresso('pessoal-junior')).toMatchObject({ falhas: 1, gravadas: 1 });
    expect(b.tabelas.mensagens_whatsapp.map((l) => l.wamid)).toEqual(['F4']);
    // log sem telefone nem texto
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/5561|oi/);
    warn.mockRestore();
  });

  it('enfileirar volta NA HORA (o webhook não espera o banco)', () => {
    const { imp } = cenario();
    const t0 = Date.now();
    expect(imp.enfileirar(NP, Array.from({ length: 1000 }, (_, i) => msg({ id: `Q${i}` })))).toBe(1000);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(imp.progresso('pessoal-junior')!.emAndamento).toBe(true);
  });
});

describe('puxar do servidor (o que a Evolution já guardou)', () => {
  it('pagina POST /chat/findMessages (90 dias) até acabar e grava tudo', async () => {
    const { b, imp } = cenario();
    const paginas = [[msg({ id: 'P1' }), msg({ id: 'P2' })], [msg({ id: 'P3', dias: 60 })]];
    const f = vi.fn(async (_url: string, init: any) => {
      const corpo = JSON.parse(init.body);
      const recs = paginas[corpo.page - 1] ?? [];
      return new Response(JSON.stringify({ messages: { total: 3, pages: 2, currentPage: corpo.page, records: recs } }), { status: 200 });
    });
    const r = await imp.puxarDoServidor(NP, { baseUrl: 'https://evo.exemplo/', apiKey: 'k', fetchImpl: f as any }, 2);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe('https://evo.exemplo/chat/findMessages/pessoal-junior');
    const corpo = JSON.parse(f.mock.calls[0][1].body);
    expect(corpo).toMatchObject({ page: 1, offset: 2 });
    expect(corpo.where.messageTimestamp.gte).toBe(new Date(agora - 90 * 86_400_000).toISOString());
    expect(b.tabelas.mensagens_whatsapp.map((l) => l.wamid).sort()).toEqual(['P1', 'P2', 'P3']);
  });

  it('Evolution fora do ar: ok=false, nada quebra', async () => {
    const { imp } = cenario();
    const r = await imp.puxarDoServidor(NP, { baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: (async () => new Response('x', { status: 500 })) as any });
    expect(r.ok).toBe(false);
  });
});

describe('resumo para a tela', () => {
  it('mensagens, conversas e a mais antiga — só do dono e deste número', async () => {
    const { b } = cenario({
      mensagens_whatsapp: [
        { id: '1', company_id: CASA, visivel_so_para: 'u-junior', numero: 'pessoal-junior', contato_telefone: '5561999990001', criado_em: '2026-07-10T10:00:00Z' },
        { id: '2', company_id: CASA, visivel_so_para: 'u-junior', numero: 'pessoal-junior', contato_telefone: '5561999990001', criado_em: '2026-09-10T10:00:00Z' },
        { id: '3', company_id: CASA, visivel_so_para: 'u-junior', numero: 'pessoal-junior', contato_telefone: '5562988887777', criado_em: '2026-08-10T10:00:00Z' },
        { id: '4', company_id: CASA, visivel_so_para: 'u-outro', numero: 'pessoal-outro', contato_telefone: '5563911112222', criado_em: '2026-01-10T10:00:00Z' },
      ],
    });
    expect(await resumoDoPessoal(b.client, NP)).toEqual({ mensagens: 3, conversas: 2, conversasMais: false, maisAntiga: '2026-07-10T10:00:00Z' });
  });
});

describe('tempo real também deixa de fora a Eva e a equipe', () => {
  it('aviso da Eva no celular do dono NÃO vira conversa "Não é lead"', async () => {
    const { b } = cenario();
    const r = await receberNoNumeroPessoal(b.client, NP, { type: 'text', from: '5561993077140', content: '🔔 Lead novo', timestamp: new Date(agora), messageId: 'EVA1', fromMe: false }, agora);
    expect(r).toBe('ignorada');
    const r2 = await receberNoNumeroPessoal(b.client, NP, { type: 'text', from: '556188880000', content: 'recado', timestamp: new Date(agora), messageId: 'EQ1', fromMe: false }, agora);
    expect(r2).toBe('ignorada');
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(0);
    const r3 = await receberNoNumeroPessoal(b.client, NP, { type: 'text', from: '5562988887777', content: 'oi', timestamp: new Date(agora), messageId: 'CLI1', fromMe: false }, agora);
    expect(r3).toBe('gravada');
  });
});

describe('webhook messages.set', () => {
  it('reconhece o evento (messages.set / MESSAGES_SET) e só o histórico', async () => {
    const { ehEventoDeHistorico } = await import('../src/modules/numero-pessoal-historico.js');
    expect(ehEventoDeHistorico({ event: 'messages.set' })).toBe(true);
    expect(ehEventoDeHistorico({ event: 'MESSAGES_SET' })).toBe(true);
    expect(ehEventoDeHistorico({ event: 'messages.upsert' })).toBe(false);
    expect(ehEventoDeHistorico(null)).toBe(false);
  });
  it('número pessoal ativo: enfileira e responde na hora; Eva/tenant/desligado/conflito: nada; banco fora: 503', async () => {
    const { receberHistoricoNoWebhook } = await import('../src/modules/numero-pessoal-historico.js');
    const importador = { enfileirar: vi.fn(() => 2) };
    const body = { event: 'messages.set', instance: 'pessoal-junior', data: [msg(), msg()] };
    const ok = await receberHistoricoNoWebhook({ body, porInstancia: async () => NP, companyDaInstancia: async () => null, importador });
    expect(ok).toEqual({ http: 200, status: 'historico_enfileirado', aceitas: 2 });
    expect(importador.enfileirar).toHaveBeenCalledWith(NP, body.data);
    importador.enfileirar.mockClear();
    expect((await receberHistoricoNoWebhook({ body: { ...body, instance: 'eva' }, porInstancia: async () => null, companyDaInstancia: async () => null, importador })).status).toBe('historico_ignorado');
    expect((await receberHistoricoNoWebhook({ body, porInstancia: async () => ({ ...NP, ativo: false }), companyDaInstancia: async () => null, importador })).status).toBe('numero_pessoal_desligado');
    expect((await receberHistoricoNoWebhook({ body, porInstancia: async () => NP, companyDaInstancia: async () => TENANT, importador })).status).toBe('numero_pessoal_conflito');
    expect((await receberHistoricoNoWebhook({ body, porInstancia: async () => 'erro', companyDaInstancia: async () => null, importador })).http).toBe(503);
    expect(importador.enfileirar).not.toHaveBeenCalled();
  });
});
