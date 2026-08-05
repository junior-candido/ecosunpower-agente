// tests/pasta-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PastaService } from '../src/modules/relatorios/pasta/service.js';

const PASTA_BASE = {
  id: 'pasta-1', lead_id: 'lead-1', slug: 'abcdefghjk', status: 'rascunho',
  capa_storage_path: null, data_entrega: null, mensagem_zap: null,
  arquivos: [], acessos: 0, ultimo_acesso_em: null,
  enviado_em: null, enviado_para_phone: null,
  created_at: '2026-08-05T12:00:00Z', updated_at: '2026-08-05T12:00:00Z', created_by: 'junior',
};

function fakeSupabase(o: any = {}) {
  return {
    criarPastaCliente: vi.fn().mockResolvedValue({ ok: true, id: 'pasta-1' }),
    getPastaClienteByLead: vi.fn().mockResolvedValue(null),
    getPastaClienteById: vi.fn().mockResolvedValue({ ...PASTA_BASE }),
    getPastaClienteBySlug: vi.fn().mockResolvedValue(null),
    listPastasCliente: vi.fn().mockResolvedValue([]),
    atualizarPastaCliente: vi.fn().mockResolvedValue({ ok: true }),
    marcarPastaClienteEnviada: vi.fn().mockResolvedValue(undefined),
    incrementarAcessoPasta: vi.fn().mockResolvedValue(undefined),
    listRelatoriosPosInstalacaoByLead: vi.fn().mockResolvedValue([]),
    getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue(null),
    getClienteByLeadId: vi.fn().mockResolvedValue({
      id: 'lead-1', name: 'João Silva', phone: '5561999990000', opt_out: false,
      city: 'Brasília', uf: 'DF',
    }),
    getClient: vi.fn().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'p/x.pdf' }, error: null }),
          createSignedUrls: vi.fn().mockImplementation(async (paths: string[]) => ({
            data: paths.map((p) => ({ path: p, signedUrl: `https://sig/${p}` })), error: null,
          })),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          download: vi.fn().mockResolvedValue({ data: null, error: { message: 'no logo' } }),
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    ...o,
  };
}

const semSistema = async () => null;

describe('PastaService.obterOuCriarPorLead', () => {
  it('cria pasta nova com slug quando lead não tem', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.obterOuCriarPorLead('lead-1');
    expect(r.ok).toBe(true);
    expect(sb.criarPastaCliente).toHaveBeenCalledOnce();
    expect(sb.criarPastaCliente.mock.calls[0][0].slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it('retorna a existente sem criar de novo (1 pasta por lead)', async () => {
    const sb = fakeSupabase({ getPastaClienteByLead: vi.fn().mockResolvedValue({ ...PASTA_BASE }) });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.obterOuCriarPorLead('lead-1');
    expect(r.ok).toBe(true);
    expect(r.pasta?.id).toBe('pasta-1');
    expect(sb.criarPastaCliente).not.toHaveBeenCalled();
  });
});

describe('PastaService.adicionarArquivos', () => {
  it('sobe arquivos e anexa na seção com origem upload', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.adicionarArquivos('pasta-1', 'projeto', [
      { buffer: Buffer.from('pdf'), mimeType: 'application/pdf', ext: 'pdf', nome: 'prancha.pdf' },
    ]);
    expect(r.ok).toBe(true);
    const patch = sb.atualizarPastaCliente.mock.calls[0][1];
    expect(patch.arquivos.length).toBe(1);
    expect(patch.arquivos[0]).toMatchObject({ secao: 'projeto', nome_exibicao: 'prancha.pdf', origem: 'upload' });
    expect(patch.arquivos[0].storage_path).toMatch(/^lead-1\/pasta\//);
  });

  it('falha de upload: rollback e retorna error', async () => {
    const sb = fakeSupabase({
      getClient: vi.fn().mockReturnValue({
        storage: { from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'bucket off' } }),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        }) },
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.adicionarArquivos('pasta-1', 'fotos', [
      { buffer: Buffer.from('x'), mimeType: 'image/jpeg', ext: 'jpg', nome: 'a.jpg' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('bucket off');
    expect(sb.atualizarPastaCliente).not.toHaveBeenCalled();
  });
});

describe('PastaService.removerArquivo', () => {
  it('remove do jsonb e apaga do bucket quando origem=upload', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'projeto', storage_path: 'lead-1/pasta/a.pdf', nome_exibicao: 'a.pdf', origem: 'upload' }],
      }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.removerArquivo('pasta-1', 'lead-1/pasta/a.pdf');
    expect(r.ok).toBe(true);
    expect(sb.atualizarPastaCliente.mock.calls[0][1].arquivos).toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith(['lead-1/pasta/a.pdf']);
  });

  it('origem=r-pi: desvincula MAS NÃO apaga do bucket (foto pertence ao relatório)', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f.jpg', nome_exibicao: 'f.jpg', origem: 'r-pi' }],
      }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.removerArquivo('pasta-1', 'lead-1/pos_instalacao/f.jpg');
    expect(r.ok).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('remover a foto que era capa limpa capa_storage_path', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        capa_storage_path: 'lead-1/pasta/c.jpg',
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pasta/c.jpg', nome_exibicao: 'c.jpg', origem: 'upload' }],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    await svc.removerArquivo('pasta-1', 'lead-1/pasta/c.jpg');
    expect(sb.atualizarPastaCliente.mock.calls[0][1].capa_storage_path).toBeNull();
  });
});

