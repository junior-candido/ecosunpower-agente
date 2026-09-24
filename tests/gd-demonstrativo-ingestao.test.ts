import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ingerirDemonstrativo,
  escolherPdf,
  tratarConfirmacaoGmail,
  extrairConfirmacaoGmail,
  assinaturaDemonstrativo,
  montarRegistro,
  type DepsIngestao,
} from '../src/modules/gd/demonstrativo-ingestao.js';
import { parseDemonstrativo } from '../src/modules/gd/demonstrativo-parser.js';

const TEXTO = readFileSync(join(__dirname, 'fixtures', 'gd', 'cliente-unico-2026-06.txt'), 'utf-8');
const ASSUNTO = { referencia: '2026-06-01', nome: 'CLIENTE TESTE UM', codigoCliente: '100001', instalacao: '200002' };
const PDF = { id: 'a-pdf', nome: 'RelatorioResumo.pdf', tipo: 'application/octet-stream' };
const PNG = { id: 'a-png', nome: 'Demonstrativo_Saida_202608.png', tipo: 'application/octet-stream' };
const ECOSUN = '00000000-0000-0000-0000-000000000001';

function deps(over: Partial<DepsIngestao> = {}): DepsIngestao & { avisos: string[]; salvos: any[] } {
  const avisos: string[] = [];
  const salvos: any[] = [];
  return {
    avisos,
    salvos,
    modoTeste: true,
    companyId: ECOSUN,
    jaProcessado: vi.fn(async () => false),
    listarAnexos: vi.fn(async () => [PNG, PDF]),
    baixarAnexo: vi.fn(async () => new Uint8Array([1, 2, 3])),
    verificarOrigem: vi.fn(async () => 'pass' as const),
    extrairTexto: vi.fn(async () => TEXTO),
    buscarLeadPorUc: vi.fn(async () => ({ id: 'lead-1', nome: 'Cliente Um', companyId: ECOSUN })),
    registroExistente: vi.fn(async () => null),
    buscarRateio: vi.fn(async () => []),
    geracaoDoMes: vi.fn(async () => 1000),
    salvar: vi.fn(async (r) => { salvos.push(r); }),
    avisar: vi.fn(async (t) => { avisos.push(t); }),
    ...over,
  };
}

describe('escolherPdf', () => {
  it('prefere o RelatorioResumo.pdf mesmo vindo como octet-stream, ignora o PNG', () => {
    expect(escolherPdf([PNG, PDF])?.nome).toBe('RelatorioResumo.pdf');
  });
  it('aceita pelo content-type quando o nome nao ajuda', () => {
    const a = { id: 'x', nome: 'arquivo', tipo: 'application/pdf' };
    expect(escolherPdf([PNG, a])).toBe(a);
  });
  it('sem PDF devolve null', () => {
    expect(escolherPdf([PNG])).toBeNull();
  });
});

describe('ingerirDemonstrativo — caminho feliz', () => {
  it('le, liga ao lead, cruza com a geracao, grava e avisa o Junior', async () => {
    const d = deps();
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.buscarLeadPorUc).toHaveBeenCalledWith('200002', '100001');
    expect(d.baixarAnexo).toHaveBeenCalledTimes(1);
    expect(d.baixarAnexo).toHaveBeenCalledWith('in_1', PDF); // so o PDF, nunca o PNG
    expect(d.geracaoDoMes).toHaveBeenCalledWith('lead-1', '2026-06-01');
    expect(d.salvos).toHaveLength(1);
    const s = d.salvos[0];
    expect(s.company_id).toBe(ECOSUN);
    expect(s.lead_id).toBe('lead-1');
    expect(s.instalacao).toBe('200002');
    expect(s.referencia).toBe('2026-06-01');
    expect(s.saldo_acumulado_kwh).toBe(10998.67);
    expect(s.geracao_mes_kwh).toBe(1000);
    expect(s.email_id).toBe('in_1');
    expect(s.texto_bruto).toContain('Faturamento Microgera');
    expect(s.alertas.some((a: any) => a.tipo === 'autoconsumo')).toBe(true);
    expect(d.avisos).toHaveLength(1);
    expect(d.avisos[0]).toContain('Cliente Um');
    expect(d.avisos[0]).toMatch(/modo teste/i);
  });

  it('cliente sem monitoramento: grava sem geracao e sem inventar autoconsumo', async () => {
    const d = deps({ geracaoDoMes: vi.fn(async () => null) });
    await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(d.salvos[0].geracao_mes_kwh).toBeNull();
    expect(d.salvos[0].alertas.some((a: any) => a.tipo === 'autoconsumo')).toBe(false);
  });

  it('usa o rateio cadastrado do lead gerador', async () => {
    const d = deps({ buscarRateio: vi.fn(async () => [{ uc: '999999', nome: 'Filha', percentual: 30 }]) });
    await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(d.buscarRateio).toHaveBeenCalledWith('lead-1');
    expect(d.avisos[0]).toContain('Filha');
  });
});

