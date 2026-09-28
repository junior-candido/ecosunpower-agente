// src/modules/dashboard/mapa-usinas-views.ts
// Telas do Mapa das Usinas (28/09/2026) — padrão cc-, sem Tailwind:
//  - blocoMapaUsinas:      o mapa grande do Command Center (Brasília e entorno)
//  - blocoMiniMapaUsina:   mini-mapa com alfinete arrastável na tela da usina
//  - renderLocalizarUsinasPage: "Localizar usinas sem posição" (em lote, com progresso)
//
// O código que roda no navegador mora em ui/mapa-cliente.ts e é servido como
// arquivo com hash (ui/estatico.ts). MapLibre GL JS vem do jsDelivr com versão
// FIXA + SRI; tiles do OpenFreeMap (sem chave, atribuição no canto do mapa).

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { cabecalhoPagina, cartaoSecao, estadoVazio, icone } from './ui/componentes.js';
import { fmtNumero } from './ui/html.js';
import { URL_CSS_MAPA_USINAS, URL_JS_MAPA_USINAS, URL_JS_MAPA_USINA } from './ui/estatico.js';
import { centroDaCidade } from '../monitoring/geocodificacao.js';
import type { UsinaSemPosicao } from '../monitoring/usinas-posicao.js';

/** MapLibre GL JS — versão fixa + integridade (sha384 do arquivo publicado no npm). */
export const MAPLIBRE = {
  versao: '4.7.1',
  js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  jsSri: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj',
  css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  cssSri: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V',
} as const;

/** Estilos do OpenFreeMap (gratuito, sem chave). "fiord" = escuro azulado; "liberty" = claro com ruas. */
export const ESTILO_MAPA_ESCURO = 'https://tiles.openfreemap.org/styles/fiord';
export const ESTILO_MAPA_CLARO = 'https://tiles.openfreemap.org/styles/liberty';

export const URL_MAPA_JSON = '/dashboard/command-center/mapa.json';
export const URL_LOCALIZAR = '/dashboard/monitoramento/localizar';

const attrsMaplibre = () =>
  `data-ml-js="${escapeHtml(MAPLIBRE.js)}" data-ml-js-sri="${escapeHtml(MAPLIBRE.jsSri)}" data-ml-css="${escapeHtml(MAPLIBRE.css)}" data-ml-css-sri="${escapeHtml(MAPLIBRE.cssSri)}"`;

/** O mapa grande do Command Center. Os números chegam por JSON (mapa.json). */
export function blocoMapaUsinas(o: { podeLocalizar: boolean; tv?: boolean }): string {
  const dados = [
    `data-url="${URL_MAPA_JSON}"`,
    `data-estilo="${escapeHtml(ESTILO_MAPA_ESCURO)}"`,
    attrsMaplibre(),
    o.podeLocalizar ? `data-localizar="${URL_LOCALIZAR}"` : '',
    o.tv ? 'data-tv="1"' : '',
  ].filter(Boolean).join(' ');
  // Mesma casca do cartaoSecao (ui/componentes.ts), com os data-* do mapa.
  return `<link rel="stylesheet" href="${URL_CSS_MAPA_USINAS}">
<section class="cc-panel cc-mapa cc-a-mapa" id="cc-mapa-usinas" ${dados}>
  <div class="cc-ph"><h3>Mapa das usinas</h3><span class="cc-hint">Brasília e entorno · cor = estado agora</span><span class="cc-sp"></span><button type="button" class="cc-btn cc-btn-sm" data-acao="tela-cheia">Tela cheia</button></div>
  <div class="cc-mapa-top"><div class="cc-mapa-leg" aria-label="Legenda e contagem por estado"></div></div>
  <div class="cc-mapa-box"><div class="cc-mapa-canvas" role="region" aria-label="Mapa das usinas"></div><div class="cc-mapa-status">Carregando o mapa…</div></div>
  <div class="cc-mapa-aviso" hidden></div>
  <div class="cc-mapa-rod">${icone('clock', 'xs')}Atualiza sozinho a cada 5 minutos · clique num alfinete para ver a usina · grupos com número abrem ao clicar</div>
  <noscript><p class="cc-nota">O mapa precisa de JavaScript ligado.</p></noscript>
</section>
<script src="${URL_JS_MAPA_USINAS}" defer></script>`;
}

const ROTULO_FONTE: Record<string, { texto: string; classe: string }> = {
  endereco: { texto: 'Pelo endereço', classe: '' },
  api: { texto: 'Informada pela marca do inversor', classe: '' },
  manual: { texto: 'Ajustada à mão', classe: 'mu-fonte-manual' },
  cidade: { texto: 'Aproximada (centro da cidade)', classe: 'mu-fonte-cidade' },
};

export interface SistemaNoMapa {
  id: string;
  apelido: string;
  cidade: string | null;
  uf: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  geo_fonte?: string | null;
}

const numOuVazio = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
};

