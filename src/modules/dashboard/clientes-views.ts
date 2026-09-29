// src/modules/dashboard/clientes-views.ts
// Clientes — telas admin:
//   renderClientesListPage  → GET /dashboard/clientes (busca, arquivados, sistemas sem cliente)
//   renderClienteDetailPage → GET /dashboard/clientes/:id (ficha)
//   renderFormNovoCliente   → GET /dashboard/clientes/novo
// Renovação do miolo — R16 (28/09/2026): mesmos formulários, campos, confirms,
// fetch do ViaCEP e da busca de cliente; visual no padrão cc- do Command Center,
// tema escuro (D4), sem Tailwind. A ficha virou duas colunas com abas por âncora
// (Resumo · Usinas · Arquivos · Ações) — todas as seções ficam na página, então
// os redirects do servidor (#dados, #anexos) caem na seção certa. Arquivar /
// Restaurar / Excluir moram no "⋯ Mais ações" com os MESMOS formulários.
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { renderClienteSelector } from './proprietario.js';
import { statusLabel } from '../clientes/mappers.js';
import { CONCESSIONARIAS_BR, getConcessionariaById } from '../concessionarias.js';
import { CIDADES_DF_GO } from '../cidades-df-go.js';
import type { ClienteRow, ClienteDetail, InsightCard, SistemaOrfaoCard, InstallationStatus } from '../clientes/types.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, menuAcoes, celulaDupla, avatar,
  abas, chipsFiltro, faixaKpis, trilhaEtapas, pontoStatus, type Tom,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

// Datalist comum de cidades DF+GO (renderizado uma vez por página, referenciado por list="cidades-df-go")
const CIDADES_DATALIST_HTML = `<datalist id="cidades-df-go">${CIDADES_DF_GO.map((c) => `<option value="${c}">`).join('')}</datalist>`;

// JS de auto-preenchimento por CEP via ViaCEP. Reutilizado no modal e no form.
const CEP_LOOKUP_SCRIPT = `
<script>
  async function puxarCep(cepInput, formEl) {
    const raw = (cepInput.value || '').replace(/\\D/g, '');
    if (raw.length !== 8) return;
    try {
      const r = await fetch('https://viacep.com.br/ws/' + raw + '/json/');
      if (!r.ok) return;
      const d = await r.json();
      if (d.erro) return;
      const setIfEmpty = (selector, value) => {
        if (!value) return;
        const el = formEl.querySelector(selector);
        if (el && !el.value) el.value = value;
      };
      setIfEmpty('[name="endereco_rua"]', d.logradouro);
      setIfEmpty('[name="neighborhood"]', d.bairro);
      // cidade e UF sempre sobrescrevem (CEP é fonte da verdade)
      const elCity = formEl.querySelector('[name="city"]'); if (elCity && d.localidade) elCity.value = d.localidade;
      const elUf = formEl.querySelector('[name="uf"]'); if (elUf && d.uf) elUf.value = d.uf;
    } catch (e) { /* falha silenciosa */ }
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[name="cep"]').forEach((el) => {
      el.addEventListener('blur', () => puxarCep(el, el.closest('form')));
    });
    document.querySelectorAll('.js-num').forEach((el) => {
      el.addEventListener('blur', () => { el.value = (el.value || '').replace(',', '.'); });
    });
    document.querySelectorAll('form').forEach((f) => {
      f.addEventListener('submit', () => {
        f.querySelectorAll('.js-num').forEach((el) => { el.value = (el.value || '').replace(',', '.'); });
      });
    });
  });
</script>`;

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const fmtBR = (n: number, casas = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataBR = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);

