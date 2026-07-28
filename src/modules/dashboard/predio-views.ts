// src/modules/dashboard/predio-views.ts
// F1 do PRÉDIO VIVO (spec 2026-07-28): a tela 3D. Three.js (CDN pinado, ES
// modules) numa rota SÓ-ECOSUN. Estética decidida: low-poly NOTURNO (nunca
// realismo) — janelas emissivas, chão refletivo suave, estrelas. O prédio
// gira sozinho; arrastar orbita; scroll aproxima; clique num apto abre o
// painel lateral. Dados: fetch em /dashboard/api/predio (polling 10s) OU
// window.__PREDIO_MOCK__ (preview de aprovação do Junior, regra do visual).

export function renderPredioPage(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🏢 Prédio Vivo — EcoSunPower</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap');
  html,body{margin:0;height:100%;background:#05070D;color:#E2E8F0;font-family:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;overflow:hidden}
  #cena{position:fixed;inset:0}
  .hud{position:fixed;z-index:10}
  #titulo{top:18px;left:22px}
  #titulo h1{margin:0;font-size:20px;letter-spacing:.04em}
  #titulo p{margin:2px 0 0;font-size:11px;color:#64748B}
  #voltar{top:18px;right:22px;font-size:12px}
  #voltar a{color:#7DD3FC;text-decoration:none;border:1px solid #1E293B;border-radius:10px;padding:8px 12px;background:rgba(9,14,24,.7);backdrop-filter:blur(6px)}
  #letreiro{left:22px;right:22px;bottom:16px;background:rgba(9,14,24,.72);backdrop-filter:blur(8px);border:1px solid #1E293B;border-radius:14px;padding:10px 14px;font-size:12px;display:flex;gap:18px;align-items:center;overflow:hidden;white-space:nowrap}
  #letreiro b{color:#FDE68A}
  #painel{top:0;right:0;bottom:0;width:340px;max-width:88vw;background:rgba(7,11,20,.92);backdrop-filter:blur(10px);border-left:1px solid #1E293B;padding:20px;transform:translateX(105%);transition:transform .25s ease;overflow:auto}
  #painel.aberto{transform:none}
  #painel h2{margin:0 0 2px;font-size:18px}
  #painel .sub{font-size:11px;color:#64748B;margin-bottom:14px}
  #painel .num{display:flex;justify-content:space-between;border-bottom:1px dashed #1E293B;padding:8px 0;font-size:13px}
  #painel .num b{font-size:16px}
  #painel .secao{margin-top:16px;font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em}
  #painel .mnt{font-size:12px;padding:7px 0;border-bottom:1px solid #111827}
  #painel .st-pedido{color:#FCA5A5}.st-fazendo{color:#FCD34D}.st-entregue{color:#6EE7B7}
  #painel .fechar{position:absolute;top:12px;right:14px;cursor:pointer;color:#64748B;font-size:18px;background:none;border:none}
  #tooltip{position:fixed;pointer-events:none;background:rgba(9,14,24,.9);border:1px solid #1E293B;border-radius:8px;padding:6px 10px;font-size:12px;display:none;z-index:20}
  #aviso-vazio{position:fixed;inset:0;display:none;align-items:center;justify-content:center;color:#64748B;font-size:14px}
</style></head>
<body>
<div id="cena"></div>
<div class="hud" id="titulo"><h1>🏢 Prédio Vivo</h1><p>Cada apartamento é uma empresa · luz acesa = atividade agora · clique num apto</p></div>
<div class="hud" id="voltar"><a href="/dashboard/home">← voltar ao dashboard</a></div>
<div class="hud" id="letreiro">🔧 <b>Manutenções do prédio:</b> <span id="letreiro-itens">carregando…</span></div>
<div class="hud" id="painel">
  <button class="fechar" onclick="document.getElementById('painel').classList.remove('aberto')">✕</button>
  <h2 id="p-nome">—</h2><div class="sub" id="p-sub">—</div>
  <div class="num"><span>⚡ Usinas monitoradas</span><b id="p-usinas">—</b></div>
  <div class="num"><span>👥 Assentos</span><b id="p-assentos">—</b></div>
  <div class="num"><span>📋 Leads</span><b id="p-leads">—</b></div>
  <div class="num"><span>🕐 Último sinal</span><b id="p-sinal">—</b></div>
  <div class="secao">🛠 Pedidos & entregas do apto</div>
  <div id="p-manutencoes"></div>
</div>
<div id="tooltip"></div>
<div id="aviso-vazio">Sem dados do prédio (endpoint indisponível).</div>

<script type="importmap">{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cont = document.getElementById('cena');
const cena = new THREE.Scene();
cena.background = new THREE.Color(0x05070D);
cena.fog = new THREE.Fog(0x05070D, 60, 160);

const cam = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, .1, 400);
cam.position.set(26, 18, 30);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
cont.appendChild(renderer.domElement);
const controles = new OrbitControls(cam, renderer.domElement);
controles.enableDamping = true; controles.maxPolarAngle = Math.PI * .49;
controles.minDistance = 14; controles.maxDistance = 90;
controles.autoRotate = !reduzMovimento; controles.autoRotateSpeed = .6;

cena.add(new THREE.AmbientLight(0x334155, 1.1));
const lua = new THREE.DirectionalLight(0x93C5FD, .5); lua.position.set(-30, 40, 20); cena.add(lua);

// chão refletivo suave + estrelas
const chao = new THREE.Mesh(new THREE.CircleGeometry(90, 64),
  new THREE.MeshStandardMaterial({ color: 0x0B1220, metalness: .6, roughness: .4 }));
chao.rotation.x = -Math.PI/2; cena.add(chao);
{
  const g = new THREE.BufferGeometry(); const N = 700; const pos = new Float32Array(N*3);
  for (let i=0;i<N;i++){ const r=120+Math.random()*80, t=Math.random()*Math.PI*2, p=Math.random()*Math.PI*.5;
    pos[i*3]=r*Math.cos(t)*Math.cos(p); pos[i*3+1]=20+Math.abs(r*Math.sin(p)); pos[i*3+2]=r*Math.sin(t)*Math.cos(p); }
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  cena.add(new THREE.Points(g, new THREE.PointsMaterial({ color:0x94A3B8, size:.35, transparent:true, opacity:.7 })));
}

const AND_ALT = 3.2, LARG = 12, PROF = 9, GAP = .35;
const grupoPredio = new THREE.Group(); cena.add(grupoPredio);
const clicaveis = []; let dados = null; const janelasPorApto = new Map();

function limparPredio(){ while (grupoPredio.children.length) grupoPredio.remove(grupoPredio.children[0]); clicaveis.length = 0; janelasPorApto.clear(); }

function construirPredio(d){
  limparPredio();
  const aptos = d.apartamentos;
  aptos.forEach((apto, i) => {
    const y = 1 + i * (AND_ALT + GAP) + AND_ALT/2;
    const corpo = new THREE.Mesh(
      new THREE.BoxGeometry(LARG, AND_ALT, PROF),
      new THREE.MeshStandardMaterial({ color: apto.ehEcosun ? 0x14243D : 0x101826, metalness:.2, roughness:.7 }));
    corpo.position.y = y; corpo.userData.apto = apto;
    grupoPredio.add(corpo); clicaveis.push(corpo);

    // janelas emissivas (2 fileiras × 5, frente e fundo; 3 nas laterais)
    const jans = [];
    const matJanela = () => new THREE.MeshStandardMaterial({ color:0x0A0F1A,
      emissive: new THREE.Color(0xFFC24D), emissiveIntensity: 0 });
    const addJan = (x, yy, z, rotY) => {
      const j = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .8), matJanela());
      j.position.set(x, yy, z); j.rotation.y = rotY; grupoPredio.add(j); jans.push(j);
    };
    for (const lado of [1, -1]) for (let c=0;c<5;c++) for (let l=0;l<2;l++)
      addJan(-4.4 + c*2.2, y - .7 + l*1.4, lado*(PROF/2 + .02), lado===1?0:Math.PI);
    for (const lado of [1, -1]) for (let c=0;c<3;c++) for (let l=0;l<2;l++)
      addJan(lado*(LARG/2 + .02), y - .7 + l*1.4, -2.6 + c*2.6, lado===1?Math.PI/2:-Math.PI/2);
    janelasPorApto.set(apto.companyId, { jans, apto });

    if (apto.ehEcosun) { // coroamento da cobertura
      const topo = new THREE.Mesh(new THREE.BoxGeometry(LARG*.6, .5, PROF*.6),
        new THREE.MeshStandardMaterial({ color:0x1E3A5F }));
      topo.position.y = y + AND_ALT/2 + .25; grupoPredio.add(topo);
    }
    if (apto.manutencaoAtiva) { // capacete de obra 👷 (cone âmbar girando)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.5, .8, 12),
        new THREE.MeshStandardMaterial({ color:0xF59E0B, emissive:0x7C4A00, emissiveIntensity:.6 }));
      cone.position.set(LARG/2 + 1.1, y, 0); cone.userData.gira = true;
      grupoPredio.add(cone);
    }
  });
  // térreo
  const terreo = new THREE.Mesh(new THREE.BoxGeometry(LARG+2, 1, PROF+2),
    new THREE.MeshStandardMaterial({ color:0x0D1524 }));
  terreo.position.y = .5; grupoPredio.add(terreo);
}

