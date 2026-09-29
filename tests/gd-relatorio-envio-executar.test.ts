// tests/gd-relatorio-envio-executar.test.ts
// O miolo do POST /dashboard/demonstrativos/:instalacao/enviar, sem Express e
// sem banco: tudo injetado, pra provar o que cria, o que manda e o que limpa.
import { describe, it, expect, vi } from 'vitest';
import {
  executarEnvioRelatorio, type DepsExecutarEnvio, type EntradaExecutarEnvio,
} from '../src/modules/gd/relatorio-envio-executar.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'T'.repeat(32);

const tenantCfg = normalizarEmpresaRow({ company_id: TENANT, nome_fantasia: 'Conquista Solar' });
const ecosunCfg = normalizarEmpresaRow({ company_id: ECOSUN, nome_fantasia: 'EcoSunPower' });

function entrada(o: Partial<EntradaExecutarEnvio> = {}): EntradaExecutarEnvio {
  return {
    instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', leadId: 'L1',
    nomeCliente: 'JOÃO DA SILVA', mesExtenso: 'agosto de 2026', numeros: { gerouKwh: 612 },
    canal: 'evolution', empresa: tenantCfg,
    destino: { zap: { fone: '5561991718505', motivo: null }, email: { para: 'joao@x.com', motivo: null } },
    jaEnviado: false, reenviar: false,
    ...o,
  };
}

function deps(o: Partial<DepsExecutarEnvio> = {}) {
  const repo = {
    reservarEnvio: vi.fn(async () => 'R1' as string | null),
    anexarPdfEToken: vi.fn(async () => {}),
    cancelarEnvio: vi.fn(async () => {}),
    marcarEnvio: vi.fn(async () => {}),
  };
  const d = {
    basePublica: 'https://p.x',
    gerarPdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
    guardarPdf: vi.fn(async () => ({ ok: true, storage_path: 'L1/relatorio-gd/a.pdf' })),
    apagarPdf: vi.fn(async () => {}),
    gerarToken: vi.fn(() => TOKEN),
    repo,
    noCanal: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
    sendText: vi.fn(async () => {}),
    sendTemplate: vi.fn(async () => ({})),
    sendDocument: vi.fn(async () => {}),
    enviarEmail: vi.fn(async () => 'mid-1'),
    registrarEmailEnviado: vi.fn(async () => {}),
    registrarConversa: vi.fn(async () => {}),
    ...o,
  };
  return d;
}

function nadaCriado(d: ReturnType<typeof deps>) {
  expect(d.gerarPdf).not.toHaveBeenCalled();
  expect(d.guardarPdf).not.toHaveBeenCalled();
  expect(d.gerarToken).not.toHaveBeenCalled();
  expect(d.repo.reservarEnvio).not.toHaveBeenCalled();
  if (d.sendText) expect(d.sendText).not.toHaveBeenCalled();
}

