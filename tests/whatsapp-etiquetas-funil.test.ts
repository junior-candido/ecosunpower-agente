// W4 — etiquetas do WhatsApp Business (número pessoal) ↔ etapa do funil.
// Banco em memória e dublê da Evolution: nada sai de verdade.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  lerEtiquetasEvolution, lerAssociacaoEtiqueta, mapeamentoDoFormulario, salvarMapeamento, lerMapeamento,
  etapaParaEtiqueta, etiquetaParaEtapa, ETAPAS_ETIQUETA,
} from '../src/modules/etiquetas-funil.js';
import { EvolutionService } from '../src/modules/evolution.js';
import { cartaoEtiquetas } from '../src/modules/dashboard/whatsapp-pessoal-views.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

afterEach(() => vi.unstubAllGlobals());
const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', instancia: 'pessoal-j', ativo: true };
const ETQ = [{ id: '1', nome: 'Novo cliente', cor: '1' }, { id: '2', nome: 'Proposta', cor: '2' }, { id: '5', nome: 'Fechou', cor: '5' }];

describe('leitura das etiquetas e dos avisos', () => {
  it('findLabels (lista ou {labels}); apagada e id estranho ficam de fora', () => {
    expect(lerEtiquetasEvolution([{ id: '1', name: 'Novo', color: 1 }, { id: '2', name: 'x', deleted: true }, { id: '<x>', name: 'y' }])).toEqual([{ id: '1', nome: 'Novo', cor: '1' }]);
    expect(lerEtiquetasEvolution({ labels: [{ id: '3', name: 'Pago' }] })).toEqual([{ id: '3', nome: 'Pago', cor: null }]);
  });
  it('labels.association nos dois formatos da Evolution; grupo ignorado', () => {
    expect(lerAssociacaoEtiqueta({ event: 'labels.association', data: { type: 'add', chatId: '556199990001@s.whatsapp.net', labelId: '2' } })).toEqual({ labelId: '2', jid: '556199990001@s.whatsapp.net', tipo: 'add' });
    expect(lerAssociacaoEtiqueta({ event: 'LABELS_ASSOCIATION', data: { association: { chatId: '556199990001@s.whatsapp.net', labelId: '5' }, type: 'remove' } })).toMatchObject({ tipo: 'remove', labelId: '5' });
    expect(lerAssociacaoEtiqueta({ event: 'labels.association', data: { type: 'add', chatId: '1203@g.us', labelId: '2' } })).toBeNull();
    expect(lerAssociacaoEtiqueta({ event: 'messages.upsert', data: {} })).toBeNull();
  });
  it('formulário: só etiquetas que existem; a mesma etiqueta em duas etapas vale só na 1ª', () => {
    expect(mapeamentoDoFormulario({ etapa_novo: '1', etapa_proposta_enviada: '2', etapa_negociacao: '2', etapa_ganho: '99' }, ETQ))
      .toEqual([{ etapa: 'novo', label_id: '1', label_nome: 'Novo cliente' }, { etapa: 'proposta_enviada', label_id: '2', label_nome: 'Proposta' }]);
  });
});

function banco(extra: Record<string, any[]> = {}) {
  return bancoMemoria({
    whatsapp_numeros_pessoais: [NP],
    whatsapp_etiquetas_funil: [],
    leads: [{ id: 'L1', company_id: CASA, phone: '5561999990001', status: 'novo', created_at: '1' }, { id: 'L9', company_id: TENANT, phone: '5561988887777', status: 'novo', created_at: '1' }],
    mensagens_whatsapp: [{ id: 'm1', company_id: CASA, lead_id: 'L1', visivel_so_para: 'u-junior', contato_telefone: '5561999990001' }],
    ...extra,
  });
}

