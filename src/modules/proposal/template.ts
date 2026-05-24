// Template HTML da proposta EcoSunPower v2.
// Renderiza com base em ProposalData + ProposalCalculations.
// Standalone (CSS inline). Usado tanto pra publicacao web quanto pra geracao de PDF.

import type { ProposalCalculations } from './calculator.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from './assets/logo-base64.js';

export interface ProposalData {
  // Identificacao
  numeroProposta: string; // ex: "2026-0142"
  dataProposta: string;   // ex: "29/04/2026"
  validadeDias: number;   // padrao 5

  // Cliente — opcional no modo junior_envia, exceto nome
  nomeCliente: string;
  documentoCliente?: string;
  enderecoCliente?: string; // resumido (cidade-UF)
  telefoneCliente?: string;
  emailCliente?: string;

  // Sistema
  potenciaKwp: number;
  fatorPerda: number;
  tipoCliente: string;          // residencial / comercial / etc
  modalidade: string;           // autoconsumo local / remoto / compartilhada
  concessionaria: string;       // Neoenergia DF / Equatorial GO

  // Equipamentos
  modulo: { fabricante: string; modelo: string; potenciaW: number; quantidade: number; garantiaDefeito: number; garantiaEficiencia: number; tecnologia?: string };
  inversor: { fabricante: string; modelo: string; potenciaW: number; quantidade: number; garantia: number; eficiencia?: number; tipoInversor?: 'string' | 'microinversor' | 'solaredge' };
  // Tipo de estrutura de fixacao - ex: "Telha cerâmica", "Telha metálica",
  // "Telha fibrocimento", "Laje", "Solo", "Carport". Pode incluir marca/material.
  estruturaFixacao?: { tipo: string; material?: string; descricao?: string };

  // Comercial
  valorTotalRs: number;
  formasPagamento: Array<{ tipo: string; titulo: string; descricao?: string; valorPrincipal: string; valorSecundario: string; recomendado?: boolean; bullets: string[] }>;

  // Tipo da proposta (basica/personalizada) e estudo personalizado opcional
  tipo?: 'basica' | 'personalizada';
  estudoPersonalizado?: {
    fotos: Array<{ url: string; legenda: string; ordem: number }>;
    video?: { thumbnailUrl: string; legenda: string; webVideoUrl: string };
    qrCodeDataUrl?: string;
  };

  // Empresa (defaults)
  empresa: {
    nome: string;       // "EcoSunPower Energia Solar LTDA"
    cnpj: string;       // "33.020.459/0001-06"
    cidade: string;     // "Brasília-DF"
    telefone: string;   // "(61) 99697-8781"
    site: string;       // "ecosunpower.eng.br"
  };
}

const fmtRs = (n: number, frac = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtNum = (n: number, frac = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtPct = (n: number, frac = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac }) + '%';

// Formata valor grande pra notacao curta (R$ 38,5k / R$ 1,2M).
function fmtCurto(n: number): string {
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 1_000) return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return 'R$ ' + fmtRs(n, 0);
}