describe('PastaService.puxarFotosDoRelatorio', () => {
  it('adiciona fotos do r-pi com origem=r-pi sem re-upload, pulando duplicadas', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f1.jpg', nome_exibicao: 'foto-obra-1.jpg', origem: 'r-pi' }],
      }),
      listRelatoriosPosInstalacaoByLead: vi.fn().mockResolvedValue([{ id: 'rel-1' }]),
      getRelatorioPosInstalacaoById: vi.fn().mockResolvedValue({
        id: 'rel-1', lead_id: 'lead-1',
        fotos: [
          { storage_path: 'lead-1/pos_instalacao/f1.jpg', caption: null },
          { storage_path: 'lead-1/pos_instalacao/f2.jpg', caption: 'Inversor' },
        ],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDoRelatorio('pasta-1');
    expect(r.ok).toBe(true);
    expect(r.adicionadas).toBe(1);
    const arquivos = sb.atualizarPastaCliente.mock.calls[0][1].arquivos;
    expect(arquivos.length).toBe(2);
    expect(arquivos[1]).toMatchObject({ secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f2.jpg', origem: 'r-pi', caption: 'Inversor' });
  });

  it('lead sem relatório: ok=false com mensagem clara', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDoRelatorio('pasta-1');
    expect(r.ok).toBe(false);
  });
});

describe('PastaService.publicar', () => {
  it('pasta vazia NÃO publica', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.publicar('pasta-1');
    expect(r.ok).toBe(false);
    expect(sb.atualizarPastaCliente).not.toHaveBeenCalled();
  });

  it('com arquivo: muda status pra publicada', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/pasta/a.jpg', nome_exibicao: 'a.jpg', origem: 'upload' }],
      }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.publicar('pasta-1');
    expect(r.ok).toBe(true);
    expect(sb.atualizarPastaCliente.mock.calls[0][1].status).toBe('publicada');
  });
});