/** Mini-mapa da tela da usina (tela clara). Arrastar o alfinete salva a posição como "manual". */
export function blocoMiniMapaUsina(s: SistemaNoMapa, o: { podeEditar: boolean }): string {
  const lat = numOuVazio(s.lat);
  const lng = numOuVazio(s.lng);
  const tem = lat !== '' && lng !== '';
  const centro = centroDaCidade(s.cidade, s.uf) ?? { lat: -15.7939, lng: -47.8828 };
  const fonte = tem ? (ROTULO_FONTE[s.geo_fonte ?? ''] ?? { texto: 'Posição salva', classe: '' }) : { texto: 'Sem localização', classe: 'mu-fonte-nada' };
  const dica = !o.podeEditar
    ? (tem ? 'Posição da usina no mapa.' : 'Esta usina ainda não tem posição no mapa.')
    : tem
      ? (s.geo_fonte === 'cidade'
        ? 'O ponto é só o centro da cidade. Arraste o alfinete até o telhado da usina — salva na hora.'
        : 'Se o alfinete não estiver no telhado certo, arraste-o — salva na hora e não é trocado pela localização automática.')
      : 'Ainda sem posição. Clique em "Localizar pelo endereço" ou arraste o alfinete até a usina — salva na hora.';
  const id = encodeURIComponent(s.id);
  return `<link rel="stylesheet" href="${URL_CSS_MAPA_USINAS}">
<section class="mu-box" id="mu-mapa-usina" data-lat="${lat}" data-lng="${lng}" data-fonte="${escapeHtml(s.geo_fonte ?? '')}"
  data-centro-lat="${centro.lat}" data-centro-lng="${centro.lng}" data-pode-editar="${o.podeEditar ? '1' : '0'}"
  data-url-salvar="/dashboard/monitoramento/${id}/posicao" data-url-localizar="${URL_LOCALIZAR}/${id}"
  data-estilo="${escapeHtml(ESTILO_MAPA_CLARO)}" ${attrsMaplibre()}>
  <div class="mu-h"><b>📍 Localização no mapa</b><span class="mu-fonte ${fonte.classe}">${escapeHtml(fonte.texto)}</span></div>
  <div class="mu-map" role="region" aria-label="Mapa com a posição da usina"></div>
  <div class="mu-rod"><span class="mu-st">${escapeHtml(dica)}</span>${
    o.podeEditar && s.geo_fonte !== 'manual' ? '<button type="button" class="mu-btn" data-acao="localizar">Localizar pelo endereço</button>' : ''}</div>
</section>
<script src="${URL_JS_MAPA_USINA}" defer></script>`;
}

// ---------------------------------------------------------------------------
// Página: Localizar usinas sem posição (em lote, 1 por segundo, com progresso)
// ---------------------------------------------------------------------------

export interface LocalizarPageInput {
  pendentes: UsinaSemPosicao[];
  user: DashUser | undefined;
  /** Colunas do mapa ainda não existem no banco. */
  migracaoPendente?: boolean;
}

const CSS_LOCALIZAR = `
.cc-loc .cc-loc-top{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.cc-loc .cc-loc-n{font-family:var(--cc-f-num);font-size:34px;font-weight:600;color:var(--cc-gold-2);line-height:1}
.cc-loc .cc-loc-top p{margin:0;color:var(--cc-text-2);font-size:14px;max-width:62ch;line-height:1.5}
.cc-loc .cc-loc-bar{height:10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--cc-line);overflow:hidden;margin:14px 0 8px}
.cc-loc .cc-loc-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#F0A500,#fbbf24);transition:width .3s}
.cc-loc .cc-loc-st{font-size:13px;color:var(--cc-muted);min-height:20px}
.cc-loc .cc-loc-lista{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto}
.cc-loc .cc-loc-lista li{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.028);border:1px solid var(--cc-line);font-size:13px;color:var(--cc-text-2)}
.cc-loc .cc-loc-lista li b{color:var(--cc-text);font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-loc .cc-loc-lista li small{color:var(--cc-faint)}
.cc-loc .cc-loc-lista li[data-r="ok"] small{color:var(--cc-ok)}
.cc-loc .cc-loc-lista li[data-r="aprox"] small{color:var(--cc-warn)}
.cc-loc .cc-loc-lista li[data-r="erro"] small{color:var(--cc-crit)}
.cc-loc .cc-loc-acoes{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.cc-loc .cc-nota{font-size:12.5px;line-height:1.5;color:var(--cc-muted);margin:16px 0 0;max-width:90ch}
.cc-loc .cc-nota b{color:var(--cc-text-2)}
`;

