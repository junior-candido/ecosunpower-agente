// Envio do RELATÓRIO DO PERÍODO pela Eva: reusa o fluxo do mensal
// (executarEnvioRelatorio), com nome de arquivo, e-mail e registro do período.
import { describe, it, expect, vi } from 'vitest';
import { nomeArquivoRelatorioPeriodo } from '../src/modules/gd/relatorio-envio-textos.js';
import { montarEmailRelatorio } from '../src/modules/gd/relatorio-envio.js';
import { executarEnvioRelatorio, type DepsExecutarEnvio, type EntradaExecutarEnvio } from '../src/modules/gd/relatorio-envio-executar.js';
import { criarRepoTelaGd } from '../src/modules/gd/demonstrativos-tela-repo.js';
import { abrirPdfPublico, relatoriosParaPasta } from '../src/modules/gd/relatorio-publico.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'T'.repeat(32);
const tenantCfg = normalizarEmpresaRow({ company_id: TENANT, nome_fantasia: 'Conquista Solar' });

describe('textos do período', () => {
  it('nome do arquivo: relatorio-<uc>-<inicio>-a-<fim>.pdf', () => {
    expect(nomeArquivoRelatorioPeriodo('351534', '2026-05-01', '2026-08-01')).toBe('relatorio-351534-2026-05-a-2026-08.pdf');
  });
  it('e-mail do período: título e chamada falam do período, não do mês', () => {
    const { assunto, html } = montarEmailRelatorio(
      { nome: 'JOÃO', mesExtenso: 'maio a agosto de 2026', link: 'https://p.x/rg/T', periodo: true }, tenantCfg,
    );
    expect(assunto).toBe('João, o relatório de maio a agosto de 2026 da sua usina solar');
    expect(html).toContain('Relatório do período da usina');
    expect(html).toContain('Sua usina de maio a agosto de 2026');
    expect(html).not.toContain('Relatório mensal');
  });
  it('e-mail do mensal continua igual', () => {
    const { html } = montarEmailRelatorio({ nome: 'João', mesExtenso: 'agosto de 2026', link: 'https://p.x/rg/T' }, tenantCfg);
    expect(html).toContain('Relatório mensal da usina');
    expect(html).toContain('Sua usina em agosto de 2026');
  });
});

function entrada(o: Partial<EntradaExecutarEnvio> = {}): EntradaExecutarEnvio {
  return {
    instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', leadId: 'L1',
    nomeCliente: 'JOÃO DA SILVA', mesExtenso: 'maio a agosto de 2026',
    numeros: { periodo: { inicio: '2026-05-01', fim: '2026-08-01' }, gerouKwh: 2300 },
    canal: 'evolution', empresa: tenantCfg,
    destino: { zap: { fone: '5561991718505', motivo: null }, email: { para: 'joao@x.com', motivo: null } },
    jaEnviado: false, reenviar: false, periodo: { inicio: '2026-05-01', fim: '2026-08-01' },
    ...o,
  };
}

function deps(): DepsExecutarEnvio & Record<string, any> {
  return {
    basePublica: 'https://p.x',
    gerarPdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
    guardarPdf: vi.fn(async () => ({ ok: true, storage_path: 'L1/relatorio-gd/a.pdf' })),
    apagarPdf: vi.fn(async () => {}),
    gerarToken: vi.fn(() => TOKEN),
    repo: {
      reservarEnvio: vi.fn(async () => 'R1' as string | null),
      anexarPdfEToken: vi.fn(async () => {}),
      cancelarEnvio: vi.fn(async () => {}),
      marcarEnvio: vi.fn(async () => {}),
    },
    noCanal: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
    sendText: vi.fn(async () => {}),
    sendTemplate: vi.fn(async () => ({})),
    sendDocument: vi.fn(async () => {}),
    enviarEmail: vi.fn(async () => 'mid-1'),
    registrarEmailEnviado: vi.fn(async () => {}),
    registrarConversa: vi.fn(async () => {}),
  };
}

describe('executarEnvioRelatorio — período', () => {
  it('reserva com referencia = fim e os números com o período; PDF anexo com o nome do período', async () => {
    const d = deps();
    const r = await executarEnvioRelatorio(d, entrada());
    expect(r.tipo).toBe('resultado');
    expect(d.repo.reservarEnvio).toHaveBeenCalledWith(expect.objectContaining({
      referencia: '2026-08-01', numeros: expect.objectContaining({ periodo: { inicio: '2026-05-01', fim: '2026-08-01' } }),
    }));
    expect(d.sendDocument).toHaveBeenCalledWith(
      '5561991718505', expect.any(String), 'relatorio-351534-2026-05-a-2026-08.pdf', 'Relatório de maio a agosto de 2026',
    );
    expect(d.sendText.mock.calls[0][1]).toContain('O relatório de maio a agosto de 2026 da sua usina solar está pronto');
    const email = (d.enviarEmail.mock.calls[0] as any)[0];
    expect(email.html).toContain('Relatório do período da usina');
  });
});

