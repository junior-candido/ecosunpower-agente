// Atendimento Parte 2b — o WhatsApp pessoal do dono (QR/Evolution). Banco em
// memória; nada é enviado. Regras: grava TUDO, só o dono vê, a Eva nunca
// responde, eco do painel não duplica, 1 cliente = 1 lead (telefone com 55
// dentro da empresa), o dono respondendo um lead pelo celular = assumiu.
import { describe, it, expect } from 'vitest';
import {
  receberNoNumeroPessoal, textoDaEntrada, virarLead, mensagensPessoais, leadDoTelefoneNaEmpresa,
  criarResolverNumeroPessoal, instanciaLivreParaPessoal, type NumeroPessoal,
} from '../src/modules/numero-pessoal.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const NP: NumeroPessoal = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'junior-business', numero: '5561998805002', ativo: true };

function banco(extra: Record<string, any[]> = {}) {
  return bancoMemoria({
    leads: [
      { id: 'L-ana', company_id: CASA, phone: '556199990001', name: 'Ana', eva_active: true, opt_out: false, created_at: '2026-09-01' }, // sem o 9º dígito
      { id: 'L-outra', company_id: TENANT, phone: '5561988887777', name: 'Da outra empresa', eva_active: true, opt_out: false, created_at: '2026-09-01' },
    ],
    mensagens_whatsapp: [], eva_cadence: [],
    whatsapp_numeros_pessoais: [NP],
    companies: [{ id: TENANT, evolution_instance: 'solar-aurora' }],
    ...extra,
  }, { mensagens_whatsapp: [['company_id', 'wamid'], ['company_id', 'chave_envio']] });
}
const msg = (o: Record<string, unknown> = {}) => ({ type: 'text', from: '5561999990001', content: 'Oi Junior!', timestamp: new Date('2026-09-28T15:00:00Z'), messageId: 'W1', fromMe: false, pushName: 'Ana Zap', ...o }) as any;

describe('receberNoNumeroPessoal', () => {
  it('cliente que já é lead (outro formato de telefone): grava no lead, canal pessoal, só o dono vê', async () => {
    const b = banco();
    expect(await receberNoNumeroPessoal(b.client, NP, msg())).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({
      company_id: CASA, lead_id: 'L-ana', contato_telefone: '5561999990001', contato_nome: 'Ana Zap', direcao: 'entrada', autor: 'cliente',
      canal: 'whatsapp_business', numero: 'junior-business', texto: 'Oi Junior!', wamid: 'W1', status: 'recebida', visivel_so_para: 'u-junior',
    });
    // a Eva não foi tocada
    expect(b.tabelas.leads[0].eva_active).toBe(true);
  });

  it('amigo que ainda não é lead: grava SEM lead (aparece com "virar lead"); não cria lead sozinho', async () => {
    const b = banco();
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ from: '5561977776666', pushName: 'Carlos' }))).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ lead_id: null, contato_telefone: '5561977776666', contato_nome: 'Carlos' });
    expect(b.tabelas.leads).toHaveLength(2);
  });

  it('lead de OUTRA empresa com o mesmo telefone não é usado', async () => {
    const b = banco();
    await receberNoNumeroPessoal(b.client, NP, msg({ from: '5561988887777' }));
    expect(b.tabelas.mensagens_whatsapp[0].lead_id).toBeNull();
  });

  it('o dono digitou no celular para um lead: grava como dele e ASSUME (mesmo estado do botão)', async () => {
    const b = banco();
    const logo = Date.parse('2026-09-28T15:01:00Z');
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ fromMe: true, content: 'Oi Ana, tudo certo?', messageId: 'W2' }), logo)).toBe('gravada');
    const saida = b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')!;
    expect(saida).toMatchObject({ autor: 'humano', user_id: 'u-junior', autor_nome: 'Junior', origem: 'celular', status: 'enviada', visivel_so_para: 'u-junior' });
    expect(b.tabelas.leads[0].eva_active).toBe(false);
    const ev = b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'evento')!;
    expect(ev).toMatchObject({ evento: 'assumiu', origem: 'celular' });
    expect(ev.visivel_so_para ?? null).toBeNull(); // "assumiu" é da empresa toda; o conteúdo pessoal não
  });

  it('eco do que o PAINEL mandou não duplica (pelo wamid ou pelo texto recente sem wamid)', async () => {
    const b = banco({ mensagens_whatsapp: [
      { id: 'p1', company_id: CASA, contato_telefone: '5561999990001', origem: 'painel', canal: 'whatsapp_business', numero: 'junior-business', visivel_so_para: 'u-junior', texto: 'Mandei pelo painel', wamid: 'W9', criado_em: new Date().toISOString() },
      { id: 'p2', company_id: CASA, contato_telefone: '5561999990001', origem: 'painel', canal: 'whatsapp_business', numero: 'junior-business', visivel_so_para: 'u-junior', texto: 'Ainda sem id\r\n', wamid: null, criado_em: new Date().toISOString() },
    ] });
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ fromMe: true, messageId: 'W9', content: 'Mandei pelo painel' }))).toBe('eco');
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ fromMe: true, messageId: 'W10', content: 'Ainda sem id' }))).toBe('eco');
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(2);
    expect(b.tabelas.mensagens_whatsapp[1].wamid).toBe('W10');
  });

  it('webhook repetido (mesmo wamid): duplicada, não grava de novo', async () => {
    const b = banco();
    await receberNoNumeroPessoal(b.client, NP, msg());
    expect(await receberNoNumeroPessoal(b.client, NP, msg())).toBe('duplicada');
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(1);
  });

  it('grupo, número que não é telefone (@lid) e mensagem vazia: ignora', async () => {
    const b = banco();
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ deGrupo: true }))).toBe('ignorada');
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ from: '123456789012345@lid' }))).toBe('ignorada');
    expect(await receberNoNumeroPessoal(b.client, NP, msg({ content: '  ' }))).toBe('ignorada');
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(0);
  });

  it('mídia vira marcador (+ legenda)', () => {
    expect(textoDaEntrada({ type: 'audio', content: 'https://x' } as any)).toBe('[áudio]');
    expect(textoDaEntrada({ type: 'image', content: 'u', caption: ' meu telhado ' } as any)).toBe('[imagem] meu telhado');
  });
});

