// tests/digest-por-empresa.test.ts
//
// VAZAMENTO LGPD 02/09/2026. O Digest das 7h chegou no zap do Junior com leads
// da Conquista Solar misturados aos da EcoSunPower (print de 07h03: Geraldo,
// Leonardo Marinho e a própria linha da Clara, todos DDD 77).
//
// É o MESMO vazamento de 31/08 por outro caminho. A trava do PR #260
// (tenant-admin-guard) pergunta "de qual empresa é esta mensagem?" — mas o
// digest nasce de um relógio (setInterval), não de uma mensagem. Sem contexto,
// `empresa()` devolve a EcoSunPower, a trava vê "é a casa mesmo" e libera.
//
// O furo não está na trava: está na LEITURA, que nunca separou as empresas.
//
// Decisão do Junior (02/09): tenant NÃO ganha cadência automática — mandar em
// massa por conexão não-oficial derruba o número. O digest cai no próprio
// celular da assistente mostrando os leads esfriando e induz o upgrade pro
// WhatsApp Oficial da Meta.
import { describe, it, expect } from 'vitest';
import {
  destinoDoDigest,
  chaveDigest,
  buildDigestMessage,
  collectDigestData,
  type DigestData,
} from '../src/modules/eva-digest.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const JUNIOR = '5561996978781';
const CONQUISTA_ID = '99fd46d7-60fc-49fe-918f-66587ffa3829';
const CLARA = '5577999610038';

const ecosun = normalizarEmpresaRow({ nome_fantasia: 'EcoSunPower' });

const conquista = normalizarEmpresaRow({
  company_id: CONQUISTA_ID,
  nome_fantasia: 'Conquista Solar',
  nome_atendente: 'Clara',
  telefone_atendente: CLARA,
});

const tenantSemTelefone = normalizarEmpresaRow({
  company_id: 'aaaa1111-2222-3333-4444-555566667777',
  nome_fantasia: 'Tenant Novo',
  nome_atendente: 'Ana',
});

function dadosVazios(): DigestData {
  return {
    leadsNovos: [],
    leadsSilentes: [],
    cadenciaEnviadaHoje: 0,
    cadenciaRespondidaHoje: [],
    leadsQualificadosHoje: [],
    agendadosHoje: [],
    totalConversasHoje: 0,
  };
}

function comSilentes(quantos: number): DigestData {
  const d = dadosVazios();
  d.leadsSilentes = Array.from({ length: quantos }, (_, i) => ({
    id: `lead-${i}`,
    name: `Cliente ${i}`,
    phone: `557798818687${i}`,
    updated_at: '2026-09-01T10:00:00.000Z',
  }));
  return d;
}

