// Diário de Serviços F1 — telas mobile-first: lista + novo registro.
import { describe, it, expect } from 'vitest';
import { renderServicosPage, renderNovoServicoPage } from '../src/modules/dashboard/servicos-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';

const TIPOS = [
  { id: 'visita-tecnica', nome: 'Visita técnica' },
  { id: 'termino-instalacao', nome: 'Término de instalação (entrega)' },
];
const SERVICOS = [
  { id: 's1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'l1', clienteNome: 'Fernanda', sistemaId: null, observacoes: 'ok', dataServico: '2026-07-30', fotos: 3, videos: 1, status: 'concluido' as const, atribuidoA: null, atribuidoNome: null },
];
const ATRIBUIDO = { ...SERVICOS[0]!, id: 's2', tipoId: 'termino-instalacao', tipoNome: 'Término de instalação (entrega)', status: 'atribuido' as const, atribuidoA: 'u-inst', atribuidoNome: 'João Instalador', fotos: 0, videos: 0 };

describe('renderServicosPage (lista)', () => {
  const html = renderServicosPage(SERVICOS, undefined);
  it('mostra o registro: tipo, cliente, data e contagem de mídias', () => {
    expect(html).toContain('Visita técnica');
    expect(html).toContain('Fernanda');
    expect(html).toContain('30/07/2026');
    expect(html).toContain('3 fotos');
    expect(html).toContain('1 vídeo');
  });
  it('tem o botão de novo registro', () => {
    expect(html).toContain('/dashboard/servicos/novo');
  });
});

describe('renderNovoServicoPage (form mobile)', () => {
  const html = renderNovoServicoPage(TIPOS, undefined);
  it('tem tipo, busca de cliente, cliente novo, data, observações', () => {
    expect(html).toContain('Visita técnica');
    expect(html).toContain('buscar-cliente');
    expect(html).toContain('Cliente novo');
    expect(html).toContain('name="data"');
    expect(html).toContain('observacoes');
  });
  it('aceita foto e vídeo (máx 2 vídeos avisado no código)', () => {
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('accept="video/*"');
    expect(html).toContain('MAX_VIDEOS=2');
  });
  it('fluxo de subida: cria registro, sobe pras URLs assinadas e confirma', () => {
    expect(html).toContain('/dashboard/servicos/nova');
    expect(html).toContain('confirmar-midias');
  });
  it('guia de fotos por tipo (visita e término) aparece conforme o select', () => {
    expect(html).toContain('Fotos pra tirar neste serviço');
    expect(html).toContain('data-tipo="visita-tecnica"');
    expect(html).toContain('data-tipo="termino-instalacao"');
    // As duas listas são as DITADAS pelo Junior (29/07)
    expect(html).toContain('bitola do cabo do padrão de entrada');
    expect(html).toContain('Tipo de telha');
    expect(html).toContain('Capacidade da corrente do disjuntor'); // "corrente", NUNCA "amperagem"
    expect(html).toContain('cabo tronco');
    expect(html).toContain('placa de geração própria');
    expect(html).toContain('corrente CA');
    expect(html).toContain('mostraGuia');
  });
});

describe('o JS embutido da página é VÁLIDO (guarda do bug 29/07: 1 parêntese matou todos os botões)', () => {
  it('todo <script> das telas de serviços compila (novo, lista e detalhe pendente)', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    for (const html of [
      renderNovoServicoPage(TIPOS, undefined, [{ id: 'u1', nome: 'João' }]),
      renderServicosPage(SERVICOS, undefined),
      renderDetalheServicoPage(ATRIBUIDO, [], undefined),
    ]) {
      for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        expect(() => new Function(m[1]!)).not.toThrow();
      }
    }
  });
});

describe('atribuição (F2)', () => {
  it('form novo tem o select Atribuir a com os usuários', () => {
    const html = renderNovoServicoPage(TIPOS, undefined, [{ id: 'u-inst', nome: 'João Instalador' }]);
    expect(html).toContain('name="atribuido"');
    expect(html).toContain('João Instalador');
    expect(html).toContain('eu mesmo');
  });
  it('lista: pendente do usuário logado sobe pra seção "Seus serviços pendentes"', () => {
    const eu = { id: 'u-inst', companyId: 'c1', nome: 'João', login: 'j', isAdmin: false, roleNome: 'Campo', permissoes: { servicos: ['visualizar', 'criar'] } } as any;
    const html = renderServicosPage([SERVICOS[0]!, ATRIBUIDO], eu);
    expect(html).toContain('Seus serviços pendentes');
    expect(html).toContain('🟡 pendente');
    expect(html).toContain('🟢 concluído');
  });
  it('detalhe pendente vira tela de trabalho: guia + anexos + Concluir', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(ATRIBUIDO, [], undefined);
    expect(html).toContain('Fotos pra tirar neste serviço'); // guia do tipo aparece
    expect(html).toContain('cabo tronco');                    // lista do Junior (término)
    expect(html).toContain('Concluir serviço');
    expect(html).toContain('/concluir');
    expect(html).toContain('Atribuído a João Instalador');
  });
  it('detalhe concluído NÃO tem o modo de trabalho', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(SERVICOS[0]!, [], undefined);
    expect(html).not.toContain('Concluir serviço');
  });
  it('Reabrir aparece SÓ no concluído e SÓ pra quem pode editar', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    expect(renderDetalheServicoPage(SERVICOS[0]!, [], undefined, true)).toContain('/reabrir');
    expect(renderDetalheServicoPage(SERVICOS[0]!, [], undefined, false)).not.toContain('/reabrir');
    expect(renderDetalheServicoPage(ATRIBUIDO, [], undefined, true)).not.toContain('/reabrir'); // pendente não reabre
  });
});

describe('renderDetalheServicoPage', () => {
  it('mostra o registro com fotos e vídeo (URLs assinadas)', async () => {
    const { renderDetalheServicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderDetalheServicoPage(
      SERVICOS[0]!,
      [
        { tipoMidia: 'foto', url: 'https://x/assinada-1.jpg' },
        { tipoMidia: 'video', url: 'https://x/assinada-2.mp4' },
      ],
      undefined,
    );
    expect(html).toContain('Visita técnica');
    expect(html).toContain('assinada-1.jpg');
    expect(html).toContain('<video');
  });
});

describe('menu — item Serviços', () => {
  it('aparece com gate da área servicos', () => {
    const html = renderLayout({ active: 'servicos', title: 'X', body: '' } as any);
    expect(html).toContain('href="/dashboard/servicos"');
  });
});
