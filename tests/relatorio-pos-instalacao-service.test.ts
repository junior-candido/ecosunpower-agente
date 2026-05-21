// tests/relatorio-pos-instalacao-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PosInstalacaoService } from '../src/modules/relatorios/pos-instalacao/service.js';

function fakeSupabase(o: any = {}) {
  return {
    criarRelatorioPosInstalacao: vi.fn().mockResolvedValue({ ok: true, id: 'rel-1' }),
    getRelatorioPosInstalacaoBySlug: vi.fn().mockResolvedValue(null),
    getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue(null),
    listRelatoriosPosInstalacaoByLead: vi.fn().mockResolvedValue([]),
    marcarRelatorioPosInstalacaoEnviado: vi.fn().mockResolvedValue(undefined),
    marcarLeadPostInstallReportSent: vi.fn().mockResolvedValue(undefined),
    incrementarAcessoRelatorioPI: vi.fn().mockResolvedValue(undefined),
    getClienteByLeadId: vi.fn().mockResolvedValue({
      id: 'lead-1', name: 'João', phone: '5561999990000', opt_out: false,
      city: 'Brasília', uf: 'DF', concessionaria: 'neoenergia-df', uc_numero: '123',
      installed_at: '2026-05-01', meter_swapped_at: '2026-05-15',
    }),
    getClient: vi.fn().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'p/x.jpg' }, error: null }),
          createSignedUrls: vi.fn().mockResolvedValue({ data: [{ path: 'p/x.jpg', signedUrl: 'https://sig/x.jpg' }], error: null }),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      },
    }),
    ...o,
  };
}

describe('PosInstalacaoService.criarDraft', () => {
  it('upload das fotos + insert da row + retorna id+slug', async () => {
    const sb = fakeSupabase();
    const svc = new PosInstalacaoService(sb as any, async () => ({ id: 'sis-1', apelido: 'Casa', marca_inversor: 'deye', potencia_kwp: 5, qtd_paineis: 11, painel_marca: 'Risen', painel_modelo: 'X', inversor_modelo: 'Y' } as any));
    const r = await svc.criarDraft({
      lead_id: 'lead-1',
      mensagem_personalizada: 'Obrigado',
      data_instalacao: '2026-05-01',
      fotos: [{ buffer: Buffer.from('x'), mimeType: 'image/jpeg', ext: 'jpg' }],
    });
    expect(r.ok).toBe(true);
    expect(r.id).toBe('rel-1');
    expect(r.slug).toMatch(/^[a-z0-9]{8,}$/);
    expect(sb.criarRelatorioPosInstalacao).toHaveBeenCalledOnce();
    const arg = sb.criarRelatorioPosInstalacao.mock.calls[0][0];
    expect(arg.fotos.length).toBe(1);
    expect(arg.fotos[0].storage_path).toMatch(/^lead-1\/pos_instalacao\//);
  });

  it('falha de upload: aborta e retorna error', async () => {
    const sb = fakeSupabase({
      getClient: vi.fn().mockReturnValue({
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket missing' } }),
            remove: vi.fn(),
          }),
        },
      }),
    });
    const svc = new PosInstalacaoService(sb as any, async () => null);
    const r = await svc.criarDraft({
      lead_id: 'lead-1', mensagem_personalizada: null, data_instalacao: null,
      fotos: [{ buffer: Buffer.from('x'), mimeType: 'image/jpeg', ext: 'jpg' }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('bucket missing');
  });

  it('zero fotos: cria draft mesmo assim (relatório sem fotos)', async () => {
    const sb = fakeSupabase();
    const svc = new PosInstalacaoService(sb as any, async () => null);
    const r = await svc.criarDraft({
      lead_id: 'lead-1', mensagem_personalizada: null, data_instalacao: null, fotos: [],
    });
    expect(r.ok).toBe(true);
  });
});

describe('PosInstalacaoService.enviarPorWhatsApp', () => {
  it('opt_out: NÃO envia, retorna ok:false com motivo', async () => {
    const sb = fakeSupabase({
      getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue({ id: 'rel-1', slug: 'abc', lead_id: 'lead-1' }),
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'J', phone: '5561111', opt_out: true }),
    });
    const sendText = vi.fn();
    const svc = new PosInstalacaoService(sb as any, async () => null);
    const r = await svc.enviarPorWhatsApp('rel-1', sendText);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('opt_out');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('sem phone: NÃO envia, reason=sem_phone', async () => {
    const sb = fakeSupabase({
      getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue({ id: 'rel-1', slug: 'abc', lead_id: 'lead-1' }),
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'J', phone: '', opt_out: false }),
    });
    const svc = new PosInstalacaoService(sb as any, async () => null);
    const r = await svc.enviarPorWhatsApp('rel-1', vi.fn());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('sem_phone');
  });

  it('happy: chama sendText com link público + marca enviado', async () => {
    const sb = fakeSupabase({
      getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue({ id: 'rel-1', slug: 'abc123', lead_id: 'lead-1' }),
    });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new PosInstalacaoService(sb as any, async () => null);
    const r = await svc.enviarPorWhatsApp('rel-1', sendText);
    expect(r.ok).toBe(true);
    expect(sendText).toHaveBeenCalledOnce();
    const [phone, body] = sendText.mock.calls[0];
    expect(phone).toBe('5561999990000');
    expect(body).toContain('/r-pi/abc123');
    expect(sb.marcarRelatorioPosInstalacaoEnviado).toHaveBeenCalledOnce();
    expect(sb.marcarLeadPostInstallReportSent).toHaveBeenCalledWith('lead-1');
  });
});