const CSS_CLIENTES = `
.cc-cl .cc-panel+.cc-panel,.cc-cl .cc-kstrip+.cc-panel,.cc-cl .cc-aviso+.cc-panel{margin-top:16px}
.cc-cl-busca{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.cc-cl-busca input[name=q]{flex:1 1 240px;min-width:0}
.cc-cl-busca select{flex:0 1 200px;min-width:0}
.cc-cl-quem{display:flex;align-items:center;gap:10px;min-width:0}
.cc-cl-quem .cc-dupla{min-width:0}
.cc-cl-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-cl-acoes form{margin:0}
.cc-cl-modal{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px}
.cc-cl-modal.hidden{display:none}
.cc-cl-modal>div{width:100%;max-width:440px;border-radius:14px;border:1px solid var(--cc-line-2);background:var(--cc-surface);padding:20px}
.cc-cl-modal h3{margin:0 0 4px;font-size:17px;color:var(--cc-text)}
.cc-cl-modal p{margin:0 0 14px;font-size:12.5px;color:var(--cc-muted)}
.cc-cl-modal p span{color:var(--cc-gold-2)}
.cc-cl-modal form{display:flex;flex-direction:column;gap:12px}
.cc-cl-modal .cc-cl-acoes .cc-btn{flex:1 1 0;justify-content:center}
.cc-us-sel{display:flex;flex-direction:column;gap:8px}
.cc-us-sel-busca{position:relative}
.cc-us-sel-drop{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:14rem;overflow:auto;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);box-shadow:0 12px 28px rgba(0,0,0,.35)}
.cc-us-sel-item{padding:8px 12px;font-size:13px;color:var(--cc-text);cursor:pointer}
.cc-us-sel-item:hover{background:var(--cc-surface-3)}
.cc-us-sel-item .cc-muted{font-size:12px}
.cc-us-sel-in,.cc-us-sel-novo input{width:100%}
.cc-us-sel-t{font-weight:600}
.cc-us-sel summary{cursor:pointer;font-size:12.5px;color:var(--cc-muted)}
.cc-us-sel-novo{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.cc-cl-ficha{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.cc-cl-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.cc-cl .cc-cl-col>.cc-panel{margin:0}
.cc-cl-ficha section[id],.cc-cl-ficha div[id]{scroll-margin-top:16px}
.cc-cl-jorn{margin:4px 0 16px}
.cc-cl-dados{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cc-cl-dados fieldset{margin:0;border:1px solid var(--cc-line-2);border-radius:12px;padding:10px 12px 12px;min-width:0}
.cc-cl-dados legend{padding:0 6px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-muted)}
.cc-cl-dados .cc-cl-cheia{grid-column:1/-1}
.cc-cl-g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cc-cl-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.cc-cl-g6{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.cc-cl-g .cc-cl-s2,.cc-cl-g6 .cc-cl-s2{grid-column:span 2}
.cc-cl-g6 .cc-cl-s3{grid-column:span 3}
.cc-cl-g .cc-cl-tudo,.cc-cl-g3 .cc-cl-tudo{grid-column:1/-1}
.cc-cl-dados input:not([type=checkbox]),.cc-cl-dados select,.cc-cl-dados textarea{width:100%}
.cc-cl-check input{width:auto;flex:none}
.cc-cl-check{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:4px 0 10px}
.cc-cl-usina{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0}
.cc-cl-usina div{min-width:0}
.cc-cl-usina dt{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-muted)}
.cc-cl-usina dd{margin:2px 0 0;font-size:14px;color:var(--cc-text);overflow-wrap:anywhere}
.cc-cl-ins{display:flex;flex-direction:column;gap:10px}
.cc-cl-ins>div{border:1px solid var(--cc-line-2);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.02)}
.cc-cl-ins p{margin:0 0 8px;font-size:13px;line-height:1.45;color:var(--cc-text-2)}
.cc-cl-ins form{margin:0}
.cc-cl-ins small{font-size:12px;color:var(--cc-faint)}
.cc-cl-lnk{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.cc-cl-lnk .cc-btn{justify-content:center}
.cc-cl-anx{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}
.cc-cl-anx-it{position:relative;border:1px solid var(--cc-line-2);border-radius:12px;background:rgba(255,255,255,.02);min-width:0}
.cc-cl-anx-it>a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:1;padding:8px;color:var(--cc-text-2);text-decoration:none}
.cc-cl-anx-it>a:hover{color:var(--cc-gold-2)}
.cc-cl-anx-it>a b{font-size:26px;font-weight:400}
.cc-cl-anx-it>a span{font-size:11.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-cl-anx-it form{position:absolute;top:6px;right:6px;margin:0}
.cc-cl-anx-up{display:flex;flex-direction:column;gap:8px;border:1px dashed var(--cc-line-2);border-radius:12px;padding:10px;min-width:0}
.cc-cl-anx-up input,.cc-cl-anx-up select{width:100%}
.cc-cl-tl{display:flex;flex-direction:column;gap:8px}
.cc-cl-tl>div{display:flex;gap:10px;align-items:baseline;font-size:13px;color:var(--cc-text-2)}
.cc-cl-tl time{flex:none;width:84px;color:var(--cc-faint);font-variant-numeric:tabular-nums}
.cc-cl-tl span:last-child{min-width:0;overflow-wrap:anywhere}
.cc-cl-msg{display:flex;flex-direction:column;gap:8px}
.cc-cl-msg>div{border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.45;background:var(--cc-surface-2);color:var(--cc-text-2);overflow-wrap:anywhere}
.cc-cl-msg>div.cc-cl-cli{background:rgba(56,189,248,.10);color:var(--cc-text)}
.cc-cl-msg small{display:block;font-size:11px;color:var(--cc-faint);margin-bottom:2px}
.cc-cl-link{display:inline-block;margin-top:10px;font-size:13px;color:var(--cc-info)}
.cc-cl-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cc-cl-form input,.cc-cl-form select{width:100%}
.cc-cl-form .cc-cl-tudo{grid-column:1/-1}
.cc-cl-erros ul{margin:6px 0 0;padding-left:18px}
@media (max-width:1023px){.cc-cl-ficha{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){
  .cc-cl-busca input[name=q],.cc-cl-busca select{flex:1 1 100%}
  .cc-cl-busca .cc-btn{flex:1 1 0;justify-content:center}
  .cc-cl-dados,.cc-cl-g,.cc-cl-g3,.cc-cl-g6,.cc-cl-form{grid-template-columns:minmax(0,1fr)}
  .cc-cl-g .cc-cl-s2,.cc-cl-g6 .cc-cl-s2,.cc-cl-g6 .cc-cl-s3{grid-column:auto}
  .cc-cl-acoes{width:100%}
  .cc-cl-acoes>.cc-btn,.cc-cl-acoes>form{flex:1 1 auto}
  .cc-cl-acoes .cc-btn{justify-content:center}
  .cc-cl-acoes form .cc-btn{width:100%}
  .cc-cl-usina{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
`;