// ---------------------------------------------------------------------------
// 1. Pra onde vai o digest
// ---------------------------------------------------------------------------
describe('destinoDoDigest — cada empresa recebe no número dela', () => {
  it('EcoSunPower recebe no zap do Junior, como sempre foi', () => {
    expect(destinoDoDigest(ecosun, JUNIOR)).toBe(JUNIOR);
  });

  it('tenant recebe na PRÓPRIA linha da assistente, nunca no zap do Junior', () => {
    expect(destinoDoDigest(conquista, JUNIOR)).toBe(CLARA);
    expect(destinoDoDigest(conquista, JUNIOR)).not.toBe(JUNIOR);
  });

  it('tenant sem telefone cadastrado não manda pra ninguém (falha fechado)', () => {
    expect(destinoDoDigest(tenantSemTelefone, JUNIOR)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. A trava anti-disparo-repetido não pode ser compartilhada entre empresas
// ---------------------------------------------------------------------------
describe('chaveDigest — uma empresa não consome o disparo da outra', () => {
  it('empresas diferentes, no mesmo dia e janela, têm chaves diferentes', () => {
    const a = chaveDigest('2026-09-02', 'manha', ecosun.companyId);
    const b = chaveDigest('2026-09-02', 'manha', CONQUISTA_ID);
    expect(a).not.toBe(b);
  });

  it('mesma empresa, mesmo dia e janela, tem sempre a mesma chave', () => {
    expect(chaveDigest('2026-09-02', 'manha', CONQUISTA_ID))
      .toBe(chaveDigest('2026-09-02', 'manha', CONQUISTA_ID));
  });

  it('janelas diferentes do mesmo dia não colidem', () => {
    expect(chaveDigest('2026-09-02', 'manha', CONQUISTA_ID))
      .not.toBe(chaveDigest('2026-09-02', 'almoco', CONQUISTA_ID));
  });
});

// ---------------------------------------------------------------------------
// 3. A isca do WhatsApp Oficial
// ---------------------------------------------------------------------------
describe('a isca do WhatsApp Oficial só aparece quando dói', () => {
  it('com leads esperando, a mensagem diz que precisa do Oficial da Meta', () => {
    const texto = buildDigestMessage('manha', comSilentes(12), {
      nomeAtendente: 'Clara',
      podeCadenciarSozinha: false,
    });
    expect(texto).toMatch(/WhatsApp Oficial/i);
    expect(texto).toMatch(/painel/i);
  });

  it('sem ninguém esperando, a isca NÃO vai — senão vira propaganda', () => {
    const texto = buildDigestMessage('manha', dadosVazios(), {
      nomeAtendente: 'Clara',
      podeCadenciarSozinha: false,
    });
    expect(texto).not.toMatch(/WhatsApp Oficial/i);
  });

  it('quem já cadencia sozinha não recebe a isca', () => {
    const texto = buildDigestMessage('manha', comSilentes(12), {
      nomeAtendente: 'Eva',
      podeCadenciarSozinha: true,
    });
    expect(texto).not.toMatch(/WhatsApp Oficial/i);
  });

  it('a assistente do tenant não cita o Junior nem a EcoSunPower', () => {
    const texto = buildDigestMessage('manha', comSilentes(12), {
      nomeAtendente: 'Clara',
      podeCadenciarSozinha: false,
    });
    expect(texto).not.toMatch(/junior/i);
    expect(texto).not.toMatch(/ecosun/i);
    expect(texto).toMatch(/Clara/);
  });
});

// ---------------------------------------------------------------------------
// 4. O coração do vazamento: toda consulta tem que filtrar a empresa
// ---------------------------------------------------------------------------

/**
 * Fake do supabase-js que anota, por tabela, quais filtros foram aplicados.
 * Não simula banco — só prova que o filtro da empresa foi pedido em TODA
 * consulta. É exatamente o que faltava e causou o vazamento.
 */
function fakeClientQueRegistraFiltros() {
  const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

  const builder = (tabela: string) => {
    const registro = { tabela, filtros: [] as Array<[string, unknown]> };
    consultas.push(registro);

    const chain: Record<string, unknown> = {};
    for (const metodo of ['select', 'in', 'lt', 'gte', 'lte', 'not', 'order', 'limit']) {
      chain[metodo] = () => chain;
    }
    chain.eq = (coluna: string, valor: unknown) => {
      registro.filtros.push([coluna, valor]);
      return chain;
    };
    // O await no final da cadeia devolve o formato do supabase-js.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve);

    return chain;
  };

  return {
    client: { from: builder } as never,
    consultas,
  };
}

describe('collectDigestData — nenhuma consulta pode escapar sem o filtro da empresa', () => {
  it('toda tabela consultada leva company_id da empresa pedida', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();

    await collectDigestData(client, 10, CONQUISTA_ID);

    expect(consultas.length).toBeGreaterThan(0);
    for (const consulta of consultas) {
      const temFiltro = consulta.filtros.some(
        ([coluna, valor]) => coluna === 'company_id' && valor === CONQUISTA_ID,
      );
      expect(
        temFiltro,
        `consulta na tabela "${consulta.tabela}" saiu SEM filtro de empresa — é por aqui que vaza`,
      ).toBe(true);
    }
  });

  it('o digest da EcoSunPower também é filtrado (não é "tudo que sobrou")', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();

    await collectDigestData(client, 10, ecosun.companyId);

    for (const consulta of consultas) {
      const temFiltro = consulta.filtros.some(
        ([coluna, valor]) => coluna === 'company_id' && valor === ecosun.companyId,
      );
      expect(
        temFiltro,
        `consulta na tabela "${consulta.tabela}" saiu SEM filtro de empresa`,
      ).toBe(true);
    }
  });
});