function fmtPaybackTexto(anos: number, meses: number): string {
  if (anos === 0) return `${meses} meses`;
  if (meses === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

// Renderiza secao "Estudamos seu Telhado" — fotos com layout 1/2/3 + bloco video com QR Code.
// O bloco do video tem o atributo data-video-block + data-video-url pra que a versao web
// (src/index.ts /p/:slug) possa substituir o thumbnail por um <video> nativo na hora.
function renderEstudoPersonalizado(estudo: NonNullable<ProposalData['estudoPersonalizado']>): string {
  const { fotos, video, qrCodeDataUrl } = estudo;
  const fotoCount = fotos.length;

  // Marca d'agua EcoSunPower com logo oficial (PNG transparente, cores originais).
  // Tamanho usa max-width responsivo (10% da imagem) pra nao dominar em mobile.
  // Sombra suave + opacidade pra leitura em qualquer fundo sem chamar atencao demais.
  const watermark = `<img src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower" style="position:absolute;bottom:8px;right:8px;width:auto;height:auto;max-width:14%;max-height:32px;opacity:0.85;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.4));pointer-events:none">`;

  const renderFoto = (f: { url: string; legenda: string }, extra = '') => `
    <figure style="margin:0;${extra}">
      <div style="position:relative">
        <img src="${escapeHtml(f.url)}" style="width:100%;border-radius:12px;display:block">
        ${watermark}
      </div>
      <figcaption style="text-align:center;margin-top:10px;font-size:13px;color:#555;font-style:italic">${escapeHtml(f.legenda)}</figcaption>
    </figure>`;

  let fotosHtml = '';
  if (fotoCount === 1) {
    fotosHtml = `<div style="display:flex;justify-content:center"><div style="max-width:90%;width:100%">${renderFoto(fotos[0])}</div></div>`;
  } else if (fotoCount === 2) {
    fotosHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${fotos.map(f => renderFoto(f)).join('')}</div>`;
  } else if (fotoCount >= 3) {
    fotosHtml = `
      ${renderFoto(fotos[0], 'margin-bottom:16px')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${[fotos[1], fotos[2]].map(f => renderFoto(f)).join('')}</div>`;
  }

  let videoHtml = '';
  if (video) {
    videoHtml = `
      <div data-video-block data-video-url="${escapeHtml(video.webVideoUrl)}" style="margin-top:24px;background:#f7f9fc;padding:24px;border-radius:12px;display:grid;grid-template-columns:2fr 1fr;gap:24px;align-items:center">
        <figure style="margin:0">
          <div style="position:relative">
            ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" style="width:100%;border-radius:8px;display:block">` : `<div style="width:100%;aspect-ratio:16/9;background:#1a3a52;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px">▶</div>`}
            ${watermark}
          </div>
          <figcaption style="margin-top:10px;font-size:13px;color:#555;font-style:italic">🎥 ${escapeHtml(video.legenda)}</figcaption>
        </figure>
        <div style="text-align:center">
          ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" style="width:140px;height:140px;display:block;margin:0 auto">` : ''}
          <p style="font-size:11px;margin-top:8px;color:#666;line-height:1.4">Aponte a câmera<br>do celular pra<br>assistir o vídeo</p>
        </div>
      </div>`;
  }

  return `
<div class="container" style="padding-top:24px">
  <section style="margin:24px 0;padding:32px;border-left:4px solid #f4a83d;background:linear-gradient(180deg,#fdf8f0 0%,#fff 100%);border-radius:12px">
    <span style="display:inline-block;padding:4px 12px;background:#f4a83d;color:#1a3a52;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Estudo Técnico</span>
    <h2 style="color:#1a3a52;margin:8px 0 12px 0;font-size:28px">Estudamos seu Telhado</h2>
    <p style="color:#555;margin:0 0 24px 0;font-size:14px;line-height:1.5">Análise técnica personalizada do imóvel pra dimensionar o sistema ideal.</p>
    ${fotosHtml}
    ${videoHtml}
  </section>
</div>
`;
}

export function renderProposalHTML(data: ProposalData, calc: ProposalCalculations, socialProofHtml = ''): string {
  // Guards contra dados invalidos que estouram o render
  if (!data.nomeCliente || !data.potenciaKwp || data.potenciaKwp <= 0) {
    throw new Error('renderProposalHTML: dados incompletos (nomeCliente ou potenciaKwp)');
  }
  if (!isFinite(calc.contaSemSistemaMensal) || calc.contaSemSistemaMensal <= 0) {
    throw new Error('renderProposalHTML: calc.contaSemSistemaMensal invalido — verificar consumo/tarifa');
  }
  if (!isFinite(calc.geracaoMensalKwh) || calc.geracaoMensalKwh <= 0) {
    throw new Error('renderProposalHTML: calc.geracaoMensalKwh invalido — verificar potencia/HSP/fatorPerda');
  }

  const economiaPercent = Math.min(100, (calc.economiaMensal / calc.contaSemSistemaMensal) * 100);
  const geracaoMensal = Math.round(calc.geracaoMensalKwh);
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta EcoSunPower — ${escapeHtml(data.nomeCliente)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--primary-50:#E6F7FD;--primary-300:#66CFF3;--primary-500:#1FB8E8;--primary-600:#0E7CB8;--primary-700:#0B5A87;--primary-800:#073E5C;--accent-500:#FFC72C;--accent-600:#E5A800;--dark:#0F172A;--dark-soft:#1E293B;--muted:#64748B;--surface:#FFFFFF;--surface-alt:#F8FAFC;--border:#E2E8F0;--success:#10B981}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Inter',system-ui,sans-serif;color:var(--dark);background:var(--surface-alt);line-height:1.6;font-size:16px}
h1,h2,h3,h4,.display{font-family:'Space Grotesk','Inter',sans-serif;font-weight:700;letter-spacing:-0.02em;color:var(--dark)}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
section{padding:80px 0}
.section-tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--primary-600);margin-bottom:12px}
.section-title{font-size:40px;line-height:1.15;margin-bottom:16px}
.section-subtitle{font-size:18px;color:var(--muted);max-width:640px;margin-bottom:40px}
.hero{background:linear-gradient(135deg,#1FB8E8 0%,#0E7CB8 60%,#0F172A 100%);color:#fff;padding:0;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-30%;right:-15%;width:60%;height:120%;background:radial-gradient(circle,rgba(255,199,44,0.15) 0%,transparent 60%);pointer-events:none}
.hero-inner{padding:80px 24px 100px;position:relative;z-index:2}
.hero-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:80px}
.hero-logo{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.02em;display:flex;align-items:center;gap:10px}
.hero-logo-dot{width:10px;height:10px;border-radius:50%;background:var(--accent-500);box-shadow:0 0 16px rgba(255,199,44,0.6)}
.hero-meta{font-size:13px;opacity:0.85;text-align:right}
.hero-meta strong{display:block;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;font-size:11px}
.hero-tag{display:inline-block;background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2);padding:6px 16px;border-radius:100px;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:20px}
.hero h1{font-size:56px;line-height:1.05;color:#fff;margin-bottom:24px;font-weight:800}
.hero h1 span{color:var(--accent-500)}
.hero-lead{font-size:20px;opacity:0.9;max-width:600px;margin-bottom:48px;font-weight:300}
.hero-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;padding-top:48px;border-top:1px solid rgba(255,255,255,0.15)}
.hero-stat-label{font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;opacity:0.7;margin-bottom:8px}
.hero-stat-value{font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700;line-height:1}
.hero-stat-unit{font-size:14px;opacity:0.7;margin-top:4px}
.client-card{background:#fff;border-radius:24px;padding:40px;margin-top:-60px;position:relative;z-index:3;box-shadow:0 30px 60px -20px rgba(15,23,42,0.25);max-width:1052px;margin-left:auto;margin-right:auto}
.client-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:32px}
.client-grid-label{font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.client-grid-value{font-weight:600;color:var(--dark);font-size:14px}
.executive-summary{padding:80px 0;background:#fff}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.summary-card{background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px 24px;transition:all 0.3s;position:relative;overflow:hidden}
.summary-card:hover{transform:translateY(-4px);box-shadow:0 20px 40px -12px rgba(15,23,42,0.15);border-color:var(--primary-300)}
.summary-card::before{content:'';position:absolute;top:0;left:0;width:100%;height:4px;background:var(--primary-500)}
.summary-card.accent::before{background:var(--accent-500)}
.summary-icon{width:48px;height:48px;border-radius:12px;background:var(--primary-50);display:flex;align-items:center;justify-content:center;margin-bottom:16px;color:var(--primary-600)}
.summary-card.accent .summary-icon{background:#FFF8E1;color:var(--accent-600)}
.summary-label{font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.summary-value{font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700;line-height:1.05}
.summary-unit{font-size:14px;color:var(--muted);margin-top:4px;font-weight:500}
.system-section{background:var(--surface-alt)}
.chart-card{background:#fff;border-radius:24px;padding:40px;border:1px solid var(--border);box-shadow:0 4px 24px -8px rgba(15,23,42,0.08)}
.chart-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:32px;flex-wrap:wrap;gap:16px}
.chart-legend{display:flex;gap:24px;font-size:13px;font-weight:500}
.legend-item{display:flex;align-items:center;gap:8px}
.legend-dot{width:10px;height:10px;border-radius:3px}
.chart-container{min-height:320px;position:relative}
.equipment-section{background:#fff}
.equipment-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:8px}
.equipment-card{background:linear-gradient(180deg,#fff 0%,var(--surface-alt) 100%);border:1px solid var(--border);border-radius:20px;padding:32px;position:relative;overflow:hidden}
.equipment-card.featured{border:2px solid var(--primary-500);box-shadow:0 0 40px rgba(31,184,232,0.15)}
.equipment-badge{position:absolute;top:24px;right:24px;background:var(--primary-500);color:#fff;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:4px 10px;border-radius:6px}
.equipment-cat{font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--primary-600);margin-bottom:12px}
.equipment-name{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;line-height:1.2;margin-bottom:8px}
.equipment-brand{font-size:14px;color:var(--muted);font-weight:500;margin-bottom:24px}
.equipment-specs{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding-top:24px;border-top:1px solid var(--border)}
.spec-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px}
.spec-value{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600}
.financial-section{background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%)}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:48px}
.compare-card{padding:40px;border-radius:24px;position:relative;overflow:hidden}
.compare-card.before{background:#fff;border:1px solid var(--border)}
.compare-card.after{background:linear-gradient(135deg,var(--primary-600) 0%,var(--primary-800) 100%);color:#fff}
.compare-card.after::before{content:'';position:absolute;top:-50%;right:-30%;width:100%;height:200%;background:radial-gradient(circle,rgba(255,199,44,0.1) 0%,transparent 60%);pointer-events:none}
.compare-tag{font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:16px;display:inline-block;padding:4px 12px;border-radius:100px}
.compare-card.before .compare-tag{background:#FEE2E2;color:#DC2626}
.compare-card.after .compare-tag{background:rgba(255,255,255,0.2);color:#fff}
.compare-amount{font-family:'Space Grotesk',sans-serif;font-size:48px;font-weight:700;line-height:1;margin-bottom:8px}
.compare-period{font-size:14px;opacity:0.7;margin-bottom:32px}
.compare-list{list-style:none;font-size:14px}
.compare-list li{padding:12px 0;border-bottom:1px solid rgba(15,23,42,0.08);display:flex;justify-content:space-between}
.compare-card.after .compare-list li{border-bottom-color:rgba(255,255,255,0.15)}
.compare-list li:last-child{border-bottom:none}
.indicators-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.indicator-card{background:#fff;border:1px solid var(--border);border-radius:20px;padding:32px;text-align:center}
.indicator-card.highlight{background:linear-gradient(135deg,var(--accent-500) 0%,var(--accent-600) 100%);color:#fff;border:none}
.indicator-icon{width:56px;height:56px;border-radius:16px;background:var(--primary-50);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:var(--primary-600)}
.indicator-card.highlight .indicator-icon{background:rgba(255,255,255,0.2);color:#fff}
.indicator-label{font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;opacity:0.8}
.indicator-value{font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:700;line-height:1}
.indicator-unit{font-size:14px;opacity:0.7;margin-top:4px}
.payment-section{background:#fff}
.payment-grid{display:grid;grid-template-columns:repeat(${data.formasPagamento.length},1fr);gap:24px}
.payment-card{border:1px solid var(--border);border-radius:20px;padding:32px;background:#fff;position:relative;transition:all 0.3s}
.payment-card:hover{border-color:var(--primary-500);transform:translateY(-2px)}
.payment-card.recommended{border:2px solid var(--accent-500);background:linear-gradient(180deg,#FFF8E1 0%,#fff 100%)}
.payment-recommended-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent-500);color:var(--dark);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:6px 16px;border-radius:100px;box-shadow:0 4px 12px rgba(255,199,44,0.4)}
.payment-tag{font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--primary-600);margin-bottom:8px}
.payment-title{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin-bottom:16px}
.payment-amount{font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:700;color:var(--primary-600);margin-bottom:4px;line-height:1}
.payment-amount-sub{font-size:14px;color:var(--muted);margin-bottom:24px}
.payment-features{list-style:none;font-size:14px;padding-top:20px;border-top:1px solid var(--border)}
.payment-features li{padding:8px 0;display:flex;align-items:start;gap:8px;color:var(--muted)}
.payment-features li::before{content:"✓";color:var(--success);font-weight:700;flex-shrink:0}
.cta-section{background:linear-gradient(135deg,var(--dark) 0%,var(--primary-800) 100%);color:#fff;text-align:center;position:relative;overflow:hidden}
.cta-section::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,rgba(255,199,44,0.15) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(31,184,232,0.2) 0%,transparent 50%);pointer-events:none}
.cta-section .container{position:relative;z-index:2}
.cta-section h2{color:#fff;font-size:48px;margin-bottom:16px}
.cta-section p{font-size:20px;opacity:0.85;max-width:600px;margin:0 auto 48px}
.cta-buttons{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:10px;padding:18px 36px;font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;border-radius:100px;text-decoration:none;cursor:pointer;border:none;transition:all 0.3s}
.btn-primary{background:var(--accent-500);color:var(--dark);box-shadow:0 8px 24px rgba(255,199,44,0.4)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(255,199,44,0.5)}
.btn-secondary{background:rgba(255,255,255,0.1);color:#fff;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2)}
.btn-secondary:hover{background:rgba(255,255,255,0.15)}
.cta-badges{margin-top:48px;display:flex;justify-content:center;gap:32px;flex-wrap:wrap;opacity:0.7;font-size:13px}
footer{background:var(--dark);color:rgba(255,255,255,0.7);padding:48px 0 32px;text-align:center;font-size:13px}
footer .container{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
footer strong{color:#fff;font-weight:600}
.footer-meta{font-size:11px;opacity:0.5;margin-top:24px;text-align:center}
@media (max-width:768px){
  .hero h1{font-size:36px}
  .hero-lead{font-size:16px}
  .hero-stats{grid-template-columns:repeat(2,1fr);gap:24px}
  .client-grid,.summary-grid,.indicators-grid{grid-template-columns:repeat(2,1fr)}
  .equipment-grid,.compare-grid,.payment-grid{grid-template-columns:1fr}
  .section-title,.cta-section h2{font-size:32px}
  section{padding:48px 0}
}
@media print{
  .cta-section,footer{break-inside:avoid}
  .cta-buttons{display:none}
  body{background:#fff}
  .hero,.cta-section{break-after:page}
  .summary-card:hover,.equipment-card:hover,.payment-card:hover{transform:none;box-shadow:none}
}
</style>
</head>
<body>

<header class="hero">
  <div class="container hero-inner">
    <div class="hero-nav">
      <div class="hero-logo"><span class="hero-logo-dot"></span> ECOSUNPOWER</div>
      <div class="hero-meta">
        <strong>Proposta #${escapeHtml(data.numeroProposta)}</strong>
        ${escapeHtml(data.dataProposta)} · Válida ${data.validadeDias} dias
      </div>
    </div>

    <span class="hero-tag">⚡ Proposta Comercial Personalizada</span>
    <h1>Energia solar premium<br>para <span>${escapeHtml(data.nomeCliente)}</span></h1>
    <p class="hero-lead">Sistema dimensionado, equipamentos Tier 1 e instalação certificada — projetado pra você economizar até ${fmtPct(economiaPercent, 0)} na conta de luz e valorizar seu imóvel.</p>

    <div class="hero-stats">
      <div>
        <div class="hero-stat-label">Sistema</div>
        <div class="hero-stat-value">${fmtNum(data.potenciaKwp, 1)}</div>
        <div class="hero-stat-unit">kWp instalados</div>
      </div>
      <div>
        <div class="hero-stat-label">Geração</div>
        <div class="hero-stat-value">${fmtNum(geracaoMensal)}</div>
        <div class="hero-stat-unit">kWh/mês estimados</div>
      </div>
      <div>
        <div class="hero-stat-label">Economia</div>
        <div class="hero-stat-value">${fmtPct(economiaPercent, 0)}</div>
        <div class="hero-stat-unit">na conta de luz</div>
      </div>
      <div>
        <div class="hero-stat-label">Investimento</div>
        <div class="hero-stat-value">${fmtCurto(data.valorTotalRs)}</div>
        <div class="hero-stat-unit">à vista</div>
      </div>
    </div>
  </div>
</header>

${data.tipo === 'personalizada' ? `
<div class="container" style="padding-top:16px">
  <div style="background:linear-gradient(135deg,#1a3a52 0%,#f4a83d 100%);color:#fff;padding:14px 24px;text-align:center;font-weight:700;font-size:13px;letter-spacing:1px;border-radius:12px;text-transform:uppercase">
    📐 Proposta com Estudo Técnico Personalizado
  </div>
</div>
` : ''}

${data.estudoPersonalizado ? renderEstudoPersonalizado(data.estudoPersonalizado) : ''}

<div class="container">
  <div class="client-card">
    <div class="client-grid">
      <div><div class="client-grid-label">Cliente</div><div class="client-grid-value">${escapeHtml(data.nomeCliente)}</div></div>
      ${data.enderecoCliente ? `<div><div class="client-grid-label">Endereço</div><div class="client-grid-value">${escapeHtml(data.enderecoCliente)}</div></div>` : ''}
      <div><div class="client-grid-label">Concessionária</div><div class="client-grid-value">${escapeHtml(data.concessionaria)}</div></div>
      <div><div class="client-grid-label">Modalidade</div><div class="client-grid-value">${escapeHtml(data.modalidade)}</div></div>
    </div>
  </div>
</div>

<section class="executive-summary">
  <div class="container">
    <span class="section-tag">Resumo Executivo</span>
    <h2 class="section-title">O que esse sistema faz pra você</h2>
    <p class="section-subtitle">Os números importantes da sua proposta — em uma olhada.</p>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-icon">⚡</div>
        <div class="summary-label">Geração Anual</div>
        <div class="summary-value">${fmtNum(calc.geracaoAnualKwh / 1000, 1)} MWh</div>
        <div class="summary-unit">${fmtNum(calc.geracaoAnualKwh)} kWh por ano</div>
      </div>
      <div class="summary-card accent">
        <div class="summary-icon">⏱</div>
        <div class="summary-label">Payback</div>
        <div class="summary-value">${calc.paybackInviavel ? '> 25 anos' : fmtPaybackTexto(calc.paybackAnos, calc.paybackMeses)}</div>
        <div class="summary-unit">${calc.paybackInviavel ? 'revisar projeto' : 'retorno do investimento'}</div>
      </div>
      <div class="summary-card">
        <div class="summary-icon">📈</div>
        <div class="summary-label">Economia 25 anos</div>
        <div class="summary-value">${fmtCurto(calc.economiaVidaUtil)}</div>
        <div class="summary-unit">com reajuste 10%/ano</div>
      </div>
      <div class="summary-card accent">
        <div class="summary-icon">🌱</div>
        <div class="summary-label">CO₂ evitado</div>
        <div class="summary-value">${fmtNum(calc.co2EvitadoToneladas, 0)} t</div>
        <div class="summary-unit">em 25 anos</div>
      </div>
    </div>
  </div>
</section>

<section class="system-section">
  <div class="container">
    <span class="section-tag">Análise Técnica</span>
    <h2 class="section-title">Consumo × Geração mensal</h2>
    <p class="section-subtitle">Sistema dimensionado pra cobrir seu consumo médio com folga sazonal.</p>
    <div class="chart-card">
      <div class="chart-header">
        <div>
          <div style="font-family:'Space Grotesk';font-size:20px;font-weight:600;margin-bottom:4px">Projeção mensal${data.enderecoCliente ? ` — ${escapeHtml(data.enderecoCliente)}` : ''}</div>
          <div style="font-size:14px;color:var(--muted)">Fator perda ${fmtNum(data.fatorPerda, 2)} aplicado · sazonalidade real</div>
        </div>
        <div class="chart-legend">
          <div class="legend-item"><span class="legend-dot" style="background:linear-gradient(180deg,#FFC72C 0%,#1FB8E8 60%,#0E7CB8 100%)"></span> Geração (kWh)</div>
          <div class="legend-item"><span class="legend-dot" style="background:#CBD5E1"></span> Consumo (kWh)</div>
          <div class="legend-item" style="color:#64748B">☀ = mês cobre 100% do consumo</div>
        </div>
      </div>
      <div class="chart-container">${renderGraficoSVG(calc.geracaoMensalDistribuida, calc.consumoMensalDistribuido)}</div>
      ${renderNotaSazonalidade(calc.geracaoMensalDistribuida, calc.consumoMensalDistribuido, calc.geracaoAnualKwh)}
    </div>
  </div>
</section>

<section class="equipment-section">
  <div class="container">
    <span class="section-tag">Equipamentos Premium</span>
    <h2 class="section-title">O que vai no seu telhado</h2>
    <p class="section-subtitle">Marcas Tier 1 homologadas INMETRO. Sem economias na qualidade.</p>
    <div class="equipment-grid">
      <div class="equipment-card featured">
        <span class="equipment-badge">Tier 1</span>
        <div class="equipment-cat">Módulos Fotovoltaicos</div>
        <div class="equipment-name">${escapeHtml(formataNomeEquipamento(data.modulo.fabricante, data.modulo.modelo))}</div>
        <div class="equipment-brand">${data.modulo.potenciaW} W${data.modulo.tecnologia ? ' · ' + escapeHtml(data.modulo.tecnologia) : ''}</div>
        <div class="equipment-specs">
          <div><div class="spec-label">Quantidade</div><div class="spec-value">${data.modulo.quantidade} unidades</div></div>
          <div><div class="spec-label">Potência Total</div><div class="spec-value">${fmtNum(data.modulo.potenciaW * data.modulo.quantidade)} Wp</div></div>
          <div><div class="spec-label">Garantia Defeito</div><div class="spec-value">${data.modulo.garantiaDefeito} anos</div></div>
          <div><div class="spec-label">Garantia Eficiência</div><div class="spec-value">${data.modulo.garantiaEficiencia} anos</div></div>
        </div>
      </div>
      <div class="equipment-card">
        <div class="equipment-cat">Inversor</div>
        <div class="equipment-name">${escapeHtml(formataNomeEquipamento(data.inversor.fabricante, data.inversor.modelo))}</div>
        <div class="equipment-brand">${data.inversor.tipoInversor === 'microinversor' ? 'Microinversor' : data.inversor.tipoInversor === 'solaredge' ? 'Inversor com otimizadores' : 'Inversor string'}${data.inversor.eficiencia ? ` · Eficiência ${fmtPct(data.inversor.eficiencia * 100)}` : ''}</div>
        <div class="equipment-specs">
          <div><div class="spec-label">Quantidade</div><div class="spec-value">${data.inversor.quantidade} unidade${data.inversor.quantidade > 1 ? 's' : ''}</div></div>
          <div><div class="spec-label">Potência</div><div class="spec-value">${fmtNum(data.inversor.potenciaW)} W</div></div>
          <div><div class="spec-label">Garantia</div><div class="spec-value">${data.inversor.garantia} anos${data.inversor.tipoInversor === 'solaredge' ? ' · extensível até 20 anos' : ''}</div></div>
          <div><div class="spec-label">Monitoramento</div><div class="spec-value">Wi-Fi nativo</div></div>
        </div>
      </div>
    </div>

    ${data.estruturaFixacao ? `
    <div style="margin-top:24px;background:linear-gradient(180deg,#fff 0%,var(--surface-alt) 100%);border:1px solid var(--border);border-radius:20px;padding:32px;display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center">
      <div style="width:64px;height:64px;border-radius:16px;background:var(--primary-50);color:var(--primary-600);display:flex;align-items:center;justify-content:center;font-size:32px">🔩</div>
      <div>
        <div class="equipment-cat">Estrutura de fixação</div>
        <div class="equipment-name">${escapeHtml(data.estruturaFixacao.tipo)}</div>
        <div class="equipment-brand">${data.estruturaFixacao.material ? escapeHtml(data.estruturaFixacao.material) : 'Alumínio anodizado + parafusos inox'}${data.estruturaFixacao.descricao ? ' · ' + escapeHtml(data.estruturaFixacao.descricao) : ''} · Garantia mínima 5 anos</div>
      </div>
    </div>
    ` : ''}
  </div>
</section>

<section style="background:#fff;padding:80px 0">
  <div class="container">
    <span class="section-tag">Por que EcoSunPower</span>
    <h2 class="section-title">Não é só painel no telhado</h2>
    <p class="section-subtitle">Engenharia, segurança e responsabilidade técnica que vão muito além do equipamento.</p>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px">
      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--primary-50);color:var(--primary-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">🛡️</div>
        <h3 style="font-size:20px;margin-bottom:12px">Garantia EcoSunPower 12 meses</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Cobrimos <strong>tudo</strong> que decorrer da nossa instalação: curtos elétricos, fiação CC e CA, fixação, disjuntores, quadros elétricos e até vazamentos no telhado por nossa fixação. Acionamento direto pelo WhatsApp.</p>
      </div>

      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:#FFF8E1;color:var(--accent-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">📋</div>
        <h3 style="font-size:20px;margin-bottom:12px">ART/TRT + Normas ABNT</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Anotação de Responsabilidade Técnica (ART CREA / TRT CFT) assinada pelo nosso Responsável Técnico. Projeto e instalação seguem ABNT NBR 5410, NBR 16690, NBR 16149/16150 e NR-10. Sem improviso.</p>
      </div>

      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--primary-50);color:var(--primary-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">⚡</div>
        <h3 style="font-size:20px;margin-bottom:12px">Marcas Tier 1 INMETRO</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Trabalhamos só com fabricantes Tier 1 homologados pelo INMETRO — <strong>Módulos:</strong> Trina, JA Solar, Jinko, LONGi, Risen, DAH. <strong>Inversores:</strong> Sungrow, Solis, Deye, Huawei, GoodWe, SolarEdge, Hoymiles, NEP. Não economizamos na qualidade: sua geração é a nossa reputação.</p>
      </div>

      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:#FFF8E1;color:var(--accent-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">📊</div>
        <h3 style="font-size:20px;margin-bottom:12px">Monitoramento incluído</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">12 meses de monitoramento remoto sem custo adicional. Detectamos quedas de geração antes de você sentir na conta. Suporte direto comigo (Junior, Responsável Técnico) pelo WhatsApp.</p>
      </div>

      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--primary-50);color:var(--primary-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">🤝</div>
        <h3 style="font-size:20px;margin-bottom:12px">Responsável Técnico que atende direto</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Junior Candido — <strong>Responsável Técnico CREA/CFT da EcoSunPower</strong> — assina a ART/TRT do seu projeto e fica como ponto único de contato pelo WhatsApp. Do orçamento ao pós-venda, você fala com quem entende e decide. Instalação executada por equipe certificada sob supervisão técnica EcoSunPower.</p>
      </div>

      <div style="background:linear-gradient(180deg,var(--surface-alt) 0%,#fff 100%);border:1px solid var(--border);border-radius:20px;padding:32px">
        <div style="width:48px;height:48px;border-radius:12px;background:#FFF8E1;color:var(--accent-600);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:16px">🌐</div>
        <h3 style="font-size:20px;margin-bottom:12px">Eva, sua consultora EcoSunPower</h3>
        <p style="color:var(--muted);font-size:15px;line-height:1.6">Atendimento 24/7 via WhatsApp pra dúvidas, agendamento, status do projeto, garantia. Eva responde rápido — Junior entra em casos complexos.</p>
      </div>
    </div>
  </div>
</section>

<section class="financial-section">
  <div class="container">
    <span class="section-tag">Análise Financeira</span>
    <h2 class="section-title">Sua conta de luz, antes e depois</h2>
    <p class="section-subtitle">A diferença que o sistema vai fazer no seu bolso, mês a mês.</p>
    <div class="compare-grid">
      <div class="compare-card before">
        <span class="compare-tag">Sem Sistema Solar</span>
        <div class="compare-amount">R$ ${fmtRs(calc.contaSemSistemaMensal, 0)}</div>
        <div class="compare-period">por mês · em 2026</div>
        <ul class="compare-list">
          <li><span>Conta anual atual</span> <strong>R$ ${fmtRs(calc.contaSemSistemaMensal * 12, 0)}</strong></li>
          <li><span>Em 5 anos (com 10% reajuste)</span> <strong>R$ ${fmtRs(calc.contaSemSistemaAnual.slice(0, 5).reduce((a, b) => a + b, 0), 0)}</strong></li>
          <li><span>Em 25 anos</span> <strong>R$ ${fmtRs(calc.contaSemSistemaAnual.reduce((a, b) => a + b, 0), 0)}</strong></li>
        </ul>
      </div>
      <div class="compare-card after">
        <span class="compare-tag">Com EcoSunPower</span>
        <div class="compare-amount">R$ ${fmtRs(calc.contaComSistemaMensal, 0)}</div>
        <div class="compare-period">por mês · Fio B + iluminação pública</div>
        <ul class="compare-list">
          <li><span>Custo anual</span> <strong>R$ ${fmtRs(calc.contaComSistemaMensal * 12, 0)}</strong></li>
          <li><span>Economia mensal</span> <strong>R$ ${fmtRs(calc.economiaMensal, 0)}</strong></li>
          <li><span>Economia em 25 anos</span> <strong>R$ ${fmtRs(calc.economiaVidaUtil, 0)}</strong></li>
        </ul>
      </div>
    </div>
    <h3 style="font-size:24px;margin-bottom:24px">Indicadores de viabilidade</h3>
    <div class="indicators-grid">
      <div class="indicator-card">
        <div class="indicator-icon">⏱</div>
        <div class="indicator-label">Payback</div>
        <div class="indicator-value">${calc.paybackInviavel ? '—' : fmtPaybackTexto(calc.paybackAnos, calc.paybackMeses)}</div>
        <div class="indicator-unit">${calc.paybackInviavel ? 'inviável em 25a' : 'do investimento'}</div>
      </div>
      <div class="indicator-card highlight">
        <div class="indicator-icon">📈</div>
        <div class="indicator-label">TIR</div>
        <div class="indicator-value">${fmtPct(calc.tirPercentual, 1)}</div>
        <div class="indicator-unit">ao ano</div>
      </div>
      <div class="indicator-card">
        <div class="indicator-icon">💰</div>
        <div class="indicator-label">ROI 25 anos</div>
        <div class="indicator-value">${fmtNum(calc.roiVezes, 1)}×</div>
        <div class="indicator-unit">do investimento</div>
      </div>
      <div class="indicator-card">
        <div class="indicator-icon">⚖</div>
        <div class="indicator-label">R$/Wp final</div>
        <div class="indicator-value">${fmtNum(calc.rsPorWp, 2)}</div>
        <div class="indicator-unit">com instalação</div>
      </div>
    </div>
  </div>
</section>

<section class="payment-section">
  <div class="container">
    <span class="section-tag">Formas de Pagamento</span>
    <h2 class="section-title">Como você prefere investir?</h2>
    <p class="section-subtitle">Você decide. Pagamento à vista com desconto ou financiamento — o jeito que melhor cabe no seu bolso.</p>
    <div class="payment-grid">
      ${data.formasPagamento.map(p => `
        <div class="payment-card${p.recomendado ? ' recommended' : ''}">
          ${p.recomendado ? '<span class="payment-recommended-badge">⭐ Recomendado</span>' : ''}
          <div class="payment-tag">${escapeHtml(p.tipo)}</div>
          <div class="payment-title">${escapeHtml(p.titulo)}</div>
          <div class="payment-amount">${escapeHtml(p.valorPrincipal)}</div>
          <div class="payment-amount-sub">${escapeHtml(p.valorSecundario)}</div>
          <ul class="payment-features">${p.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
        </div>
      `).join('')}
    </div>
  </div>
</section>

${socialProofHtml}

<section class="cta-section">
  <div class="container">
    <h2>Pronto pra economizar?</h2>
    <p>Aceite a proposta agora e a gente já dá início no projeto. Em 30 dias seu sistema está gerando.</p>
    <div class="cta-buttons">
      <a href="https://wa.me/55${data.empresa.telefone.replace(/\D/g, '')}?text=${encodeURIComponent('Aceito a proposta ' + data.numeroProposta)}" class="btn btn-primary">✓ Aceitar proposta</a>
      <a href="https://wa.me/55${data.empresa.telefone.replace(/\D/g, '')}" class="btn btn-secondary">💬 Tirar dúvidas no WhatsApp</a>
    </div>
    <div class="cta-badges">
      <div>⚡ Ativação em 30 dias</div>
      <div>🛡️ Garantia 12 meses instalação</div>
      <div>📈 Economia em 25 anos: ${fmtCurto(calc.economiaVidaUtil)}</div>
      <div>🌱 ${fmtNum(calc.co2EvitadoToneladas, 0)} t de CO₂ evitadas</div>
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div>
      <strong>${escapeHtml(data.empresa.nome)}</strong>
      <div style="opacity:0.7;margin-top:4px">CNPJ ${escapeHtml(data.empresa.cnpj)} · ${escapeHtml(data.empresa.cidade)}</div>
    </div>
    <div style="text-align:right">
      <strong>${escapeHtml(data.empresa.telefone)}</strong><br>
      <span style="opacity:0.7">${escapeHtml(data.empresa.site)} · Eva, sua consultora</span>
    </div>
  </div>
  <div class="footer-meta">
    Proposta #${escapeHtml(data.numeroProposta)} gerada por Eva em ${escapeHtml(data.dataProposta)} · Engine de cálculo EcoSunPower v1 · Tarifas ${escapeHtml(data.concessionaria)} 2026
  </div>
</footer>

</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]!);
}

// Concatena "Fabricante Modelo" sem duplicar quando modelo ja comeca com palavras
// do fabricante. Caminha palavra a palavra (case-insensitive) descartando do modelo
// as palavras iniciais que coincidem com as do fabricante.
// Exemplos:
//   ("Risen Energy", "Risen 715W")          -> "Risen Energy 715W"
//   ("Risen Energy", "Risen Energy 715W")   -> "Risen Energy 715W"
//   ("JA Solar",     "JA Solar JAM66")      -> "JA Solar JAM66"
//   ("JA Solar",     "JA JAM66")            -> "JA Solar JAM66"
//   ("Hoymiles",     "Hoymiles HM-2250-4T") -> "Hoymiles HM-2250-4T"
//   ("Risen Energy", "RSM132-715BHDG")      -> "Risen Energy RSM132-715BHDG"
function formataNomeEquipamento(fabricante: string, modelo: string): string {
  const f = (fabricante ?? '').trim();
  const m = (modelo ?? '').trim();
  if (!m) return f;
  if (!f) return m;

  const palavrasFab = f.split(/\s+/);
  const palavrasMod = m.split(/\s+/);

  let i = 0;
  while (i < palavrasFab.length && i < palavrasMod.length
         && palavrasMod[i].toLowerCase() === palavrasFab[i].toLowerCase()) {
    i++;
  }

  const resto = palavrasMod.slice(i).join(' ');
  return resto ? `${f} ${resto}` : f;
}

// Renderiza nota explicativa abaixo do grafico SO se houver mes(es) sem cobertura.
// Educa o cliente: "vi que mai/jun/jul nao tem sol — significa que sistema falhou?"
// Resposta: nao, e a sazonalidade real do DF, e a Lei 14.300 garante que creditos
// dos meses bons cobrem automaticamente os meses ruins.
function renderNotaSazonalidade(geracao: number[], consumo: number[], geracaoAnualKwh: number): string {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mesesSemCobertura = geracao
    .map((v, i) => ({ mes: meses[i], cobre: v >= consumo[i] }))
    .filter(x => !x.cobre)
    .map(x => x.mes);

  if (mesesSemCobertura.length === 0) return '';

  const consumoAnual = consumo.reduce((a, b) => a + b, 0);
  const percentCoberturaAnual = consumoAnual > 0
    ? Math.round((geracaoAnualKwh / consumoAnual) * 100)
    : 0;

  const lista = mesesSemCobertura.length === 1
    ? mesesSemCobertura[0]
    : mesesSemCobertura.length === 2
      ? `${mesesSemCobertura[0]} e ${mesesSemCobertura[1]}`
      : mesesSemCobertura.slice(0, -1).join(', ') + ' e ' + mesesSemCobertura.slice(-1);

  return `
    <div style="margin-top:24px;padding:16px 20px;background:#FFF8E1;border-left:3px solid #FFC72C;border-radius:8px;font-size:14px;color:#1E293B;line-height:1.55">
      <strong style="color:#0E7CB8">💡 Por que ${mesesSemCobertura.length === 1 ? 'esse mês' : 'esses meses'} (${lista}) ${mesesSemCobertura.length === 1 ? 'fica' : 'ficam'} sem ☀?</strong><br>
      No nosso clima, o sol é mais baixo no inverno (dias mais curtos, ar seco). Mas pela
      <strong>Lei 14.300/2022</strong>, os créditos gerados nos meses de pico cobrem
      automaticamente os meses de menor geração — você não paga conta cheia em nenhum mês.
      <br>
      <span style="display:inline-block;margin-top:6px;color:#0E7CB8;font-weight:600">
        Anualmente, seu sistema gera ${percentCoberturaAnual}% do consumo — saldo positivo garantido.
      </span>
    </div>
  `;
}

// Renderiza o grafico Consumo x Geracao como SVG inline (sem JS).
// Design "Linha do Sol": 12 grupos de 2 barras (consumo cinza fina + geracao com gradiente
// azul -> amarelo grossa), numero kWh em destaque acima da barra de geracao, mini sol
// quando geracao >= consumo no mes, linha tracejada de media de consumo cruzando.
// Necessario SVG inline porque Drive sandbox nao executa Chart.js no preview HTML.
function renderGraficoSVG(geracao: number[], consumo: number[]): string {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const W = 1000, H = 400;
  const pad = { top: 64, right: 24, bottom: 80, left: 24 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxValue = Math.max(...geracao, ...consumo) * 1.18;
  if (maxValue <= 0) return '<div style="padding:40px;text-align:center;color:#64748B">Sem dados de geração/consumo</div>';

  // Cada mes ocupa uma "celula" — duas barras lado a lado dentro
  const groupW = innerW / meses.length;
  const barW = Math.min(22, groupW * 0.32); // largura de cada barra
  const gap = 4; // gap entre as 2 barras do grupo
  const yScale = (v: number) => pad.top + innerH - (v / maxValue) * innerH;

  // Media anual de consumo (linha tracejada de referencia)
  const mediaConsumo = consumo.reduce((a, b) => a + b, 0) / consumo.length;
  const yMediaConsumo = yScale(mediaConsumo);

  // Renderiza um grupo (mes) com 2 barras + labels + sol opcional
  const grupos = meses.map((m, i) => {
    const cx = pad.left + i * groupW + groupW / 2;
    const xConsumo = cx - barW - gap / 2;
    const xGeracao = cx + gap / 2;
    const vConsumo = consumo[i] ?? 0;
    const vGeracao = geracao[i] ?? 0;

    const yC = yScale(vConsumo);
    const yG = yScale(vGeracao);
    const hC = pad.top + innerH - yC;
    const hG = pad.top + innerH - yG;

    const cobre = vGeracao >= vConsumo;
    const sol = cobre ? `
      <g transform="translate(${cx},${yG - 26})">
        <circle r="9" fill="#FFC72C" stroke="#fff" stroke-width="2"/>
        <g stroke="#FFC72C" stroke-width="2" stroke-linecap="round">
          <line x1="0" y1="-13" x2="0" y2="-16"/>
          <line x1="0" y1="13" x2="0" y2="16"/>
          <line x1="-13" y1="0" x2="-16" y2="0"/>
          <line x1="13" y1="0" x2="16" y2="0"/>
          <line x1="-9" y1="-9" x2="-12" y2="-12"/>
          <line x1="9" y1="-9" x2="12" y2="-12"/>
          <line x1="-9" y1="9" x2="-12" y2="12"/>
          <line x1="9" y1="9" x2="12" y2="12"/>
        </g>
      </g>
    ` : '';

    // Numero da geracao (destaque) — posicao acima da barra ou do sol
    const yLabelGeracao = cobre ? yG - 44 : yG - 8;
    const labelGeracao = `
      <text x="${cx}" y="${yLabelGeracao}" text-anchor="middle" fill="#0E7CB8"
            font-size="13" font-weight="700" font-family="Inter,system-ui,sans-serif">
        ${Math.round(vGeracao).toLocaleString('pt-BR')}
      </text>
    `;

    // Mes (eixo X)
    const labelMes = `
      <text x="${cx}" y="${H - 52}" text-anchor="middle" fill="#0F172A"
            font-size="12" font-weight="700" font-family="Inter,system-ui,sans-serif">
        ${m}
      </text>
    `;

    // Numero do consumo embaixo do mes (cinza escuro, sempre visivel).
    // Posicao isolada da barra evita sobreposicao com numero da geracao acima.
    const labelConsumo = `
      <text x="${cx}" y="${H - 30}" text-anchor="middle" fill="#475569"
            font-size="11" font-weight="600" font-family="Inter,system-ui,sans-serif">
        ${Math.round(vConsumo).toLocaleString('pt-BR')}
      </text>
    `;

    return `
      <g>
        <rect x="${xConsumo}" y="${yC}" width="${barW}" height="${hC}" rx="4" ry="4" fill="#CBD5E1"/>
        <rect x="${xGeracao}" y="${yG}" width="${barW}" height="${hG}" rx="4" ry="4" fill="url(#barGeracaoGrad)"/>
        ${labelGeracao}
        ${sol}
        ${labelMes}
        ${labelConsumo}
      </g>
    `;
  }).join('');

  // Linha base (eixo X)
  const baseY = pad.top + innerH;

  // Linha tracejada de media de consumo — sem texto (a legenda do header ja diz "Consumo").
  // Renderizada DEPOIS das barras (ordem visual = z-index).
  const linhaMedia = `
    <line x1="${pad.left}" y1="${yMediaConsumo}" x2="${W - pad.right}" y2="${yMediaConsumo}"
          stroke="#475569" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.7"/>
  `;

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico mensal de consumo versus geração de energia em kWh, com indicação dos meses em que a geração cobre 100% do consumo" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="barGeracaoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFC72C"/>
          <stop offset="35%" stop-color="#1FB8E8"/>
          <stop offset="100%" stop-color="#0E7CB8"/>
        </linearGradient>
      </defs>
      <line x1="${pad.left}" y1="${baseY}" x2="${W - pad.right}" y2="${baseY}" stroke="#E2E8F0" stroke-width="1"/>
      ${grupos}
      ${linhaMedia}
    </svg>
  `;
}