describe('PastaService.resolverView', () => {
  const pastaComArquivos = {
    ...PASTA_BASE,
    status: 'publicada',
    arquivos: [
      { secao: 'fotos', storage_path: 'lead-1/pasta/f1.jpg', nome_exibicao: 'f1.jpg', origem: 'upload' },
      { secao: 'projeto', storage_path: 'lead-1/pasta/p.pdf', nome_exibicao: 'prancha.pdf', origem: 'upload' },
    ],
  };

  it('agrupa por seção na ordem fixa e seções vazias somem', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const v = await svc.resolverView(pastaComArquivos as any, true);
    expect(v).not.toBeNull();
    expect(v!.secoes.map((s) => s.secao)).toEqual(['fotos', 'projeto']);
    expect(v!.secoes[0].arquivos[0].is_imagem).toBe(true);
    expect(v!.secoes[1].arquivos[0].is_imagem).toBe(false);
    expect(v!.secoes[1].arquivos[0].url).toBe('https://sig/lead-1/pasta/p.pdf');
  });

  it('vídeo do monitoramento sai com is_video=true', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const v = await svc.resolverView({
      ...PASTA_BASE,
      status: 'publicada',
      arquivos: [
        { secao: 'monitoramento', storage_path: 'lead-1/pasta/m.mp4', nome_exibicao: 'app-gerando.mp4', origem: 'upload' },
        { secao: 'monitoramento', storage_path: 'lead-1/pasta/m.jpg', nome_exibicao: 'print-app.jpg', origem: 'upload' },
      ],
    } as any, true);
    expect(v!.secoes[0].secao).toBe('monitoramento');
    expect(v!.secoes[0].arquivos[0].is_video).toBe(true);
    expect(v!.secoes[0].arquivos[0].is_imagem).toBe(false);
    expect(v!.secoes[0].arquivos[1].is_video).toBe(false);
    expect(v!.secoes[0].arquivos[1].is_imagem).toBe(true);
  });

  it('sem capa definida: usa a primeira foto', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const v = await svc.resolverView(pastaComArquivos as any, true);
    expect(v!.capa_url).toBe('https://sig/lead-1/pasta/f1.jpg');
  });

  it('snapshot do cliente + sistema entram na view', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, async () => ({
      id: 's1', apelido: 'Casa', marca_inversor: 'deye', potencia_kwp: 5,
      qtd_paineis: 11, painel_marca: 'Risen', painel_modelo: 'X', inversor_modelo: 'Y',
    }));
    const v = await svc.resolverView(pastaComArquivos as any, false);
    expect(v!.cliente_nome).toBe('João Silva');
    expect(v!.sistema?.potencia_kwp).toBe(5);
    expect(v!.publico).toBe(false);
  });
});

describe('PastaService.enviarPorWhatsApp', () => {
  const publicada = {
    ...PASTA_BASE, status: 'publicada',
    arquivos: [{ secao: 'fotos', storage_path: 'p', nome_exibicao: 'p', origem: 'upload' }],
  };

  it('rascunho NÃO envia', async () => {
    const sb = fakeSupabase();
    const sendText = vi.fn();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nao_publicada');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('opt_out NÃO envia', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue(publicada),
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'J', phone: '556111', opt_out: true }),
    });
    const sendText = vi.fn();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.reason).toBe('opt_out');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('envia com link /pasta/<slug> e marca enviada', async () => {
    const sb = fakeSupabase({ getPastaClienteById: vi.fn().mockResolvedValue(publicada) });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(r.ok).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/pasta/abcdefghjk');
    expect(sb.marcarPastaClienteEnviada).toHaveBeenCalledWith('pasta-1', '5561999990000');
  });

  it('mensagem padrão convida pra avaliação no Google', async () => {
    const sb = fakeSupabase({ getPastaClienteById: vi.fn().mockResolvedValue(publicada) });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new PastaService(sb as any, semSistema);
    await svc.enviarPorWhatsApp('pasta-1', sendText);
    expect(sendText.mock.calls[0][1]).toContain('g.page/r/CWB5ipa57HzhEAI/review');
  });

  it('com WABA: usa o template pasta_digital_v1 (corpo=nome, botão=slug) e NÃO o texto', async () => {
    const sb = fakeSupabase({ getPastaClienteById: vi.fn().mockResolvedValue(publicada) });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText, sendTemplate);
    expect(r.ok).toBe(true);
    const [to, nome, lang, components] = sendTemplate.mock.calls[0];
    expect(to).toBe('5561999990000');
    expect(nome).toBe('pasta_digital_v1');
    expect(lang).toBe('pt_BR');
    expect(components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'abcdefghjk' }] },
    ]);
    expect(sendText).not.toHaveBeenCalled();
    expect(sb.marcarPastaClienteEnviada).toHaveBeenCalledWith('pasta-1', '5561999990000');
  });

  it('template falhou (não aprovado ainda) → cai pro texto com link', async () => {
    const sb = fakeSupabase({ getPastaClienteById: vi.fn().mockResolvedValue(publicada) });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockRejectedValue(new Error('132001 template does not exist'));
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.enviarPorWhatsApp('pasta-1', sendText, sendTemplate);
    expect(r.ok).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/pasta/abcdefghjk');
  });
});

