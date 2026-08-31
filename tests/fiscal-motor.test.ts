// tests/fiscal-motor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { emitirNota } from '../src/modules/financeiro/fiscal/motor.js';

// deps injetadas pra não tocar rede/banco de verdade
function depsFake(overrides: Partial<Parameters<typeof emitirNota>[0]> = {}) {
  return {
    carregarNota: vi.fn(async () => ({
      id: 'n1', status: 'preparada', competencia: '2026-08-31',
      tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'SPAZIO', email: null, municipio: 'Brasília', uf: 'DF' },
      servicoId: 's1', valorBruto: 1250, valorIss: 62.5, issRetido: true, valorLiquido: 1187.5, descricao: 'aterramento',
    })),
    carregarConfig: vi.fn(async () => ({
      ambiente: 'producao' as const, serie: '1', codMunicipio: '5300108',
      cnpj: '33.020.459/0001-06', im: '0790506200159', certOk: true, certValidade: '2027-08-31',
    })),
    carregarServico: vi.fn(async () => ({ codTribNacional: '31.01.02', codTribMunicipal: '1' })),
    travarParaEnvio: vi.fn(async () => true),
    proximoNdps: vi.fn(async () => 7),
    carregarCert: vi.fn(async () => ({ pfx: Buffer.from('x'), senha: 's', keyPem: 'k', certPem: 'c' })),
    assinar: vi.fn((xml: string) => xml + '<Signature/>'),
    enviar: vi.fn(async () => ({ ok: true as const, numero: '84', chaveAcesso: 'CH123', xmlNfse: '<NFSe/>' })),
    salvarAutorizada: vi.fn(async () => {}),
    salvarTesteHomologacao: vi.fn(async () => {}),
    salvarRejeicao: vi.fn(async () => {}),
    registrarEvento: vi.fn(async () => {}),
    posAutorizada: vi.fn(async () => {}),   // ponte-caixa
    ...overrides,
  };
}

describe('motor de emissão', () => {
  it('fluxo feliz: trava, monta, assina, envia, salva autorizada e chama a ponte do caixa', async () => {
    const deps = depsFake();
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(true);
    expect(deps.travarParaEnvio).toHaveBeenCalledWith('c1', 'n1');
    expect(deps.assinar).toHaveBeenCalled();
    expect(deps.salvarAutorizada).toHaveBeenCalledWith(expect.objectContaining({ numero: '84', chaveAcesso: 'CH123' }));
    expect(deps.posAutorizada).toHaveBeenCalled();
  });
  it('trava falhou (clique duplo): não envia nada e explica', async () => {
    const deps = depsFake({ travarParaEnvio: vi.fn(async () => false) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/sendo emitida|já foi emitida/i);
    expect(deps.enviar).not.toHaveBeenCalled();
    expect(deps.proximoNdps).not.toHaveBeenCalled();
  });
  it('em homologação NÃO mexe no caixa e a nota volta pra preparada (teste não queima a nota)', async () => {
    const deps = depsFake({ carregarConfig: vi.fn(async () => ({
      ambiente: 'homologacao' as const, serie: '1', codMunicipio: '5300108',
      cnpj: '33.020.459/0001-06', im: '0790506200159', certOk: true, certValidade: '2027-08-31',
    })) });
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(true);
    expect(deps.salvarTesteHomologacao).toHaveBeenCalled();
    expect(deps.salvarAutorizada).not.toHaveBeenCalled();
    expect(deps.posAutorizada).not.toHaveBeenCalled();
  });
  it('rejeição do fisco: nota volta como preparada + evento com erro em PT, ponte NÃO roda', async () => {
    const deps = depsFake({ enviar: vi.fn(async () => ({ ok: false as const, erros: [{ codigo: 'E160', mensagem: 'Valor invalido', correcao: 'Corrija' }] })) });
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(false);
    expect(deps.salvarRejeicao).toHaveBeenCalled();
    expect(deps.posAutorizada).not.toHaveBeenCalled();
  });
  it('conexão caiu no envio: nota FICA travada (enviada) e o erro manda conferir no portal', async () => {
    const deps = depsFake({ enviar: vi.fn(async () => { throw new Error('timeout'); }) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/portal/i);
    expect(deps.salvarRejeicao).not.toHaveBeenCalled();   // NÃO destrava sozinho
    expect(deps.registrarEvento).toHaveBeenCalledWith('n1', 'falha_conexao', expect.anything());
  });
  it('nota que não está preparada não emite', async () => {
    const deps = depsFake({ carregarNota: vi.fn(async () => ({ status: 'autorizada' }) as never) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/preparada/);
  });
  it('sem certificado não emite', async () => {
    const deps = depsFake({ carregarConfig: vi.fn(async () => ({ certOk: false }) as never) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/certificado/i);
  });
});