describe('painel → celular', () => {
  it('etapa nova: põe a etiqueta dela e tira as outras mapeadas', async () => {
    const b = banco();
    await salvarMapeamento(b.client, NP, [{ etapa: 'novo', label_id: '1', label_nome: 'Novo' }, { etapa: 'proposta_enviada', label_id: '2', label_nome: 'Proposta' }]);
    const aplicar = vi.fn(async () => {});
    expect(await etapaParaEtiqueta(b.client, { companyId: CASA, leadId: 'L1', telefone: '5561999990001', etapa: 'proposta_enviada' }, { aplicar })).toBe(1);
    expect(aplicar.mock.calls).toEqual([
      ['pessoal-j', CASA, '5561999990001', '1', 'remove'],
      ['pessoal-j', CASA, '5561999990001', '2', 'add'],
    ]);
  });
  it('lead que nunca conversou no número pessoal, sem mapeamento ou de outra empresa: nada', async () => {
    const b = banco({ mensagens_whatsapp: [] });
    await salvarMapeamento(b.client, NP, [{ etapa: 'novo', label_id: '1', label_nome: 'Novo' }]);
    const aplicar = vi.fn(async () => {});
    expect(await etapaParaEtiqueta(b.client, { companyId: CASA, leadId: 'L1', telefone: '5561999990001', etapa: 'novo' }, { aplicar })).toBe(0);
    expect(await etapaParaEtiqueta(b.client, { companyId: TENANT, leadId: 'L9', telefone: '5561988887777', etapa: 'novo' }, { aplicar })).toBe(0);
    expect(aplicar).not.toHaveBeenCalled();
  });
});

describe('celular → painel', () => {
  it('etiqueta mapeada posta no celular: o lead vai para a etapa; eco (mesma etapa) não faz nada', async () => {
    const b = banco();
    await salvarMapeamento(b.client, NP, [{ etapa: 'proposta_enviada', label_id: '2', label_nome: 'Proposta' }]);
    const mudarEtapa = vi.fn(async () => {});
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '2', telefone: '556199990001', tipo: 'add' }, { mudarEtapa })).toBe('mudou');
    expect(mudarEtapa).toHaveBeenCalledWith('L1', 'novo', 'proposta_enviada');
    b.tabelas.leads[0].status = 'proposta_enviada';
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '2', telefone: '5561999990001', tipo: 'add' }, { mudarEtapa })).toBe('igual');
  });
  it('tirar etiqueta, etiqueta não mapeada, quem não é lead, número desligado: nada', async () => {
    const b = banco();
    await salvarMapeamento(b.client, NP, [{ etapa: 'ganho', label_id: '5', label_nome: 'Fechou' }]);
    const mudarEtapa = vi.fn(async () => {});
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '5', telefone: '5561999990001', tipo: 'remove' }, { mudarEtapa })).toBe('ignorada');
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '7', telefone: '5561999990001', tipo: 'add' }, { mudarEtapa })).toBe('ignorada');
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '5', telefone: '5561977776666', tipo: 'add' }, { mudarEtapa })).toBe('ignorada');
    expect(await etiquetaParaEtapa(b.client, NP, { labelId: '5', telefone: '5561988887777', tipo: 'add' }, { mudarEtapa })).toBe('ignorada'); // lead de OUTRA empresa
    expect(await etiquetaParaEtapa(b.client, { ...NP, ativo: false }, { labelId: '5', telefone: '5561999990001', tipo: 'add' }, { mudarEtapa })).toBe('ignorada');
    expect(mudarEtapa).not.toHaveBeenCalled();
  });
  it('mapeamento é do número (empresa + número): outro número não enxerga', async () => {
    const b = banco();
    await salvarMapeamento(b.client, NP, [{ etapa: 'ganho', label_id: '5', label_nome: 'Fechou' }]);
    expect(await lerMapeamento(b.client, { id: 'np2', company_id: CASA })).toEqual([]);
    expect(await lerMapeamento(b.client, { id: 'np1', company_id: TENANT })).toEqual([]);
  });
});