describe('ingerirDemonstrativo — o que pode dar errado (nunca lanca)', () => {
  it('e-mail ja processado: nao baixa, nao grava, nao avisa', async () => {
    const d = deps({ jaProcessado: vi.fn(async () => true) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('duplicado');
    expect(d.listarAnexos).not.toHaveBeenCalled();
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos).toHaveLength(0);
  });

  it('sem PDF anexo: avisa e nao grava', async () => {
    const d = deps({ listarAnexos: vi.fn(async () => [PNG]) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('sem_anexo');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos[0]).toMatch(/sem o PDF|não veio o PDF/i);
    expect(d.avisos[0]).toContain('CLIENTE TESTE UM');
  });

  it('PDF que nao e demonstrativo: avisa "nao consegui ler" e nao grava', async () => {
    const d = deps({ extrairTexto: vi.fn(async () => 'Nota fiscal qualquer') });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('ilegivel');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos[0]).toMatch(/não consegui ler/i);
  });

  it('UC sem cliente cadastrado: grava na EcoSun sem lead e avisa pra vincular', async () => {
    const d = deps({ buscarLeadPorUc: vi.fn(async () => null) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.salvos[0].lead_id).toBeNull();
    expect(d.salvos[0].company_id).toBe(ECOSUN);
    expect(d.geracaoDoMes).not.toHaveBeenCalled();
    expect(d.avisos[0]).toMatch(/não achei o cliente|UC não encontrada/i);
  });

  it('assunto e PDF de instalacoes diferentes: recusa e nao grava', async () => {
    const d = deps();
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: { ...ASSUNTO, instalacao: '777777' } });
    expect(r.status).toBe('recusado');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos[0]).toContain('777777');
  });

  it('falha no download: avisa e devolve erro, sem lancar', async () => {
    const d = deps({ baixarAnexo: vi.fn(async () => { throw new Error('resend 500'); }) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('erro');
    expect(d.avisos[0]).toContain('resend 500');
  });

  it('falha ao gravar: avisa e devolve erro, sem lancar', async () => {
    const d = deps({ salvar: vi.fn(async () => { throw new Error('violates row-level security'); }) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('erro');
    expect(d.avisos.some((a) => a.includes('row-level security'))).toBe(true);
  });

  it('ate o aviso falhando nao derruba o webhook', async () => {
    const d = deps({ avisar: vi.fn(async () => { throw new Error('zap fora'); }) });
    await expect(ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO })).resolves.toMatchObject({ status: 'gravado' });
  });

  it('sem email_id (payload torto): segue sem checar duplicado', async () => {
    const d = deps();
    const r = await ingerirDemonstrativo(d, { emailId: null, assunto: null });
    expect(r.status).toBe('erro');
    expect(d.jaProcessado).not.toHaveBeenCalled();
  });
});

describe('tratarConfirmacaoGmail', () => {
  it('manda o codigo pro Junior', async () => {
    const avisar = vi.fn(async () => {});
    await tratarConfirmacaoGmail({ avisar }, { codigo: '123456789' });
    expect(avisar.mock.calls[0][0]).toContain('123456789');
  });
  it('sem codigo ainda avisa pra olhar o e-mail', async () => {
    const avisar = vi.fn(async () => {});
    await tratarConfirmacaoGmail({ avisar }, { codigo: null });
    expect(avisar).toHaveBeenCalled();
  });
});

describe('ingerirDemonstrativo — prova de que veio da Neoenergia (DKIM no e-mail bruto)', () => {
  it('assinatura da Neoenergia que NAO confere: recusa, nem baixa o anexo', async () => {
    const d = deps({ verificarOrigem: vi.fn(async () => 'fail' as const) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('recusado');
    expect(d.listarAnexos).not.toHaveBeenCalled();
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos[0]).toMatch(/golpe/i);
  });

  it('verificado: grava com origem_verificada=true e sem nota de remetente', async () => {
    const d = deps();
    await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(d.salvos[0].origem_verificada).toBe(true);
    expect(d.salvos[0].inconsistencias.some((i: string) => /não verificado/.test(i))).toBe(false);
    expect(d.registroExistente).not.toHaveBeenCalled();
  });

  it('sem prova e mes novo: grava marcando nao verificado', async () => {
    const d = deps({ verificarOrigem: vi.fn(async () => 'desconhecido' as const) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.salvos[0].origem_verificada).toBe(false);
    expect(d.salvos[0].inconsistencias.some((i: string) => /não verificado/.test(i))).toBe(true);
  });

  it('sem prova e mes JA gravado VERIFICADO: nao sobrescreve', async () => {
    const d = deps({
      verificarOrigem: vi.fn(async () => 'desconhecido' as const),
      registroExistente: vi.fn(async () => ({ verificado: true })),
    });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('recusado');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos[0]).toMatch(/mantive o que já estava/i);
  });

  it('sem prova e mes gravado tambem sem prova: atualiza (igual por igual)', async () => {
    const d = deps({
      verificarOrigem: vi.fn(async () => 'desconhecido' as const),
      registroExistente: vi.fn(async () => ({ verificado: false })),
    });
    expect((await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO })).status).toBe('gravado');
  });

  it('verificado passa por cima de mes gravado sem prova (o real vence o forjado)', async () => {
    const d = deps({ registroExistente: vi.fn(async () => ({ verificado: false })) });
    expect((await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO })).status).toBe('gravado');
    expect(d.salvos[0].origem_verificada).toBe(true);
  });

  it('erro ao conferir (DNS fora): segue como nao verificado, sem acusar golpe', async () => {
    const d = deps({ verificarOrigem: vi.fn(async () => { throw new Error('dns timeout'); }) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.salvos[0].origem_verificada).toBe(false);
    expect(d.avisos[0]).not.toMatch(/golpe/i);
  });
});

