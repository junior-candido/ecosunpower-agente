// src/modules/dashboard/cerebro-views.ts
// Tela full-screen "viva" do Elo — o cerebro do EcoSunPower. Redesenhada 12/07
// com a cara do "mapa do ecossistema" aprovado pelo Junior: o Elo pulsando no
// centro e as 9 CASAS (as fontes de evento ligadas na espinha) em volta, em
// cards, com os bilhetes (pulsos) viajando pelas linhas — dourado indo pro Elo
// (algo aconteceu), verde saindo (o Elo reage). Numeros reais do SnapshotElo.
// Mantem tudo que ja existia: "Pergunte ao Elo" (fetch /dashboard/cerebro/
// perguntar), voz (microfone Web Speech + sintese de fala), painel de detalhe
// ao clicar numa casa, layout em zonas (nada sobreposto) e responsivo.
//
// Auto-contido: todo CSS/JS inline, sem asset externo (CSP-friendly).
//
// ⚠️ ARMADILHA CONHECIDA (tela branca): regex dentro deste template literal
// PERDE a barra invertida — `\p{...}` viraria `p{...}` no HTML gerado e daria
// SyntaxError (tsc e testes de string NAO pegam). Por isso as regex de
// limparParaVoz usam barra DOBRADA (`\\p`, `\\s`, `\\-`). Sempre valide o JS
// gerado com `node --check` (scripts/preview-cerebro.ts gera a pagina).
import type { SnapshotElo } from './cerebro-data.js';
import { escapeHtml } from './views.js';

