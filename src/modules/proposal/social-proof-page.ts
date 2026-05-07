import type { Case } from '../cases-fetcher.js';

interface SocialProofInput {
  cases: Case[];
  googleNota: string;
  googleQtdAvaliacoes: number;
  depoimento?: { texto: string; cliente: string; cidade: string };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSocialProofPage(input: SocialProofInput): string {
  const { cases, googleNota, googleQtdAvaliacoes, depoimento } = input;

  const cards = cases.slice(0, 3).map(c => `
    <div style="flex:1;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff">
      <img src="${escapeHtml(c.fotoPrincipal)}" alt="${escapeHtml(c.titulo)}" style="width:100%;height:120px;object-fit:cover" />
      <div style="padding:12px">
        <div style="font-weight:bold;font-size:13px">${escapeHtml(c.titulo)}</div>
        <div style="font-size:11px;color:#64748b">${escapeHtml(c.cidade)}-${escapeHtml(c.uf)}${c.kwp ? ` · ${c.kwp} kWp` : ''}</div>
      </div>
    </div>
  `).join('');

  const depoimentoHtml = depoimento ? `
    <blockquote style="margin:0;font-style:italic;color:#334155;font-size:13px;line-height:1.6">
      "${escapeHtml(depoimento.texto)}"
      <footer style="margin-top:6px;font-style:normal;font-size:11px;color:#64748b">
        — ${escapeHtml(depoimento.cliente)}, ${escapeHtml(depoimento.cidade)}
      </footer>
    </blockquote>
  ` : '';

  return `
<div style="page-break-before:always;padding:32px 28px;font-family:'Inter',Arial,sans-serif;color:#0f172a">
  <h2 style="font-size:22px;margin:0 0 16px">Você não está sozinho.</h2>
  <p style="font-size:14px;color:#475569;margin:0 0 20px">600+ clientes já economizam com a EcoSunPower em Brasília e Goiás.</p>

  <div style="display:flex;gap:16px;align-items:center;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin-bottom:24px">
    <div style="font-size:32px">⭐</div>
    <div>
      <div style="font-size:18px;font-weight:bold">${escapeHtml(googleNota)} no Google</div>
      <div style="font-size:12px;color:#78350f">${googleQtdAvaliacoes} avaliações verificadas</div>
    </div>
    ${depoimentoHtml}
  </div>

  <h3 style="font-size:14px;color:#475569;margin:0 0 12px">Outros clientes parecidos com o seu projeto:</h3>
  <div style="display:flex;gap:12px">${cards}</div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
    <span>Linha do Sol™ — EcoSunPower</span>
    <span>Responsável Técnico CREA/CFT</span>
  </div>
</div>
  `.trim();
}
