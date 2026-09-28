// Casos dos Serviços de campo — painel interno (renovação do miolo, R14):
// lista, novo registro, detalhe e lixeira. A página PÚBLICA do link mágico
// (renderCampoPublicoPage / renderCampoLinkProblemaPage) NÃO entra: ela não muda.
// Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import {
  renderServicosPage, renderNovoServicoPage, renderDetalheServicoPage, renderLixeiraServicosPage,
} from '../../src/modules/dashboard/servicos-views.js';
import type { ServicoRow } from '../../src/modules/dashboard/servicos-store.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const TIPOS_SERVICO = [
  { id: 'visita-tecnica', nome: 'Visita técnica' },
  { id: 'termino-instalacao', nome: 'Término de instalação (entrega)' },
  { id: 'manutencao', nome: 'Manutenção <b>corretiva</b>' },
];

export function servicoRow(over: Partial<ServicoRow> = {}): ServicoRow {
  return {
    id: 'srv-1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'lead-1',
    clienteNome: 'Fernanda Exemplo', sistemaId: null, observacoes: 'Telhado de cerâmica, padrão ok.',
    dataServico: '2026-09-20', fotos: 3, videos: 1, status: 'concluido', atribuidoA: null, atribuidoNome: null,
    campoNome: null, campoSlug: null, campoExpiraEm: null, ...over,
  };
}

/** Lista com: 1 pendente do usuário logado (u-casa), 1 pendente de outro, concluídos, nome com <script>. */
export const LISTA_SERVICOS: ServicoRow[] = [
  servicoRow(),
  servicoRow({ id: 'srv-2', tipoId: 'termino-instalacao', tipoNome: 'Término de instalação (entrega)', clienteNome: 'Gustavo <script>alert(1)</script>', status: 'atribuido', atribuidoA: USER_CASA.id, atribuidoNome: 'Junior', fotos: 0, videos: 0, dataServico: '2026-09-27' }),
  servicoRow({ id: 'srv-3', tipoNome: 'Manutenção <b>corretiva</b>', tipoId: 'manutencao', clienteNome: "Helena D'Ávila", status: 'atribuido', atribuidoA: 'u-outro', atribuidoNome: 'Ivo Instalador', fotos: 1, videos: 0, dataServico: '2026-09-25' }),
  servicoRow({ id: 'srv-4', clienteNome: '(sem nome)', fotos: 0, videos: 2, observacoes: null, dataServico: '2026-09-10' }),
];

const USUARIOS = [{ id: 'u-inst', nome: 'Ivo Instalador' }, { id: 'u-x', nome: 'Jó <script>x</script>' }];
const MIDIAS = [
  { tipoMidia: 'foto', url: 'https://exemplo.invalid/assinada-1.jpg' },
  { tipoMidia: 'foto', url: 'https://exemplo.invalid/assinada-2.jpg?a=1&b="2"' },
  { tipoMidia: 'video', url: 'https://exemplo.invalid/assinada-3.mp4' },
];

const PENDENTE = servicoRow({ id: 'srv-2', tipoId: 'termino-instalacao', tipoNome: 'Término de instalação (entrega)', clienteNome: 'Gustavo <script>alert(1)</script>', status: 'atribuido', atribuidoA: 'u-inst', atribuidoNome: 'Ivo Instalador', fotos: 0, videos: 0, observacoes: 'Levar escada <grande>.' });
const COM_LINK = servicoRow({ campoSlug: 'abcdefghjk', campoNome: 'Kátia <b>K</b>', campoExpiraEm: '2099-01-01T12:00:00Z' });
const LINK_VENCIDO = servicoRow({ campoSlug: 'vencido123', campoNome: 'Luís', campoExpiraEm: '2020-01-01T12:00:00Z' });

export const CASOS_SERVICOS: Record<string, () => string> = {
  'lista': () => renderServicosPage(LISTA_SERVICOS, USER_CASA, { tipo: 'ok', texto: '✅ Serviço concluído!' }),
  'lista-erro': () => renderServicosPage(LISTA_SERVICOS, USER_CASA, { tipo: 'erro', texto: 'Falha ao excluir <b>x</b>.' }),
  'lista-vazia': () => renderServicosPage([], USER_CASA),
  'lista-so-pendentes': () => renderServicosPage([LISTA_SERVICOS[1]!], USER_CASA),
  'lista-tenant': () => renderServicosPage(LISTA_SERVICOS, USER_TENANT),
  'novo': () => renderNovoServicoPage(TIPOS_SERVICO, USER_CASA, USUARIOS),
  'novo-sem-usuarios': () => renderNovoServicoPage([], USER_CASA),
  'novo-tenant': () => renderNovoServicoPage(TIPOS_SERVICO, USER_TENANT, USUARIOS),
  'detalhe-concluido': () => renderDetalheServicoPage(COM_LINK, MIDIAS, USER_CASA, true, { pode: true }),
  'detalhe-pendente': () => renderDetalheServicoPage(PENDENTE, [], USER_CASA, true, { pode: true, criadoAgora: true }),
  'detalhe-campo': () => renderDetalheServicoPage(PENDENTE, [], USER_CASA, false, { pode: false }),
  'detalhe-vencido': () => renderDetalheServicoPage(LINK_VENCIDO, [], USER_CASA, true, { pode: true }),
  'detalhe-sem-midia': () => renderDetalheServicoPage(servicoRow({ observacoes: null, fotos: 0, videos: 0 }), [], USER_CASA, false),
  'detalhe-tenant': () => renderDetalheServicoPage(COM_LINK, MIDIAS, USER_TENANT, true, { pode: true, criadoAgora: true }),
  'lixeira': () => renderLixeiraServicosPage(LISTA_SERVICOS, USER_CASA),
  'lixeira-vazia': () => renderLixeiraServicosPage([], USER_CASA),
  'lixeira-tenant': () => renderLixeiraServicosPage(LISTA_SERVICOS.slice(0, 2), USER_TENANT),
};
