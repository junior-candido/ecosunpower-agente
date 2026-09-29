// Custo de IA POR EMPRESA (28/09/2026).
// Bug: registrarUsoIa/medirIa gravavam em custos_ia_uso SEM company_id — o
// DEFAULT da coluna (migration 077) é a EcoSunPower, então TODO custo (inclusive
// o da Clara, assistente da Conquista Solar) aparecia como da casa.
// Agora: companyId explícito > contexto do custo (painel) > canal da mensagem
// (fila) > empresa em contexto. Sem nada disso: grava na casa (default) mas
// MARCA a origem com '#sem-empresa' e avisa no log — pra achar os buracos.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  registrarUsoIa, custoCentsBRL, comEmpresaDoCusto, empresaDoCustoNoContexto,
  SUFIXO_SEM_EMPRESA, usoDaOrigem, ORIGENS_IA,
} from '../src/modules/custos/ia-metering.js';
import { comCanal } from '../src/modules/canal-contexto.js';
import { comEmpresaDe } from '../src/modules/empresa-config.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = '4b1f2c3d-1111-4111-8111-222222222222';
const OUTRA = '9c9c9c9c-3333-4333-8333-444444444444';

function fake() {
  const rows: any[] = [];
  const client: any = { from: () => ({ insert: (r: any) => { rows.push(r); return Promise.resolve({ error: null }); } }) };
  return { client, rows };
}
const U = { input_tokens: 10, output_tokens: 5 };

afterEach(() => vi.restoreAllMocks());

describe('empresa na medição de IA', () => {
  it('companyId explícito vai pro company_id', async () => {
    const { client, rows } = fake();
    await registrarUsoIa(client, { modelo: 'claude-haiku-4-5', origem: 'resumo:lead', usage: U, companyId: CONQUISTA });
    expect(rows[0].company_id).toBe(CONQUISTA);
    expect(rows[0].origem).toBe('resumo:lead');
  });

  it('sem explícito, pega a empresa do CANAL da mensagem (fila da Clara)', async () => {
    const { client, rows } = fake();
    await comCanal({ companyId: CONQUISTA, evolutionInstance: 'conquista-solar' }, () =>
      registrarUsoIa(client, { modelo: 'claude-sonnet-4-6', origem: 'conversa:lead', usage: U }));
    expect(rows[0].company_id).toBe(CONQUISTA);
  });

  it('sem canal, pega a empresa em contexto (comEmpresaDe)', async () => {
    const { client, rows } = fake();
    await comEmpresaDe(OUTRA, () => registrarUsoIa(client, { modelo: 'x', origem: 'resumo:bi', usage: U }));
    expect(rows[0].company_id).toBe(OUTRA);
  });

  it('canal (mais específico) vence o login do painel; explícito vence tudo', async () => {
    // Admin da casa logado disparando algo DENTRO do canal de um tenant: o
    // custo é do tenant. O login é o contexto mais externo — só vale sozinho.
    const { client, rows } = fake();
    await comEmpresaDoCusto(CASA, () => comCanal({ companyId: CONQUISTA }, async () => {
      await registrarUsoIa(client, { modelo: 'x', origem: 'admin:elo', usage: U });
      await registrarUsoIa(client, { modelo: 'x', origem: 'admin:elo', usage: U, companyId: OUTRA });
    }));
    await comEmpresaDoCusto(CONQUISTA, () => registrarUsoIa(client, { modelo: 'x', origem: 'admin:elo', usage: U }));
    expect(rows.map((r) => r.company_id)).toEqual([CONQUISTA, OUTRA, CONQUISTA]);
  });

  it('medirIa nunca lança (nem com usage/modelo estranhos)', async () => {
    const { medirIa } = await import('../src/modules/custos/ia-metering.js');
    expect(() => medirIa({ modelo: undefined as never, origem: 'conversa:lead', usage: null })).not.toThrow();
  });

  it('o contexto sobrevive ao await (fire-and-forget dentro do job)', async () => {
    const { client, rows } = fake();
    await comCanal({ companyId: CONQUISTA }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      await registrarUsoIa(client, { modelo: 'x', origem: 'conversa:lead', usage: U });
    });
    expect(rows[0].company_id).toBe(CONQUISTA);
  });

  it('SEM empresa nenhuma: não manda company_id (default = casa), marca a origem e avisa no log', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, rows } = fake();
    await registrarUsoIa(client, { modelo: 'x', origem: 'conversa:lead', usage: U });
    expect(rows[0]).not.toHaveProperty('company_id');
    expect(rows[0].origem).toBe(`conversa:lead${SUFIXO_SEM_EMPRESA}`);
    expect(aviso).toHaveBeenCalled();
    expect(String(aviso.mock.calls[0][0])).toContain('sem empresa');
  });

  it('companyId inválido (não-UUID) é ignorado — nunca vai lixo pro banco', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, rows } = fake();
    await registrarUsoIa(client, { modelo: 'x', origem: 'a:b', usage: U, companyId: "x'),(1" });
    expect(rows[0]).not.toHaveProperty('company_id');
  });

  it('empresaDoCustoNoContexto: null fora de qualquer contexto', () => {
    expect(empresaDoCustoNoContexto()).toBeNull();
    expect(comEmpresaDoCusto(CONQUISTA, () => empresaDoCustoNoContexto())).toBe(CONQUISTA);
  });
});

describe('custo com cache de 1 hora', () => {
  it('escrita de 1h custa 2× o input (e a de 5 min, 1,25×)', () => {
    // Sonnet: input 3 USD/M. 1M escrito em 1h = 6 USD × 5,40 × 100 = 3240 cents.
    expect(custoCentsBRL('claude-sonnet-4-6', {
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 },
    })).toBe(3240);
    // metade 1h + metade 5m = (3 + 1,875) USD = 4,875 × 540 = 2632,5 → 2633
    expect(custoCentsBRL('claude-sonnet-4-6', {
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 500_000, ephemeral_5m_input_tokens: 500_000 },
    })).toBe(2633);
  });
});

describe('origem padronizada (tipo:detalhe)', () => {
  it('toda origem do catálogo segue tipo:detalhe com tipo conhecido', () => {
    const tipos = new Set(['conversa', 'midia', 'resumo', 'reativacao', 'escrita', 'admin']);
    for (const o of Object.keys(ORIGENS_IA)) {
      const [tipo, det] = o.split(':');
      expect(tipos.has(tipo), o).toBe(true);
      expect(det, o).toBeTruthy();
    }
  });

  it('usoDaOrigem traduz as origens ANTIGAS (dados de setembro) pro catálogo novo', () => {
    expect(usoDaOrigem('eva').chave).toBe('conversa:lead');
    expect(usoDaOrigem('lead-synthesis').chave).toBe('resumo:lead');
    expect(usoDaOrigem('agenda').chave).toBe('admin:agenda');
    expect(usoDaOrigem('blog').tipo).toBe('escrita');
  });

  it('usoDaOrigem tira o #sem-empresa e diz que faltou empresa', () => {
    const u = usoDaOrigem(`conversa:lead${SUFIXO_SEM_EMPRESA}`);
    expect(u.chave).toBe('conversa:lead');
    expect(u.semEmpresa).toBe(true);
    expect(u.rotulo).toMatch(/conversa/i);
  });

  it('origem desconhecida não quebra: vira ela mesma, tipo "admin"… ou o prefixo', () => {
    expect(usoDaOrigem('midia:coisa-nova').tipo).toBe('midia');
    expect(usoDaOrigem(null).chave).toBe('sem-origem');
  });
});