const layout = (title: string, body: string, user: DashUser | undefined, scripts = '', largo = true) => renderLayout({
  active: 'clientes', title, body: `<div class="cc-root cc-cl">${body}</div><style>${CSS_CLIENTES}</style>`, scripts, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

/** Situação do cliente (installation_status) → tom da pílula. */
function tomDaSituacao(s: InstallationStatus): Tom {
  switch (s) {
    case 'operando': case 'pos_venda_concluido': return 'normal';
    case 'instalado': case 'medidor_trocado': case 'contrato_assinado': return 'info';
    case 'proposta_aceita': case 'qualificado': return 'acompanhar';
    default: return 'sem_dado';
  }
}
const pilulaSituacao = (s: InstallationStatus) => pilulaStatus(tomDaSituacao(s), statusLabel(s));

export function renderClientesListPage(
  rows: ClienteRow[],
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
  sistemasOrfaos: SistemaOrfaoCard[] = [],
  pagination: { total: number; limit: number; offset: number; mostrarArquivados?: boolean } = { total: rows.length, limit: 50, offset: 0 },
  // R0: quem está vendo — a casca (menu, rodapé) é a da empresa dele.
  user: DashUser | undefined,
): string {
  const { total, limit, offset } = pagination;
  const mostrarArquivados = pagination.mostrarArquivados === true;
  const pagina = Math.floor(offset / limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const queryStringSemOffset = (() => {
    const parts: string[] = [];
    if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
    if (filters.concessionaria) parts.push(`concessionaria=${encodeURIComponent(filters.concessionaria)}`);
    if (filters.cidade) parts.push(`cidade=${encodeURIComponent(filters.cidade)}`);
    if (filters.ord) parts.push(`ord=${encodeURIComponent(filters.ord)}`);
    if (mostrarArquivados) parts.push('show=arquivados');
    return parts.length > 0 ? '&' + parts.join('&') : '';
  })();

  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const cidades = [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])].sort();

  const acoes = mostrarArquivados
    ? botao({ rotulo: '← Voltar pra ativos', href: '/dashboard/clientes' })
    : botao({ rotulo: 'Novo cliente', href: '/dashboard/clientes/novo', tom: 'ouro', icone: 'plus' });

  // Chip ativo fica sem link (é a tela atual); o outro leva pra lá.
  const chips = chipsFiltro([
    { rotulo: 'Ativos', valor: mostrarArquivados ? null : total, href: mostrarArquivados ? '/dashboard/clientes' : null, ativo: !mostrarArquivados },
    { rotulo: 'Arquivados', valor: mostrarArquivados ? total : null, href: mostrarArquivados ? null : '/dashboard/clientes?show=arquivados', ativo: mostrarArquivados },
  ]);

  const busca = `
    <form method="get" action="/dashboard/clientes" class="cc-form cc-cl-busca">
      <input name="q" value="${escapeHtml(filters.q ?? '')}" placeholder="Nome, telefone, e-mail ou CPF" aria-label="Buscar cliente">
      <select name="concessionaria" aria-label="Concessionária">
        ${opt('', 'Todas concessionárias', filters.concessionaria)}
        ${CONCESSIONARIAS_BR.map((c) => opt(c.id, c.nome, filters.concessionaria)).join('')}
      </select>
      <select name="cidade" aria-label="Cidade">
        ${opt('', 'Todas cidades', filters.cidade)}
        ${cidades.map((c) => opt(c, c, filters.cidade)).join('')}
      </select>
      <select name="ord" aria-label="Ordem">
        ${opt('', 'Mais recente', filters.ord)}
        ${opt('nome', 'Nome A-Z', filters.ord)}
      </select>
      <button class="cc-btn">Filtrar</button>
      <a href="/dashboard/clientes" class="cc-btn cc-btn-ghost">Limpar</a>
    </form>`;

  const lista = rows.length === 0
    ? (sistemasOrfaos.length === 0
      ? estadoVazio({ tipo: 'vazio', titulo: mostrarArquivados ? 'Nenhum cliente arquivado.' : 'Nenhum cadastrado ainda.', texto: mostrarArquivados ? undefined : 'Use "Novo cliente" pra começar.', icone: 'users' })
      : '')
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Cliente' }, { titulo: 'Situação' }, { titulo: 'Cidade' }, { titulo: 'Concessionária' }, { titulo: 'Consumo', alinhar: 'dir', num: true }, { titulo: 'Conta', alinhar: 'dir', num: true }],
      linhas: rows.map((r) => {
        const concNome = r.concessionaria ? getConcessionariaById(r.concessionaria)?.nome ?? r.concessionaria : null;
        return [
          { html: `<div class="cc-cl-quem">${avatar(r.name)}${celulaDupla(r.name, r.phone, `/dashboard/clientes/${r.id}`)}</div>` },
          { html: pilulaSituacao(r.installation_status) },
          [r.city, r.uf].filter(Boolean).join('/') || null,
          concNome,
          r.consumo_medio_kwh ? `${fmtBR(r.consumo_medio_kwh)} kWh/mês` : null,
          r.conta_media_brl ? `R$ ${fmtBR(r.conta_media_brl)}` : null,
        ];
      }),
    });

  // Paginação com os MESMOS links de hoje (offset ± limit), no visual cc-pg.
  const pager = total > limit ? `
    <nav class="cc-pg" aria-label="Paginação">
      <span class="cc-pg-info">Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total} · Página ${pagina} de ${totalPaginas}</span>
      <span class="cc-sp"></span>
      ${offset > 0
        ? `<a class="cc-btn cc-btn-sm" rel="prev" href="/dashboard/clientes?offset=${Math.max(0, offset - limit)}${escapeHtml(queryStringSemOffset)}">← Anterior</a>`
        : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">← Anterior</span>`}
      ${offset + limit < total
        ? `<a class="cc-btn cc-btn-sm" rel="next" href="/dashboard/clientes?offset=${offset + limit}${escapeHtml(queryStringSemOffset)}">Próxima →</a>`
        : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">Próxima →</span>`}
    </nav>` : '';

  const orfaos = sistemasOrfaos.length > 0 ? `
    ${cartaoSecao({
      titulo: 'Sistemas sem cliente vinculado',
      dica: `${sistemasOrfaos.length} · importados do monitoramento sem dono. Vincule pra cadastrar os dados reais.`,
      corpoHtml: tabela({
        mobile: 'cartoes',
        colunas: [{ titulo: 'Usina' }, { titulo: 'Marca' }, { titulo: 'Potência', alinhar: 'dir', num: true }, { titulo: 'Cidade' }, { titulo: 'Instalado em' }, { titulo: '' }],
        linhas: sistemasOrfaos.map((s) => [
          { html: celulaDupla(s.apelido, 'Sistema sem cliente') },
          s.marca_inversor || null,
          s.potencia_kwp ? `${fmtBR(s.potencia_kwp, Number.isInteger(s.potencia_kwp) ? 0 : 1)} kWp` : null,
          [s.cidade, s.uf].filter(Boolean).join('/') || null,
          s.data_instalacao ? dataBR(s.data_instalacao) : null,
          // CONSERTO (R16): id e nome vão por data-* (o nome com apóstrofo quebrava
          // o onclick — e dava pra rodar código com um nome de usina malicioso).
          { html: `<button type="button" class="cc-btn cc-btn-sm" data-sistema="${escapeHtml(s.sistema_id)}" data-apelido="${escapeHtml(s.apelido)}" onclick="abrirVinculo(this.dataset.sistema,this.dataset.apelido)">Vincular cliente</button>` },
        ]),
      }),
    })}

    <div id="modal-vinculo" class="hidden cc-cl-modal" onclick="if(event.target===this)fecharVinculo()">
      <div role="dialog" aria-modal="true" aria-labelledby="cc-cl-modal-t">
        <h3 id="cc-cl-modal-t">Vincular cliente ao sistema</h3>
        <p>Sistema: <span id="modal-sistema-apelido"></span></p>
        <form id="form-vincular" method="post" action="/dashboard/clientes/vincular-sistema" class="cc-form">
          <input type="hidden" name="sistema_id" id="modal-sistema-id">
          ${renderClienteSelector({ idPrefix: 'orf', dark: true, cc: true })}
          <div class="cc-cl-acoes">
            <button type="button" onclick="fecharVinculo()" class="cc-btn">Cancelar</button>
            <button type="submit" class="cc-btn">Vincular</button>
          </div>
        </form>
      </div>
    </div>
    <script>
      function abrirVinculo(sistemaId, apelido) {
        document.getElementById('modal-sistema-id').value = sistemaId;
        document.getElementById('modal-sistema-apelido').textContent = apelido;
        document.getElementById('modal-vinculo').classList.remove('hidden');
      }
      function fecharVinculo() {
        document.getElementById('modal-vinculo').classList.add('hidden');
      }
    </script>` : '';

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Command Center' }, { rotulo: 'Clientes' }],
    titulo: mostrarArquivados ? 'Clientes arquivados' : 'Clientes',
    subtitulo: mostrarArquivados
      ? 'Fora da lista ativa, mas com histórico intacto. Abra qualquer um pra restaurar.'
      : 'Quem comprou: clientes com contrato, instalados, operando e no pós-venda.',
    acoesHtml: acoes,
  })}
${cartaoSecao({
    titulo: mostrarArquivados ? 'Arquivados' : 'Clientes',
    dica: `${total} cliente${total === 1 ? '' : 's'}`,
    acoesHtml: chips,
    corpoHtml: `${busca}${lista}${pager}`,
  })}
${orfaos}`;

  return layout('Clientes', body, user);
}

