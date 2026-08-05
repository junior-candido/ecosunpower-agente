// src/modules/relatorios/pasta/template.ts
// Página pública da Pasta Digital — mobile-first: item por item (tocou, abriu);
// desktop: ZIP completo em destaque (mkZip store-only, receita das coletas).
import type { PastaView } from './types.js';
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

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cliente';
}

export function renderPastaHtml(v: PastaView): string {
  const previewBanner = !v.publico
    ? `<div class="banner-revisao">⚠ PREVIEW — versão de revisão. O cliente só vê depois de você publicar e enviar.</div>`
    : '';

  const capaHtml = v.capa_url
    ? `<div class="capa"><img src="${escapeHtml(v.capa_url)}" alt="Foto da usina de ${escapeHtml(v.cliente_nome)}"></div>`
    : '';

  const sistema = v.sistema;
  const sistemaHtml = sistema ? `
    <section>
      <h2>⚡ Seu sistema solar</h2>
      <div class="grid-info">
        <div><label>Potência</label><value>${sistema.potencia_kwp ?? '—'} kWp</value></div>
        <div><label>Painéis</label><value>${sistema.qtd_paineis ?? '—'}${sistema.painel_marca ? ' · ' + escapeHtml(sistema.painel_marca) : ''}${sistema.painel_modelo ? ' ' + escapeHtml(sistema.painel_modelo) : ''}</value></div>
        <div><label>Inversor</label><value>${escapeHtml(sistema.marca_inversor)}${sistema.inversor_modelo ? ' · ' + escapeHtml(sistema.inversor_modelo) : ''}</value></div>
        <div><label>Entrega</label><value>${escapeHtml(formatDateBR(v.data_entrega))}</value></div>
      </div>
    </section>` : '';

  // Seções: fotos/monitoramento = galeria com lightbox (+ player pra vídeo);
  // demais = cartões "tocou, abriu".
  const secoesHtml = v.secoes.map((s) => {
    if (s.secao === 'fotos' || s.secao === 'monitoramento') {
      const videos = s.arquivos.filter((a) => a.is_video);
      const imagens = s.arquivos.filter((a) => !a.is_video);
      return `
    <section>
      <h2>${escapeHtml(s.titulo)}</h2>
      ${videos.map((a) => `
      <div class="video-wrap">
        <video controls playsinline preload="metadata" src="${escapeHtml(a.url)}"></video>
        ${a.caption ? `<div class="video-caption">${escapeHtml(a.caption)}</div>` : ''}
      </div>`).join('')}
      ${imagens.length > 0 ? `
      <div class="grid-fotos">
        ${imagens.map((a) => `
        <figure onclick="abrirFoto('${escapeHtml(a.url)}')">
          <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.caption ?? 'Foto da instalação')}" loading="lazy">
          ${a.caption ? `<figcaption>${escapeHtml(a.caption)}</figcaption>` : ''}
        </figure>`).join('')}
      </div>` : ''}
    </section>`;
    }
    return `
    <section>
      <h2>${escapeHtml(s.titulo)}</h2>
      <div class="lista-docs">
        ${s.arquivos.map((a) => `
        <a class="doc" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
          <span class="doc-ico">${a.is_imagem ? '🖼️' : '📄'}</span>
          <span class="doc-nome">${escapeHtml(a.nome)}</span>
          <span class="doc-acao">abrir ›</span>
        </a>`).join('')}
      </div>
    </section>`;
  }).join('');

  // Lista pro ZIP: nn-secao-nome. JSON com < escapado (não fecha o <script>).
  const zipItems = v.secoes.flatMap((s) =>
    s.arquivos.map((a) => ({ url: a.url, nome: a.nome, secao: s.secao })),
  ).map((a, i) => ({
    url: a.url,
    name: `${String(i + 1).padStart(2, '0')}-${a.secao}-${a.nome.replace(/[\\/:*?"<>|]/g, '_')}`,
  }));
  const zipJson = JSON.stringify(zipItems).replace(/</g, '\\u003c');
  const zipNome = `pasta-${slugify(empresa().nomeFantasia)}-${slugify(v.cliente_nome)}.zip`;
  const temArquivos = zipItems.length > 0;

  const zapHtml = v.whatsapp
    ? `<a class="btn-zap" href="https://wa.me/${escapeHtml(v.whatsapp)}" target="_blank" rel="noopener">💬 Falar com a ${escapeHtml(empresa().nomeFantasia)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Pasta da sua Usina Solar — ${escapeHtml(v.cliente_nome)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;color:#1c1917;line-height:1.6}
  .banner-revisao{background:#fcd34d;color:#78350f;padding:10px;text-align:center;font-weight:600;font-size:14px}
  .container{max-width:780px;margin:0 auto;padding:20px 16px 32px}
  header.hero{background:linear-gradient(135deg,#0891b2 0%,#7c3aed 100%);color:#fff;padding:30px 22px;border-radius:18px;text-align:center;margin-bottom:16px}
  header.hero img.logo{max-height:52px;max-width:220px;margin-bottom:12px}
  header.hero h1{font-size:24px;font-weight:700;margin-bottom:4px}
  header.hero .sub{font-size:14px;opacity:.92}
  .capa{border-radius:16px;overflow:hidden;margin-bottom:16px;box-shadow:0 4px 18px rgba(0,0,0,.12)}
  .capa img{width:100%;max-height:340px;object-fit:cover;display:block}
  section{background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:20px;margin-bottom:14px}
  section h2{font-size:16px;font-weight:700;margin-bottom:12px;color:#0c4a6e}
  .grid-info{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .grid-info div{display:flex;flex-direction:column}
  .grid-info label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#a8a29e;margin-bottom:2px}
  .grid-info value{font-size:14px;font-weight:600}
  .grid-fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .grid-fotos figure{background:#f5f5f4;border-radius:10px;overflow:hidden;cursor:pointer}
  .grid-fotos img{width:100%;height:130px;object-fit:cover;display:block}
  .grid-fotos figcaption{padding:5px 8px;font-size:11px;color:#78716c;background:#fff}
  .video-wrap{margin-bottom:10px}
  .video-wrap video{width:100%;border-radius:10px;background:#000;max-height:420px}
  .video-caption{font-size:11px;color:#78716c;padding:4px 2px}
  .lista-docs{display:flex;flex-direction:column;gap:8px}
  .doc{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e7e5e4;border-radius:12px;text-decoration:none;color:#1c1917;background:#fafaf9}
  .doc:active{background:#f0f9ff}
  .doc-ico{font-size:22px}
  .doc-nome{flex:1;font-size:14px;font-weight:600;word-break:break-word}
  .doc-acao{font-size:13px;color:#0891b2;font-weight:600;white-space:nowrap}
  .zip-desktop{display:none}
  .btn-zip{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border:none;border-radius:12px;background:#0891b2;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  .btn-zip:disabled{opacity:.6;cursor:wait}
  .zip-mobile{text-align:center;margin-top:10px}
  .zip-mobile button{background:none;border:none;color:#78716c;font-size:12px;text-decoration:underline;cursor:pointer}
  .btn-zap{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:12px;background:#16a34a;color:#fff;font-size:15px;font-weight:700;text-decoration:none;margin-top:6px}
  footer{text-align:center;padding:24px 0 8px;color:#78716c;font-size:13px}
  footer .marca{font-weight:700;color:#0c4a6e;margin-bottom:2px}
  #lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:50;align-items:center;justify-content:center;padding:16px}
  #lightbox img{max-width:100%;max-height:92vh;border-radius:8px}
  #lightbox .fechar{position:absolute;top:14px;right:18px;color:#fff;font-size:30px;background:none;border:none;cursor:pointer}
  @media(min-width:768px){
    .container{padding-top:32px}
    header.hero h1{font-size:28px}
    .grid-fotos{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
    .grid-fotos img{height:170px}
    .zip-desktop{display:block;margin-bottom:14px}
    .zip-mobile{display:none}
  }
</style>
</head>
<body>
${previewBanner}
<div class="container">
  <header class="hero">
    <img class="logo" src="${escapeHtml(v.logo_base64)}" alt="${escapeHtml(empresa().nomeFantasia)}">
    <h1>📁 Pasta da sua Usina Solar</h1>
    <div class="sub">${escapeHtml(v.cliente_nome)}${v.cliente_cidade ? ' · ' + escapeHtml([v.cliente_cidade, v.cliente_uf].filter(Boolean).join('-')) : ''}${v.data_entrega ? ' · entregue em ' + escapeHtml(formatDateBR(v.data_entrega)) : ''}</div>
  </header>

  ${capaHtml}

  ${temArquivos ? `
  <div class="zip-desktop">
    <button class="btn-zip" id="btnZipTopo" onclick="baixarTudo(this)">⬇️ Baixar pasta completa (ZIP)</button>
  </div>` : ''}

  ${sistemaHtml}

  ${secoesHtml}

  ${zapHtml}

  ${temArquivos ? `
  <div class="zip-mobile">
    <button onclick="baixarTudo(this)">baixar tudo de uma vez (arquivo ZIP)</button>
  </div>` : ''}

  <footer>
    <div class="marca">${escapeHtml(empresa().nomeFantasia)}</div>
    <div>${escapeHtml(empresa().rtTitulo)} · energia solar com responsabilidade técnica</div>
  </footer>
</div>

<div id="lightbox" onclick="this.style.display='none'">
  <button class="fechar" aria-label="Fechar">×</button>
  <img id="lightbox-img" src="" alt="Foto ampliada">
</div>

<script>
const ARQUIVOS_ZIP = ${zipJson};
const ZIP_NOME = ${JSON.stringify(zipNome)};

function abrirFoto(url){
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}

/* ZIP store-only no navegador — receita validada nas coletas de homologação */
function crc32(u8){var t=crc32.t;if(!t){t=crc32.t=[];for(var i=0;i<256;i++){var c=i;for(var j=0;j<8;j++)c=(c&1)?(3988292384^(c>>>1)):(c>>>1);t[i]=c>>>0}}
 var c=4294967295;for(var k=0;k<u8.length;k++)c=t[(c^u8[k])&255]^(c>>>8);return (c^4294967295)>>>0}
function mkZip(items){
 var enc=new TextEncoder(),parts=[],cd=[],off=0;
 items.forEach(function(it){
  var nm=enc.encode(it.name),by=it.by,crc=crc32(by);
  var lh=new DataView(new ArrayBuffer(30));
  lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);
  lh.setUint32(14,crc,true);lh.setUint32(18,by.length,true);lh.setUint32(22,by.length,true);lh.setUint16(26,nm.length,true);
  parts.push(new Uint8Array(lh.buffer),nm,by);
  cd.push({nm:nm,crc:crc,sz:by.length,off:off});
  off+=30+nm.length+by.length});
 var cdStart=off;
 cd.forEach(function(e){
  var ch=new DataView(new ArrayBuffer(46));
  ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);
  ch.setUint32(16,e.crc,true);ch.setUint32(20,e.sz,true);ch.setUint32(24,e.sz,true);
  ch.setUint16(28,e.nm.length,true);ch.setUint32(42,e.off,true);
  parts.push(new Uint8Array(ch.buffer),e.nm);off+=46+e.nm.length});
 var eo=new DataView(new ArrayBuffer(22));
 eo.setUint32(0,0x06054b50,true);eo.setUint16(8,cd.length,true);eo.setUint16(10,cd.length,true);
 eo.setUint32(12,off-cdStart,true);eo.setUint32(16,cdStart,true);
 parts.push(new Uint8Array(eo.buffer));
 return new Blob(parts,{type:'application/zip'})}

async function baixarTudo(btn){
  if(!ARQUIVOS_ZIP.length) return;
  var original = btn.textContent;
  btn.disabled = true;
  try{
    var items = [];
    for(var i=0;i<ARQUIVOS_ZIP.length;i++){
      btn.textContent = 'Preparando... ' + (i+1) + '/' + ARQUIVOS_ZIP.length;
      var r = await fetch(ARQUIVOS_ZIP[i].url);
      if(!r.ok) throw new Error('download falhou');
      items.push({ name: ARQUIVOS_ZIP[i].name, by: new Uint8Array(await r.arrayBuffer()) });
    }
    var blob = mkZip(items);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ZIP_NOME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 60000);
  }catch(e){
    alert('Não deu pra montar o ZIP agora. Tente de novo — ou baixe os arquivos um a um.');
  }finally{
    btn.disabled = false; btn.textContent = original;
  }
}
</script>
</body>
</html>`;
}