describe('virarLead', () => {
  it('contato do número pessoal vira lead da EMPRESA, com a Eva pausada e o evento "assumiu"; mensagens passam pro lead', async () => {
    const b = banco();
    await receberNoNumeroPessoal(b.client, NP, msg({ from: '5561977776666', pushName: 'Carlos' }));
    const r = await virarLead(b.client, { companyId: CASA, userId: 'u-junior', userNome: 'Junior', telefone: '61977776666' });
    expect(r.ok && r.criado).toBe(true);
    const lead = b.tabelas.leads.find((l) => l.phone === '5561977776666')!;
    expect(lead).toMatchObject({ company_id: CASA, name: 'Carlos', status: 'novo', acquisition_source: 'whatsapp_pessoal', eva_active: false });
    expect(b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'entrada')!.lead_id).toBe(lead.id);
    expect(b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'evento')).toMatchObject({ evento: 'assumiu', lead_id: lead.id });
  });

  it('já existe lead com esse telefone (outro formato): usa o MESMO lead (um cliente, um lead)', async () => {
    const b = banco();
    await receberNoNumeroPessoal(b.client, NP, msg());
    b.tabelas.mensagens_whatsapp[0].lead_id = null;
    const r = await virarLead(b.client, { companyId: CASA, userId: 'u-junior', userNome: 'Junior', telefone: '5561999990001' });
    expect(r).toEqual({ ok: true, leadId: 'L-ana', criado: false });
    expect(b.tabelas.leads).toHaveLength(2);
    expect(b.tabelas.mensagens_whatsapp[0].lead_id).toBe('L-ana');
  });

  it('telefone que nunca falou com ESTE dono no número pessoal: recusa', async () => {
    const b = banco();
    expect(await virarLead(b.client, { companyId: CASA, userId: 'u-junior', userNome: 'Junior', telefone: '5561955554444' })).toEqual({ ok: false, motivo: 'sem_conversa' });
    await receberNoNumeroPessoal(b.client, NP, msg({ from: '5561955554444' }));
    expect(await virarLead(b.client, { companyId: CASA, userId: 'u-outro', userNome: 'Bia', telefone: '5561955554444' })).toEqual({ ok: false, motivo: 'sem_conversa' });
    expect(await virarLead(b.client, { companyId: CASA, userId: 'u-junior', userNome: 'Junior', telefone: 'abc' })).toEqual({ ok: false, motivo: 'telefone_invalido' });
  });
});