// ============================================================
// Ficha do cliente
// ============================================================

const FASES_JORNADA = ['Lead', 'Proposta', 'Contrato', 'Instalado', 'Operando', 'Pós-venda'];
function indiceJornada(installation_status: string | null): number {
  const ordem = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];
  const map: Record<string, string> = {
    novo: 'lead', qualificando: 'lead', qualificado: 'proposta',
    proposta_aceita: 'contrato', contrato_assinado: 'contrato',
    instalado: 'instalado', medidor_trocado: 'instalado',
    operando: 'operando', pos_venda_concluido: 'pos_venda',
  };
  return ordem.indexOf(map[installation_status ?? ''] ?? 'lead');
}

function renderKpis(d: ClienteDetail): string {
  const saudePct = d.sistema ? Math.round(d.sistema.ratio_ultimos_7d * 100) : null;
  return faixaKpis([
    d.sistema
      ? { rotulo: 'Sistema', valor: d.sistema.potencia_kwp, casas: 1, unidade: 'kWp', detalhe: `${d.sistema.qtd_paineis ?? '?'} painéis`, destaque: true }
      : { rotulo: 'Sistema', valor: null, href: '/dashboard/monitoramento', semDadoTexto: 'vincular' },
    { rotulo: 'Economia', valor: d.sistema ? d.sistema.geracao_total_kwh * 1 : null, prefixo: 'R$', detalhe: 'estimativa simples' },
    { rotulo: 'Saúde', valor: saudePct, unidade: '%', detalhe: 'vs esperado 7d' },
    { rotulo: 'Propostas', valor: d.propostas.length, detalhe: `${d.propostas.filter((p) => p.cliente_respondeu_at).length} respondidas` },
    { rotulo: 'Alertas', valor: d.alertas_ativos.length, detalhe: d.alertas_ativos.length ? 'ativos' : 'sistema ok' },
  ]);
}

function renderInsights(insights: InsightCard[], nomeAssistente: string): string {
  if (insights.length === 0) {
    return estadoVazio({ tipo: 'vazio', titulo: 'Cliente em ordem — nada urgente agora.', icone: 'check', compacto: true });
  }
  // O rótulo do botão vem de insights.ts ("▶ Eva pedir"): tenant vê "assistente".
  const rotulo = (t: string) => nomeAssistente === 'Eva' ? t : t.replace(/\bEva\b/g, 'assistente');
  const card = (c: InsightCard) => `
    <div>
      <p>${escapeHtml(c.texto)}</p>
      ${c.cta
        ? `<form action="/dashboard/clientes/eva-action" method="post">
             <input type="hidden" name="action" value="${escapeHtml(c.cta.action)}">
             <input type="hidden" name="lead_id" value="${escapeHtml(String(c.cta.params?.lead_id ?? ''))}">
             <input type="hidden" name="extra" value="${escapeHtml(JSON.stringify(c.cta.params))}">
             <button class="cc-btn cc-btn-sm">${escapeHtml(rotulo(c.cta.label))}</button>
           </form>`
        : `<small>Ação indisponível: o cliente pediu pra não receber mensagens.</small>`}
    </div>`;
  return `<div class="cc-cl-ins" aria-label="${escapeHtml(nomeAssistente)} sugere">${insights.map(card).join('')}</div>`;
}