function fakeDb(respostas: Record<string, Array<{ data: any; error: any }>>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, any[]]> }> = [];
  const db = {
    from(tabela: string) {
      const c = { tabela, ops: [] as Array<[string, any[]]> };
      chamadas.push(c);
      const fila = respostas[tabela] ?? [];
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = fila.shift() ?? { data: [], error: null };
            return (res: any) => Promise.resolve(r).then(res);
          }
          return (...args: any[]) => { c.ops.push([prop, args]); return q; };
        },
      });
      return q;
    },
  };
  return { db: db as any, chamadas };
}

describe('repo — "já enviado" do mês × do período', () => {
  it('ultimoEnvio (mensal) ignora os envios de período', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: [], error: null }] });
    await criarRepoTelaGd(db, 'E1').ultimoEnvio('351534', '2026-08-01');
    expect(chamadas[0].ops).toContainEqual(['is', ['numeros->periodo', null]]);
  });
  it('ultimoEnvioPeriodo: mesma empresa, UC, fim e início do período', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [
      { data: [{ enviado_em: '2026-09-27T13:05:00Z', enviado_zap_para: '5561991718505', enviado_email_para: null }], error: null },
    ] });
    const r = await criarRepoTelaGd(db, 'E1').ultimoEnvioPeriodo('351534', '2026-05-01', '2026-08-01');
    expect(r).toEqual({ enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561991718505', emailPara: null });
    const ops = chamadas[0].ops;
    expect(ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(ops).toContainEqual(['eq', ['instalacao', '351534']]);
    expect(ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
    expect(ops).toContainEqual(['eq', ['numeros->periodo->>inicio', '2026-05-01']]);
    expect(ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
  });
  it('ultimoEnvioPeriodoQualquer: o último envio de período desta UC, qualquer intervalo — pra mostrar na tela sem escolher de novo', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [
      { data: [{
        enviado_em: '2026-09-27T14:32:00Z', enviado_zap_para: '5561991718505', enviado_email_para: null,
        numeros: { periodo: { inicio: '2026-05-01', fim: '2026-08-01' } },
      }], error: null },
    ] });
    const r = await criarRepoTelaGd(db, 'E1').ultimoEnvioPeriodoQualquer('351534');
    expect(r).toEqual({
      enviadoEm: '2026-09-27T14:32:00Z', zapPara: '5561991718505', emailPara: null,
      inicio: '2026-05-01', fim: '2026-08-01',
    });
    const ops = chamadas[0].ops;
    expect(ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(ops).toContainEqual(['eq', ['instalacao', '351534']]);
    expect(ops).toContainEqual(['not', ['numeros->periodo', 'is', null]]);
    expect(ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
  });
  it('ultimoEnvioPeriodoQualquer: sem nenhum envio de período ainda — null', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [{ data: [], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').ultimoEnvioPeriodoQualquer('351534')).toBeNull();
  });
});

describe('link público e Pasta Digital com relatório do período', () => {
  it('abrirPdfPublico: nome do arquivo do período', async () => {
    const q: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: any) => Promise.resolve({ data: [{
            storage_path: 'L1/relatorio-gd/a.pdf', instalacao: '351534', referencia: '2026-08-01', lead_id: 'L1',
            numeros: { periodo: { inicio: '2026-05-01', fim: '2026-08-01' } },
          }], error: null }).then(res);
        }
        return () => q;
      },
    });
    const client: any = {
      from: () => q,
      storage: { from: () => ({ download: async () => ({ data: new Blob(['%PDF']), error: null }) }) },
    };
    const r = await abrirPdfPublico(client, TOKEN);
    expect(r!.nomeArquivo).toBe('relatorio-351534-2026-05-a-2026-08.pdf');
  });
  it('pasta: período e mês do mesmo fim aparecem os dois, com o texto certo', () => {
    const r = relatoriosParaPasta([
      { referencia: '2026-08-01', token: 'P', numeros: { periodo: { inicio: '2026-05-01', fim: '2026-08-01' } } },
      { referencia: '2026-08-01', token: 'M' },
      { referencia: '2026-08-01', token: 'M-velho', numeros: {} },
    ], 'https://p.x');
    expect(r).toEqual([
      { referencia: '2026-08-01', mesExtenso: 'maio a agosto de 2026', url: 'https://p.x/rg/P' },
      { referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/M' },
    ]);
  });
});
