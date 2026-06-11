// src/modules/relatorios/pos-instalacao/template.ts
import type { RelatorioPosInstalacaoView } from './types.js';
// [ECOSOF] empresa() lida DENTRO do render (runtime).
import { empresa } from '../../empresa-config.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function renderPosInstalacaoHtml(v: RelatorioPosInstalacaoView): string {
  const sistema = v.sistema;
  const mensagem = v.mensagem_personalizada?.trim();
  const fotosHtml = v.fotos.length > 0
    ? `
    <section class="fotos">
      <h2>📸 Sua obra registrada</h2>
      <div class="grid-fotos">
        ${v.fotos.map((f) => `
          <figure>
            <img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.caption ?? 'Foto da instalação')}" loading="lazy">
            ${f.caption ? `<figcaption>${escapeHtml(f.caption)}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
    </section>`
    : '';

  const sistemaHtml = sistema ? `
    <section class="dados-tecnicos">
      <h2>⚡ Seu sistema solar</h2>
      <div class="grid-info">
        <div><label>Potência</label><value>${sistema.potencia_kwp ?? '—'} kWp</value></div>
        <div><label>Painéis</label><value>${sistema.qtd_paineis ?? '—'}${sistema.painel_marca ? ' · ' + escapeHtml(sistema.painel_marca) : ''}${sistema.painel_modelo ? ' ' + escapeHtml(sistema.painel_modelo) : ''}</value></div>
        <div><label>Inversor</label><value>${escapeHtml(sistema.marca_inversor)}${sistema.inversor_modelo ? ' · ' + escapeHtml(sistema.inversor_modelo) : ''}</value></div>
        <div><label>Instalação</label><value>${escapeHtml(formatDateBR(v.data_instalacao))}</value></div>
        ${v.data_medidor_trocado ? `<div><label>Medidor trocado</label><value>${escapeHtml(formatDateBR(v.data_medidor_trocado))}</value></div>` : ''}
        ${v.concessionaria_label ? `<div><label>Concessionária</label><value>${escapeHtml(v.concessionaria_label)}${v.uc_numero ? ' · UC ' + escapeHtml(v.uc_numero) : ''}</value></div>` : ''}
      </div>
    </section>` : '';

  const previewBanner = !v.publico
    ? `<div class="banner-revisao">⚠ PREVIEW — esta é uma versão de revisão. Cliente só recebe após você clicar "Enviar".</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de instalação — ${escapeHtml(v.cliente_nome)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;color:#1c1917;line-height:1.6}
  .banner-revisao{background:#fcd34d;color:#78350f;padding:10px;text-align:center;font-weight:600;font-size:14px}
  .container{max-width:780px;margin:0 auto;padding:32px 20px}
  header.hero{background:linear-gradient(135deg,#0891b2 0%,#7c3aed 100%);color:#fff;padding:36px 28px;border-radius:18px;text-align:center;margin-bottom:24px}
  header.hero .logo{font-size:13px;letter-spacing:3px;text-transform:uppercase;opacity:.85;margin-bottom:6px}
  header.hero h1{font-size:28px;font-weight:700;margin-bottom:6px}
  header.hero .sub{font-size:15px;opacity:.92}
  section{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:24px;margin-bottom:18px}
  section h2{font-size:17px;font-weight:700;margin-bottom:14px;color:#0c4a6e}
  .mensagem-personalizada{font-size:16px;line-height:1.7;color:#44403c;font-style:italic;border-left:3px solid #fb923c;padding-left:16px}
  .grid-info{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
  .grid-info div{display:flex;flex-direction:column}
  .grid-info label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#a8a29e;margin-bottom:3px}
  .grid-info value{font-size:14px;font-weight:600;color:#1c1917}
  .grid-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .grid-fotos figure{margin:0;background:#f5f5f4;border-radius:10px;overflow:hidden}
  .grid-fotos img{width:100%;height:180px;object-fit:cover;display:block}
  .grid-fotos figcaption{padding:6px 10px;font-size:11px;color:#78716c;background:#fff}
  .garantia{background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);border-color:#86efac}
  .garantia h2{color:#166534}
  .garantia .item{margin-bottom:10px;font-size:14px}
  .garantia .item strong{color:#14532d}
  footer{text-align:center;padding:28px 0 12px;color:#78716c;font-size:13px}
  footer .marca{font-weight:700;color:#0c4a6e;margin-bottom:4px}
  @media(max-width:600px){
    header.hero h1{font-size:22px}
    .grid-info{grid-template-columns:1fr}
    .grid-fotos{grid-template-columns:1fr 1fr}
    .grid-fotos img{height:140px}
  }
</style>
</head>
<body>
${previewBanner}
<div class="container">
  <header class="hero">
    <div class="logo">${escapeHtml(empresa().nomeFantasia)}</div>
    <h1>🎉 Seu sistema solar está ativo</h1>
    <div class="sub">${escapeHtml(v.cliente_nome)} · ${escapeHtml([v.cliente_cidade, v.cliente_uf].filter(Boolean).join('-') || '—')}</div>
  </header>

  ${mensagem ? `
  <section>
    <h2>💬 Mensagem da equipe</h2>
    <p class="mensagem-personalizada">${escapeHtml(mensagem)}</p>
  </section>` : ''}

  ${fotosHtml}

  ${sistemaHtml}

  <section class="garantia">
    <h2>🛡 Garantia ${escapeHtml(empresa().nomeFantasia)}</h2>
    <div class="item"><strong>Instalação e serviço:</strong> ${empresa().garantiaInstalacaoMeses} meses pelo ${escapeHtml(empresa().rtTitulo)} da ${escapeHtml(empresa().nomeFantasia)}</div>
    <div class="item"><strong>Equipamentos (painéis e inversor):</strong> conforme garantia do fabricante</div>
    <div class="item" style="font-size:13px;margin-top:14px;color:#3f6212">Qualquer dúvida ou problema, fale com a gente diretamente pelo WhatsApp.</div>
  </section>

  <footer>
    <div class="marca">${escapeHtml(empresa().nomeFantasia)}</div>
    <div>Energia solar com responsabilidade técnica</div>
    <div style="margin-top:8px;font-size:11px;color:#a8a29e">Gerado em ${escapeHtml(formatDateBR(v.gerado_em))}</div>
  </footer>
</div>
</body>
</html>`;
}