function renderDados(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'residencial', label: 'Residencial' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'rural', label: 'Rural' },
  ];
  const ESTADOS_CIVIS = [
    { id: 'solteiro', label: 'Solteiro(a)' },
    { id: 'casado', label: 'Casado(a)' },
    { id: 'uniao_estavel', label: 'União estável' },
    { id: 'divorciado', label: 'Divorciado(a)' },
    { id: 'separado', label: 'Separado(a)' },
    { id: 'viuvo', label: 'Viúvo(a)' },
  ];
  const TARIFA_CLASSES = [
    { id: 'B1', label: 'B1 — Residencial' },
    { id: 'B2', label: 'B2 — Rural' },
    { id: 'B3', label: 'B3 — Demais (Comercial BT)' },
    { id: 'B4', label: 'B4 — Iluminação pública' },
    { id: 'A4', label: 'A4 — Comercial/Industrial AT' },
    { id: 'A3', label: 'A3 — Industrial AT' },
  ];
  const TARIFA_MODALIDADES = [
    { id: 'convencional', label: 'Convencional' },
    { id: 'branca', label: 'Branca' },
    { id: 'verde', label: 'Verde (Horosazonal)' },
    { id: 'azul', label: 'Azul (Horosazonal)' },
  ];
  const INSTALLATION_STATUSES = [
    { id: 'novo', label: 'Novo lead' },
    { id: 'qualificando', label: 'Qualificando' },
    { id: 'qualificado', label: 'Qualificado' },
    { id: 'proposta_aceita', label: 'Proposta aceita' },
    { id: 'contrato_assinado', label: 'Contrato assinado' },
    { id: 'instalado', label: 'Instalado' },
    { id: 'medidor_trocado', label: 'Medidor trocado' },
    { id: 'operando', label: 'Operando' },
    { id: 'pos_venda_concluido', label: 'Pós-venda concluído' },
  ];
  const FORMAS_PG = [
    { id: 'cartao', label: 'Cartão' },
    { id: 'boleto', label: 'Boleto' },
    { id: 'a_vista', label: 'À vista' },
    { id: 'financiamento', label: 'Financiamento' },
  ];
  const BANCOS = [
    { id: 'bv', label: 'BV' },
    { id: 'solfacil', label: 'Sol Fácil' },
    { id: 'solagora', label: 'Sol Agora' },
    { id: 'santander', label: 'Santander' },
    { id: 'btg', label: 'BTG Pactual' },
    { id: 'outro', label: 'Outro' },
  ];

  const opt = (v: string, label: string, sel?: string | null) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const num = (v: number | null | undefined) => (v ?? '') === '' ? '' : escapeHtml(String(v));

  return `
    <form id="form-dados" action="/dashboard/clientes/${escapeHtml(d.id)}/edit" method="post" class="cc-form cc-cl-dados">
      <fieldset>
        <legend>Identificação</legend>
        <div class="cc-cl-g">
          <input name="name" value="${escapeHtml(d.name ?? '')}" placeholder="Nome completo" aria-label="Nome completo" class="cc-cl-tudo">
          <input name="cpf_cnpj" value="${escapeHtml(d.cpf_cnpj ?? '')}" placeholder="CPF/CNPJ (só números)" aria-label="CPF/CNPJ">
          <input type="date" name="data_nascimento" value="${escapeHtml(d.data_nascimento ?? '')}" aria-label="Data de nascimento">
          <select name="profile" aria-label="Tipo">
            ${opt('', '— Tipo —', d.profile)}${TIPOS.map(t => opt(t.id, t.label, d.profile)).join('')}
          </select>
          <select name="estado_civil" aria-label="Estado civil">
            ${opt('', '— Estado civil —', d.estado_civil)}${ESTADOS_CIVIS.map(e => opt(e.id, e.label, d.estado_civil)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend>Contato</legend>
        <div class="cc-cl-g">
          <input name="phone" value="${escapeHtml(d.phone)}" placeholder="WhatsApp" aria-label="WhatsApp">
          <input name="email" type="email" value="${escapeHtml(d.email ?? '')}" placeholder="E-mail" aria-label="E-mail">
        </div>
      </fieldset>

      <fieldset class="cc-cl-cheia">
        <legend>Endereço</legend>
        <div class="cc-cl-g6">
          <input name="cep" value="${escapeHtml(d.cep ?? '')}" placeholder="CEP" aria-label="CEP">
          <input name="endereco_rua" value="${escapeHtml(d.endereco_rua ?? '')}" placeholder="Rua" aria-label="Rua" class="cc-cl-s3">
          <input name="endereco_numero" value="${escapeHtml(d.endereco_numero ?? '')}" placeholder="Nº" aria-label="Número">
          <input name="endereco_complemento" value="${escapeHtml(d.endereco_complemento ?? '')}" placeholder="Compl." aria-label="Complemento">
          <input name="neighborhood" value="${escapeHtml(d.neighborhood ?? '')}" placeholder="Bairro" aria-label="Bairro" class="cc-cl-s2">
          <input name="city" list="cidades-df-go" value="${escapeHtml(d.city ?? '')}" placeholder="Cidade" aria-label="Cidade" class="cc-cl-s2">
          <input name="uf" value="${escapeHtml(d.uf ?? '')}" placeholder="UF" maxlength="2" aria-label="UF">
        </div>
      </fieldset>

      <fieldset>
        <legend>Concessionária e UC</legend>
        <div class="cc-cl-g">
          <select name="concessionaria" aria-label="Concessionária" class="cc-cl-tudo">
            ${opt('', '— Concessionária —', d.concessionaria)}${CONCESSIONARIAS_BR.map(c => opt(c.id, c.nome, d.concessionaria)).join('')}
          </select>
          <input name="uc_numero" value="${escapeHtml(d.uc_numero ?? '')}" placeholder="UC (nº instalação)" aria-label="UC">
          <select name="tarifa_classe" aria-label="Classe tarifária">
            ${opt('', '— Classe tarifária —', d.tarifa_classe)}${TARIFA_CLASSES.map(t => opt(t.id, t.label, d.tarifa_classe)).join('')}
          </select>
          <select name="tarifa_modalidade" aria-label="Modalidade tarifária" class="cc-cl-tudo">
            ${opt('', '— Modalidade tarifária —', d.tarifa_modalidade)}${TARIFA_MODALIDADES.map(t => opt(t.id, t.label, d.tarifa_modalidade)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend>Consumo e pagamento</legend>
        <div class="cc-cl-g">
          <input type="text" inputmode="decimal" name="consumo_medio_kwh" value="${num(d.consumo_medio_kwh)}" placeholder="Consumo médio (kWh/mês, ex: 1300)" aria-label="Consumo médio" class="js-num">
          <input type="text" inputmode="decimal" name="conta_media_brl" value="${num(d.conta_media_brl)}" placeholder="Conta média (R$/mês, ex: 1560)" aria-label="Conta média" class="js-num">
          <select name="forma_pagamento" aria-label="Forma de pagamento">
            ${opt('', '— Forma de pagamento —', d.forma_pagamento)}${FORMAS_PG.map(f => opt(f.id, f.label, d.forma_pagamento)).join('')}
          </select>
          <select name="banco_financiamento" aria-label="Banco do financiamento">
            ${opt('', '— Banco do financiamento —', d.banco_financiamento)}${BANCOS.map(b => opt(b.id, b.label, d.banco_financiamento)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset class="cc-cl-cheia">
        <legend>Rateio de créditos (consumidor)</legend>
        <label class="cc-cl-check">
          <input type="checkbox" name="eh_consumidor_rateio" value="true" ${d.eh_consumidor_rateio ? 'checked' : ''}>
          Este cliente recebe créditos de uma UC geradora
        </label>
        <div class="cc-cl-g3">
          <input name="uc_geradora_lead_id" value="${escapeHtml(d.uc_geradora_lead_id ?? '')}" placeholder="UC geradora (lead_id)" aria-label="UC geradora">
          <input type="text" inputmode="decimal" name="percentual_rateio" value="${num(d.percentual_rateio)}" placeholder="% rateio (0-100, vírgula ok)" aria-label="Percentual do rateio" class="js-num">
          <input type="text" inputmode="decimal" name="credito_esperado_kwh" value="${num(d.credito_esperado_kwh)}" placeholder="Crédito esperado kWh" aria-label="Crédito esperado" class="js-num">
        </div>
      </fieldset>

      <fieldset class="cc-cl-cheia">
        <legend>Comercial e observações</legend>
        <div class="cc-cl-g3">
          <input name="vendedor_responsavel" value="${escapeHtml(d.vendedor_responsavel ?? '')}" placeholder="Vendedor responsável" aria-label="Vendedor responsável">
          <input name="lead_source" value="${escapeHtml(d.lead_source ?? '')}" placeholder="Origem (CTWA, indicação, orgânico...)" aria-label="Origem">
          <select name="installation_status" aria-label="Situação">
            ${opt('', '— Status —', d.installation_status)}${INSTALLATION_STATUSES.map(s => opt(s.id, s.label, d.installation_status)).join('')}
          </select>
          <textarea name="observacoes_perfil" placeholder="Observações livres" aria-label="Observações" rows="3" class="cc-cl-tudo">${escapeHtml(d.observacoes_perfil ?? '')}</textarea>
        </div>
      </fieldset>

      <div class="cc-cl-cheia">${botao({ rotulo: 'Salvar dados', tipo: 'submit', icone: 'check' })}</div>
    </form>`;
}