describe('PastaService.excluirPasta', () => {
  it('apaga do bucket só os uploads próprios (r-pi fica) e remove a linha', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [
          { secao: 'fotos', storage_path: 'lead-1/pasta/a.jpg', nome_exibicao: 'a.jpg', origem: 'upload' },
          { secao: 'fotos', storage_path: 'lead-1/pos_instalacao/f.jpg', nome_exibicao: 'f.jpg', origem: 'r-pi' },
        ],
      }),
      deletarPastaCliente: vi.fn().mockResolvedValue({ ok: true }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.excluirPasta('pasta-1');
    expect(r.ok).toBe(true);
    expect(storage.remove).toHaveBeenCalledWith(['lead-1/pasta/a.jpg']);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(sb.deletarPastaCliente).toHaveBeenCalledWith('pasta-1');
  });

  it('pasta inexistente → erro claro', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue(null),
      deletarPastaCliente: vi.fn(),
    });
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.excluirPasta('x');
    expect(r.ok).toBe(false);
    expect(sb.deletarPastaCliente).not.toHaveBeenCalled();
  });
});

describe('PastaService.puxarFotosDosServicos', () => {
  it('traz fotos e vídeos dos serviços/visitas sem re-upload, com legenda e origem servico', async () => {
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/servico/s1/a.jpg', nome_exibicao: 'a.jpg', origem: 'servico' }],
      }),
    });
    const buscarMidias = vi.fn().mockResolvedValue([
      { path: 'lead-1/servico/s1/a.jpg', tipoMidia: 'foto', legenda: 'Visita técnica · 01/08/2026' },
      { path: 'lead-1/servico/s1/b.jpg', tipoMidia: 'foto', legenda: 'Visita técnica · 01/08/2026' },
      { path: 'lead-1/servico/s2/c.mp4', tipoMidia: 'video', legenda: 'Instalação FV · 03/08/2026' },
    ]);
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDosServicos('pasta-1', buscarMidias);
    expect(r.ok).toBe(true);
    expect(r.adicionadas).toBe(2);
    expect(buscarMidias).toHaveBeenCalledWith('lead-1');
    const arquivos = sb.atualizarPastaCliente.mock.calls[0][1].arquivos;
    expect(arquivos.length).toBe(3);
    expect(arquivos[1]).toMatchObject({ secao: 'fotos', storage_path: 'lead-1/servico/s1/b.jpg', origem: 'servico', caption: 'Visita técnica · 01/08/2026' });
    expect(arquivos[2].storage_path).toBe('lead-1/servico/s2/c.mp4');
  });

  it('lead sem serviços com mídia → ok=false com aviso', async () => {
    const sb = fakeSupabase();
    const svc = new PastaService(sb as any, semSistema);
    const r = await svc.puxarFotosDosServicos('pasta-1', vi.fn().mockResolvedValue([]));
    expect(r.ok).toBe(false);
  });
});

describe('origem servico protege o bucket (arquivo pertence ao Diário de Serviços)', () => {
  it('remover arquivo origem=servico NÃO apaga do bucket', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [{ secao: 'fotos', storage_path: 'lead-1/servico/s1/a.jpg', nome_exibicao: 'a.jpg', origem: 'servico' }],
      }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    await svc.removerArquivo('pasta-1', 'lead-1/servico/s1/a.jpg');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('excluir pasta NÃO apaga arquivos origem=servico do bucket', async () => {
    const storage = {
      upload: vi.fn(), createSignedUrls: vi.fn(),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }), download: vi.fn(),
    };
    const sb = fakeSupabase({
      getPastaClienteById: vi.fn().mockResolvedValue({
        ...PASTA_BASE,
        arquivos: [
          { secao: 'fotos', storage_path: 'lead-1/pasta/meu.jpg', nome_exibicao: 'meu.jpg', origem: 'upload' },
          { secao: 'fotos', storage_path: 'lead-1/servico/s1/a.jpg', nome_exibicao: 'a.jpg', origem: 'servico' },
        ],
      }),
      deletarPastaCliente: vi.fn().mockResolvedValue({ ok: true }),
      getClient: vi.fn().mockReturnValue({ storage: { from: vi.fn().mockReturnValue(storage) } }),
    });
    const svc = new PastaService(sb as any, semSistema);
    await svc.excluirPasta('pasta-1');
    expect(storage.remove).toHaveBeenCalledWith(['lead-1/pasta/meu.jpg']);
  });
});
