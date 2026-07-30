// Diário de Serviços F1 — telas mobile-first: lista + novo registro.
import { describe, it, expect } from 'vitest';
import { renderServicosPage, renderNovoServicoPage } from '../src/modules/dashboard/servicos-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';

const TIPOS = [
  { id: 'visita-tecnica', nome: 'Visita técnica' },
  { id: 'termino-instalacao', nome: 'Término de instalação (entrega)' },
];
const SERVICOS = [
  { id: 's1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'l1', clienteNome: 'Fernanda', sistemaId: null, observacoes: 'ok', dataServico: '2026-07-30', fotos: 3, videos: 1 },
];

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
