// Revisão de segurança do R13 (28/09/2026): Manutenção e OS respeitam a
// empresa da SESSÃO. Antes, a agenda/leituras/usinas do /manutencao vinham de
// todas as empresas, e feita / reagendar / os/abrir / os/nova / agendar /
// leitura / a OS inteira (tela, salvar, foto, concluir, laudo) agiam em
// qualquer :id — e o que era criado nascia carimbado como EcoSun (DEFAULT 077).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bancoFalso } from './helpers/banco-falso.js';
import {
  listarAgenda, listarLeiturasPendentes, listarUsinasAtivas, sistemaDoOperador, manutencaoDoOperador, criarManutencao,
} from '../src/modules/dashboard/manutencao-queries.js';
import { getOS, criarOS, abrirOSDeManutencao } from '../src/modules/dashboard/os-queries.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const AURORA = 'aaaa1111-2222-3333-4444-555566667777';
const OUTRA = 'bbbb1111-2222-3333-4444-555566667777';

const sis = (id: string, company_id: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, apelido: `Usina ${id}`, lead_id: `l-${id}`, company_id, ativo: true, acompanhamento: 'manual', api_credentials: null, leads: { name: `Cliente ${id}` }, ...extra });
const manut = (id: string, company_id: string | null) =>
  ({ id, sistema_id: `s-${id}`, lead_id: `l-${id}`, tipo: 'limpeza', origem: 'regra', status: 'agendada', data_agendada: '2026-10-01', company_id, sistemas_clientes: { apelido: `Usina ${id}`, acompanhamento: null, api_credentials: { k: 1 }, leads: { name: 'x' } } });

function banco() {
  return bancoFalso({
    sistemas_clientes: [sis('s-eco', ECOSUN), sis('s-velha', null), sis('s-aur', AURORA), sis('s-out', OUTRA)],
    manutencoes: [manut('m-eco', ECOSUN), manut('m-velha', null), manut('m-aur', AURORA), manut('m-out', OUTRA)],
    geracao_diaria: [],
    ordens_servico: [
      { id: 'os-aur', sistema_id: 's-aur', lead_id: null, manutencao_id: null, tipo: 'limpeza', status: 'aberta', checklist: {}, observacoes: null, executor: null, aberta_em: '2026-09-01', concluida_em: null, company_id: AURORA },
      { id: 'os-velha', sistema_id: 's-velha', lead_id: null, manutencao_id: null, tipo: 'limpeza', status: 'aberta', checklist: {}, observacoes: null, executor: null, aberta_em: '2026-09-01', concluida_em: null, company_id: null },
    ],
  });
}

describe('leituras do /manutencao filtradas pela empresa da sessão', () => {
  it('agenda: tenant vê só a dele; EcoSun vê a dela + as antigas sem company_id', async () => {
    expect((await listarAgenda(banco().client, AURORA)).map((i) => i.id)).toEqual(['m-aur']);
    expect((await listarAgenda(banco().client, ECOSUN)).map((i) => i.id).sort()).toEqual(['m-eco', 'm-velha']);
  });
  it('leituras pendentes: só usinas sem API da empresa', async () => {
    expect((await listarLeiturasPendentes(banco().client, AURORA)).map((l) => l.sistemaId)).toEqual(['s-aur']);
    expect((await listarLeiturasPendentes(banco().client, ECOSUN)).map((l) => l.sistemaId).sort()).toEqual(['s-eco', 's-velha']);
  });
  it('usinas dos formulários (agendar / nova OS): só da empresa', async () => {
    expect((await listarUsinasAtivas(banco().client, AURORA)).map((u) => u.id)).toEqual(['s-aur']);
    expect((await listarUsinasAtivas(banco().client, OUTRA)).map((u) => u.id)).toEqual(['s-out']);
  });
});

describe('dono do :id antes de escrever', () => {
  it('sistemaDoOperador: usina de outra empresa → null; da empresa → lead + empresa pra carimbar', async () => {
    expect(await sistemaDoOperador(banco().client, 's-out', AURORA)).toBeNull();
    expect(await sistemaDoOperador(banco().client, 'nao-existe', AURORA)).toBeNull();
    expect(await sistemaDoOperador(banco().client, 's-aur', AURORA)).toEqual({ leadId: 'l-s-aur', companyId: AURORA });
    expect(await sistemaDoOperador(banco().client, 's-velha', ECOSUN)).toEqual({ leadId: 'l-s-velha', companyId: ECOSUN });
    expect(await sistemaDoOperador(banco().client, 's-velha', AURORA)).toBeNull();
  });
  it('manutencaoDoOperador: de outra empresa → null', async () => {
    expect(await manutencaoDoOperador(banco().client, 'm-out', AURORA)).toBeNull();
    expect(await manutencaoDoOperador(banco().client, 'm-aur', AURORA)).toEqual({ leadId: 'l-m-aur', tipo: 'limpeza' });
  });
  it('getOS: OS de outra empresa → null (tela, salvar, foto, concluir e laudo dão 404)', async () => {
    expect(await getOS(banco().client, 'os-aur', OUTRA)).toBeNull();
    expect(await getOS(banco().client, 'os-velha', AURORA)).toBeNull();
    expect((await getOS(banco().client, 'os-aur', AURORA))?.id).toBe('os-aur');
    expect((await getOS(banco().client, 'os-velha', ECOSUN))?.id).toBe('os-velha');
  });
});