function aplicarLuzes(t){
  if (!dados) return;
  for (const { jans, apto } of janelasPorApto.values()) {
    const base = apto.atividade.brilho * 1.6;
    const pulso = apto.atividade.luzAcesa && !reduzMovimento ? (Math.sin(t*2.2 + jans.length)*.25+.25) : 0;
    jans.forEach((j, idx) => {
      const acesa = idx % 5 !== 4 || apto.atividade.luzAcesa; // variação orgânica
      j.material.emissiveIntensity = acesa ? base + pulso : base * .3;
    });
  }
}

function preencherLetreiro(d){
  const el = document.getElementById('letreiro-itens');
  el.textContent = d.manutencoesPredio.length
    ? d.manutencoesPredio.map(m => m.titulo).join('  ·  ')
    : 'nenhuma manutenção registrada ainda';
}

function abrirPainel(apto){
  const g = (id) => document.getElementById(id);
  g('p-nome').textContent = (apto.ehEcosun ? '🏠 ' : '🏢 ') + apto.nome;
  g('p-sub').textContent = apto.ehEcosun ? 'A casa — cobertura do prédio' : 'Apartamento ' + (apto.andar + 1);
  g('p-usinas').textContent = apto.usinas; g('p-assentos').textContent = apto.assentos; g('p-leads').textContent = apto.leads;
  g('p-sinal').textContent = apto.atividade.ultimoSinalISO ? new Date(apto.atividade.ultimoSinalISO).toLocaleString('pt-BR') : 'sem sinal ainda';
  const mnts = (dados.manutencoes || []).filter(m => m.company_id === apto.companyId);
  g('p-manutencoes').innerHTML = mnts.length
    ? mnts.map(m => '<div class="mnt"><span class="st-' + m.status + '">●</span> ' + m.titulo + ' <span class="st-' + m.status + '">(' + m.status + ')</span></div>').join('')
    : '<div class="mnt" style="color:#475569">nenhum pedido deste apto ainda</div>';
  document.getElementById('painel').classList.add('aberto');
}

