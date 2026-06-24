// src/modules/proposal/economia-animada-render.ts
// Camada "uau" da seção "como sua economia funciona": uma ilustração ANIMADA ao
// vivo no navegador (espírito da Suíte de Ensaios, mas enxuta e própria da
// proposta — sem controles), mostrando geração×consumo com os VALORES REAIS do
// cliente. Energia flui (animateMotion/SMIL), sol pulsa (CSS) e os contadores de
// kWh/R$ sobem ao rolar até a seção (IntersectionObserver). Adapta por tipo:
//  - on-grid: painel → casa (autoconsumo) + painel → rede (injeção, etiqueta Fio B)
//  - híbrido: + bateria enchendo de dia
//  - off-grid: sem poste/rede, sem Fio B ("você sai da conta de luz")
//  - +carregador: carro carregando de dia (autoconsumo)
// Autocontido (SVG + CSS + JS inline). Fallback PDF/sem-JS: contadores já mostram
// o valor final (o JS apenas anima de 0 até ele).
import type { ProposalCalculations } from './calculator.js';
import { fmtNum, fmtPct } from './format.js';

const fmtPctInt = (frac: number) => fmtPct(frac * 100, 0);

// Cena SVG (viewBox 0 0 880 340): um CIRCUITO LIGADO, com cabos organizados que
// conectam certinho nos terminais de cada aparelho — painel → medidor → casa →
// poste. A energia são RAIOS (streaks brilhantes, estilo trovão) que correm por
// dentro dos cabos. Híbrido liga uma bateria no medidor; off-grid tira o poste e
// o cabo da rede; carregador liga um carro na casa.
function cenaSVG(calc: ProposalCalculations, temCarregador: boolean): string {
  const offGrid = calc.tipoSistema === 'off_grid';
  const comBateria = calc.tipoSistema === 'hibrido' || offGrid;
  const corGer = '#0EA5E9';    // azul  — geração (painel → medidor)
  const corAuto = '#10B981';   // verde — autoconsumo (medidor → casa)
  const corInj = '#F59E0B';    // âmbar — injeção (casa → rede, paga Fio B)

  // Terminais de conexão (dot escuro com miolo branco) onde o cabo encosta no aparelho.
  const term = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="5" fill="#0F172A"/><circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`;

  // RAIO de energia: o próprio cabo redesenhado com tracinhos curtos e brilhantes
  // (glow) que andam ao longo do caminho — parece corrente/relâmpago passando.
  // Núcleo branco por cima dá o "quente" do raio. Sem JS (SMIL), funciona no PDF.
  const raio = (d: string, cor: string, begin: number, dur = 0.9) => `
    <path d="${d}" fill="none" stroke="${cor}" stroke-width="4.5" stroke-linecap="round"
          stroke-dasharray="16 46" filter="url(#eco-glow)">
      <animate attributeName="stroke-dashoffset" values="62;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </path>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="16 46">
      <animate attributeName="stroke-dashoffset" values="62;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </path>`;

  // Geometria do circuito (terminais alinhados num barramento limpo).
  const pOut = [252, 214];       // saída do painel
  const mIn = [352, 237], mOut = [408, 237], mBot = [380, 264]; // terminais do medidor
  const hIn = [516, 224], hOut = [596, 224];                    // entrada/saída da casa
  const gIn = [808, 166];        // conexão no poste
  const batTop = [383, 290];     // topo da bateria

  // Cabos com cantos arredondados (organizados, ortogonais).
  const cabGer = `M${pOut[0]},${pOut[1]} L${pOut[0]},231 Q${pOut[0]},237 ${pOut[0] + 6},237 L${mIn[0]},${mIn[1]}`;
  const cabAuto = `M${mOut[0]},${mOut[1]} L500,237 Q${hIn[0]},237 ${hIn[0]},231 L${hIn[0]},${hIn[1]}`;
  const cabInj = `M${hOut[0]},${hOut[1]} L744,224 Q${gIn[0]},224 ${gIn[0]},198 L${gIn[0]},${gIn[1]}`;
  const cabBat = `M${mBot[0]},${mBot[1]} L${mBot[0]},${batTop[1]}`;

  return `<svg class="eco-anim__svg" viewBox="0 0 880 340" role="img"
       aria-label="Ilustração de como o sistema solar gera e distribui energia">
    <defs>
      <filter id="eco-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- chão -->
    <line x1="20" y1="306" x2="860" y2="306" stroke="#E2E8F0" stroke-width="2"/>

    <!-- SOL (grande, raios pulsando) -->
    <g class="eco-anim__sun" transform="translate(132,106)">
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const x1 = Math.cos(a) * 46, y1 = Math.sin(a) * 46;
        const x2 = Math.cos(a) * 64, y2 = Math.sin(a) * 64;
        return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#FBBF24" stroke-width="5" stroke-linecap="round"/>`;
      }).join('')}
      <circle r="38" fill="#FBBF24"/>
      <circle r="38" fill="none" stroke="#F59E0B" stroke-width="2.5"/>
    </g>

    <!-- PAINÉIS no telhado (com caixa de junção) -->
    <g transform="translate(150,150)">
      <rect x="-6" y="64" width="120" height="8" rx="2" fill="#CBD5E1"/>
      <rect x="0" y="0" width="120" height="64" rx="4" transform="skewX(-16)" fill="#1E293B"/>
      ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
        `<rect x="${6 + c * 28}" y="${6 + r * 19}" width="22" height="14" transform="skewX(-16)" fill="#334155" stroke="#38BDF8" stroke-width="0.7"/>`).join('')).join('')}
      <rect x="92" y="58" width="16" height="12" rx="2" fill="#475569"/>
    </g>

    <!-- CASA -->
    <g transform="translate(${hIn[0] - 8},${hIn[1] - 72})" aria-label="casa">
      <polygon points="48,0 100,38 -4,38" fill="#0F172A"/>
      <rect x="8" y="38" width="80" height="60" rx="3" fill="#F1F5F9" stroke="#0F172A" stroke-width="2"/>
      <rect x="38" y="62" width="24" height="36" fill="#0F172A"/>
      <rect x="18" y="50" width="15" height="15" fill="#FBBF24"/>
    </g>

    ${temCarregador ? `<!-- CARRO (carrega de dia = autoconsumo, do lado da casa; selo de carga preso no carro) -->
    <g transform="translate(420,268)" aria-label="carro carregando">
      <rect x="0" y="8" width="76" height="26" rx="8" fill="#0EA5E9"/>
      <path d="M12,8 L24,-6 L54,-6 L66,8 Z" fill="#38BDF8"/>
      <circle cx="18" cy="36" r="9" fill="#0F172A"/><circle cx="60" cy="36" r="9" fill="#0F172A"/>
      <g class="eco-anim__bolt">
        <circle cx="38" cy="-3" r="11" fill="${corAuto}" stroke="#fff" stroke-width="2"/>
        <path d="M40,-10 l-7,10 h5 l-3,8 9,-11 h-5 z" fill="#fff"/>
      </g>
    </g>` : ''}

    ${offGrid ? '' : `<!-- POSTE / REDE -->
    <g transform="translate(${gIn[0] - 8},${gIn[1] - 8})" aria-label="rede elétrica">
      <rect x="5" y="0" width="6" height="146" fill="#64748B"/>
      <rect x="-14" y="8" width="44" height="6" fill="#64748B"/>
      <rect x="-10" y="26" width="36" height="5" fill="#64748B"/>
    </g>`}

    <!-- CABOS (base cinza) -->
    <path d="${cabGer}" fill="none" stroke="#94A3B8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${cabAuto}" fill="none" stroke="#94A3B8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${offGrid ? '' : `<path d="${cabInj}" fill="none" stroke="#94A3B8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`}
    ${comBateria ? `<path d="${cabBat}" fill="none" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/>` : ''}

    <!-- RAIOS de energia correndo nos cabos -->
    ${raio(cabGer, corGer, 0)}
    ${raio(cabAuto, corAuto, 0.3)}
    ${comBateria ? raio(cabBat, corAuto, 0.6) : ''}
    ${offGrid ? '' : raio(cabInj, corInj, 0.15, 1.05)}

    <!-- MEDIDOR (sobre o cabo) -->
    <g transform="translate(${mIn[0]},${mIn[1] - 26})" aria-label="medidor">
      <rect x="0" y="0" width="56" height="52" rx="8" fill="#fff" stroke="#0F172A" stroke-width="2.5"/>
      <rect x="8" y="9" width="40" height="20" rx="3" fill="#0F172A"/>
      <circle class="eco-anim__bolt" cx="28" cy="40" r="5" fill="#10B981"/>
    </g>

    ${comBateria ? `<!-- BATERIA (ligada no medidor) -->
    <g transform="translate(${batTop[0] - 23},${batTop[1]})" aria-label="bateria">
      <rect x="0" y="0" width="46" height="40" rx="7" fill="#fff" stroke="#0F172A" stroke-width="2.5"/>
      <rect x="16" y="-5" width="14" height="6" rx="2" fill="#0F172A"/>
      <rect class="eco-anim__batt" x="5" y="22" width="36" height="13" rx="3" fill="${corAuto}"/>
    </g>` : ''}

    <!-- TERMINAIS (conexões certinhas) -->
    ${term(pOut[0], pOut[1])}
    ${term(mIn[0], mIn[1])}${term(mOut[0], mOut[1])}
    ${term(hIn[0], hIn[1])}
    ${offGrid ? '' : `${term(hOut[0], hOut[1])}${term(gIn[0], gIn[1])}`}
    ${comBateria ? term(mBot[0], mBot[1]) : ''}

    <!-- LEGENDAS -->
    <text x="460" y="224" text-anchor="middle" class="eco-anim__lbl" fill="#047857">Autoconsumo</text>
    ${offGrid ? '' : `<text x="660" y="300" text-anchor="middle" class="eco-anim__lbl" fill="#B45309">Injeção → rede · Fio B ${fmtPctInt(calc.percentualFioBInicial)}</text>`}
  </svg>`;
}

// Contador animado: textContent já é o valor final (fallback PDF/sem-JS); o JS
// reseta pra 0 e sobe quando a seção entra na tela.
function contador(target: number, label: string, cor: string, prefixo = '', sufixo = ''): string {
  return `<div style="flex:1 1 150px;min-width:140px;text-align:center;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 12px">
    <div style="font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:800;color:${cor};line-height:1">${prefixo}<span class="eco-anim__num" data-target="${Math.round(target)}">${fmtNum(Math.round(target), 0)}</span>${sufixo}</div>
    <div style="font-size:13px;color:#64748B;margin-top:6px;font-weight:600">${label}</div>
  </div>`;
}

const CSS = `<style>
.eco-anim{margin:8px 0 28px}
.eco-anim__svg{width:100%;height:auto;max-height:340px;display:block}
.eco-anim__lbl{font:700 14px Inter,sans-serif}
.eco-anim__sun{transform-box:fill-box;transform-origin:center;animation:eco-pulse 2.6s ease-in-out infinite}
.eco-anim__batt{animation:eco-charge 3s ease-in-out infinite}
.eco-anim__bolt{animation:eco-blink 1s steps(1) infinite}
@keyframes eco-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes eco-charge{0%{height:6px;y:55px}100%{height:54px;y:7px}}
@keyframes eco-blink{0%,50%{opacity:1}51%,100%{opacity:.25}}
@media (prefers-reduced-motion: reduce){.eco-anim__sun,.eco-anim__batt,.eco-anim__bolt{animation:none}}
</style>`;

const JS = `<script>(function(){
  if (window.__ecoAnimInit) return; window.__ecoAnimInit = true;
  function run(el){
    var alvo = parseInt(el.getAttribute('data-target'), 10) || 0;
    var ini = null, dur = 1100;
    function step(ts){
      if (!ini) ini = ts;
      var p = Math.min(1, (ts - ini) / dur);
      var val = Math.round(alvo * (1 - Math.pow(1 - p, 3))); // ease-out
      el.textContent = val.toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function init(){
    // Acessibilidade: quem pede menos movimento — pausa tambem os RAIOS (SMIL),
    // que o CSS prefers-reduced-motion nao alcanca (so cobre animacao CSS).
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.querySelectorAll('.eco-anim__svg').forEach(function(s){
          if (typeof s.pauseAnimations === 'function') s.pauseAnimations();
        });
      }
    } catch (e) { /* sem matchMedia: segue com animacao */ }
    var nums = document.querySelectorAll('.eco-anim__num');
    // Sem IntersectionObserver (ou PDF/sem rolagem): mantém o valor final já
    // renderizado no HTML — nunca mostra 0.
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting){ run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    nums.forEach(function(n){ io.observe(n); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();</script>`;

export function renderEconomiaAnimada(
  calc: ProposalCalculations,
  opts: { temCarregador?: boolean } = {},
): string {
  const offGrid = calc.tipoSistema === 'off_grid';
  const d = calc.contaComDetalhada;
  const temCarregador = !!opts.temCarregador && !offGrid;

  // Sem geração não há o que ilustrar — não desenha fluxo "do nada".
  if (!(calc.geracaoMensalKwh > 0)) return '';

  // Contadores: geração, o que usa de dia (autoconsumo, de graça) e a economia.
  const contadores = offGrid
    ? `${contador(calc.geracaoMensalKwh, 'kWh gerados/mês', '#0F172A', '', ' kWh')}
       ${contador(calc.economiaMensal, 'economia/mês — a conta inteira', '#047857', 'R$ ')}`
    : `${contador(calc.geracaoMensalKwh, 'kWh gerados/mês', '#0F172A', '', ' kWh')}
       ${contador(d.autoconsumoKwh, 'kWh usados na hora (de graça)', '#047857', '', ' kWh')}
       ${contador(calc.economiaMensal, 'economia por mês', '#047857', 'R$ ')}`;

  return `${CSS}
<div class="eco-anim">
  ${cenaSVG(calc, temCarregador)}
  <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px">
    ${contadores}
  </div>
</div>
${JS}`;
}