// Embute um valor em JSON dentro de uma <script>. JSON.stringify já escapa
// tudo que precisa pro contexto JS; o replace de "<" evita que um valor
// vindo do banco (ex: uma fala com "</script>") feche a tag e injete HTML.
function toScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function renderCerebroPage(snap: SnapshotElo, falas: string[]): string {
  const listaFalas = falas.length > 0 ? falas : ['Oi, eu sou o Elo.'];
  const primeiraFala = escapeHtml(listaFalas[0]);
  const snapJson = toScriptJson(snap);
  const falasJson = toScriptJson(listaFalas);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elo — cérebro do EcoSunPower</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --ground:#0a1526; --ground-2:#0e1c33; --card:#13233f; --card-2:#182c4d;
    --line:#2a4066; --ink:#eaf1fb; --ink-soft:#a9bcd8; --ink-faint:#6f85a8;
    --green:#34d399; --green-soft:#7fe0ab; --gold:#f5b301; --brain:#34d399;
  }
  html,body { height:100%; background:radial-gradient(1100px 700px at 50% -8%, var(--ground-2), var(--ground)); overflow:hidden; font-family:-apple-system,Segoe UI,Roboto,sans-serif; }

  /* ---- layout em zonas: topbar / mapa / fala / caixa de pergunta, empilhados
     numa coluna flex — o mapa nunca fica escondido atras das barras. ---- */
  #wrap {
    position:fixed; inset:0;
    display:flex; flex-direction:column;
    height:100vh; height:100dvh;
    overflow:hidden;
  }
  .topbar {
    flex:0 0 auto; display:flex; align-items:center; gap:12px;
    padding:14px 26px; background:rgba(6,11,22,.55);
    border-bottom:1px solid rgba(52,211,153,.12);
  }
  .topbar .dot { width:10px; height:10px; border-radius:50%; background:var(--green); box-shadow:0 0 14px var(--green); animation:blink 2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
  .topbar h1 { color:var(--ink); font-size:16px; font-weight:700; letter-spacing:.3px; }
  .topbar h1 b { color:var(--green); font-weight:800; }
  .topbar span { color:var(--ink-faint); font-size:13px; font-weight:400; }
  .hint { flex:0 0 auto; text-align:center; padding:6px 0; color:var(--ink-faint); font-size:12px; }

  /* zona do meio: o mapa vive SO aqui (flex:1), centralizado */
  #stageZone { flex:1 1 auto; position:relative; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; }
  #stage { position:relative; }
  #stage svg.links { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }

  .house {
    position:absolute; transform:translate(-50%,-50%);
    width:clamp(58px, 10vmin, 92px);
    background:linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, transparent), color-mix(in srgb, var(--card-2) 88%, transparent));
    border:1px solid var(--line); border-radius:12px;
    padding:6px 5px 6px; text-align:center; cursor:pointer;
    box-shadow:0 12px 26px -16px rgba(0,0,0,.7);
    transition:transform .16s ease, border-color .16s ease;
  }
  .house:hover, .house:focus-visible { transform:translate(-50%,-50%) translateY(-3px); border-color:var(--green); outline:none; }
  .house .em { font-size:clamp(13px,2.2vmin,17px); line-height:1; }
  .house .nm { font-weight:700; font-size:clamp(8.5px,1.35vmin,10.5px); color:var(--ink); margin-top:3px; letter-spacing:-.01em; line-height:1.15; overflow-wrap:anywhere; word-break:break-word; hyphens:auto; }
  .house .n { font-weight:800; font-size:clamp(13px,2.3vmin,18px); color:var(--green); margin-top:1px; font-variant-numeric:tabular-nums; line-height:1.1; }
  .house .lb { font-size:clamp(7.5px,1.05vmin,9px); color:var(--ink-soft); }
  .house .src { font-size:7.5px; color:var(--ink-faint); margin-top:2px; letter-spacing:.02em; }

  .brain {
    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:clamp(104px,19vmin,158px); aspect-ratio:1/1; border-radius:50%;
    display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
    cursor:pointer;
    background:radial-gradient(circle at 50% 36%, color-mix(in srgb, var(--brain) 34%, var(--card)), var(--card) 72%);
    border:1.5px solid color-mix(in srgb, var(--brain) 55%, var(--line));
    box-shadow:0 0 0 8px color-mix(in srgb, var(--brain) 8%, transparent), 0 18px 46px -14px rgba(0,0,0,.7);
  }
  .brain::before { content:""; position:absolute; inset:-13px; border-radius:50%; border:1px dashed color-mix(in srgb, var(--brain) 38%, transparent); animation:spin 40s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .brain .em { font-size:clamp(22px,4.2vmin,36px); line-height:1; }
  .brain .ti { font-weight:800; font-size:clamp(13px,2.3vmin,18px); color:var(--ink); margin-top:2px; }
  .brain .n { font-size:clamp(9px,1.5vmin,11px); color:var(--green-soft); margin-top:2px; font-variant-numeric:tabular-nums; }

  .speech {
    flex:0 0 auto; align-self:center; width:min(720px, 88vw); margin:8px 0;
    background:rgba(11,22,40,.72); backdrop-filter:blur(10px);
    border:1px solid rgba(52,211,153,.25); border-radius:16px; padding:14px 24px;
    box-shadow:0 10px 40px rgba(0,0,0,.5); text-align:center;
  }
  .speech .who { color:var(--green); font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:7px; display:flex; align-items:center; justify-content:center; gap:8px; }
  .speech .who i { width:6px; height:6px; border-radius:50%; background:var(--green); box-shadow:0 0 10px var(--green); }
  .speech p { color:#dbe8fb; font-size:17px; line-height:1.5; min-height:50px; transition:opacity .5s; }

  #askBox { flex:0 0 auto; align-self:center; width:min(560px, 88vw); margin:0 0 16px; display:flex; gap:8px; }
  #askForm { display:flex; gap:8px; flex:1; min-width:0; }
  #askInput { flex:1; min-width:0; background:rgba(11,22,40,.85); border:1px solid rgba(245,179,1,.35); border-radius:12px; padding:12px 16px; color:var(--ink); font-size:14px; outline:none; }
  #askInput::placeholder { color:var(--ink-faint); }
  #askInput:focus { border-color:var(--gold); box-shadow:0 0 0 3px rgba(245,179,1,.15); }
  #askForm button { background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#1a1400; border:none; border-radius:12px; padding:0 20px; font-weight:700; font-size:14px; cursor:pointer; }
  #askForm button:disabled { opacity:.6; cursor:default; }
  #micBtn, #voiceToggle { flex-shrink:0; width:44px; background:rgba(11,22,40,.85); border:1px solid rgba(52,211,153,.35); border-radius:12px; color:#dbe8fb; font-size:18px; cursor:pointer; }
  #micBtn.listening { background:linear-gradient(135deg,#f87171,#ef4444); border-color:#fca5a5; animation:micPulse 1.1s infinite; }
  @keyframes micPulse { 0%,100% { box-shadow:0 0 0 0 rgba(248,113,113,.55); } 50% { box-shadow:0 0 0 10px rgba(248,113,113,0); } }
  #voiceToggle.off { opacity:.4; }

  #panel {
    position:fixed; top:0; right:0; bottom:0; z-index:20; width:min(360px, 90vw);
    background:rgba(8,15,28,.97); backdrop-filter:blur(14px);
    border-left:1px solid rgba(52,211,153,.25); box-shadow:-20px 0 50px rgba(0,0,0,.5);
    transform:translateX(100%); transition:transform .28s ease; padding:26px 22px; color:#dbe8fb; overflow-y:auto;
  }
  #panel.open { transform:translateX(0); }
  #panel .panelClose { position:absolute; top:16px; right:16px; width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#dbe8fb; font-size:16px; cursor:pointer; line-height:1; }
  #panel h2 { font-size:20px; margin:6px 30px 6px 0; color:var(--ink); }
  #panel .desc { color:#9fb4d4; font-size:13px; line-height:1.5; margin-bottom:18px; }
  #panel .kpi { display:flex; justify-content:space-between; align-items:baseline; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06); }
  #panel .kpi .n { font-size:22px; font-weight:800; color:var(--green); font-variant-numeric:tabular-nums; }
  #panel .kpi .l { font-size:13px; color:#9fb4d4; }

  .legend { flex:0 0 auto; display:flex; gap:20px; justify-content:center; padding:0 0 4px; }
  .legend span { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--ink-faint); }
  .legend i { width:9px; height:9px; border-radius:50%; }
  .legend i.g { background:var(--gold); box-shadow:0 0 8px var(--gold); }
  .legend i.v { background:var(--green); box-shadow:0 0 8px var(--green); }

  /* cadeado CAMUFLADO do cofre de custos — canto direito do topo, discreto (só o CEO sabe) */
  .cofre-lock { margin-left:auto; padding:2px 7px; font-size:15px; line-height:1; background:transparent; border:none; opacity:.55; cursor:pointer; transition:opacity .2s, transform .2s; }
  .cofre-lock:hover, .cofre-lock:focus-visible { opacity:1; transform:scale(1.12); outline:none; }
  #cofre { position:fixed; top:0; right:0; bottom:0; z-index:30; width:min(380px,92vw); background:rgba(6,11,22,.98); backdrop-filter:blur(16px); border-left:1px solid rgba(245,179,1,.3); box-shadow:-20px 0 50px rgba(0,0,0,.6); transform:translateX(100%); transition:transform .28s ease; padding:26px 22px; color:#dbe8fb; overflow-y:auto; }
  #cofre.open { transform:translateX(0); }
  #cofre h2 { font-size:20px; margin:6px 30px 6px 0; color:var(--ink); }
  #cofre .desc { color:#9fb4d4; font-size:13px; margin-bottom:16px; }
  #cofreForm { display:flex; gap:8px; margin-bottom:10px; }
  #cofrePin { flex:1; min-width:0; background:rgba(11,22,40,.85); border:1px solid rgba(245,179,1,.35); border-radius:12px; padding:12px 14px; color:var(--ink); font-size:16px; letter-spacing:3px; outline:none; }
  #cofreForm button { background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#1a1400; border:none; border-radius:12px; padding:0 18px; font-weight:700; cursor:pointer; }
  #cofreMsg { font-size:13px; color:#f87171; min-height:16px; margin-bottom:6px; }
  #cofre .linha { display:flex; justify-content:space-between; align-items:baseline; padding:11px 0; border-bottom:1px solid rgba(255,255,255,.06); }
  #cofre .linha .l { color:#9fb4d4; font-size:14px; }
  #cofre .linha .n { font-size:17px; font-weight:800; color:var(--ink); font-variant-numeric:tabular-nums; }
  #cofre .linha.total .n { color:var(--gold); font-size:22px; }
  #cofre .add { margin-top:18px; padding-top:14px; border-top:1px solid rgba(255,255,255,.08); }
  #cofre .add input { width:100%; margin-bottom:8px; background:rgba(11,22,40,.85); border:1px solid var(--line); border-radius:10px; padding:10px 12px; color:var(--ink); font-size:14px; outline:none; }
  #cofre .add button { width:100%; background:rgba(52,211,153,.15); border:1px solid var(--green); color:var(--green-soft); border-radius:10px; padding:10px; font-weight:700; cursor:pointer; }
  @media (max-width: 640px) { #cofre { top:auto; left:0; right:0; bottom:0; width:100%; max-height:72vh; border-left:none; border-top:1px solid rgba(245,179,1,.3); border-radius:20px 20px 0 0; transform:translateY(100%); } #cofre.open { transform:translateY(0); } }

  @media (prefers-reduced-motion: reduce) { .brain::before { animation:none; } .pulse { display:none; } }

  /* ---- celular: painel vira bottom-sheet POR CIMA (overlay, fecha no X ou
     tocando fora); cards e cérebro encolhem via clamp/vmin ---- */
  @media (max-width: 640px) {
    #panel { top:auto; left:0; right:0; bottom:0; width:100%; max-height:58vh; border-left:none; border-top:1px solid rgba(52,211,153,.25); border-radius:20px 20px 0 0; box-shadow:0 -20px 50px rgba(0,0,0,.5); transform:translateY(100%); padding:22px 18px; }
    #panel.open { transform:translateY(0); }
    .topbar { padding:10px 14px; gap:8px; }
    .topbar span { display:none; }
    .hint, .legend { display:none; }
    .speech { width:94vw; margin:6px 0; padding:11px 16px; }
    .speech p { font-size:15px; min-height:38px; }
    #askBox { width:96vw; margin-bottom:12px; gap:6px; }
    #askForm { gap:6px; }
    #askInput { padding:12px 12px; font-size:16px; min-height:44px; }
    #askForm button, #micBtn, #voiceToggle { min-width:44px; min-height:44px; }
  }
</style>
</head>
<body>
<div id="wrap">
  <div class="topbar">
    <div class="dot"></div>
    <h1><b>Elo</b> · cérebro do EcoSunPower</h1>
    <span>· as casas do ecossistema ligadas, ao vivo</span>
    <button class="cofre-lock" id="cofreLock" type="button" aria-label="Custos" title="Custos">🔒</button>
  </div>
  <div class="hint">clique numa casa pra ver os números · o Elo no centro liga todas</div>
  <div id="stageZone"><div id="stage"><svg class="links" id="links" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg></div></div>
  <div class="legend">
    <span><i class="g"></i> bilhete indo pro Elo</span>
    <span><i class="v"></i> o Elo reagindo</span>
  </div>
  <div class="speech">
    <div class="who"><i></i> o Elo está falando</div>
    <p id="say">${primeiraFala}</p>
  </div>
  <div id="askBox">
    <form id="askForm" autocomplete="off">
      <input id="askInput" type="text" placeholder="Pergunte ao Elo..." maxlength="300" />
      <button type="button" id="micBtn" aria-label="Falar com o Elo" title="Falar com o Elo">🎤</button>
      <button type="submit" id="askBtn">Perguntar</button>
    </form>
    <button type="button" id="voiceToggle" aria-label="Ligar/desligar a voz do Elo" title="Voz do Elo">🔊</button>
  </div>
  <aside id="panel">
    <button class="panelClose" id="panelClose" type="button" aria-label="Fechar">✕</button>
    <div id="panelBody"></div>
  </aside>
  <aside id="cofre">
    <button class="panelClose" id="cofreClose" type="button" aria-label="Fechar">✕</button>
    <div id="cofreBody">
      <h2>🔒 Cofre</h2>
      <p class="desc">Área restrita. Digite o PIN pra ver os custos do mês.</p>
      <form id="cofreForm" autocomplete="off">
        <input id="cofrePin" type="password" inputmode="numeric" placeholder="PIN" maxlength="12" />
        <button type="submit" id="cofreBtn">Abrir</button>
      </form>
      <div id="cofreMsg"></div>
      <div id="cofreDados"></div>
    </div>
  </aside>
</div>
<script>
const SNAP = ${snapJson};
const FALAS = ${falasJson};
const NS = 'http://www.w3.org/2000/svg';

// ---- as 9 casas ligadas na espinha do Elo (numeros reais do SNAP) ----
function num(v){ return (typeof v === 'number' && isFinite(v)) ? v : 0; }
const M = SNAP.marketing || {};
const X = SNAP.externos || {};
const HOUSES = [
  { key:'leads',         em:'🎯', nm:'Leads',         n:num(SNAP.comercial && SNAP.comercial.leads),   lb:'no funil',         src:'novo · estágio' },
  { key:'propostas',     em:'📄', nm:'Propostas',     n:num(SNAP.comercial && SNAP.comercial.propostas), lb:'enviadas',        src:'criada · aberta' },
  { key:'calculadora',   em:'🧮', nm:'Calculadora',   n:num(X.calculadora),                             lb:'orçamentos',       src:'kit · proposta' },
  { key:'site',          em:'🌐', nm:'Site',          n:num(X.site),                                    lb:'visitas · leads',  src:'formulário' },
  { key:'anuncios',      em:'📣', nm:'Anúncios',      n:num(M.anuncios),                                lb:'leads de anúncio', src:'Meta · Google' },
  { key:'blog',          em:'✍️', nm:'Blog',          n:num(M.blog),                                    lb:'artigos no ar',    src:'publicado' },
  { key:'financeiro',    em:'💰', nm:'Financeiro',    n:num(SNAP.financeiro && SNAP.financeiro.vendas), lb:'vendas',           src:'conta · recebido' },
  { key:'posvenda',      em:'🤝', nm:'Pós-venda',     n:num(SNAP.relacionamento && SNAP.relacionamento.clientes), lb:'clientes', src:'etapa da obra' },
  { key:'monitoramento', em:'📈', nm:'Monitoramento', n:num(SNAP.operacao && SNAP.operacao.usinas),     lb:'usinas',           src:'alerta de usina' },
  { key:'email',         em:'📧', nm:'E-mail',        n:num(M.emailsEnviados),                          lb:'enviados',         src:'sequência viva' },
  { key:'eva',           em:'💬', nm:'Eva · Zap',     n:num(SNAP.atendimento && SNAP.atendimento.conversas), lb:'conversas',   src:'mensagem · resposta' }
];

const stageZone = document.getElementById('stageZone');
const stage = document.getElementById('stage');
const svg = document.getElementById('links');
const CX=500, CY=500, R=398, BR=110; // coords no viewBox 1000x1000

// mantem o palco QUADRADO e cabendo na zona do meio (o SVG usa viewBox, entao
// escala junto; as casas sao posicionadas por porcentagem do quadrado)
function sizeStage(){
  const z = stageZone.getBoundingClientRect();
  const s = Math.max(200, Math.min(z.width, z.height) - 6);
  stage.style.width = s + 'px';
  stage.style.height = s + 'px';
}
sizeStage();
window.addEventListener('resize', sizeStage);
if(window.ResizeObserver){ new ResizeObserver(sizeStage).observe(stageZone); }

// ---- monta as casas + as conexoes + os pulsos (bilhetes) ----
function addPulse(path, color, seed){
  const c = document.createElementNS(NS,'circle');
  c.setAttribute('r','6'); c.setAttribute('fill',color); c.setAttribute('class','pulse'); c.setAttribute('opacity','0.95');
  const m = document.createElementNS(NS,'animateMotion');
  m.setAttribute('path', path);
  m.setAttribute('dur', (2.8 + (seed % 5) * 0.4).toFixed(2) + 's');
  m.setAttribute('begin', (-(seed * 0.5)).toFixed(2) + 's');
  m.setAttribute('repeatCount','indefinite');
  const fade = document.createElementNS(NS,'animate');
  fade.setAttribute('attributeName','opacity'); fade.setAttribute('values','0;1;1;0');
  fade.setAttribute('keyTimes','0;0.15;0.7;1');
  fade.setAttribute('dur', m.getAttribute('dur')); fade.setAttribute('begin', m.getAttribute('begin'));
  fade.setAttribute('repeatCount','indefinite');
  c.appendChild(m); c.appendChild(fade); svg.appendChild(c);
}

function abrirCasa(key){ openPanel(key); }

HOUSES.forEach(function(h, i){
  // distribui as casas igualmente em volta do Elo (comeca no topo, -90deg),
  // seja qual for a quantidade — assim adicionar casa nova nao desalinha
  const a = (-90 + i * (360 / HOUSES.length)) * Math.PI / 180;
  const hx = CX + R*Math.cos(a), hy = CY + R*Math.sin(a);
  const bx = CX + BR*Math.cos(a), by = CY + BR*Math.sin(a);
  const ex = CX + (R-72)*Math.cos(a), ey = CY + (R-72)*Math.sin(a);

  const line = document.createElementNS(NS,'line');
  line.setAttribute('x1',bx); line.setAttribute('y1',by); line.setAttribute('x2',ex); line.setAttribute('y2',ey);
  line.setAttribute('stroke','rgba(52,211,153,.28)'); line.setAttribute('stroke-width','1.5'); line.setAttribute('stroke-linecap','round');
  svg.appendChild(line);

  addPulse('M ' + ex + ' ' + ey + ' L ' + bx + ' ' + by, 'var(--gold)', i);        // casa -> Elo
  addPulse('M ' + bx + ' ' + by + ' L ' + ex + ' ' + ey, 'var(--green)', i + 4.5); // Elo -> casa

  const el = document.createElement('div');
  el.className = 'house';
  el.style.left = (hx/10) + '%'; el.style.top = (hy/10) + '%';
  el.setAttribute('role','button'); el.setAttribute('tabindex','0'); el.setAttribute('aria-label', h.nm);
  el.innerHTML = '<div class="em">' + h.em + '</div><div class="nm">' + h.nm + '</div>' +
                 '<div class="n">' + h.n + '</div><div class="lb">' + h.lb + '</div>' +
                 '<div class="src">' + h.src + '</div>';
  el.addEventListener('click', function(){ abrirCasa(h.key); });
  el.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); abrirCasa(h.key); } });
  stage.appendChild(el);
});