export function renderLocalizarUsinasPage(p: LocalizarPageInput): string {
  const n = p.pendentes.length;
  const cab = cabecalhoPagina({
    titulo: 'Localizar usinas sem posição',
    trilha: [{ rotulo: 'Command Center', href: '/dashboard/command-center' }, { rotulo: 'Localizar usinas' }],
    subtitulo: 'Coloca no mapa as usinas que ainda não têm posição, pelo endereço do cliente. Quem foi ajustado à mão nunca é mexido.',
  });

  let corpo: string;
  if (p.migracaoPendente) {
    corpo = estadoVazio({ tipo: 'sem_dado', titulo: 'Falta uma atualização do banco', texto: 'O banco ainda não tem onde guardar a posição das usinas (migration 145). Fale com o suporte.' });
  } else if (!n) {
    corpo = estadoVazio({ tipo: 'vazio', titulo: 'Todas as usinas ativas já estão no mapa', texto: 'Se algum alfinete estiver no lugar errado, abra a usina e arraste o alfinete.' });
  } else {
    const itens = p.pendentes.map((u) => `<li data-id="${escapeHtml(u.id)}"><b>${escapeHtml(u.apelido)}</b><small>${escapeHtml([u.cidade, u.uf].filter(Boolean).join('/') || 'sem cidade')}</small></li>`).join('');
    corpo = `<div class="cc-loc-top"><span class="cc-loc-n">${escapeHtml(fmtNumero(n))}</span>
        <p>${n === 1 ? 'usina ativa está' : 'usinas ativas estão'} sem posição no mapa. A busca vai uma por uma (cerca de 1 por segundo, regra do serviço de endereços). Pode deixar a página aberta e seguir trabalhando em outra aba.</p></div>
      <div class="cc-loc-acoes">
        <button type="button" class="cc-btn cc-btn-gold" data-acao="localizar-todas">${icone('search', 'sm')}Localizar agora</button>
        <a class="cc-btn" href="/dashboard/command-center#cc-mapa-usinas">Ver o mapa</a>
      </div>
      <div class="cc-loc-bar" aria-hidden="true"><i></i></div>
      <div class="cc-loc-st" role="status">Pronto para começar.</div>
      <ul class="cc-loc-lista">${itens}</ul>`;
  }

  const nota = `<p class="cc-nota">Como funciona: primeiro tenta o endereço do cliente (rua e número); se não achar, usa o centro da cidade e marca como <b>aproximada</b> — aí é só abrir a usina e arrastar o alfinete. A busca usa o OpenStreetMap (Nominatim), gratuito e com limite de uso: por isso vai devagar. Endereço de condomínio/chácara costuma cair no centro do bairro.</p>`;

  const script = n && !p.migracaoPendente ? `<script>
(function () {
  var btn = document.querySelector('[data-acao="localizar-todas"]');
  var bar = document.querySelector('.cc-loc-bar i');
  var st = document.querySelector('.cc-loc-st');
  var itens = Array.prototype.slice.call(document.querySelectorAll('.cc-loc-lista li'));
  if (!btn) return;
  function marcar(li, r, txt) { li.setAttribute('data-r', r); li.querySelector('small').textContent = txt; }
  btn.addEventListener('click', function () {
    btn.disabled = true;
    var feitos = 0, achados = 0, aprox = 0, falhas = 0, i = 0;
    function proximo() {
      if (i >= itens.length) {
        st.textContent = 'Pronto: ' + achados + ' pelo endereço, ' + aprox + ' aproximadas (centro da cidade), ' + falhas + ' sem posição.';
        btn.disabled = false; btn.lastChild.textContent = 'Tentar de novo as que faltaram';
        itens = itens.filter(function (li) { return li.getAttribute('data-r') === 'erro'; });
        return;
      }
      var li = itens[i++];
      st.textContent = 'Procurando ' + (feitos + 1) + ' de ' + itens.length + '…';
      li.scrollIntoView({ block: 'nearest' });
      fetch('${URL_LOCALIZAR}/' + encodeURIComponent(li.getAttribute('data-id')), { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, motivo: 'resposta inválida' }; }); })
        .then(function (j) {
          if (j.ok && j.pulada) { marcar(li, 'ok', 'mantida (' + (j.motivo || 'já tinha posição') + ')'); achados++; }
          else if (j.ok && j.fonte === 'cidade') { marcar(li, 'aprox', 'aproximada — centro da cidade'); aprox++; }
          else if (j.ok) { marcar(li, 'ok', j.fonte === 'api' ? 'pela marca do inversor' : 'pelo endereço ✓'); achados++; }
          else { marcar(li, 'erro', j.motivo || 'não achei'); falhas++; if (j.limite) { i = itens.length; st.textContent = 'O serviço de endereços pediu uma pausa. Tente de novo em alguns minutos.'; } }
        })
        .catch(function () { marcar(li, 'erro', 'sem resposta do servidor'); falhas++; })
        .then(function () { feitos++; bar.style.width = Math.round((feitos / itens.length) * 100) + '%'; proximo(); });
    }
    proximo();
  });
})();
</script>` : '';

  const body = `<div class="cc-root cc-loc">
  ${cab}
  <div class="cc-wrap">
    ${cartaoSecao({ titulo: 'Usinas sem posição', dica: 'só as desta empresa', corpoHtml: corpo + nota })}
  </div>
</div>
<style>${CSS_LOCALIZAR}</style>
${script}`;
  return renderLayout({ active: 'monitoramento', title: 'Localizar usinas', body, dark: true, largo: true, user: p.user, tailwind: false });
}