/** Client mínimo que guarda os inserts (o banco falso não tem .single()). */
function clientDeInsert(leituras: Record<string, unknown> = {}) {
  const inserts: Array<{ tabela: string; linha: Record<string, unknown> }> = [];
  const client = {
    from(tabela: string) {
      const q: any = {
        insert(linha: Record<string, unknown>) { inserts.push({ tabela, linha }); return q; },
        select() { return q; }, eq() { return q; },
        single: async () => ({ data: { id: 'novo' }, error: null }),
        maybeSingle: async () => ({ data: leituras[tabela] ?? null, error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, inserts };
}

describe('o que nasce leva a empresa dona (não o DEFAULT EcoSun)', () => {
  it('criarManutencao carimba company_id', async () => {
    const { client, inserts } = clientDeInsert();
    await criarManutencao(client, { sistemaId: 's-aur', leadId: null, tipo: 'limpeza', origem: 'manual', dataAgendada: '2026-10-01', companyId: AURORA });
    expect(inserts[0]).toMatchObject({ tabela: 'manutencoes', linha: { company_id: AURORA } });
  });
  it('criarOS carimba company_id', async () => {
    const { client, inserts } = clientDeInsert();
    await criarOS(client, { sistemaId: 's-aur', leadId: null, tipo: 'corretiva', companyId: AURORA });
    expect(inserts[0]).toMatchObject({ tabela: 'ordens_servico', linha: { company_id: AURORA } });
  });
  it('abrirOSDeManutencao: de outra empresa não cria nada; da empresa carimba a dona', async () => {
    const outra = clientDeInsert({ manutencoes: { sistema_id: 's-out', lead_id: null, tipo: 'limpeza', company_id: OUTRA } });
    expect(await abrirOSDeManutencao(outra.client, 'm-out', AURORA)).toBeNull();
    expect(outra.inserts).toEqual([]);
    const dela = clientDeInsert({ manutencoes: { sistema_id: 's-aur', lead_id: null, tipo: 'limpeza', company_id: AURORA } });
    expect(await abrirOSDeManutencao(dela.client, 'm-aur', AURORA)).toBe('novo');
    expect(dela.inserts[0]).toMatchObject({ tabela: 'ordens_servico', linha: { company_id: AURORA, manutencao_id: 'm-aur' } });
  });
});

describe('router: toda rota de Manutenção/OS confere a empresa da sessão', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const rota = (metodo: string, caminho: string) => {
    const i = fonte.indexOf(`router.${metodo}('${caminho}'`);
    expect(i, caminho).toBeGreaterThan(-1);
    return fonte.slice(i, fonte.indexOf('\n  });', i));
  };
  it.each([
    ['get', '/manutencao', /listarAgenda\(db, companyId\)[\s\S]*listarLeiturasPendentes\(db, companyId\)[\s\S]*listarUsinasAtivas\(db, companyId\)/],
    ['post', '/manutencao/agendar', /sistemaDoOperador\(db, sistemaId, req\.dashUser!\.companyId\)/],
    ['post', '/manutencao/:id/feita', /manutencaoDoOperador\(db, id, req\.dashUser!\.companyId\)[\s\S]*marcarManutencaoFeita/],
    ['post', '/manutencao/:id/reagendar', /manutencaoDoOperador\([\s\S]*reagendarManutencao/],
    ['post', '/usinas/:sistemaId/leitura', /sistemaDoOperador\([\s\S]*registrarLeituraManual/],
    ['post', '/manutencao/:id/os/abrir', /abrirOSDeManutencao\(supabase, mid, req\.dashUser!\.companyId\)/],
    ['post', '/os/nova', /sistemaDoOperador\(db, sistemaId, req\.dashUser!\.companyId\)[\s\S]*criarOS/],
    ['get', '/os/:id', /getOS\(supabase, id, req\.dashUser!\.companyId\)/],
    ['post', '/os/:id/salvar', /getOS\(supabase, id, req\.dashUser!\.companyId\)[\s\S]*salvarOS/],
    ['post', '/os/:id/foto', /getOS\(supabase, id, req\.dashUser!\.companyId\)[\s\S]*addFotoOS/],
    ['post', '/os/:id/concluir', /getOS\(supabase, id, req\.dashUser!\.companyId\)[\s\S]*concluirOS/],
    ['get', '/os/:id/laudo', /getOS\(supabase, id, req\.dashUser!\.companyId\)/],
  ])('%s %s', (metodo, caminho, re) => {
    expect(rota(metodo, caminho)).toMatch(re);
  });
});