function renderAnexos(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'parecer_acesso', label: 'Parecer de acesso' },
    { id: 'foto_telhado', label: 'Foto telhado' },
    { id: 'foto_instalacao', label: 'Foto instalação' },
    { id: 'foto_inversor', label: 'Foto inversor' },
    { id: 'foto_visita_tecnica', label: 'Visita técnica' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'outros', label: 'Outros' },
  ];
  const rotuloTipo = (t: string) => TIPOS.find((x) => x.id === t)?.label ?? t;
  const items = d.anexos.map(a => `
    <div class="cc-cl-anx-it">
      <a href="${escapeHtml(a.signed_url ?? '#')}" target="_blank" rel="noopener">
        <b aria-hidden="true">${a.mime_type?.startsWith('image/') ? '🖼' : a.mime_type === 'application/pdf' ? '📄' : '📁'}</b>
        <span>${escapeHtml(rotuloTipo(a.tipo))}</span>
      </a>
      <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos/${escapeHtml(a.id)}" method="post" onsubmit="return confirm('Remover este anexo?')">
        <input type="hidden" name="_method" value="delete">
        <button class="cc-btn cc-btn-sm cc-btn-crit" title="Remover anexo" aria-label="Remover anexo">×</button>
      </form>
    </div>`).join('');

  const upload = `
    <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos" method="post" enctype="multipart/form-data" class="cc-form cc-cl-anx-up">
      <input type="file" name="file" required accept="image/*,application/pdf" id="anexo_file" aria-label="Arquivo">
      <button type="button" onclick="var i=document.getElementById('anexo_file');i.setAttribute('capture','environment');i.setAttribute('accept','image/*');i.click();i.removeAttribute('capture');i.setAttribute('accept','image/*,application/pdf')" class="cc-btn cc-btn-sm">📷 Tirar foto</button>
      <select name="tipo" required aria-label="Tipo do anexo">
        ${TIPOS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
      </select>
      <input name="descricao" placeholder="Descrição (opcional)" aria-label="Descrição">
      <button class="cc-btn cc-btn-sm">＋ Adicionar</button>
    </form>`;

  return `<div class="cc-cl-anx">${items}${upload}</div>`;
}

function renderPropostas(d: ClienteDetail): string {
  const nova = botao({ rotulo: 'Nova proposta', href: `/dashboard/propostas/novo?lead_id=${d.id}`, tamanho: 'sm', icone: 'file' });
  if (d.propostas.length === 0) {
    return `${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma proposta gerada ainda.', icone: 'file', compacto: true })}<div class="cc-cl-lnk">${nova}</div>`;
  }
  return tabela({
    mobile: 'cartoes',
    colunas: [{ titulo: 'Nº' }, { titulo: 'Data' }, { titulo: 'Valor', alinhar: 'dir', num: true }, { titulo: 'Acessos', alinhar: 'dir', num: true }, { titulo: 'Situação' }, { titulo: '' }],
    linhas: d.propostas.map((p) => [
      { html: celulaDupla(p.numero_proposta, null, `/dashboard/propostas/${p.slug}/preview`) },
      dataBR(p.created_at),
      p.valor_total_brl ? `R$ ${fmtBR(p.valor_total_brl)}` : null,
      `${p.acessos} acesso${p.acessos === 1 ? '' : 's'}`,
      { html: p.cliente_respondeu_at ? pilulaStatus('normal', 'Respondeu') : pilulaStatus('sem_dado', '—') },
      { html: botao({ rotulo: 'Reabrir', href: `/dashboard/propostas/${p.slug}/preview`, tamanho: 'sm' }) },
    ]),
  });
}

function renderLinhaDoTempo(d: ClienteDetail): string {
  type Ev = { data: string; texto: string; tom: Tom };
  const evs: Ev[] = [];
  evs.push({ data: d.created_at, texto: `Lead via ${d.acquisition_source ?? d.lead_source ?? 'orgânico'}`, tom: 'sem_dado' });
  for (const p of d.propostas) evs.push({ data: p.created_at, texto: `Proposta ${p.numero_proposta}${p.valor_total_brl ? ' · R$ ' + fmtBR(p.valor_total_brl) : ''}`, tom: 'info' });
  if (d.installed_at) evs.push({ data: d.installed_at + 'T00:00:00Z', texto: `Instalação concluída${d.sistema ? ' · ' + d.sistema.apelido : ''}`, tom: 'normal' });
  for (const a of d.alertas_ativos) evs.push({ data: a.primeiro_visto_em, texto: a.texto, tom: a.severidade === 'urgente' ? 'critico' : a.severidade === 'aviso' ? 'atencao' : 'normal' });

  evs.sort((a, b) => b.data.localeCompare(a.data));
  const items = evs.slice(0, 20).map(e => `
    <div>${pontoStatus(e.tom)}<time>${escapeHtml(dataBR(e.data))}</time><span>${escapeHtml(e.texto)}</span></div>`).join('');
  return items ? `<div class="cc-cl-tl">${items}</div>` : estadoVazio({ tipo: 'vazio', titulo: 'Sem eventos.', compacto: true });
}