// ---- o Elo no centro ----
const totalEventos = num(SNAP.elo && SNAP.elo.totalEventos);
const brain = document.createElement('div');
brain.className = 'brain';
brain.setAttribute('role','button'); brain.setAttribute('tabindex','0'); brain.setAttribute('aria-label','Elo');
brain.innerHTML = '<div class="em">🧠</div><div class="ti">Elo</div><div class="n">' + totalEventos + ' eventos</div>';
brain.addEventListener('click', function(){ openPanel('elo'); });
brain.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openPanel('elo'); } });
stage.appendChild(brain);

// ---- barra de fala: cicla FALAS a cada ~4s, com pausa quando o Elo responde ----
let li=0; const sayEl=document.getElementById('say');
let cycleTimer=null;
function showSay(text){
  sayEl.style.opacity=0;
  setTimeout(function(){ sayEl.textContent=text; sayEl.style.opacity=1; }, 320);
}
function startCycle(){
  if(cycleTimer) clearInterval(cycleTimer);
  cycleTimer=setInterval(function(){ li=(li+1)%FALAS.length; showSay(FALAS[li]); }, 4200);
}
startCycle();

// ---- "Pergunte ao Elo" ----
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const askBtn = document.getElementById('askBtn');
askForm.addEventListener('submit', function(e){
  e.preventDefault();
  const pergunta = askInput.value.trim();
  if(!pergunta) return;
  askInput.value=''; askInput.blur(); askBtn.disabled = true;
  if(cycleTimer) clearInterval(cycleTimer);
  showSay('Deixa eu ver isso...');
  fetch('/dashboard/cerebro/perguntar', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({pergunta: pergunta})
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    const bruta = data && data.resposta ? data.resposta : 'Não consegui responder agora, tenta de novo.';
    const resposta = limparParaVoz(bruta);
    showSay(resposta); speak(resposta);
  })
  .catch(function(){
    const resposta = 'Deu um erro ao falar com o Elo. Tenta de novo em instantes.';
    showSay(resposta); speak(resposta);
  })
  .finally(function(){ askBtn.disabled = false; setTimeout(startCycle, 6000); });
});

