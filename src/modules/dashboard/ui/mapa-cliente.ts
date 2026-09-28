// src/modules/dashboard/ui/mapa-cliente.ts
// Código que roda no NAVEGADOR para o Mapa das Usinas (28/09/2026):
//  - JS_MAPA_USINAS: mapa do Command Center (alfinetes, agrupamento, cartão, legenda, tela cheia)
//  - JS_MAPA_USINA:  mini-mapa da tela da usina (alfinete arrastável → salva "manual")
//  - CSS_MAPA_USINAS: visual dos dois (tema escuro cc-, cartão, mini-mapa claro)
// Servidos como ARQUIVO com hash no nome (ui/estatico.ts), cache de 1 ano.
//
// MapLibre GL JS é baixado do jsDelivr com versão FIXA e SRI (integridade),
// só quando o mapa entra na tela. Tiles: OpenFreeMap (sem chave; atribuição
// © OpenStreetMap/OpenMapTiles/OpenFreeMap aparece no canto do mapa).
//
// Regra: dado do banco entra no DOM só por textContent (nunca innerHTML).
// Sem crases nem "${" aqui dentro (é texto dentro de template string).

export const CSS_MAPA_USINAS = String.raw`
.cc-mapa{position:relative}
.cc-mapa .cc-mapa-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-2px 0 12px}
.cc-mapa .cc-mapa-leg{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0}
.cc-mapa .cc-mapa-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 9px;border-radius:999px;background:rgba(0,0,0,.22);border:1px solid var(--cc-line);color:var(--cc-text-2);white-space:nowrap}
.cc-mapa .cc-mapa-chip b{font-family:var(--cc-f-num);color:var(--cc-text);font-weight:600}
.cc-mapa .cc-mapa-chip i{width:9px;height:9px;border-radius:50%;display:inline-block;box-shadow:0 0 0 3px rgba(255,255,255,.04)}
.cc-mapa .cc-mapa-box{position:relative;height:540px;border-radius:14px;overflow:hidden;border:1px solid var(--cc-line-2);background:radial-gradient(ellipse at 50% 40%,#16304F 0%,#0A1729 70%)}
.cc-mapa .cc-mapa-canvas{position:absolute;inset:0}
.cc-mapa .cc-mapa-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--cc-muted);font-size:13.5px;pointer-events:none}
.cc-mapa .cc-mapa-status[hidden]{display:none}
.cc-mapa .cc-mapa-aviso{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(251,191,36,.07);border:1px dashed rgba(251,191,36,.35);font-size:13px;color:var(--cc-text-2)}
.cc-mapa .cc-mapa-aviso[hidden]{display:none}
.cc-mapa .cc-mapa-aviso b{color:var(--cc-gold-2)}
.cc-mapa .cc-mapa-aviso .cc-btn{margin-left:auto}
.cc-mapa .cc-mapa-rod{display:flex;gap:10px;align-items:center;margin-top:8px;font-size:11.5px;color:var(--cc-faint)}
.cc-mapa:fullscreen{background:var(--cc-bg);padding:18px;display:flex;flex-direction:column}
.cc-mapa:fullscreen .cc-mapa-box{flex:1;height:auto}
.cc-mapa .maplibregl-ctrl-group{background:rgba(15,33,56,.92);border:1px solid var(--cc-line-2);box-shadow:none}
.cc-mapa .maplibregl-ctrl-group button+button{border-top:1px solid var(--cc-line-2)}
.cc-mapa .maplibregl-ctrl button .maplibregl-ctrl-icon{filter:invert(1) brightness(1.4)}
.cc-mapa .maplibregl-ctrl-attrib{background:rgba(10,23,41,.72);color:var(--cc-muted);font-size:10.5px}
.cc-mapa .maplibregl-ctrl-attrib a{color:var(--cc-text-2)}
.cc-mapa .maplibregl-ctrl-attrib-button{filter:invert(1)}
.cc-mapa .maplibregl-cooperative-gesture-screen{background:rgba(10,23,41,.72);color:#EAF1F8;font-size:15px}
.cc-mapa .maplibregl-popup-content{background:#0F2138;color:var(--cc-text);border:1px solid rgba(150,185,225,.22);border-radius:14px;padding:14px 16px 14px;box-shadow:0 18px 40px rgba(0,0,0,.45);min-width:250px;max-width:300px}
.cc-mapa .maplibregl-popup-tip{border-top-color:#0F2138;border-bottom-color:#0F2138}
.cc-mapa .maplibregl-popup-close-button{color:var(--cc-muted);font-size:20px;right:6px;top:4px}
.cc-mp-h{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.cc-mp-h i{width:9px;height:9px;border-radius:50%;display:inline-block}
.cc-mp-t{display:block;font-size:16px;font-weight:600;line-height:1.25;margin:6px 18px 2px 0;color:#fff}
.cc-mp-s{font-size:12.5px;color:var(--cc-muted);margin-bottom:10px}
.cc-mp-g{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:10px}
.cc-mp-g div{min-width:0}
.cc-mp-g span{display:block;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--cc-faint)}
.cc-mp-g b{display:block;font-family:var(--cc-f-num);font-size:14.5px;font-weight:600;color:var(--cc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-mp-al{font-size:12px;line-height:1.4;color:var(--cc-text-2);background:rgba(228,87,75,.1);border:1px solid rgba(228,87,75,.25);border-radius:9px;padding:7px 9px;margin-bottom:10px}
.cc-mp-ap{font-size:11.5px;color:var(--cc-faint);margin-bottom:10px}
.cc-mp .cc-btn{width:100%;justify-content:center}
@media (max-width:760px){
  .cc-mapa .cc-mapa-box{height:400px}
  .cc-mapa .maplibregl-popup-content{min-width:0;max-width:260px}
}

/* Mini-mapa da tela da usina (tela clara antiga) */
.mu-box{background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,.08);padding:18px;margin-bottom:24px}
.mu-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.mu-h b{font-size:16px;font-weight:600;color:#0f172a}
.mu-fonte{font-size:12px;padding:3px 9px;border-radius:999px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}
.mu-fonte-manual{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
.mu-fonte-cidade,.mu-fonte-nada{background:#fffbeb;color:#b45309;border-color:#fde68a}
.mu-map{position:relative;height:300px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#eef2f6}
.mu-rod{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:13px;color:#475569}
.mu-rod .mu-st{flex:1;min-width:200px}
.mu-st-ok{color:#047857;font-weight:600}
.mu-st-erro{color:#b91c1c;font-weight:600}
.mu-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer}
.mu-btn:hover{background:#f8fafc}
.mu-btn[disabled]{opacity:.5;cursor:default}
.mu-pino{width:34px;height:46px;cursor:grab}
.mu-pino:active{cursor:grabbing}
`;