// interação: hover tooltip + clique
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
addEventListener('pointermove', (e) => {
  mouse.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
  ray.setFromCamera(mouse, cam);
  const hit = ray.intersectObjects(clicaveis)[0];
  if (hit) { tooltip.style.display='block'; tooltip.style.left=(e.clientX+14)+'px'; tooltip.style.top=(e.clientY+10)+'px';
    const a = hit.object.userData.apto; tooltip.textContent = a.nome + (a.atividade.luzAcesa ? ' · 🟢 ativo agora' : ''); }
  else tooltip.style.display='none';
});
addEventListener('click', () => {
  ray.setFromCamera(mouse, cam);
  const hit = ray.intersectObjects(clicaveis)[0];
  if (hit) abrirPainel(hit.object.userData.apto);
});
addEventListener('resize', () => { cam.aspect = innerWidth/innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

async function carregar(){
  try {
    const d = window.__PREDIO_MOCK__ ?? await (await fetch('/dashboard/api/predio')).json();
    dados = d; construirPredio(d); preencherLetreiro(d);
  } catch { document.getElementById('aviso-vazio').style.display = 'flex'; }
}
await carregar();
if (!window.__PREDIO_MOCK__) setInterval(carregar, 10_000);

renderer.setAnimationLoop((tms) => {
  const t = tms/1000;
  aplicarLuzes(t);
  grupoPredio.children.forEach(o => { if (o.userData.gira && !reduzMovimento) o.rotation.y = t*1.5; });
  controles.update();
  renderer.render(cena, cam);
});
</script>
</body></html>`;
}
