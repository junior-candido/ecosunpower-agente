// src/modules/dashboard/cerebro-views.ts
// Tela full-screen "viva" do Elo — o cerebro do EcoSunPower. Adaptado do
// protótipo aprovado (brain-elo.html): Elo pulsando no centro, um neurônio
// por departamento, sinais viajando pelas conexões, barra de fala do Elo.
// Aqui a gente injeta números reais (SnapshotElo), liga a caixa "Pergunte
// ao Elo" (fetch pro endpoint /dashboard/cerebro/perguntar) e um painel
// lateral que abre com os números reais de cada departamento ao clicar.
//
// Auto-contido: todo CSS/JS inline, sem asset externo (CSP-friendly).
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
  html,body { height:100%; background:#060b16; overflow:hidden; font-family:-apple-system,Segoe UI,Roboto,sans-serif; }
  #wrap { position:fixed; inset:0; }
  #canvasWrap { position:absolute; top:0; left:0; bottom:0; right:0; transition:right .28s ease; }
  canvas { display:block; width:100%; height:100%; cursor:pointer; }
  #wrap.panel-open #canvasWrap { right:360px; }
  .topbar {
    position:absolute; top:0; left:0; right:0; z-index:5;
    display:flex; align-items:center; gap:12px;
    padding:18px 26px;
    background:linear-gradient(180deg, rgba(6,11,22,.85), rgba(6,11,22,0));
    pointer-events:none;
  }
  .topbar .dot { width:10px; height:10px; border-radius:50%; background:#22c55e; box-shadow:0 0 14px #22c55e; animation:blink 2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
  .topbar h1 { color:#e6f0ff; font-size:16px; font-weight:700; letter-spacing:.3px; }
  .topbar h1 b { color:#34d399; font-weight:800; }
  .topbar span { color:#5f7fa8; font-size:13px; font-weight:400; }
  .speech {
    position:absolute; left:50%; bottom:120px; transform:translateX(-50%);
    z-index:5; width:min(720px, 88vw);
    background:rgba(11,22,40,.72); backdrop-filter:blur(10px);
    border:1px solid rgba(52,211,153,.25);
    border-radius:16px; padding:18px 24px;
    box-shadow:0 10px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05);
    text-align:center;
    pointer-events:none;
  }
  .speech .who { color:#34d399; font-size:12px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:8px; }
  .speech .who i { width:6px; height:6px; border-radius:50%; background:#34d399; box-shadow:0 0 10px #34d399; }
  .speech p { color:#dbe8fb; font-size:18px; line-height:1.55; min-height:56px; transition:opacity .5s; }
  .hint { position:absolute; top:70px; left:50%; transform:translateX(-50%); z-index:5; color:#3d557a; font-size:12px; pointer-events:none; }

  #askBox {
    position:absolute; left:50%; bottom:28px; transform:translateX(-50%);
    z-index:6; width:min(560px, 88vw);
    display:flex; gap:8px;
  }
  #askForm { display:flex; gap:8px; width:100%; }
  #askInput {
    flex:1; background:rgba(11,22,40,.85); border:1px solid rgba(251,191,36,.35);
    border-radius:12px; padding:12px 16px; color:#e6f0ff; font-size:14px; outline:none;
  }
  #askInput::placeholder { color:#5f7fa8; }
  #askInput:focus { border-color:#fbbf24; box-shadow:0 0 0 3px rgba(251,191,36,.15); }
  #askForm button {
    background:linear-gradient(135deg,#fbbf24,#f59e0b); color:#1a1400; border:none;
    border-radius:12px; padding:0 20px; font-weight:700; font-size:14px; cursor:pointer;
  }
  #askForm button:disabled { opacity:.6; cursor:default; }

  #panel {
    position:absolute; top:0; right:0; bottom:0; z-index:8;
    width:min(360px, 88vw);
    background:rgba(8,15,28,.96); backdrop-filter:blur(14px);
    border-left:1px solid rgba(52,211,153,.25);
    box-shadow:-20px 0 50px rgba(0,0,0,.5);
    transform:translateX(100%); transition:transform .28s ease;
    padding:26px 22px;
    color:#dbe8fb;
    overflow-y:auto;
  }
  #panel.open { transform:translateX(0); }
  #panel .panelClose {
    position:absolute; top:16px; right:16px; width:30px; height:30px; border-radius:50%;
    background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#dbe8fb;
    font-size:16px; cursor:pointer; line-height:1;
  }
  #panel h2 { font-size:20px; margin:6px 30px 6px 0; color:#e6f0ff; }
  #panel .desc { color:#9fb4d4; font-size:13px; line-height:1.5; margin-bottom:18px; }
  #panel .kpi { display:flex; justify-content:space-between; align-items:baseline; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06); }
  #panel .kpi .n { font-size:22px; font-weight:800; color:#34d399; }
  #panel .kpi .l { font-size:13px; color:#9fb4d4; }
</style>
</head>
<body>
<div id="wrap">
  <div id="canvasWrap"><canvas id="c"></canvas></div>
  <div class="topbar">
    <div class="dot"></div>
    <h1><b>Elo</b> · cérebro do EcoSunPower</h1>
    <span>· coordenando os departamentos, ao vivo</span>
  </div>
  <div class="hint">clique num departamento pra ver os números · o Elo no centro</div>
  <div class="speech">
    <div class="who"><i></i> o Elo está falando</div>
    <p id="say">${primeiraFala}</p>
  </div>
  <div id="askBox">
    <form id="askForm" autocomplete="off">
      <input id="askInput" type="text" placeholder="Pergunte ao Elo..." maxlength="300" />
      <button type="submit" id="askBtn">Perguntar</button>
    </form>
  </div>
  <aside id="panel">
    <button class="panelClose" id="panelClose" type="button" aria-label="Fechar">✕</button>
    <div id="panelBody"></div>
  </aside>
</div>
<script>
const SNAP = ${snapJson};
const FALAS = ${falasJson};

const wrap = document.getElementById('wrap');
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H, DPR;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W*DPR; cv.height = H*DPR;
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize); resize();

// re-chama resize() a cada frame enquanto o painel abre/fecha (transicao CSS
// de ~280ms), pra o cerebro reacomodar suavemente na area que sobrou
let panelResizeRaf = null;
function animatePanelResize(){
  if(panelResizeRaf) cancelAnimationFrame(panelResizeRaf);
  const start = performance.now(), dur = 340;
  (function step(now){
    resize();
    if(now - start < dur){ panelResizeRaf = requestAnimationFrame(step); }
    else { panelResizeRaf = null; }
  })(start);
}

// ---- Elo + departamentos (posições normalizadas), números reais do SNAP ----
const NODES = [
  {id:'core', dept:'elo',            label:'Elo · '+SNAP.elo.totalEventos+' eventos',              emoji:'🧠', x:.50, y:.50, r:36, c:'#34d399', core:true},
  {id:'com',  dept:'comercial',      label:'Comercial · '+SNAP.comercial.leads+' leads',            emoji:'🎯', x:.50, y:.16, r:22, c:'#4ade80'},
  {id:'aten', dept:'atendimento',    label:'Atendimento · '+SNAP.atendimento.conversas,             emoji:'💬', x:.20, y:.32, r:21, c:'#22d3ee'},
  {id:'mkt',  dept:'marketing',      label:'Marketing · '+SNAP.marketing.emailsEnviados+' e-mails', emoji:'📣', x:.80, y:.30, r:22, c:'#a78bfa'},
  {id:'op',   dept:'operacao',       label:'Operação · '+SNAP.operacao.usinas+' usinas',            emoji:'⚡', x:.84, y:.60, r:20, c:'#fbbf24'},
  {id:'pos',  dept:'relacionamento', label:'Relacionamento · '+SNAP.relacionamento.clientes,        emoji:'🤝', x:.66, y:.84, r:20, c:'#f472b6'},
  {id:'fin',  dept:'financeiro',     label:'Financeiro · '+SNAP.financeiro.vendas,                  emoji:'💰', x:.26, y:.82, r:20, c:'#fbbf24'}
];
const NI = Object.fromEntries(NODES.map((n,i)=>[n.id,i]));
const EDGES = [
  ['core','com'],['core','aten'],['core','mkt'],['core','op'],['core','pos'],['core','fin'],
  ['com','aten'],['com','mkt'],['mkt','aten'],['op','pos'],['fin','com'],['pos','aten'],['fin','pos']
];

const BG = Array.from({length:70}, (_,i)=>({
  x: (i*0.137)%1, y:(i*0.311+0.05)%1, r: 0.6+ (i%3)*0.5, ph: i*0.7
}));

const signals = [];
let sigSeed = 0;
function spawnSignal(){
  const e = EDGES[(sigSeed++ * 7) % EDGES.length];
  const a = NODES[NI[e[0]]], b = NODES[NI[e[1]]];
  signals.push({a,b,t:0, sp:0.006+ (sigSeed%5)*0.0016, c: (sigSeed%2? a.c : b.c)});
}
function px(n){ return n.x*W; } function py(n){ return n.y*H; }

let tG = 0;
function frame(){
  tG += 0.016;
  ctx.clearRect(0,0,W,H);
  const g = ctx.createRadialGradient(W*0.5,H*0.5,0, W*0.5,H*0.5, Math.max(W,H)*0.7);
  g.addColorStop(0,'#0b1a2e'); g.addColorStop(1,'#060b16');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  for(const p of BG){
    const tw = 0.35+0.3*Math.sin(tG*1.3+p.ph);
    ctx.beginPath(); ctx.arc(p.x*W, p.y*H, p.r, 0, 7);
    ctx.fillStyle='rgba(90,140,200,'+tw*0.5+')'; ctx.fill();
  }

  ctx.lineWidth=1.1;
  for(const e of EDGES){
    const a=NODES[NI[e[0]]], b=NODES[NI[e[1]]];
    const pulse = 0.12+0.10*Math.sin(tG*1.5 + a.x*10 + b.y*10);
    ctx.strokeStyle='rgba(52,211,153,'+pulse+')';
    ctx.beginPath();
    ctx.moveTo(px(a),py(a));
    const mx=(px(a)+px(b))/2, my=(py(a)+py(b))/2 - 18;
    ctx.quadraticCurveTo(mx,my,px(b),py(b));
    ctx.stroke();
  }

  if(Math.random()<0.09 || signals.length<6) spawnSignal();
  for(let i=signals.length-1;i>=0;i--){
    const s=signals[i]; s.t+=s.sp;
    if(s.t>=1){ signals.splice(i,1); continue; }
    const mx=(px(s.a)+px(s.b))/2, my=(py(s.a)+py(s.b))/2 - 18;
    const t=s.t, it=1-t;
    const x = it*it*px(s.a) + 2*it*t*mx + t*t*px(s.b);
    const y = it*it*py(s.a) + 2*it*t*my + t*t*py(s.b);
    ctx.save(); ctx.shadowBlur=14; ctx.shadowColor=s.c;
    ctx.beginPath(); ctx.arc(x,y,3.2,0,7); ctx.fillStyle=s.c; ctx.fill();
    ctx.restore();
  }

  for(const n of NODES){
    const x=px(n), y=py(n);
    const pulse = n.core ? (1+0.06*Math.sin(tG*2)) : (1+0.05*Math.sin(tG*2.4+n.x*8));
    const r = n.r*pulse;
    ctx.save(); ctx.shadowBlur=n.core?42:20; ctx.shadowColor=n.c;
    const rg=ctx.createRadialGradient(x,y,2,x,y,r);
    rg.addColorStop(0, n.core?'rgba(210,255,230,.98)':'rgba(255,255,255,.9)');
    rg.addColorStop(0.35, n.c);
    rg.addColorStop(1, 'rgba(10,20,35,0)');
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fillStyle=rg; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.strokeStyle=n.c; ctx.globalAlpha=.5; ctx.lineWidth=1.4; ctx.stroke(); ctx.globalAlpha=1;
    ctx.font=(n.core?30:16)+'px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(n.emoji, x, y+1);
    ctx.font='700 '+(n.core?18:12)+'px -apple-system,Segoe UI,sans-serif';
    ctx.fillStyle= n.core?'#c9ffe4':'#cfe0f5';
    ctx.fillText(n.label, x, y + r + (n.core?20:15));
  }
  requestAnimationFrame(frame);
}
frame();

// ---- barra de fala: cicla FALAS a cada ~4s, com pausa quando o Elo responde uma pergunta ----
let li=0; const sayEl=document.getElementById('say');
let cycleTimer=null;
function showSay(text){
  sayEl.style.opacity=0;
  setTimeout(()=>{ sayEl.textContent=text; sayEl.style.opacity=1; }, 320);
}
function startCycle(){
  if(cycleTimer) clearInterval(cycleTimer);
  cycleTimer=setInterval(()=>{
    li=(li+1)%FALAS.length;
    showSay(FALAS[li]);
  }, 4200);
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
  askInput.value='';
  askInput.blur();
  askBtn.disabled = true;
  if(cycleTimer) clearInterval(cycleTimer);
  showSay('Deixa eu ver isso...');
  fetch('/dashboard/cerebro/perguntar', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({pergunta: pergunta})
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    showSay(data && data.resposta ? data.resposta : 'Não consegui responder agora, tenta de novo.');
  })
  .catch(function(){
    showSay('Deu um erro ao falar com o Elo. Tenta de novo em instantes.');
  })
  .finally(function(){
    askBtn.disabled = false;
    setTimeout(startCycle, 6000);
  });
});

// ---- painel lateral: clique num departamento abre os números reais ----
const DEPT_INFO = {
  elo: {
    titulo: '🧠 Elo · visão geral',
    desc: 'Sou o cérebro do EcoSunPower: cada evento de cada departamento passa por mim, e eu ligo tudo.',
    kpis: [ ['Eventos registrados', SNAP.elo.totalEventos] ]
  },
  comercial: {
    titulo: '🎯 Comercial',
    desc: 'Acompanho cada lead do primeiro contato até a venda fechada.',
    kpis: [
      ['Leads', SNAP.comercial.leads],
      ['Em negociação', SNAP.comercial.negociacao],
      ['Ganhos', SNAP.comercial.ganhos],
      ['Propostas enviadas', SNAP.comercial.propostas]
    ]
  },
  atendimento: {
    titulo: '💬 Atendimento · Eva',
    desc: 'A Eva conversa com leads e clientes pelo WhatsApp — eu vejo cada troca.',
    kpis: [ ['Conversas', SNAP.atendimento.conversas] ]
  },
  marketing: {
    titulo: '📣 Marketing · E-mail',
    desc: 'Cada e-mail aberto me diz quem está mais perto de comprar.',
    kpis: [
      ['E-mails enviados', SNAP.marketing.emailsEnviados],
      ['E-mails abertos', SNAP.marketing.emailsAbertos],
      ['Leads quentes', SNAP.marketing.leadsQuentes]
    ]
  },
  operacao: {
    titulo: '⚡ Operação',
    desc: 'Monitoro a geração de cada usina instalada, em tempo real.',
    kpis: [ ['Usinas monitoradas', SNAP.operacao.usinas] ]
  },
  relacionamento: {
    titulo: '🤝 Relacionamento',
    desc: 'Cuido do pós-venda: manutenções, avisos e satisfação do cliente.',
    kpis: [
      ['Clientes', SNAP.relacionamento.clientes],
      ['Manutenções', SNAP.relacionamento.manutencoes]
    ]
  },
  financeiro: {
    titulo: '💰 Financeiro',
    desc: 'Registro cada fechamento — é o resultado de tudo que passa por mim.',
    kpis: [ ['Vendas fechadas', SNAP.financeiro.vendas] ]
  }
};

const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const panelClose = document.getElementById('panelClose');

function openPanel(deptKey){
  const info = DEPT_INFO[deptKey];
  if(!info) return;
  let html = '<h2>'+info.titulo+'</h2><p class="desc">'+info.desc+'</p>';
  for(const kpi of info.kpis){
    html += '<div class="kpi"><span class="l">'+kpi[0]+'</span><span class="n">'+kpi[1]+'</span></div>';
  }
  panelBody.innerHTML = html;
  panel.classList.add('open');
  wrap.classList.add('panel-open');
  animatePanelResize();
}
function closePanel(){
  panel.classList.remove('open');
  wrap.classList.remove('panel-open');
  animatePanelResize();
}
panelClose.addEventListener('click', closePanel);

cv.addEventListener('click', function(ev){
  const rect = cv.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  let hit = null;
  for(const n of NODES){
    const nx = px(n), ny = py(n);
    const dist = Math.hypot(x-nx, y-ny);
    if(dist <= n.r + 12){ hit = n; break; }
  }
  if(hit) openPanel(hit.dept); else closePanel();
});
</script>
</body>
</html>`;
}