function renderConversa(d: ClienteDetail, nomeAssistente: string): string {
  if (d.conversas_recentes.length === 0) {
    return estadoVazio({ tipo: 'vazio', titulo: 'Sem mensagens recentes.', icone: 'wa', compacto: true });
  }
  const quem = (role: string) => role === 'user' ? 'Cliente' : role === 'assistant' ? nomeAssistente : role;
  const items = d.conversas_recentes.map(m => `
    <div${m.role === 'user' ? ' class="cc-cl-cli"' : ''}>
      <small>${escapeHtml(quem(m.role))} · ${escapeHtml((m.timestamp ?? '').slice(0, 16).replace('T', ' '))}</small>
      ${escapeHtml(m.content)}
    </div>`).join('');
  return `<div class="cc-cl-msg">${items}</div><a href="/dashboard/leads/${escapeHtml(d.id)}" class="cc-cl-link">Ver conversa completa em Leads →</a>`;
}

function renderUsina(d: ClienteDetail): string {
  const s = d.sistema;
  if (!s) {
    return `${estadoVazio({ tipo: 'sem_dado', titulo: 'Nenhuma usina vinculada.', texto: 'Vincule a usina deste cliente no Monitoramento.', icone: 'sun', compacto: true })}`;
  }
  const item = (rot: string, val: string | null) => `<div><dt>${escapeHtml(rot)}</dt><dd>${val ? escapeHtml(val) : '—'}</dd></div>`;
  const saude = Math.round(s.ratio_ultimos_7d * 100);
  return `<dl class="cc-cl-usina">
      ${item('Usina', s.apelido)}
      ${item('Potência', s.potencia_kwp != null ? `${fmtBR(s.potencia_kwp, 1)} kWp` : null)}
      ${item('Inversor', s.marca_inversor || null)}
      ${item('Painéis', s.qtd_paineis != null ? `${s.qtd_paineis}${s.painel_marca ? ' · ' + s.painel_marca : ''}` : s.painel_marca)}
      ${item('Instalada em', dataBR(s.data_instalacao))}
      ${item('Geração 7 dias', `${fmtBR(s.geracao_7d_kwh)} kWh`)}
    </dl>
    <div class="cc-cl-lnk">${pilulaStatus(saude >= 90 ? 'normal' : saude >= 70 ? 'atencao' : 'critico', `Saúde ${saude}% do esperado (7 dias)`)}</div>`;
}

export function renderClienteDetailPage(d: ClienteDetail, insights: InsightCard[], user: DashUser | undefined): string {
  const concNome = d.concessionaria ? getConcessionariaById(d.concessionaria)?.nome ?? d.concessionaria : '—';
  const phoneClean = d.phone.replace(/\D/g, '');
  // Tenant nunca vê o nome da assistente da casa.
  const nomeAssistente = user?.companyId === ECOSUN_COMPANY_ID ? 'Eva' : 'Assistente';
  const nomeCliente = d.name || 'Sem nome';

  const acoesSecundarias = `
      ${d.archived_at
        ? `<form action="/dashboard/clientes/${escapeHtml(d.id)}/desarquivar" method="post">
            <button class="cc-btn">↩️ Restaurar</button>
          </form>`
        : `<form action="/dashboard/clientes/${escapeHtml(d.id)}/arquivar" method="post" data-nome="${escapeHtml(d.name ?? 'esse cadastro')}" onsubmit="return confirm('Arquivar ' + this.dataset.nome + '? Sai da lista ativa, mas historico fica intacto e da pra restaurar a qualquer hora.')">
            <button class="cc-btn">📦 Arquivar</button>
          </form>`}
      <form action="/dashboard/clientes/${escapeHtml(d.id)}/excluir" method="post" data-nome="${escapeHtml(d.name ?? 'esse cadastro')}" onsubmit="return confirm('Excluir ' + this.dataset.nome + ' PERMANENTEMENTE? Isso apaga propostas, conversas e anexos vinculados. Não dá pra desfazer.')">
        <button class="cc-btn cc-btn-crit">🗑 Excluir</button>
      </form>`;

  const acoes = `<div class="cc-cl-acoes">
    ${botao({ rotulo: 'Relatório pós-obra', href: `/dashboard/clientes/${d.id}/relatorio-pos-instalacao/novo`, tom: 'ouro', icone: 'doc-check' })}
    ${botao({ rotulo: 'Conversar', href: `https://wa.me/${phoneClean}`, icone: 'wa', attrs: { target: '_blank', rel: 'noopener' } })}
    ${menuAcoes({ alinhar: 'dir', itensHtml: acoesSecundarias })}
  </div>`;

  const insightsComLeadId = insights.map(i => ({
    ...i,
    cta: i.cta ? { ...i.cta, params: { ...(i.cta.params ?? {}), lead_id: d.id } } : null,
  }));

  const navAbas = abas({
    rotuloNav: 'Seções da ficha',
    itens: [
      { rotulo: 'Resumo', href: '#resumo', ativo: true },
      { rotulo: 'Usinas', href: '#usinas', selo: d.sistema ? 1 : null },
      { rotulo: 'Arquivos', href: '#arquivos', selo: d.anexos.length || null },
      { rotulo: 'Ações', href: '#acoes', selo: insights.length || null },
    ],
  });

  const colunaPrincipal = `
    <div class="cc-cl-col">
      <div id="resumo" class="cc-cl-col">
        ${cartaoSecao({ id: 'dados', titulo: 'Dados do cliente', dica: 'cadastro completo', corpoHtml: renderDados(d) })}
        ${cartaoSecao({ id: 'propostas', titulo: 'Propostas', dica: String(d.propostas.length), acoesHtml: d.propostas.length ? botao({ rotulo: 'Nova proposta', href: `/dashboard/propostas/novo?lead_id=${d.id}`, tamanho: 'sm', icone: 'plus' }) : '', corpoHtml: renderPropostas(d) })}
        ${cartaoSecao({ id: 'timeline', titulo: 'Linha do tempo', dica: 'do primeiro contato até hoje', corpoHtml: renderLinhaDoTempo(d) })}
      </div>
      <div id="arquivos">
        ${cartaoSecao({ id: 'anexos', titulo: 'Arquivos', dica: `${d.anexos.length} anexo${d.anexos.length === 1 ? '' : 's'} · fotos, contrato, parecer`, corpoHtml: renderAnexos(d) })}
      </div>
    </div>`;

  const colunaLateral = `
    <div class="cc-cl-col">
      ${cartaoSecao({ id: 'usinas', titulo: 'Usina', dica: d.sistema ? `${d.sistema.potencia_kwp != null ? fmtBR(d.sistema.potencia_kwp, 1) + ' kWp' : '—'} · ${d.sistema.marca_inversor || '—'}` : 'sem usina', corpoHtml: renderUsina(d) })}
      ${cartaoSecao({
        id: 'acoes', titulo: `${nomeAssistente} sugere`, dica: 'próximo passo com este cliente',
        corpoHtml: `${renderInsights(insightsComLeadId, nomeAssistente)}
          <div class="cc-cl-lnk">
            ${botao({ rotulo: 'Nova proposta', href: `/dashboard/propostas/novo?lead_id=${d.id}`, icone: 'file' })}
          </div>`,
      })}
      ${cartaoSecao({ id: 'conversa', titulo: 'Conversa recente', corpoHtml: renderConversa(d, nomeAssistente) })}
    </div>`;

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Clientes', href: '/dashboard/clientes' }, { rotulo: nomeCliente }],
    titulo: nomeCliente,
    subtitulo: `${[d.city, d.uf].filter(Boolean).join('-') || '—'} · Cliente desde ${(d.installed_at ?? d.created_at).slice(0, 7).split('-').reverse().join('/')} · ${concNome}`,
    seloHtml: `${pilulaSituacao(d.installation_status)}${d.archived_at ? pilulaStatus('sem_dado', 'Arquivado') : ''}`,
    acoesHtml: acoes,
  })}
<div class="cc-cl-jorn">${trilhaEtapas(FASES_JORNADA, indiceJornada(d.installation_status))}</div>
${renderKpis(d)}
${navAbas}
<div class="cc-cl-ficha">
  ${colunaPrincipal}
  ${colunaLateral}
</div>
${CIDADES_DATALIST_HTML}`;

  return layout(`Cliente — ${d.name ?? '?'}`, body, user, CEP_LOOKUP_SCRIPT);
}