/** Mapa do Command Center. Lê a config dos atributos data-* do bloco. */
export const JS_MAPA_USINAS = String.raw`(function () {
  'use strict';
  var raiz = document.getElementById('cc-mapa-usinas');
  if (!raiz) return;
  var cfg = raiz.dataset;
  var caixa = raiz.querySelector('.cc-mapa-canvas');
  var stEl = raiz.querySelector('.cc-mapa-status');
  var legEl = raiz.querySelector('.cc-mapa-leg');
  var avisoEl = raiz.querySelector('.cc-mapa-aviso');
  var btnCheia = raiz.querySelector('[data-acao="tela-cheia"]');
  var TV = cfg.tv === '1';
  var CORES = { normal: '#3DBB6E', atencao: '#F2862E', critico: '#E4574B', sem_comunicacao: '#8FA3BC', sem_monitoramento: '#5E7792' };
  var ROTULO = { normal: 'Gerando bem', atencao: 'Abaixo do esperado', critico: 'Parada', sem_comunicacao: 'Sem comunicação', sem_monitoramento: 'Sem dado (leitura manual)' };
  var ORDEM = ['critico', 'sem_comunicacao', 'atencao', 'normal', 'sem_monitoramento'];
  // Brasília + entorno (DF e cidades de GO em volta): enquadramento padrão.
  var ENTORNO = [[-48.45, -16.3], [-47.3, -15.45]];
  var mapa = null;
  var popup = null;

  function status(txt) {
    if (!stEl) return;
    if (!txt) { stEl.hidden = true; return; }
    stEl.hidden = false;
    stEl.textContent = txt;
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = String(txt);
    return e;
  }
  function num(v, casas) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }
  function energia(kwh) {
    if (kwh === null || kwh === undefined) return '—';
    if (Math.abs(kwh) >= 1000) return num(kwh / 1000, kwh >= 10000 ? 1 : 2) + ' MWh';
    return num(kwh, kwh < 100 ? 1 : 0) + ' kWh';
  }
  function quando(iso) {
    if (!iso) return 'nunca';
    var t = Date.parse(iso);
    if (!isFinite(t)) return '—';
    var min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 48) return 'há ' + h + ' h';
    return 'há ' + Math.round(h / 24) + ' dias';
  }

  function carregarJs(src, sri) {
    return new Promise(function (ok, falha) {
      if (window.maplibregl) { ok(); return; }
      var s = document.createElement('script');
      s.src = src; if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; }
      s.onload = function () { ok(); }; s.onerror = function () { falha(new Error('js')); };
      document.head.appendChild(s);
    });
  }
  function carregarCss(href, sri) {
    if (document.querySelector('link[data-maplibre]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-maplibre', '1');
    if (sri) { l.integrity = sri; l.crossOrigin = 'anonymous'; }
    document.head.appendChild(l);
  }
  function webgl() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  function legenda(d) {
    if (!legEl) return;
    legEl.textContent = '';
    ORDEM.forEach(function (e) {
      var n = ((d.porEstadoNoMapa || d.porEstado) || {})[e] || 0;
      if (!n && (e === 'sem_monitoramento' || e === 'critico')) return;
      var c = el('span', 'cc-mapa-chip');
      var i = el('i'); i.style.background = CORES[e]; c.appendChild(i);
      c.appendChild(document.createTextNode(ROTULO[e] + ' '));
      c.appendChild(el('b', null, num(n)));
      legEl.appendChild(c);
    });
  }
  function aviso(d) {
    if (!avisoEl) return;
    avisoEl.textContent = '';
    if (d.migracaoPendente) {
      avisoEl.appendChild(el('span', null, 'O mapa precisa de uma atualização do banco para guardar a posição das usinas (migration 145). Fale com o suporte.'));
      avisoEl.hidden = false; return;
    }
    if (!d.semPosicao) { avisoEl.hidden = true; return; }
    var t = el('span');
    t.appendChild(el('b', null, num(d.semPosicao) + (d.semPosicao === 1 ? ' usina sem localização' : ' usinas sem localização')));
    var nomes = (d.semPosicaoNomes || []).join(', ');
    if (nomes) t.appendChild(document.createTextNode(' — ' + nomes + (d.semPosicao > (d.semPosicaoNomes || []).length ? ' e outras' : '') + '.'));
    avisoEl.appendChild(t);
    if (cfg.localizar) {
      var a = el('a', 'cc-btn cc-btn-sm cc-btn-gold', 'Localizar');
      a.href = cfg.localizar; avisoEl.appendChild(a);
    } else {
      avisoEl.appendChild(el('span', null, 'Peça a um administrador para localizar.'));
    }
    avisoEl.hidden = false;
  }

  function geojson(d) {
    return {
      type: 'FeatureCollection',
      features: (d.usinas || []).map(function (u) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [u.lng, u.lat] }, properties: { id: u.id, estado: u.estado, nome: u.nome, u: JSON.stringify(u) } };
      }),
    };
  }

  // Alfinete desenhado no canvas (um por cor), em alta resolução.
  function imagemPino(cor) {
    var r = window.devicePixelRatio > 1 ? 2 : 1;
    var w = 30 * r, h = 40 * r;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.scale(r, r);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    g.beginPath();
    g.moveTo(15, 38);
    g.bezierCurveTo(13, 31, 3, 24, 3, 14);
    g.arc(15, 14, 12, Math.PI, 0);
    g.bezierCurveTo(27, 24, 17, 31, 15, 38);
    g.closePath();
    g.fillStyle = cor; g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
    g.beginPath(); g.arc(15, 14, 4.6, 0, Math.PI * 2); g.fillStyle = '#0F2138'; g.fill();
    return { img: g.getImageData(0, 0, w, h), r: r };
  }

  // Deixa o estilo "fiord" no azul-marinho do painel, nomes em português e
  // a divisa do DF em dourado.
  function tingir(m) {
    var pinta = function (id, prop, valor) { try { if (m.getLayer(id)) m.setPaintProperty(id, prop, valor); } catch (e) {} };
    pinta('background', 'background-color', '#0B1B2F');
    pinta('water', 'fill-color', '#0A2A4A');
    pinta('landuse_residential', 'fill-color', '#13294A');
    pinta('landuse_residential', 'fill-opacity', 0.55);
    pinta('park', 'fill-opacity', 0.12);
    pinta('landcover_wood', 'fill-opacity', 0.35);
    pinta('boundary_state', 'line-color', 'rgba(251,191,36,.55)');
    pinta('boundary_state', 'line-width', 1.4);
    var nomePt = ['coalesce', ['get', 'name:pt'], ['get', 'name']];
    (m.getStyle().layers || []).forEach(function (l) {
      if (l.type === 'symbol' && /^place_/.test(l.id)) {
        try { m.setLayoutProperty(l.id, 'text-field', nomePt); } catch (e) {}
        pinta(l.id, 'text-color', l.id === 'place_suburb' ? '#8CA3BC' : '#DCE7F3');
        pinta(l.id, 'text-halo-color', 'rgba(8,18,32,.9)');
        pinta(l.id, 'text-halo-width', 1.4);
      }
    });
  }

  function limitesDe(d) {
    var b = [[ENTORNO[0][0], ENTORNO[0][1]], [ENTORNO[1][0], ENTORNO[1][1]]];
    (d.usinas || []).forEach(function (u) {
      b[0][0] = Math.min(b[0][0], u.lng); b[0][1] = Math.min(b[0][1], u.lat);
      b[1][0] = Math.max(b[1][0], u.lng); b[1][1] = Math.max(b[1][1], u.lat);
    });
    return b;
  }

  function cartao(u) {
    var c = el('div', 'cc-mp');
    var h = el('div', 'cc-mp-h'); var i = el('i'); i.style.background = CORES[u.estado] || '#8FA3BC';
    h.appendChild(i); var r = el('span', null, ROTULO[u.estado] || ''); r.style.color = CORES[u.estado] || '#8FA3BC'; h.appendChild(r);
    c.appendChild(h);
    c.appendChild(el('b', 'cc-mp-t', u.nome));
    var sub = [u.cliente, [u.cidade, u.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    c.appendChild(el('div', 'cc-mp-s', sub || 'Sem cidade no cadastro'));
    var g = el('div', 'cc-mp-g');
    function item(rot, val) { var d = el('div'); d.appendChild(el('span', null, rot)); d.appendChild(el('b', null, val)); g.appendChild(d); }
    item('Potência', u.kwp === null ? '—' : num(u.kwp, u.kwp < 100 ? 2 : 1) + ' kWp');
    item('Hoje', energia(u.hojeKwh));
    item('No mês', energia(u.mesKwh));
    item('Do esperado', u.pctEsperado === null ? '—' : num(u.pctEsperado) + '% (7 dias)');
    item('Último sinal', quando(u.ultimaComunicacao));
    item('Inversor', u.marca || '—');
    c.appendChild(g);
    if (u.alerta && u.estado !== 'normal') c.appendChild(el('div', 'cc-mp-al', u.alerta));
    if (u.aproximada) c.appendChild(el('div', 'cc-mp-ap', 'Posição aproximada (centro da cidade). Ajuste na tela da usina.'));
    var a = el('a', 'cc-btn cc-btn-sm cc-btn-gold', 'Abrir usina →');
    a.href = u.href; c.appendChild(a);
    return c;
  }

  function montar(d) {
    var toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    mapa = new maplibregl.Map({
      container: caixa,
      style: cfg.estilo,
      bounds: limitesDe(d),
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
      cooperativeGestures: toque && !TV,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 17.5,
      minZoom: 4,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para aproximar o mapa',
        'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para aproximar o mapa',
        'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
        'NavigationControl.ZoomIn': 'Aproximar',
        'NavigationControl.ZoomOut': 'Afastar',
      },
    });
    raiz.ccMapa = mapa; // acesso pra depuração/tela do escritório
    mapa.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (!TV) mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapa.touchZoomRotate.disableRotation();
    // Ícone do estilo que não veio no sprite: vira transparente (sem aviso no console).
    mapa.on('styleimagemissing', function (e) {
      if (!mapa.hasImage(e.id)) mapa.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    mapa.on('error', function (e) {
      if (window.console) console.warn('[mapa]', e && e.error ? e.error.message : e);
      if (!carregou) status('Não consegui baixar o desenho do mapa agora. Tente de novo em alguns minutos.');
    });
    var carregou = false;
    mapa.on('load', function () {
      carregou = true;
      if ((d.usinas || []).length) status('');
      tingir(mapa);
      Object.keys(CORES).forEach(function (k) {
        var p = imagemPino(CORES[k]);
        mapa.addImage('pino-' + k, p.img, { pixelRatio: p.r });
      });
      var soma = function (estado) { return ['+', ['case', ['==', ['get', 'estado'], estado], 1, 0]]; };
      mapa.addSource('usinas', {
        type: 'geojson', data: geojson(d), cluster: true, clusterRadius: 44, clusterMaxZoom: 13,
        clusterProperties: { critico: soma('critico'), sem_comunicacao: soma('sem_comunicacao'), atencao: soma('atencao'), normal: soma('normal') },
      });
      var corGrupo = ['case',
        ['>', ['get', 'critico'], 0], CORES.critico,
        ['>', ['get', 'sem_comunicacao'], 0], CORES.sem_comunicacao,
        ['>', ['get', 'atencao'], 0], CORES.atencao,
        ['>', ['get', 'normal'], 0], CORES.normal,
        CORES.sem_monitoramento];
      var raio = ['step', ['get', 'point_count'], 17, 5, 21, 15, 26, 50, 32];
      mapa.addLayer({ id: 'grupo-halo', type: 'circle', source: 'usinas', filter: ['has', 'point_count'],
        paint: { 'circle-color': corGrupo, 'circle-radius': ['+', raio, 9], 'circle-opacity': 0.18, 'circle-blur': 0.35 } });
      mapa.addLayer({ id: 'grupo', type: 'circle', source: 'usinas', filter: ['has', 'point_count'],
        paint: { 'circle-color': corGrupo, 'circle-radius': raio, 'circle-opacity': 0.92, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,.85)' } });
      mapa.addLayer({ id: 'grupo-n', type: 'symbol', source: 'usinas', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.35)', 'text-halo-width': 1 } });
      mapa.addLayer({ id: 'usina-brilho', type: 'circle', source: 'usinas', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': ['match', ['get', 'estado'], 'normal', CORES.normal, 'atencao', CORES.atencao, 'critico', CORES.critico, 'sem_comunicacao', CORES.sem_comunicacao, CORES.sem_monitoramento],
          'circle-radius': 12, 'circle-opacity': 0.22, 'circle-blur': 0.6, 'circle-translate': [0, 1] } });
      mapa.addLayer({ id: 'usina', type: 'symbol', source: 'usinas', filter: ['!', ['has', 'point_count']],
        layout: { 'icon-image': ['concat', 'pino-', ['get', 'estado']], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'symbol-sort-key': ['match', ['get', 'estado'], 'critico', 5, 'sem_comunicacao', 4, 'atencao', 3, 'normal', 2, 1] } });
      mapa.addLayer({ id: 'usina-nome', type: 'symbol', source: 'usinas', filter: ['!', ['has', 'point_count']], minzoom: 12,
        layout: { 'text-field': ['get', 'nome'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 0.6], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 12 },
        paint: { 'text-color': '#EAF1F8', 'text-halo-color': 'rgba(8,18,32,.92)', 'text-halo-width': 1.4 } });

      // Um clique só no mapa, com folga de ~14 px (dedo no celular não é mira).
      mapa.on('click', function (e) {
        var p = e.point;
        var achados = mapa.queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: ['usina', 'grupo'] });
        var f = achados.filter(function (x) { return x.layer.id === 'usina'; })[0] || achados[0];
        if (!f) return;
        if (f.layer.id === 'grupo') {
          var z = mapa.getSource('usinas').getClusterExpansionZoom(f.properties.cluster_id);
          var ir = function (zz) { mapa.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zz + 0.3, 16) }); };
          if (z && z.then) z.then(ir); else if (typeof z === 'number') ir(z);
          return;
        }
        var u; try { u = JSON.parse(f.properties.u); } catch (x) { return; }
        if (popup) popup.remove();
        // Cartão sempre ACIMA do alfinete: desce o mapa pra o alfinete ficar perto da borda de baixo.
        var alt = mapa.getContainer().clientHeight;
        mapa.easeTo({ center: f.geometry.coordinates, offset: [0, Math.max(0, alt / 2 - 34)], duration: 350 });
        popup = new maplibregl.Popup({ anchor: 'bottom', offset: [0, -40], maxWidth: '300px', focusAfterOpen: false })
          .setLngLat(f.geometry.coordinates).setDOMContent(cartao(u)).addTo(mapa);
      });
      ['grupo', 'usina'].forEach(function (id) {
        mapa.on('mouseenter', id, function () { mapa.getCanvas().style.cursor = 'pointer'; });
        mapa.on('mouseleave', id, function () { mapa.getCanvas().style.cursor = ''; });
      });
    });
  }

  function atualizar() {
    return fetch(cfg.url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 403) throw new Error('403');
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
  }

  function iniciar() {
    status('Carregando o mapa…');
    atualizar().then(function (d) {
      legenda(d); aviso(d);
      if (!(d.usinas || []).length && !d.total) { status('Nenhuma usina ativa ainda.'); }
      if (!webgl()) { status('Este navegador não consegue desenhar o mapa (WebGL desligado). As usinas continuam listadas por cidade acima.'); return; }
      carregarCss(cfg.mlCss, cfg.mlCssSri);
      return carregarJs(cfg.mlJs, cfg.mlJsSri).then(function () {
        if (!(d.usinas || []).length) status(d.total ? 'Nenhuma usina com localização ainda.' : 'Nenhuma usina ativa ainda.');
        montar(d);
        // Tela do escritório: atualiza sozinho (sem ninguém mexer).
        setInterval(function () {
          if (document.hidden) return;
          atualizar().then(function (n) {
            legenda(n); aviso(n);
            var s = mapa && mapa.getSource('usinas'); if (s) s.setData(geojson(n));
          }).catch(function () {});
        }, 5 * 60 * 1000);
      });
    }).catch(function (e) {
      status(e && e.message === '403' ? 'Sem acesso às usinas.' : 'Não consegui abrir o mapa agora. Tente de novo em alguns minutos.');
    });
  }

  if (btnCheia) {
    if (!document.fullscreenEnabled) btnCheia.hidden = true;
    btnCheia.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen(); else raiz.requestFullscreen().catch(function () {});
    });
    document.addEventListener('fullscreenchange', function () {
      btnCheia.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
      if (mapa) setTimeout(function () { mapa.resize(); }, 60);
    });
  }

  // Só baixa o MapLibre quando o mapa chega perto da tela.
  if ('IntersectionObserver' in window && !TV) {
    var io = new IntersectionObserver(function (ents) {
      if (ents.some(function (x) { return x.isIntersecting; })) { io.disconnect(); iniciar(); }
    }, { rootMargin: '400px' });
    io.observe(raiz);
  } else {
    iniciar();
  }
})();
`;