describe('extrairConfirmacaoGmail (o codigo vem no CORPO em portugues)', () => {
  const CORPO_PT = `Você recebeu esta mensagem porque junior@ecosunpower.eng.br solicitou o recebimento de e-mails em faturas@woupri.resend.app.
Código de confirmação: 987654321
Para permitir, clique no link abaixo para confirmar a solicitação:
https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc%5D-9f8e7d
Se você clicar no link e ele não funcionar...`;
  it('pega codigo e link do texto em portugues', () => {
    expect(extrairConfirmacaoGmail(CORPO_PT)).toEqual({
      codigo: '987654321',
      link: 'https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc%5D-9f8e7d',
    });
  });
  it('pega em ingles tambem, e desfaz &amp; do html', () => {
    const r = extrairConfirmacaoGmail('Confirmation code: 123456789 <a href="https://mail-settings.google.com/mail/vf-x&amp;y">');
    expect(r).toEqual({ codigo: '123456789', link: 'https://mail-settings.google.com/mail/vf-x&y' });
  });
  it('Workspace em portugues: SEM codigo, so o link em mail.google.com (visto no teste real 22/09)', () => {
    const corpo = `Para permitir, clique no link abaixo:
https://mail.google.com/mail/vf-%5BANGjdJ_xyz%5D-AbC123_d
<a href="https://mail.google.com/mail/u/0/vf-%5BANGjdJ_xyz%5D-AbC123_d">`;
    expect(extrairConfirmacaoGmail(corpo)).toEqual({
      codigo: null,
      link: 'https://mail.google.com/mail/vf-%5BANGjdJ_xyz%5D-AbC123_d',
    });
    expect(extrairConfirmacaoGmail('<a href="https://mail.google.com/mail/u/0/vf-k&amp;z">').link).toBe(
      'https://mail.google.com/mail/u/0/vf-k&z',
    );
  });
  it('nao aceita link de outro dominio disfarcado', () => {
    expect(extrairConfirmacaoGmail('https://mail.google.com.golpe.io/mail/vf-x').link).toBeNull();
    expect(extrairConfirmacaoGmail('https://evil.com/?u=https://mail.google.com/mail/vf-x').link).toBe(
      'https://mail.google.com/mail/vf-x',
    );
  });
  it('so o link (sem codigo) ja vira aviso com o link, nao "nao achei"', async () => {
    const avisar = vi.fn(async () => {});
    await tratarConfirmacaoGmail(
      { avisar, buscarCorpo: async () => 'clique: https://mail.google.com/mail/vf-%5BA%5D-z' },
      { codigo: null, emailId: 'in_10' },
    );
    const msg = (avisar.mock.calls[0] as any)[0] as string;
    expect(msg).toContain('https://mail.google.com/mail/vf-%5BA%5D-z');
    expect(msg).not.toMatch(/não achei/);
  });
  it('sem nada: nulos', () => {
    expect(extrairConfirmacaoGmail('oi')).toEqual({ codigo: null, link: null });
    expect(extrairConfirmacaoGmail(null)).toEqual({ codigo: null, link: null });
  });
  it('tratarConfirmacaoGmail busca o corpo quando o assunto nao tem codigo', async () => {
    const avisar = vi.fn(async () => {});
    await tratarConfirmacaoGmail({ avisar, buscarCorpo: async () => CORPO_PT }, { codigo: null, emailId: 'in_9' });
    const msg = (avisar.mock.calls[0] as any)[0] as string;
    expect(msg).toContain('987654321');
    expect(msg).toContain('mail-settings.google.com');
  });
  it('falha ao buscar o corpo ainda avisa', async () => {
    const avisar = vi.fn(async () => {});
    await tratarConfirmacaoGmail({ avisar, buscarCorpo: async () => { throw new Error('x'); } }, { codigo: null, emailId: 'in_9' });
    expect((avisar.mock.calls[0] as any)[0]).toMatch(/não achei o código/);
  });
});