describe('leitura e cadastro', () => {
  it('mensagensPessoais: só da empresa e do dono, as mais novas', async () => {
    const b = banco({ mensagens_whatsapp: [
      { id: '1', company_id: CASA, visivel_so_para: 'u-junior', contato_telefone: 'A', criado_em: '2026-09-28T10:00:00Z' },
      { id: '2', company_id: CASA, visivel_so_para: 'u-bia', contato_telefone: 'A', criado_em: '2026-09-28T11:00:00Z' },
      { id: '3', company_id: TENANT, visivel_so_para: 'u-junior', contato_telefone: 'A', criado_em: '2026-09-28T12:00:00Z' },
      { id: '4', company_id: CASA, visivel_so_para: 'u-junior', contato_telefone: 'B', criado_em: '2026-09-28T13:00:00Z' },
    ] });
    expect((await mensagensPessoais(b.client, CASA, 'u-junior')).map((m) => m.id)).toEqual(['1', '4']);
    expect((await mensagensPessoais(b.client, CASA, 'u-junior', { telefone: 'B' })).map((m) => m.id)).toEqual(['4']);
    expect(await mensagensPessoais(b.client, CASA, '')).toEqual([]);
  });
  it('leadDoTelefoneNaEmpresa acha o legado sem company_id na casa, nunca o de outra empresa', async () => {
    const b = bancoMemoria({ leads: [{ id: 'L0', company_id: null, phone: '5561999990001', created_at: '1' }, { id: 'LT', company_id: TENANT, phone: '5561999990002', created_at: '1' }] });
    expect((await leadDoTelefoneNaEmpresa(b.client, CASA, '61999990001'))!.id).toBe('L0');
    expect(await leadDoTelefoneNaEmpresa(b.client, CASA, '5561999990002')).toBeNull();
  });
  it('resolver por instância (ativa) e a instância não pode ser a da Eva nem a de um tenant', async () => {
    const b = banco();
    const r = criarResolverNumeroPessoal(b.client);
    expect((await r.porInstancia('junior-business'))!.dono_user_id).toBe('u-junior');
    expect(await r.porInstancia('solar-aurora')).toBeNull();
    expect(await r.porInstancia('x y')).toBeNull();
    expect(await instanciaLivreParaPessoal(b.client, 'junior-business', 'eva-principal')).toBe(true);
    expect(await instanciaLivreParaPessoal(b.client, 'solar-aurora', 'eva-principal')).toBe(false);
    expect(await instanciaLivreParaPessoal(b.client, 'eva-principal', 'eva-principal')).toBe(false);
  });
});

describe('achados da revisão (2b)', () => {
  it('mensagem ANTIGA do dono (reentregue ao reconectar) não pausa a Eva', async () => {
    const b = banco();
    await receberNoNumeroPessoal(b.client, NP, msg({ fromMe: true, content: 'antiga', messageId: 'W7' }), Date.parse('2026-09-29T15:00:00Z'));
    expect(b.tabelas.leads[0].eva_active).toBe(true);
  });
  it('quando o contato já é lead, as mensagens antigas dele (sem lead) passam pro lead', async () => {
    const b = banco({ mensagens_whatsapp: [{ id: 'v', company_id: CASA, lead_id: null, contato_telefone: '5561999990001', visivel_so_para: 'u-junior', texto: 'antes', criado_em: '2026-09-01' }] });
    await receberNoNumeroPessoal(b.client, NP, msg());
    expect(b.tabelas.mensagens_whatsapp.every((m) => m.lead_id === 'L-ana')).toBe(true);
  });
  it('resolver: número DESLIGADO volta (o webhook ignora calado); tabela inexistente = não é pessoal; erro de banco = "erro"', async () => {
    const b = banco({ whatsapp_numeros_pessoais: [{ ...NP, ativo: false }] });
    expect((await criarResolverNumeroPessoal(b.client).porInstancia('junior-business')) as any).toMatchObject({ ativo: false });
    const c = banco();
    c.falharEm('whatsapp_numeros_pessoais', 'relation "whatsapp_numeros_pessoais" does not exist', '42P01');
    expect(await criarResolverNumeroPessoal(c.client).porInstancia('junior-business')).toBeNull();
    const d = banco();
    d.falharEm('whatsapp_numeros_pessoais', 'timeout', '57014');
    expect(await criarResolverNumeroPessoal(d.client).porInstancia('junior-business')).toBe('erro');
  });
  it('virar lead de telefone que já é lead de OUTRA empresa: motivo claro', async () => {
    const b = bancoMemoria({ leads: [], mensagens_whatsapp: [{ id: 'm', company_id: CASA, visivel_so_para: 'u-junior', contato_telefone: '5561977776666', criado_em: '1' }] }, { leads: [['phone']] });
    b.tabelas.leads.push({ id: 'LT', company_id: TENANT, phone: '5561977776666' });
    expect(await virarLead(b.client, { companyId: CASA, userId: 'u-junior', userNome: 'Junior', telefone: '5561977776666' })).toEqual({ ok: false, motivo: 'telefone_de_outra_empresa' });
  });
});