/** Mini-mapa da tela da usina: alfinete arrastável que salva a posição como "manual". */
export const JS_MAPA_USINA = String.raw`(function () {
  'use strict';
  var raiz = document.getElementById('mu-mapa-usina');
  if (!raiz) return;
  var cfg = raiz.dataset;
  var caixa = raiz.querySelector('.mu-map');
  var stEl = raiz.querySelector('.mu-st');
  var fonteEl = raiz.querySelector('.mu-fonte');
  var btnLoc = raiz.querySelector('[data-acao="localizar"]');
  var pode = cfg.podeEditar === '1';
  var marcador = null, salvo = null;

  function st(txt, tipo) { if (!stEl) return; stEl.textContent = txt; stEl.className = 'mu-st' + (tipo ? ' mu-st-' + tipo : ''); }
  function webgl() { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
  function carregar() {
    return new Promise(function (ok, falha) {
      if (!document.querySelector('link[data-maplibre]')) {
        var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = cfg.mlCss; l.integrity = cfg.mlCssSri; l.crossOrigin = 'anonymous'; l.setAttribute('data-maplibre', '1');
        document.head.appendChild(l);
      }
      if (window.maplibregl) { ok(); return; }
      var s = document.createElement('script'); s.src = cfg.mlJs; s.integrity = cfg.mlJsSri; s.crossOrigin = 'anonymous';
      s.onload = function () { ok(); }; s.onerror = function () { falha(new Error('js')); };
      document.head.appendChild(s);
    });
  }
  function pino(cor) {
    var d = document.createElement('div'); d.className = 'mu-pino';
    d.innerHTML = '<svg viewBox="0 0 30 40" width="34" height="46" aria-hidden="true"><path d="M15 38C13 31 3 24 3 14a12 12 0 0 1 24 0c0 10-10 17-12 24z" fill="' + cor + '" stroke="#fff" stroke-width="1.6"/><circle cx="15" cy="14" r="4.6" fill="#0F2138"/></svg>';
    return d;
  }
  function marcarFonte(txt, cls) { if (!fonteEl) return; fonteEl.textContent = txt; fonteEl.className = 'mu-fonte ' + cls; }
  function salvar(ll) {
    // Segura o recarregamento automático da página enquanto salva.
    window.ccSegurarRecarga = true;
    st('Salvando a posição…');
    var corpo = new URLSearchParams(); corpo.set('lat', ll.lat.toFixed(6)); corpo.set('lng', ll.lng.toFixed(6));
    return fetch(cfg.urlSalvar, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body: corpo })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.motivo || 'erro'); return j; }); })
      .then(function () {
        salvo = [ll.lng, ll.lat];
        st('Posição salva. Ela não será trocada pela localização automática.', 'ok'); marcarFonte('Ajustada à mão', 'mu-fonte-manual');
        if (btnLoc && btnLoc.parentNode) { btnLoc.parentNode.removeChild(btnLoc); btnLoc = null; }
      })
      .catch(function (e) { if (marcador && salvo) marcador.setLngLat(salvo); st('Não consegui salvar: ' + e.message + '. O alfinete voltou pro lugar salvo.', 'erro'); })
      .then(function () { window.ccSegurarRecarga = false; });
  }

  if (!webgl()) { st('Este navegador não consegue desenhar o mapa.'); return; }
  carregar().then(function () {
    var lat = parseFloat(cfg.lat), lng = parseFloat(cfg.lng);
    var tem = isFinite(lat) && isFinite(lng);
    var centro = tem ? [lng, lat] : [parseFloat(cfg.centroLng), parseFloat(cfg.centroLat)];
    var mapa = new maplibregl.Map({
      container: caixa, style: cfg.estilo, center: centro, zoom: tem && cfg.fonte !== 'cidade' ? 17 : 13,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para aproximar o mapa',
        'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para aproximar o mapa',
        'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
      },
    });
    mapa.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var m = new maplibregl.Marker({ element: pino(tem ? '#16a34a' : '#f59e0b'), anchor: 'bottom', draggable: pode }).setLngLat(centro).addTo(mapa);
    marcador = m; salvo = centro;
    // Mexendo no mapa: segura o recarregamento automático da página por 2 min.
    var soltar = null;
    mapa.on('movestart', function () {
      window.ccSegurarRecarga = true;
      clearTimeout(soltar); soltar = setTimeout(function () { window.ccSegurarRecarga = false; }, 120000);
    });
    if (pode) {
      m.on('dragstart', function () { window.ccSegurarRecarga = true; });
      m.on('dragend', function () { salvar(m.getLngLat()); });
    }
    if (btnLoc) {
      btnLoc.addEventListener('click', function () {
        btnLoc.disabled = true; st('Procurando pelo endereço…');
        fetch(cfg.urlLocalizar, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.ok && j.pulada) { st('Posição mantida: ' + (j.motivo || 'já ajustada à mão') + '.'); }
            else if (j.ok && isFinite(j.lat)) {
              m.setLngLat([j.lng, j.lat]); salvo = [j.lng, j.lat]; mapa.easeTo({ center: [j.lng, j.lat], zoom: j.fonte === 'cidade' ? 13 : 17 });
              if (j.fonte === 'cidade') { st('Achei só a cidade: o ponto é aproximado. Arraste até a usina para corrigir.'); marcarFonte('Aproximada (centro da cidade)', 'mu-fonte-cidade'); }
              else { st('Achei pelo endereço. Confira e, se precisar, arraste o alfinete.', 'ok'); marcarFonte('Pelo endereço', ''); }
            } else {
              st(j.motivo ? 'Não achei: ' + j.motivo + '.' : 'Não achei pelo endereço.', 'erro');
            }
          })
          .catch(function () { st('Não consegui procurar agora.', 'erro'); })
          .then(function () { btnLoc.disabled = false; });
      });
    }
  }).catch(function () { st('Não consegui abrir o mapa agora.'); });
})();
`;