describe('executarEnvioRelatorio', () => {
  it('já enviado sem "Enviar de novo" → pede confirmação e não cria nada', async () => {
    const d = deps();
    expect(await executarEnvioRelatorio(d, entrada({ jaEnviado: true }))).toEqual({ tipo: 'confirmar_reenvio' });
    nadaCriado(d);
  });

  it('já enviado com reenviar=true → envia de novo', async () => {
    const d = deps();
    const r = await executarEnvioRelatorio(d, entrada({ jaEnviado: true, reenviar: true }));
    expect(r.tipo).toBe('resultado');
    expect(d.sendText).toHaveBeenCalled();
  });

  it('nenhum canal pode mandar (sem telefone e e-mail desligado) → explica, sem PDF, upload, token ou linha', async () => {
    const d = deps({ enviarEmail: undefined });
    const r = await executarEnvioRelatorio(d, entrada({
      destino: { zap: { fone: null, motivo: 'sem_phone' }, email: { para: 'joao@x.com', motivo: null } },
    }));
    expect(r).toEqual({ tipo: 'resultado', zap: { ok: false, reason: 'sem_phone' }, email: null, linkPublico: null });
    nadaCriado(d);
  });

  it('telefone ok mas WhatsApp não configurado no ambiente, e cliente sem e-mail → nada criado', async () => {
    const d = deps({ sendText: undefined });
    const r = await executarEnvioRelatorio(d, entrada({
      destino: { zap: { fone: '5561991718505', motivo: null }, email: { para: null, motivo: 'sem_email' } },
    }));
    expect(r.tipo).toBe('resultado');
    if (r.tipo !== 'resultado') throw new Error();
    expect(r.zap).toMatchObject({ ok: false, reason: 'falha_envio' });
    expect(r.email).toEqual({ ok: false, reason: 'sem_email' });
    nadaCriado(d);
  });

  it('outro envio do mesmo mês em andamento (duplo clique) → em_andamento, sem PDF nem envio', async () => {
    const d = deps();
    d.repo.reservarEnvio.mockResolvedValueOnce(null);
    expect(await executarEnvioRelatorio(d, entrada())).toEqual({ tipo: 'em_andamento' });
    expect(d.gerarPdf).not.toHaveBeenCalled();
    expect(d.guardarPdf).not.toHaveBeenCalled();
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('caminho feliz (tenant): reserva, PDF, token na linha, zap + PDF anexo + e-mail, conversa e resultado', async () => {
    const d = deps();
    const r = await executarEnvioRelatorio(d, entrada());
    expect(d.repo.reservarEnvio).toHaveBeenCalledWith({
      instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', numeros: { gerouKwh: 612 }, leadId: 'L1',
    });
    expect(d.repo.anexarPdfEToken).toHaveBeenCalledWith('R1', { token: TOKEN, storagePath: 'L1/relatorio-gd/a.pdf' });
    expect(d.noCanal).toHaveBeenCalledTimes(1);
    expect(d.sendDocument).toHaveBeenCalledWith('5561991718505', expect.any(String), 'relatorio-351534-2026-08.pdf', 'Relatório de agosto de 2026');
    expect(d.registrarConversa).toHaveBeenCalledWith(expect.stringContaining('https://p.x/rg/' + TOKEN));
    const resumo = d.repo.marcarEnvio.mock.calls[0][1] as any;
    expect(d.repo.marcarEnvio.mock.calls[0][0]).toBe('R1');
    expect(resumo.algumOk).toBe(true);
    expect(d.repo.cancelarEnvio).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tipo: 'resultado', zap: { ok: true }, email: { ok: true }, linkPublico: 'https://p.x/rg/' + TOKEN });
  });

  it('nome do cliente vem em CAIXA ALTA da conta → sai em "João" no zap e no assunto do e-mail', async () => {
    const d = deps();
    await executarEnvioRelatorio(d, entrada());
    expect(d.sendText.mock.calls[0][1]).toContain('Olá, João!');
    expect((d.enviarEmail.mock.calls[0] as any)[0].subject).toMatch(/^João, /);
  });

  it('tenant NUNCA recebe sendTemplate (WABA da casa), mesmo se ele existir no ambiente', async () => {
    const d = deps();
    await executarEnvioRelatorio(d, entrada({ canal: 'evolution', empresa: tenantCfg }));
    expect(d.sendTemplate).not.toHaveBeenCalled();
    expect(d.sendText).toHaveBeenCalled();
  });

  it('EcoSun (casa): vai pelo modelo, sem PDF anexo pela Evolution', async () => {
    const d = deps();
    await executarEnvioRelatorio(d, entrada({ canal: 'casa', empresa: ecosunCfg }));
    expect(d.sendTemplate).toHaveBeenCalledTimes(1);
    expect(d.sendDocument).not.toHaveBeenCalled();
  });

  it('EcoSun (casa): modelo escolhido na configuração (v2) chega no envio; sem escolha = v1', async () => {
    const d2 = deps({ modeloRelatorio: 'relatorio_usina_v2' });
    await executarEnvioRelatorio(d2, entrada({ canal: 'casa', empresa: ecosunCfg }));
    expect((d2.sendTemplate.mock.calls[0] as any)[1]).toBe('relatorio_usina_v2');
    const d1 = deps();
    await executarEnvioRelatorio(d1, entrada({ canal: 'casa', empresa: ecosunCfg }));
    expect((d1.sendTemplate.mock.calls[0] as any)[1]).toBe('relatorio_usina_v1');
  });

  it('todos os canais falham → marcarEnvio com algumOk=false (enviado_em fica nulo) e sem link na tela', async () => {
    const d = deps({
      sendText: vi.fn(async () => { throw new Error('evolution fora'); }),
      enviarEmail: vi.fn(async () => { throw new Error('resend 500'); }),
    });
    const r = await executarEnvioRelatorio(d, entrada());
    const resumo = d.repo.marcarEnvio.mock.calls[0][1] as any;
    expect(resumo.algumOk).toBe(false);
    expect(resumo.zapPara).toBeNull();
    expect(resumo.emailPara).toBeNull();
    expect(d.registrarConversa).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tipo: 'resultado', zap: { ok: false, reason: 'falha_envio' }, email: { ok: false, reason: 'falha_envio' }, linkPublico: null });
  });

  it('gravar o token/PDF na linha falha depois do upload → apaga o PDF, cancela a reserva e sobe o erro, sem mandar nada', async () => {
    const d = deps();
    d.repo.anexarPdfEToken.mockRejectedValueOnce(new Error('banco caiu'));
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/banco caiu/);
    expect(d.apagarPdf).toHaveBeenCalledWith('L1/relatorio-gd/a.pdf');
    expect(d.repo.cancelarEnvio).toHaveBeenCalledWith('R1', expect.stringContaining('banco caiu'));
    expect(d.sendText).not.toHaveBeenCalled();
  });

  it('apagar o PDF também falha → o erro original é o que sobe (limpeza é best-effort)', async () => {
    const d = deps({ apagarPdf: vi.fn(async () => { throw new Error('storage fora'); }) });
    d.repo.anexarPdfEToken.mockRejectedValueOnce(new Error('banco caiu'));
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/banco caiu/);
  });

  it('upload do PDF falha → cancela a reserva e sobe o erro', async () => {
    const d = deps({ guardarPdf: vi.fn(async () => ({ ok: false, error: 'bucket cheio' })) });
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/bucket cheio/);
    expect(d.repo.cancelarEnvio).toHaveBeenCalledWith('R1', expect.any(String));
    expect(d.repo.anexarPdfEToken).not.toHaveBeenCalled();
    expect(d.apagarPdf).not.toHaveBeenCalled();
  });

  it('gerar o PDF falha → cancela a reserva (o mês não fica travado) e sobe o erro', async () => {
    const d = deps({ gerarPdf: vi.fn(async () => { throw new Error('sem gráfico'); }) });
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/sem gráfico/);
    expect(d.repo.cancelarEnvio).toHaveBeenCalledWith('R1', expect.stringContaining('sem gráfico'));
    expect(d.guardarPdf).not.toHaveBeenCalled();
  });

  it('o envio estoura no meio → o link morre (cancelarEnvio zera o token) e o erro sobe', async () => {
    const d = deps({ noCanal: vi.fn(async () => { throw new Error('contexto quebrou'); }) });
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/contexto quebrou/);
    expect(d.repo.cancelarEnvio).toHaveBeenCalledWith('R1', expect.stringContaining('contexto quebrou'));
    expect(d.repo.marcarEnvio).not.toHaveBeenCalled();
  });

  // 27/09/2026 (review): quando o WhatsApp JÁ tinha saído e algo estourava
  // DEPOIS (e-mail, ou o próprio `noCanal`), o catch único cancelava a reserva
  // — apagando o token/link que o cliente já tinha recebido. Um erro depois da
  // entrega não pode matar um link que já está na mão do cliente.
  it('e-mail falha depois do WhatsApp já ter saído, e o canal ainda assim estoura → NÃO cancela, grava o parcial e mostra o resultado', async () => {
    const d = deps({
      enviarEmail: vi.fn(async () => { throw new Error('resend 500'); }),
      // Simula o pior caso: o `fn` roda até o fim (zap manda, e-mail tenta e
      // falha por dentro), mas o wrapper do canal ainda assim estoura depois.
      noCanal: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
        throw new Error('canal caiu logo depois de mandar');
      }),
    });
    const r = await executarEnvioRelatorio(d, entrada());
    expect(d.repo.cancelarEnvio).not.toHaveBeenCalled();
    expect(d.repo.marcarEnvio).toHaveBeenCalledTimes(1);
    const resumo = d.repo.marcarEnvio.mock.calls[0][1] as any;
    expect(resumo.algumOk).toBe(true);
    expect(resumo.emailPara).toBeNull();
    expect(r).toMatchObject({
      tipo: 'resultado', zap: { ok: true }, email: { ok: false, reason: 'falha_envio' },
      linkPublico: 'https://p.x/rg/' + TOKEN,
    });
    // O que saiu pro cliente ainda vai pra conversa, mesmo com o estouro depois.
    expect(d.registrarConversa).toHaveBeenCalled();
  });

  it('nada saiu ainda quando o canal estoura (zap e e-mail falharam) → cancela normalmente, como antes', async () => {
    const d = deps({
      sendText: vi.fn(async () => { throw new Error('evolution fora'); }),
      enviarEmail: vi.fn(async () => { throw new Error('resend 500'); }),
      noCanal: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
        throw new Error('canal caiu depois, mas nada tinha saído');
      }),
    });
    await expect(executarEnvioRelatorio(d, entrada())).rejects.toThrow(/nada tinha saído/);
    expect(d.repo.cancelarEnvio).toHaveBeenCalledWith('R1', expect.stringContaining('nada tinha saído'));
    expect(d.repo.marcarEnvio).not.toHaveBeenCalled();
  });

  it('enviarRelatorioEmail nunca joga erro pro catch de fora — falha do provedor vira {ok:false} normal', async () => {
    const d = deps({ enviarEmail: vi.fn(async () => { throw new Error('domain not verified'); }) });
    const r = await executarEnvioRelatorio(d, entrada());
    expect(r.tipo).toBe('resultado');
    if (r.tipo !== 'resultado') throw new Error();
    expect(r.email).toMatchObject({ ok: false, reason: 'falha_envio', detalhe: 'domain not verified' });
    expect(r.zap.ok).toBe(true);
    expect(d.repo.cancelarEnvio).not.toHaveBeenCalled();
  });
});