describe('Evolution: etiquetas', () => {
  it('findLabels e handleLabel pela instância em contexto', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: '1', name: 'Novo' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService({ evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' });
    expect(await s.listarEtiquetas()).toEqual([{ id: '1', name: 'Novo' }]);
    await s.etiquetar('5561999990001', '1', 'add');
    expect(fetchMock.mock.calls[0][0]).toBe('http://evo:8080/label/findLabels/eva');
    expect(fetchMock.mock.calls[1][0]).toBe('http://evo:8080/label/handleLabel/eva');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ number: '5561999990001', labelId: '1', action: 'add' });
  });
});

describe('tela: cartão das etiquetas', () => {
  it('uma lista por etapa com as etiquetas do WhatsApp (nome escapado) e a atual marcada', () => {
    const h = cartaoEtiquetas({ disponiveis: [...ETQ, { id: '9', nome: '<b>VIP</b>', cor: null }], mapeamento: [{ etapa: 'ganho', label_id: '5', label_nome: 'Fechou' }] });
    for (const e of ETAPAS_ETIQUETA) expect(h).toContain(`name="etapa_${e.id}"`);
    expect(h).toContain('<option value="5" selected>Fechou</option>');
    expect(h).toContain('&lt;b&gt;VIP&lt;/b&gt;');
    expect(h).toContain('action="/dashboard/whatsapp/pessoal/etiquetas"');
  });
  it('sem conexão / sem etiquetas: explica o que fazer', () => {
    expect(cartaoEtiquetas({ disponiveis: null, mapeamento: [] })).toContain('Não consegui ler');
    expect(cartaoEtiquetas({ disponiveis: [], mapeamento: [] })).toContain('Etiquetas');
  });
});

describe('rota: salvar (só o dono, só da casa)', async () => {
  const { criarRotasNumeroPessoal } = await import('../src/modules/dashboard/numero-pessoal-rotas.js');
  const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', isAdmin: true, permissoes: {} };
  const res = () => { const r: any = { statusCode: 200, destino: '' }; r.status = (c: number) => { r.statusCode = c; return r; }; r.send = () => r; r.redirect = (a: any, b?: any) => { r.destino = typeof a === 'string' ? a : b; return r; }; return r; };
  it('salva conferindo com as etiquetas do WhatsApp do dono', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [{ ...NP, dono_nome: 'Junior', numero: null }], whatsapp_etiquetas_funil: [], audit_log: [] });
    const rotas = criarRotasNumeroPessoal({ supabase: b.client, instanciaDaEva: 'eva', etiquetasDaInstancia: async () => ETQ });
    const r = res();
    await rotas.etiquetas({ body: { etapa_ganho: '5', etapa_novo: 'inexistente' }, headers: {}, dashUser: junior, query: {} } as any, r);
    expect(r.destino).toBe('/dashboard/whatsapp/pessoal?ok=etiquetas_salvas#wp-etiquetas');
    expect(b.tabelas.whatsapp_etiquetas_funil).toEqual([expect.objectContaining({ company_id: CASA, numero_pessoal_id: 'np1', etapa: 'ganho', label_id: '5' })]);
  });
  it('tenant: 404; WhatsApp fora: não apaga o que estava salvo', async () => {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [{ ...NP, dono_nome: 'Junior', numero: null }], whatsapp_etiquetas_funil: [{ company_id: CASA, numero_pessoal_id: 'np1', etapa: 'ganho', label_id: '5' }] });
    const r1 = res();
    await criarRotasNumeroPessoal({ supabase: b.client, instanciaDaEva: 'eva', etiquetasDaInstancia: async () => ETQ }).etiquetas({ body: {}, headers: {}, dashUser: { ...junior, companyId: TENANT }, query: {} } as any, r1);
    expect(r1.statusCode).toBe(404);
    const r2 = res();
    await criarRotasNumeroPessoal({ supabase: b.client, instanciaDaEva: 'eva', etiquetasDaInstancia: async () => { throw new Error('caiu'); } }).etiquetas({ body: {}, headers: {}, dashUser: junior, query: {} } as any, r2);
    expect(r2.destino).toContain('erro=etiquetas_sem_whatsapp');
    expect(b.tabelas.whatsapp_etiquetas_funil).toHaveLength(1);
  });
});