// ============================================================
// A4-V2.1 — Form "Novo cliente" avulso
// ============================================================

export function renderFormNovoCliente(input: {
  erros?: string[];
  values?: {
    name?: string;
    phone?: string;
    email?: string;
    cpf_cnpj?: string;
    city?: string;
    uf?: string;
    concessionaria?: string;
    consumo_medio_kwh?: string;
    profile?: string;
  };
  user: DashUser | undefined;
}): string {
  const v = input.values ?? {};
  const errosHtml = (input.erros ?? []).length > 0
    ? `<div class="cc-aviso cc-aviso-erro cc-cl-erros" role="alert"><span>
         <strong>Corrija antes de criar:</strong>
         <ul>${input.erros!.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
       </span></div>`
    : '';

  const campo = (rotulo: string, dentro: string, tudo = false) =>
    `<label class="cc-campo${tudo ? ' cc-cl-tudo' : ''}"><span>${escapeHtml(rotulo)}</span>${dentro}</label>`;

  const form = `
      <form action="/dashboard/clientes/novo" method="post" class="cc-form cc-cl-form">
        ${campo('Nome completo *', `<input name="name" required value="${escapeHtml(v.name)}">`)}
        ${campo('Telefone (com DDD) *', `<input name="phone" required value="${escapeHtml(v.phone)}" placeholder="(61) 99999-9999">`)}
        ${campo('E-mail', `<input name="email" type="email" value="${escapeHtml(v.email)}">`)}
        ${campo('CPF/CNPJ', `<input name="cpf_cnpj" value="${escapeHtml(v.cpf_cnpj)}">`)}
        ${campo('Cidade', `<input name="city" value="${escapeHtml(v.city)}" placeholder="Brasília">`)}
        ${campo('UF', `<select name="uf">
              <option value="">—</option>
              <option value="DF" ${v.uf === 'DF' ? 'selected' : ''}>DF</option>
              <option value="GO" ${v.uf === 'GO' ? 'selected' : ''}>GO</option>
            </select>`)}
        ${campo('Concessionária', `<select name="concessionaria">
              <option value="">—</option>
              <option value="neoenergia-df" ${v.concessionaria === 'neoenergia-df' ? 'selected' : ''}>Neoenergia DF</option>
              <option value="equatorial-go" ${v.concessionaria === 'equatorial-go' ? 'selected' : ''}>Equatorial GO</option>
            </select>`)}
        ${campo('Consumo médio (kWh/mês)', `<input name="consumo_medio_kwh" type="number" step="1" value="${escapeHtml(v.consumo_medio_kwh)}">`)}
        ${campo('Tipo', `<select name="profile">
              ${['indefinido', 'residencial', 'comercial', 'rural', 'industrial'].map((t) => `<option value="${t}" ${(v.profile ?? 'indefinido') === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>`)}
        <div class="cc-cl-tudo cc-cl-acoes">
          ${botao({ rotulo: 'Criar cliente', tipo: 'submit', tom: 'ouro', icone: 'plus' })}
          <a href="/dashboard/clientes" class="cc-btn">Cancelar</a>
        </div>
      </form>`;

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Clientes', href: '/dashboard/clientes' }, { rotulo: 'Novo cliente' }],
    titulo: 'Novo cliente',
    subtitulo: 'Cadastro rápido. Depois você completa na ficha.',
    acoesHtml: botao({ rotulo: '← Voltar à lista', href: '/dashboard/clientes' }),
  })}
${errosHtml}
${cartaoSecao({ titulo: 'Dados do cliente', dica: '* obrigatório', corpoHtml: form })}`;
  return layout('Novo cliente', body, input.user, '', false);
}