describe('mes repetido com os mesmos numeros', () => {
  it('nao grava de novo e nao avisa (status repetido)', async () => {
    const r0 = parseDemonstrativo(TEXTO);
    if (!r0.ok) throw new Error('fixture');
    const d = deps({ assinaturaGravada: vi.fn(async () => assinaturaDemonstrativo(r0.dados)) });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_2', assunto: ASSUNTO });
    expect(r.status).toBe('repetido');
    expect(d.salvos).toHaveLength(0);
    expect(d.avisos).toHaveLength(0);
  });

  it('mesmo mes com numero diferente: grava e avisa', async () => {
    const d = deps({ assinaturaGravada: vi.fn(async () => '["outra"]') });
    const r = await ingerirDemonstrativo(d, { emailId: 'in_2', assunto: ASSUNTO });
    expect(r.status).toBe('gravado');
    expect(d.avisos).toHaveLength(1);
  });

  it('grava origem email e a assinatura', async () => {
    const d = deps();
    await ingerirDemonstrativo(d, { emailId: 'in_1', assunto: ASSUNTO });
    expect(d.salvos[0].origem).toBe('email');
    expect(typeof d.salvos[0].assinatura).toBe('string');
  });
});

describe('montarRegistro', () => {
  it('converte o demonstrativo lido em linha da tabela', () => {
    const r0 = parseDemonstrativo(TEXTO);
    if (!r0.ok) throw new Error('fixture');
    const reg = montarRegistro(r0.dados, {
      companyId: ECOSUN, leadId: null, inconsistencias: [], alertas: [], geracaoKwh: null,
      emailId: null, textoBruto: 'x', verificada: false, origem: 'pdf_manual', conferidoPor: 'u1',
    });
    expect(reg.origem).toBe('pdf_manual');
    expect(reg.instalacao).toBe('200002');
    expect(reg.conferido_por).toBe('u1');
    expect(reg.conferido_em).not.toBeNull();
    expect(reg.assinatura).toBe(assinaturaDemonstrativo(r0.dados));
  });
});