// ---- voz: entrada por microfone (Web Speech API, gratis, so no navegador) ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = document.getElementById('micBtn');
if(SR){
  const recognition = new SR();
  recognition.lang = 'pt-BR'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  let listening = false;
  recognition.addEventListener('result', function(ev){
    const texto = ev.results[0][0].transcript;
    askInput.value = texto;
    if(askForm.requestSubmit) askForm.requestSubmit();
    else askForm.dispatchEvent(new Event('submit', {cancelable:true}));
  });
  recognition.addEventListener('end', function(){ listening = false; micBtn.classList.remove('listening'); });
  recognition.addEventListener('error', function(){ listening = false; micBtn.classList.remove('listening'); });
  micBtn.addEventListener('click', function(){
    if(listening){ recognition.stop(); return; }
    try { recognition.start(); listening = true; micBtn.classList.add('listening'); }
    catch(err){ listening = false; micBtn.classList.remove('listening'); }
  });
} else {
  micBtn.style.display = 'none';
}

// ---- voz: saida — o Elo fala a resposta em voz alta ----
const hasTTS = 'speechSynthesis' in window;
const voiceToggle = document.getElementById('voiceToggle');
let voiceOn = true;
if(hasTTS){
  voiceToggle.addEventListener('click', function(){
    voiceOn = !voiceOn;
    voiceToggle.classList.toggle('off', !voiceOn);
    voiceToggle.textContent = voiceOn ? '🔊' : '🔇';
    if(!voiceOn) window.speechSynthesis.cancel();
  });
} else {
  voiceToggle.style.display = 'none';
}
// tira simbolo de markdown/emoji antes de falar, senao o sintetizador le
// "asterisco asterisco" em voz alta em vez de so o texto
function limparParaVoz(t){
  if(!t) return '';
  return String(t)
    .replace(/\\p{Extended_Pictographic}/gu, '')   // emojis
    .replace(/[️‍]/g, '')                 // seletor de variacao / zero-width-joiner de emoji
    .replace(/[*_\`~#>]+/g, '')                   // negrito/italico/codigo/citacao/titulo do markdown
    .replace(/^\\s*[•\\-]\\s+/gm, '')           // marcador de lista (bullet)
    .replace(/\\s+/g, ' ')                         // colapsa espacos/quebras de linha
    .trim();
}
// escolhe a MELHOR voz pt-BR disponivel no navegador (dicçao e fluencia). As
// vozes carregam de forma assincrona, entao re-escolhe no onvoiceschanged.
let eloVoice = null;
function pickVoice(){
  if(!hasTTS) return;
  const vs = window.speechSynthesis.getVoices() || [];
  const pt = vs.filter(function(v){ return /pt[-_]?br/i.test(v.lang) || /portug/i.test(v.name); });
  const pref = ['Google portugu', 'Luciana', 'Microsoft Thalita', 'Microsoft Francisca', 'Microsoft Maria', 'Natural', 'Microsoft Daniel'];
  for(let i=0;i<pref.length;i++){
    const alvo = pref[i];
    const hit = pt.find(function(v){ return v.name.indexOf(alvo) !== -1; });
    if(hit){ eloVoice = hit; return; }
  }
  if(pt.length) eloVoice = pt[0];
}
pickVoice();
if(hasTTS){ window.speechSynthesis.onvoiceschanged = pickVoice; }
function speak(texto){
  const limpo = limparParaVoz(texto);
  if(!hasTTS || !voiceOn || !limpo) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(limpo);
  u.lang = 'pt-BR';
  if(eloVoice) u.voice = eloVoice;
  u.rate = 0.98;   // um tiquinho mais devagar = mais claro e fluente
  u.pitch = 1.02;
  window.speechSynthesis.speak(u);
}

// ---- painel de detalhe: clique numa casa (ou no Elo) abre os números reais ----
const C = SNAP.comercial || {}, A = SNAP.atendimento || {}, O = SNAP.operacao || {}, RL = SNAP.relacionamento || {}, F = SNAP.financeiro || {}, E = SNAP.elo || {};
const INFO = {
  elo: { titulo:'🧠 Elo · visão geral', desc:'Sou o cérebro do EcoSunPower: cada evento de cada casa passa por mim, e eu ligo tudo — nada se perde.', kpis:[ ['Eventos registrados', num(E.totalEventos)] ] },
  leads: { titulo:'🎯 Leads · Comercial', desc:'Acompanho cada lead do primeiro contato até a venda fechada.', kpis:[ ['Leads', num(C.leads)], ['Em negociação', num(C.negociacao)], ['Ganhos', num(C.ganhos)], ['Propostas', num(C.propostas)] ] },
  propostas: { titulo:'📄 Propostas', desc:'Sei quando uma proposta é criada e quando o cliente abre pela primeira vez.', kpis:[ ['Propostas enviadas', num(C.propostas)] ] },
  anuncios: { titulo:'📣 Anúncios', desc:'Cada lead que chega de um anúncio pago do Meta ou Google vira um bilhete pra mim.', kpis:[ ['Leads de anúncio', num(M.anuncios)] ] },
  blog: { titulo:'✍️ Blog', desc:'Toda vez que um artigo novo é publicado no site, eu registro.', kpis:[ ['Artigos no ar', num(M.blog)] ] },
  calculadora: { titulo:'🧮 Calculadora', desc:'A calculadora solar monta kits e orçamentos — cada orçamento gerado vira um bilhete pra mim.', kpis:[ ['Orçamentos', num(X.calculadora)] ] },
  site: { titulo:'🌐 Site', desc:'O site institucional traz visitas e leads — eu registro o que chega de lá.', kpis:[ ['Visitas e leads', num(X.site)] ] },
  financeiro: { titulo:'💰 Financeiro', desc:'Registro cada conta a receber e cada recebimento — o resultado de tudo que passa por mim.', kpis:[ ['Vendas fechadas', num(F.vendas)] ] },
  posvenda: { titulo:'🤝 Pós-venda', desc:'Cuido do cliente depois da venda: a cada etapa da obra que avança, eu sei.', kpis:[ ['Clientes', num(RL.clientes)], ['Manutenções', num(RL.manutencoes)] ] },
  monitoramento: { titulo:'📈 Monitoramento', desc:'Monitoro a geração de cada usina — quando uma dá alerta, o bilhete chega na hora.', kpis:[ ['Usinas monitoradas', num(O.usinas)] ] },
  email: { titulo:'📧 E-mail', desc:'A máquina de e-mail nutre e converte: cada envio e cada abertura passa por mim.', kpis:[ ['E-mails enviados', num(M.emailsEnviados)], ['Abertos', num(M.emailsAbertos)], ['Leads quentes', num(M.leadsQuentes)] ] },
  eva: { titulo:'💬 Eva · WhatsApp', desc:'A Eva conversa com leads e clientes no WhatsApp — eu vejo cada mensagem e cada resposta.', kpis:[ ['Conversas', num(A.conversas)] ] }
};

const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const panelClose = document.getElementById('panelClose');
function openPanel(key){
  const info = INFO[key];
  if(!info) return;
  let html = '<h2>'+info.titulo+'</h2><p class="desc">'+info.desc+'</p>';
  for(const kpi of info.kpis){ html += '<div class="kpi"><span class="l">'+kpi[0]+'</span><span class="n">'+kpi[1]+'</span></div>'; }
  panelBody.innerHTML = html;
  panel.classList.add('open');
}
function closePanel(){ panel.classList.remove('open'); }
panelClose.addEventListener('click', closePanel);
// clique/toque fora do painel fecha (as casas tem seu proprio handler)
document.addEventListener('click', function(ev){
  if(!panel.classList.contains('open')) return;
  if(panel.contains(ev.target)) return;
  if(ev.target.closest && ev.target.closest('.house, .brain')) return;
  closePanel();
}, true);

// ---- Cofre de Custos (camuflado): 🔒 -> PIN -> custos reais do mês ----
// O custo NUNCA vem no SNAP; ele é buscado só aqui, e o servidor só devolve se
// for admin (CEO) + PIN certo. Sem regex nesta parte (sem risco de tela branca).
const cofre = document.getElementById('cofre');
const cofreLock = document.getElementById('cofreLock');
const cofreClose = document.getElementById('cofreClose');
const cofreForm = document.getElementById('cofreForm');
const cofrePin = document.getElementById('cofrePin');
const cofreMsg = document.getElementById('cofreMsg');
const cofreDados = document.getElementById('cofreDados');
let cofrePinOk = '';
function reais(cents){ return (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function abrirCofre(){ cofre.classList.add('open'); setTimeout(function(){ cofrePin.focus(); }, 300); }
function fecharCofre(){ cofre.classList.remove('open'); cofreMsg.textContent=''; cofreDados.innerHTML=''; cofrePin.value=''; cofrePinOk=''; cofreForm.style.display='flex'; }
cofreLock.addEventListener('click', abrirCofre);
cofreClose.addEventListener('click', fecharCofre);

function linhaCusto(l, c, cls){ return '<div class="linha '+(cls||'')+'"><span class="l">'+l+'</span><span class="n">'+reais(c)+'</span></div>'; }
function linhaNum(l, n){ return '<div class="linha"><span class="l">'+l+'</span><span class="n">'+String(n)+'</span></div>'; }
function linhaResultado(c){
  var pos = Number(c||0) >= 0;
  var cor = pos ? '#34d399' : '#f87171';
  var rot = pos ? '⚖️ Resultado (lucro)' : '⚖️ Resultado (prejuízo)';
  return '<div class="linha total"><span class="l">'+rot+'</span><span class="n" style="color:'+cor+'">'+reais(c)+'</span></div>';
}
function renderCustos(d){
  cofreDados.innerHTML =
    linhaCusto('📣 Anúncios (Meta)', d.metaCents) +
    linhaCusto('🔍 Anúncios (Google)', d.googleCents) +
    linhaCusto('🧠 IA (Claude)', d.iaCents) +
    linhaCusto('🔵 Fixos (servidor/assinaturas)', d.fixosCents) +
    linhaCusto('Total gasto no mês', d.totalCents, 'total') +
    '<div style="height:8px"></div>' +
    linhaCusto('💰 Faturamento do mês', d.faturamentoCents) +
    linhaNum('📊 Vendas no mês', d.vendasMes) +
    linhaCusto('🎯 Custo por venda', d.custoPorVendaCents) +
    linhaResultado(d.lucroCents) +
    '<div class="add">' +
      '<input id="fixoNome" type="text" placeholder="Novo fixo: nome (ex.: Servidor)" maxlength="80" />' +
      '<input id="fixoValor" type="number" step="0.01" min="0" placeholder="Valor por mês (R$)" />' +
      '<button type="button" id="fixoAdd">+ Adicionar custo fixo</button>' +
    '</div>';
  document.getElementById('fixoAdd').addEventListener('click', addFixo);
}

cofreForm.addEventListener('submit', function(e){
  e.preventDefault();
  const pin = cofrePin.value.trim();
  if(!pin) return;
  cofreMsg.style.color=''; cofreMsg.textContent='Abrindo...';
  fetch('/dashboard/cerebro/custos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin: pin}) })
    .then(function(r){ if(r.status===403){ throw new Error('403'); } return r.json(); })
    .then(function(d){ cofrePinOk = pin; cofreMsg.textContent=''; cofreForm.style.display='none'; renderCustos(d); })
    .catch(function(err){ cofreMsg.style.color='#f87171'; cofreMsg.textContent = (String(err && err.message) === '403') ? 'PIN incorreto ou sem acesso.' : 'Erro ao abrir. Tenta de novo.'; });
});

function addFixo(){
  const nome = (document.getElementById('fixoNome').value || '').trim();
  const valor = Number(document.getElementById('fixoValor').value);
  if(!nome || !(valor > 0)){ cofreMsg.style.color='#f87171'; cofreMsg.textContent='Preencha nome e valor.'; return; }
  cofreMsg.style.color=''; cofreMsg.textContent='Salvando...';
  fetch('/dashboard/cerebro/custos/fixo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin: cofrePinOk, nome: nome, valor: valor}) })
    .then(function(r){ if(!r.ok){ throw new Error('falhou'); } return r.json(); })
    .then(function(){ cofreMsg.textContent=''; return fetch('/dashboard/cerebro/custos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({pin: cofrePinOk}) }); })
    .then(function(r){ return r.json(); })
    .then(function(d){ renderCustos(d); })
    .catch(function(){ cofreMsg.style.color='#f87171'; cofreMsg.textContent='Não deu pra salvar.'; });
}
</script>
</body>
</html>`;
}
