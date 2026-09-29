// src/modules/dashboard/servicos-views.ts
// Diário de Serviços (F1) — telas MOBILE-FIRST: o instalador usa no celular,
// no sol, com luva. Botão grande, campo grande, pouco texto.
// Fluxo do novo registro: 1) POST /dashboard/servicos/nova (JSON, sem os
// arquivos) → volta {id, uploads:[{url}]}; 2) navegador sobe cada arquivo
// DIRETO pro Storage (PUT na URL assinada — vídeo não passa pelo Express);
// 3) POST /servicos/:id/confirmar-midias com o que subiu → lista.
//
// Renovação do miolo — R14 (28/09/2026): lista, novo, detalhe e lixeira no
// padrão cc- do Command Center, tema ESCURO (decisão do dono p/ todas as telas
// renovadas; contraste alto pro sol), sem Tailwind. Mesmos fetch, ids, names,
// forms e confirm. "Tirar foto" virou botão grande (≥ 48 px no celular).
// Conserto: o resultado da busca de cliente/usina era montado com innerHTML
// usando o NOME do lead cru (lead vem do WhatsApp) — agora é DOM + textContent.
// A página PÚBLICA do link mágico (renderCampoPublicoPage) NÃO muda.
import { renderLayout, escapeHtml } from './views.js';
import { LOGO_PASTA_BASE64 } from '../relatorios/pasta/logo-pasta.js';
import type { DashUser } from './permissions.js';
import type { ServicoRow, TipoServico } from './servicos-store.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, estadoVazio, botao, menuAcoes, celulaDupla, aviso as avisoCc, icone,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** CSS das telas de Serviços (classes cc-sv-*). Exportado pro teste do tamanho do botão de foto. */
export const CSS_SERVICOS = `
.cc-sv .cc-panel+.cc-panel,.cc-sv .cc-aviso+.cc-panel,.cc-sv .cc-panel+.cc-aviso,.cc-sv .cc-aviso+.cc-aviso{margin-top:16px}
.cc-sv-col{max-width:760px}
/* .hidden (liga/desliga pelo JS) vence o display dos blocos cc-sv (ex.: .cc-sv-par é grid) */
.cc-sv .hidden{display:none!important}
.cc-sv-form{display:flex;flex-direction:column;gap:16px}
.cc-sv-form .cc-campo input,.cc-sv-form .cc-campo select,.cc-sv-form .cc-campo textarea{width:100%}
.cc-sv-dica{font-size:12.5px;color:var(--cc-muted);line-height:1.45}
.cc-sv-par{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
.cc-sv-par input{width:100%}
.cc-sv-opcoes{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.cc-sv-opcoes:empty{display:none}
.cc-sv-opcao{display:block;width:100%;text-align:left;min-height:44px;padding:10px 12px;border:1px solid var(--cc-line-2);border-radius:10px;background:var(--cc-surface-2);color:var(--cc-text);font:inherit;font-size:14px;cursor:pointer}
.cc-sv-opcao:hover,.cc-sv-opcao:focus{border-color:var(--cc-gold);outline:none}
.cc-sv-escolhido{margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--cc-ok-soft);color:var(--cc-ok);font-size:14px;font-weight:600;overflow-wrap:anywhere}
.cc-sv-escolhido-usina{background:var(--cc-info-soft);color:var(--cc-info)}
.cc-sv-guia{margin-top:8px;padding:12px 14px;border:1px solid var(--cc-line-2);border-radius:12px;background:var(--cc-info-soft)}
.cc-sv-guia p{margin:0 0 6px;font-size:13.5px;font-weight:600;color:var(--cc-info)}
.cc-sv-guia ol{margin:0;padding-left:20px;font-size:14px;color:var(--cc-text);line-height:1.55}
.cc-sv-fotos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.cc-sv-foto{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:64px;padding:10px 6px;border:2px dashed var(--cc-line-2);border-radius:12px;background:var(--cc-surface-2);color:var(--cc-text);font-size:14px;font-weight:600;text-align:center;cursor:pointer;line-height:1.25;user-select:none}
.cc-sv-foto:hover{border-color:var(--cc-gold)}
.cc-sv-foto-cam{border-style:solid;border-color:var(--cc-gold);background:var(--cc-gold-soft);color:var(--cc-gold-2)}
.cc-sv-foto .cc-sv-emo{font-size:22px;line-height:1}
.cc-sv-anexos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.cc-sv-anexos:empty{display:none}
.cc-sv-mini{display:block;width:100%;height:84px;object-fit:cover;border-radius:10px;cursor:pointer}
.cc-sv-mini-vid{display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;background:var(--cc-surface-3);color:var(--cc-text);font-size:12px}
.cc-sv-grande{height:auto;min-height:52px;font-size:16px;width:100%;justify-content:center}
.cc-sv-progresso{text-align:center;font-size:13px;color:var(--cc-muted);min-height:18px;margin-top:8px}
.cc-sv-dl{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px 14px;margin:0;font-size:14px}
.cc-sv-dl dt{color:var(--cc-muted);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding-top:2px}
.cc-sv-dl dd{margin:0;color:var(--cc-text);overflow-wrap:anywhere;white-space:pre-wrap}
.cc-sv-galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.cc-sv-galeria a{display:block}
.cc-sv-galeria img{display:block;width:100%;height:150px;object-fit:cover;border-radius:10px}
.cc-sv-video{display:block;width:100%;max-height:420px;border-radius:10px;margin-top:10px;background:#000}
.cc-sv-trab textarea{width:100%;margin-top:12px}
.cc-sv-trab .cc-sv-grande{margin-top:12px}
.cc-sv-linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-sv-codigo{flex:1 1 200px;min-width:0;font-size:12.5px;padding:8px 10px;border-radius:8px;background:var(--cc-surface-3);color:var(--cc-info);overflow-wrap:anywhere}
.cc-sv-modal{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.cc-sv-modal input#l_nome{width:100%}
.cc-sv-dias{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cc-muted)}
.cc-sv-dias input{width:76px;text-align:center}
.cc-sv-reabrir>summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--cc-gold-2);padding:4px 0}
.cc-sv-reabrir form{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.cc-sv-reabrir form input{flex:1 1 220px;min-width:0}
.cc-sv-quem{margin:10px 0 0;font-size:13px;color:var(--cc-muted)}
.cc-sv .cc-mais-menu form{margin:0}
@media (max-width:760px){
  .cc-sv-foto{min-height:72px;font-size:15px}
  .cc-sv-fotos{gap:8px}
  .cc-sv-par{grid-template-columns:minmax(0,1fr)}
  .cc-sv-dl{grid-template-columns:minmax(0,1fr);gap:2px}
  .cc-sv-dl dd{margin-bottom:8px}
  .cc-sv-galeria{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-sv-galeria img{height:130px}
  .cc-sv .cc-tools{width:100%}
  .cc-sv .cc-tools>.cc-btn{flex:1 1 auto;justify-content:center}
  .cc-sv-reabrir form .cc-btn{width:100%;justify-content:center}
}
`;

const layout = (title: string, body: string, user: DashUser | undefined, largo: boolean) => renderLayout({
  active: 'servicos', title, body: `<div class="cc-root cc-sv">${body}</div><style>${CSS_SERVICOS}</style>`, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

const TRILHA = [{ rotulo: 'O&M' }, { rotulo: 'Serviços de campo', href: '/dashboard/servicos' }];

/** Pílula do status. O title guarda o rótulo com a bolinha de antes (🟡 pendente / 🟢 concluído). */
function pilulaServico(status: ServicoRow['status']): string {
  return status === 'atribuido'
    ? '<span class="cc-pill cc-s-watch" title="🟡 pendente">pendente</span>'
    : '<span class="cc-pill cc-s-ok" title="🟢 concluído">concluído</span>';
}

function midiasTexto(s: ServicoRow): string | null {
  const t = [
    s.fotos ? `${s.fotos} foto${s.fotos > 1 ? 's' : ''}` : '',
    s.videos ? `${s.videos} vídeo${s.videos > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  return t || null;
}

function tabelaServicos(lista: ServicoRow[]): string {
  return tabela({
    mobile: 'cartoes',
    colunas: [{ titulo: 'Serviço' }, { titulo: 'Data' }, { titulo: 'Status' }, { titulo: 'Quem faz' }, { titulo: 'Mídias' }],
    linhas: lista.map((s) => [
      { html: celulaDupla(s.tipoNome, s.clienteNome, `/dashboard/servicos/${s.id}`) },
      dataBr(s.dataServico),
      { html: pilulaServico(s.status) },
      s.atribuidoNome,
      midiasTexto(s),
    ]),
  });
}

/** Os 3 botões de anexo (câmera, galeria, vídeo) — mesmos inputs de antes. */
function botoesFoto(): string {
  return `<div class="cc-sv-fotos">
      <label class="cc-sv-foto cc-sv-foto-cam"><span class="cc-sv-emo" aria-hidden="true">📷</span>Tirar foto
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFotos(this)"></label>
      <label class="cc-sv-foto"><span class="cc-sv-emo" aria-hidden="true">🖼️</span>Galeria
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="cc-sv-foto"><span class="cc-sv-emo" aria-hidden="true">🎥</span>Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>`;
}

function guiaHtml(itens: string[], extra = ''): string {
  return `<div class="cc-sv-guia${extra ? ` ${extra}` : ''}">
      <p>📷 Fotos pra tirar neste serviço:</p>
      <ol>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>
    </div>`;
}

export function renderServicosPage(
  servicos: ServicoRow[],
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  // Os SEUS pendentes vêm primeiro — é o que o instalador abre no campo.
  const meusPendentes = servicos.filter((s) => s.status === 'atribuido' && user && s.atribuidoA === user.id);
  const resto = servicos.filter((s) => !meusPendentes.includes(s));

  const acoes = `${botao({ rotulo: 'Novo registro', href: '/dashboard/servicos/novo', tom: 'ouro', icone: 'plus' })}${botao({ rotulo: 'Lixeira', href: '/dashboard/servicos/lixeira', tom: 'fantasma' })}`;
  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'O&M' }, { rotulo: 'Serviços de campo' }],
    titulo: 'Serviços de campo',
    subtitulo: 'Registro de campo: visita, instalação, manutenção — tudo gravado no cliente.',
    acoesHtml: acoes,
  })}
${aviso ? avisoCc({ tom: aviso.tipo, texto: aviso.texto }) : ''}
${meusPendentes.length ? cartaoSecao({ titulo: 'Seus serviços pendentes', dica: `${meusPendentes.length} pra fazer`, corpoHtml: tabelaServicos(meusPendentes) }) : ''}
${resto.length || !meusPendentes.length ? cartaoSecao({
    titulo: meusPendentes.length ? 'Outros registros' : 'Registros',
    dica: `${resto.length} registro(s)`,
    corpoHtml: resto.length
      ? tabelaServicos(resto)
      : estadoVazio({ tipo: 'vazio', titulo: 'Nenhum serviço registrado ainda.', texto: 'Toque em "Novo registro" pra registrar o primeiro.', icone: 'wrench' }),
  }) : ''}`;

  return layout('Serviços', body, user, true);
}

export function renderDetalheServicoPage(
  s: ServicoRow,
  midias: { tipoMidia: string; url: string }[],
  user: DashUser | undefined,
  podeReabrir = false,
  linkCampo?: { pode: boolean; criadoAgora?: boolean },
): string {
  const fotos = midias.filter((m) => m.tipoMidia === 'foto')
    .map((m) => `<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(m.url)}" alt="Foto do serviço" loading="lazy"></a>`).join('');
  const videos = midias.filter((m) => m.tipoMidia === 'video')
    .map((m) => `<video src="${escapeHtml(m.url)}" controls preload="metadata" class="cc-sv-video"></video>`).join('');

  // Pendente? Vira a tela de TRABALHO do instalador: guia + anexos + concluir.
  const guia = s.status === 'atribuido' && GUIAS_FOTOS[s.tipoId] ? guiaHtml(GUIAS_FOTOS[s.tipoId]!) : '';
  const completar = s.status === 'atribuido'
    ? cartaoSecao({ titulo: 'Anexar e concluir', classe: 'cc-sv-trab cc-form', corpoHtml: `${guia}
    <div style="margin-top:12px">${botoesFoto()}</div>
    <div id="anexos" class="cc-sv-anexos"></div>
    <textarea id="f_obs_final" rows="2" placeholder="Observações finais…" class="cc-sv-obs"></textarea>
    <button id="concluir" onclick="concluir()" class="cc-btn cc-btn-gold cc-sv-grande">✅ Concluir serviço</button>
    <div id="progresso" class="cc-sv-progresso"></div>
    <script>
    var MAX_VIDEOS=2, MAX_VIDEO_MB=180, SID='${escapeHtml(s.id)}';
    var estado={fotos:[],videos:[]};
    function comprime(f){return new Promise(function(res,rej){
     var img=new Image(),u=URL.createObjectURL(f);
     img.onload=function(){var M=1600,r=Math.min(1,M/Math.max(img.width,img.height));
      var cv=document.createElement('canvas');cv.width=Math.round(img.width*r);cv.height=Math.round(img.height*r);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      cv.toBlob(function(bl){URL.revokeObjectURL(u);bl?res(bl):rej()},'image/jpeg',.72)};
     img.onerror=function(){URL.revokeObjectURL(u);rej()};img.src=u})}
    function pintaAnexos(){
     var d=document.getElementById('anexos');d.innerHTML='';
     estado.fotos.forEach(function(b,i){var img=document.createElement('img');img.src=URL.createObjectURL(b);
      img.className='cc-sv-mini';img.alt='Foto '+(i+1)+' (toque pra tirar)';img.onclick=function(){estado.fotos.splice(i,1);pintaAnexos()};d.appendChild(img)});
     estado.videos.forEach(function(f,i){var v=document.createElement('div');
      v.className='cc-sv-mini cc-sv-mini-vid';
      v.textContent='🎥 '+Math.round(f.size/1048576)+'MB';
      v.onclick=function(){estado.videos.splice(i,1);pintaAnexos()};d.appendChild(v)})}
    function addFotos(inp){var fs=Array.prototype.slice.call(inp.files||[]);inp.value='';
     Promise.all(fs.map(comprime)).then(function(bs){estado.fotos=estado.fotos.concat(bs);pintaAnexos()})
     .catch(function(){alert('Falha ao ler a foto')})}
    function addVideo(inp){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;
     if(estado.videos.length>=MAX_VIDEOS){alert('Máximo de '+MAX_VIDEOS+' vídeos');return}
     if(f.size>MAX_VIDEO_MB*1048576){alert('Vídeo muito grande (máx '+MAX_VIDEO_MB+'MB)');return}
     estado.videos.push(f);pintaAnexos()}
    function prog(t){document.getElementById('progresso').textContent=t}
    function concluir(){
     var btn=document.getElementById('concluir');btn.disabled=true;btn.textContent='Enviando…';
     var midias=estado.fotos.map(function(b,i){return{nome:'foto-'+(i+1)+'.jpg',tipoMidia:'foto',contentType:'image/jpeg'}})
      .concat(estado.videos.map(function(f,i){return{nome:'video-'+(i+1),tipoMidia:'video',contentType:f.type||'video/mp4'}}));
     var arquivos=estado.fotos.concat(estado.videos);
     fetch('/dashboard/servicos/'+SID+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({midias:midias})})
     .then(function(r){return r.json()}).then(function(j){
      if(!j.ok)throw new Error(j.erro||'falha');
      var ups=j.uploads||[],feitas=[],falhas=[],fila=Promise.resolve();
      ups.forEach(function(u,i){fila=fila.then(function(){
       prog('Subindo '+(i+1)+' de '+ups.length+'…');
       return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
        .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia});
         else falhas.push(midias[i].nome+' (erro '+r.status+(r.status===413?' — arquivo grande demais pro cofre':'')+')')})
        .catch(function(){falhas.push(midias[i].nome+' (rede caiu no meio)')})})});
      return fila.then(function(){
       if(falhas.length)alert('⚠️ '+falhas.length+' arquivo(s) NÃO subiram:\\n'+falhas.join('\\n')+'\\n\\nO resto foi salvo. Vídeo grande é a causa mais comum — tente um vídeo mais curto.');
       return fetch('/dashboard/servicos/'+SID+'/confirmar-midias',{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:feitas})})})
      .then(function(){
       return fetch('/dashboard/servicos/'+SID+'/concluir',{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({observacoes:document.getElementById('f_obs_final').value.trim()})})})
      .then(function(){window.location='/dashboard/servicos?ok='+encodeURIComponent('✅ Serviço concluído!')})})
     .catch(function(e){alert('Falha: '+e.message);btn.disabled=false;btn.textContent='✅ Concluir serviço'})}
    </script>` })
    : '';

  // 🪄 Gerar link de campo (quem pode editar): o serviço vai pro campo por
  // link secreto com validade — sem usuário/senha. A plataforma NÃO manda
  // zap: o escritório copia o link e manda pelo zap pessoal (Junior 06/08 —
  // o template de aviso saiu: caía no login e ainda custava por envio).
  const faixaCriado = linkCampo?.criadoAgora
    ? avisoCc({ tom: 'ok', texto: `Serviço criado!${linkCampo.pode ? ' Gere o link de campo aqui embaixo e mande pelo seu zap pra quem vai fazer.' : ''}` })
    : '';
  const linkCampoHtml = linkCampo?.pode ? cartaoSecao({ titulo: 'Link de campo', dica: 'sem senha, sem cadastro', corpoHtml: `
    <button type="button" onclick="document.getElementById('link_modal').classList.remove('hidden')" class="cc-btn cc-sv-grande">🪄 Gerar link de campo</button>
    <div id="link_modal" class="hidden cc-sv-modal cc-form">
      <p class="cc-sv-dica">O link abre o serviço direto — sem senha, sem cadastro. Copie e mande pelo seu zap.</p>
      <input id="l_nome" placeholder="Nome de quem vai fazer" aria-label="Nome de quem vai fazer">
      <div class="cc-sv-dias">link vale por
        <input id="l_dias" type="number" min="1" max="60" value="7" aria-label="Dias de validade"> dias
      </div>
      <button type="button" id="l_gerar" onclick="gerarLinkCampo()" class="cc-btn cc-sv-grande">🪄 Gerar link</button>
      <div id="l_pronto" class="hidden">
        <div class="cc-sv-linha">
          <code id="l_link" class="cc-sv-codigo"></code>
          <button type="button" onclick="copiarLinkCampo(this)" class="cc-btn cc-btn-sm">📋 copiar</button>
        </div>
      </div>
      <div id="l_status" class="cc-sv-progresso"></div>
    </div>
    <script>
    function gerarLinkCampo(){
     var nome=document.getElementById('l_nome').value.trim();
     if(!nome){alert('Informe o nome de quem vai fazer');return}
     var dias=parseInt(document.getElementById('l_dias').value,10)||7;
     var btn=document.getElementById('l_gerar');btn.disabled=true;btn.textContent='Gerando…';
     fetch('/dashboard/servicos/${escapeHtml(s.id)}/link-campo',{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({nome:nome,dias:dias})})
     .then(function(r){return r.json()}).then(function(j){
      btn.disabled=false;btn.textContent='🪄 Gerar link';
      if(!j.ok)throw new Error(j.erro||'falha');
      var l=j.link&&j.link.indexOf('http')===0?j.link:window.location.origin+j.link;
      document.getElementById('l_link').textContent=l;
      document.getElementById('l_pronto').classList.remove('hidden');
      document.getElementById('l_status').textContent='✅ Link pronto — vale '+j.dias+' dia(s). Copie e mande no seu zap.'})
     .catch(function(e){btn.disabled=false;btn.textContent='🪄 Gerar link';
      document.getElementById('l_status').textContent='❌ '+e.message})}
    function copiarLinkCampo(btn){navigator.clipboard.writeText(document.getElementById('l_link').textContent).then(function(){btn.textContent='✅ copiado'})}
    </script>` }) : '';

  // Link atual (válido ou vencido) — só pra quem pode editar.
  let linkAtual = '';
  if (podeReabrir && s.campoSlug) {
    const vencido = s.campoExpiraEm ? new Date(s.campoExpiraEm).getTime() < Date.now() : false;
    const venceBr = s.campoExpiraEm ? new Date(s.campoExpiraEm).toLocaleDateString('pt-BR') : '';
    linkAtual = vencido
      ? `<div class="cc-aviso cc-aviso-atencao" role="status">${icone('clock', 'sm')}<span>
             O link de campo${s.campoNome ? ` do(a) <b>${escapeHtml(s.campoNome)}</b>` : ''} <b>venceu</b> (${escapeHtml(venceBr)}) — gere um novo no 🪄 aqui em cima.
           </span></div>`
      : cartaoSecao({
        titulo: `Link de campo${s.campoNome ? ` — ${s.campoNome}` : ''}`,
        dica: `vale até ${venceBr}`,
        corpoHtml: `<div class="cc-sv-linha">
               <code id="linkCampo" class="cc-sv-codigo"></code>
               <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('linkCampo').textContent).then(()=>{this.textContent='✅'})" class="cc-btn cc-btn-sm">📋 copiar</button>
             </div>
             <p class="cc-sv-dica" style="margin:8px 0 0">Manda pelo seu zap — quem tocar trabalha direto, sem senha.</p>
             <script>document.getElementById('linkCampo').textContent = window.location.origin + '/dashboard/servicos/campo-${escapeHtml(s.campoSlug)}';</script>`,
      });
  }

  const reabrir = s.status === 'concluido' && podeReabrir ? cartaoSecao({ titulo: 'Faltou algo?', corpoHtml: `
    <details class="cc-sv-reabrir"><summary>🔄 Reabrir o serviço</summary>
      <form method="post" action="/dashboard/servicos/${s.id}/reabrir" class="cc-form">
        <input name="motivo" placeholder="O que faltou? (vai no zap do instalador)" aria-label="O que faltou">
        <button class="cc-btn">Reabrir</button>
      </form>
      <p class="cc-sv-dica" style="margin:8px 0 0">Reabrir reativa o acesso do instalador (se temporário) e avisa ele no zap; ao concluir de novo, expira de novo.</p>
    </details>` }) : '';

  const excluir = podeReabrir ? `
    <form method="post" action="/dashboard/servicos/${s.id}/excluir"
      onsubmit="return confirm('Mover este serviço pra Lixeira? Dá pra restaurar quando quiser (nada é apagado).')">
      <button class="cc-btn cc-btn-crit">🗑️ Excluir (vai pra Lixeira, dá pra desfazer)</button>
    </form>` : '';

  const registro = cartaoSecao({ titulo: 'Registro', corpoHtml: `
    <dl class="cc-sv-dl">
      <dt>Cliente</dt><dd>${escapeHtml(s.clienteNome)}</dd>
      <dt>Data</dt><dd>${dataBr(s.dataServico)}</dd>
      <dt>Observações</dt><dd>${s.observacoes ? escapeHtml(s.observacoes) : '—'}</dd>
    </dl>
    ${s.atribuidoNome ? `<p class="cc-sv-quem">🛠️ Atribuído a ${escapeHtml(s.atribuidoNome)}</p>` : ''}` });

  const midiasHtml = fotos || videos
    ? cartaoSecao({ titulo: 'Fotos e vídeos', dica: midiasTexto(s) ?? undefined, corpoHtml: `${fotos ? `<div class="cc-sv-galeria">${fotos}</div>` : ''}${videos}` })
    : s.status === 'concluido'
      ? cartaoSecao({ titulo: 'Fotos e vídeos', corpoHtml: estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma foto neste registro.', icone: 'eye', compacto: true }) })
      : '';

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA, { rotulo: s.tipoNome }],
    titulo: s.tipoNome,
    seloHtml: pilulaServico(s.status),
    subtitulo: `${s.clienteNome} · ${dataBr(s.dataServico)}`,
    acoesHtml: `${botao({ rotulo: '← Voltar', href: '/dashboard/servicos', tom: 'fantasma' })}${excluir ? menuAcoes({ alinhar: 'dir', itensHtml: excluir }) : ''}`,
  })}
<div class="cc-sv-col">
${faixaCriado}
${registro}
${midiasHtml}
${completar}
${linkCampoHtml}
${linkAtual}
${reabrir}
</div>`;
  return layout(s.tipoNome, body, user, false);
}

// Lixeira: excluído some da lista mas volta com 1 clique (Junior 05/08:
// "excluir sempre com opção de desfazer").
export function renderLixeiraServicosPage(servicos: ServicoRow[], user: DashUser | undefined): string {
  const lista = servicos.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Lixeira vazia.', texto: 'Nada aqui foi apagado — o que for excluído aparece aqui e volta com 1 clique.', icone: 'check' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Serviço' }, { titulo: 'Data' }, { titulo: '' }],
      linhas: servicos.map((s) => [
        { html: celulaDupla(s.tipoNome, s.clienteNome) },
        dataBr(s.dataServico),
        { html: `<form method="post" action="/dashboard/servicos/${s.id}/restaurar">
        <button class="cc-btn cc-btn-sm">♻️ Restaurar</button>
      </form>` },
      ]),
    });

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA, { rotulo: 'Lixeira' }],
    titulo: 'Lixeira de serviços',
    subtitulo: 'Nada aqui foi apagado — restaure quando quiser.',
    acoesHtml: botao({ rotulo: '← Voltar aos serviços', href: '/dashboard/servicos', tom: 'fantasma' }),
  })}
${cartaoSecao({ titulo: 'Na lixeira', dica: `${servicos.length} registro(s)`, corpoHtml: lista })}`;
  return layout('Lixeira de serviços', body, user, true);
}


// Guia de fotos por tipo de serviço (pedido do Junior 29/07: "um guia escrito
// das fotos a serem enviadas"). Rascunho do Claude — o Junior ajusta o texto.
export const GUIAS_FOTOS: Record<string, string[]> = {
  // Lista do Junior (29/07) — palavras dele.
  'visita-tecnica': [
    'Foto do padrão de entrada',
    'Foto do quadro elétrico',
    'Foto da bitola do cabo do padrão de entrada',
    'Foto do ramal do medidor',
    'Ponto de conexão',
    'Foto da bitola do fio que chega no quadro',
    'Ponto de conexão do sistema fotovoltaico',
    'Foto abaixo do telhado',
    'Tipo de telha',
    'Capacidade da corrente do disjuntor',
    'Extras que viu — anotar nas observações',
  ],
  // Lista do Junior (29/07) — palavras dele, ordem da obra.
  'termino-instalacao': [
    'Localização (link do Maps ou foto de referência)',
    'Foto da infra: trilhos',
    'Foto da infra: aterramento',
    'Foto dos parafusos vedados na telha',
    'Todos os módulos (visão geral)',
    'Foto módulos alinhados',
    'Ligação dos módulos (MC4)',
    'Foto dos micros — todos da instalação',
    'Numeração de cada micro',
    'Mapeamento dos micros no telhado',
    'Conector dos micros',
    'Ligação dos micros / cabo tronco',
    'Inversor na parede — completo',
    'Foto inversor funcionando',
    'Caminhos dos cabos CC',
    'Caminhos dos cabos CA',
    'Quadro elétrico — ponto de conexão',
    'Foto do medidor com a placa de geração própria',
    'Foto do aplicativo: monitoramento conectado na internet',
    'Foto do aplicativo: corrente CA do inversor',
  ],
};


export function renderNovoServicoPage(
  tipos: TipoServico[],
  user: DashUser | undefined,
  usuarios: { id: string; nome: string }[] = [],
): string {
  const opcoes = tipos.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nome)}</option>`).join('');
  const opcoesUsuarios = usuarios.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.nome)}</option>`).join('');
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // A classe guia-fotos é o gancho do mostraGuia() (querySelectorAll('.guia-fotos')).
  const guias = Object.entries(GUIAS_FOTOS).map(([tipo, itens]) =>
    `<div class="guia-fotos hidden cc-sv-guia" data-tipo="${escapeHtml(tipo)}">
      <p>📷 Fotos pra tirar neste serviço:</p>
      <ol>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>
    </div>`).join('');

  // O "formulário" é um <div class="cc-form"> (como antes, não é <form>: quem
  // envia é o salvar() por fetch JSON). O .cc-form só pinta os campos.
  const campos = `
  <div class="cc-form cc-sv-form" id="form">
    <label class="cc-campo"><span>Tipo de serviço</span>
      <select id="f_tipo" onchange="mostraGuia()">${opcoes}</select></label>
    ${guias}

    <div class="cc-campo"><span>Cliente</span>
      <input id="f_busca" placeholder="Busque por nome ou telefone…" autocomplete="off" aria-label="Buscar cliente">
      <div id="resultados" class="cc-sv-opcoes"></div>
      <div id="escolhido" class="hidden cc-sv-escolhido"></div>
      <div><button type="button" onclick="clienteNovo()" class="cc-btn cc-btn-sm cc-btn-ghost">➕ Cliente novo (nome + telefone)</button></div>
      <div id="novo_cliente" class="hidden cc-sv-par">
        <input id="f_nome_novo" placeholder="Nome" aria-label="Nome do cliente novo">
        <input id="f_tel_novo" placeholder="Telefone (zap)" inputmode="tel" aria-label="Telefone do cliente novo">
      </div>
    </div>

    <div class="cc-campo"><span>Usina (opcional)</span>
      <input id="f_busca_usina" placeholder="Busque a usina, se for o caso…" autocomplete="off" aria-label="Buscar usina">
      <div id="resultados_usina" class="cc-sv-opcoes"></div>
      <div id="usina_escolhida" class="hidden cc-sv-escolhido cc-sv-escolhido-usina"></div>
    </div>

    <label class="cc-campo"><span>Atribuir a (quem vai fazer)</span>
      <select id="f_atribuido" name="atribuido">
        <option value="">— eu mesmo, registro pronto —</option>
        ${opcoesUsuarios}
      </select>
      <small class="cc-sv-dica">Atribuiu a alguém? O serviço fica 🟡 pendente pra ele — as fotos podem ficar por conta dele na hora da obra.</small></label>

    <label class="cc-campo"><span>Data do serviço</span>
      <input type="date" name="data" id="f_data" value="${hoje}"></label>

    <label class="cc-campo"><span>Observações</span>
      <textarea id="f_observacoes" name="observacoes" rows="3" placeholder="O que foi visto/feito…"></textarea></label>

    <div class="cc-campo"><span>Fotos e vídeos</span>
      ${botoesFoto()}
      <div id="anexos" class="cc-sv-anexos"></div>
    </div>

    <button id="salvar" onclick="salvar()" class="cc-btn cc-btn-gold cc-sv-grande">💾 Salvar registro</button>
    <div id="progresso" class="cc-sv-progresso"></div>
  </div>`;

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA, { rotulo: 'Novo registro' }],
    titulo: 'Novo registro',
    subtitulo: 'Tipo, cliente, fotos — o registro fica gravado no cliente.',
    acoesHtml: botao({ rotulo: '← Voltar', href: '/dashboard/servicos', tom: 'fantasma' }),
  })}
<div class="cc-sv-col">
${cartaoSecao({ titulo: 'Registro de campo', corpoHtml: campos })}
</div>

  <script>
  var MAX_VIDEOS=2, MAX_VIDEO_MB=180;
  var estado={leadId:null,sistemaId:null,fotos:[],videos:[]};

  function mostraGuia(){
   var t=document.getElementById('f_tipo').value;
   document.querySelectorAll('.guia-fotos').forEach(function(g){
    g.classList.toggle('hidden',g.getAttribute('data-tipo')!==t)})}
  mostraGuia();

  function debounce(f,ms){var t;return function(){var a=arguments;clearTimeout(t);t=setTimeout(function(){f.apply(null,a)},ms)}}

  // Resultado da busca: montado com DOM + textContent (nome do lead vem de fora
  // — WhatsApp —, nunca vai cru pro innerHTML).
  function opcao(rotulo,aoEscolher){var b=document.createElement('button');b.type='button';
   b.className='cc-sv-opcao';b.textContent=rotulo;b.onclick=function(){aoEscolher(b.textContent)};return b}
  function lista(id,itens){var d=document.getElementById(id);d.innerHTML='';itens.forEach(function(el){d.appendChild(el)})}

  document.getElementById('f_busca').addEventListener('input',debounce(function(e){
    var q=e.target.value.trim();if(q.length<2){document.getElementById('resultados').innerHTML='';return}
    fetch('/dashboard/servicos/buscar-cliente?q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}})
     .then(function(r){return r.json()}).then(function(j){
      lista('resultados',(j.clientes||[]).map(function(c){
       return opcao(String(c.nome)+(c.telefone?' · '+c.telefone:''),function(rot){escolheCliente(String(c.id),rot)})}))})
  },300));
  function escolheCliente(id,rotulo){estado.leadId=id;
   document.getElementById('escolhido').textContent='✅ '+rotulo;
   document.getElementById('escolhido').classList.remove('hidden');
   document.getElementById('resultados').innerHTML='';
   document.getElementById('novo_cliente').classList.add('hidden')}
  function clienteNovo(){estado.leadId=null;
   document.getElementById('escolhido').classList.add('hidden');
   document.getElementById('novo_cliente').classList.remove('hidden')}

  document.getElementById('f_busca_usina').addEventListener('input',debounce(function(e){
    var q=e.target.value.trim();if(q.length<2){document.getElementById('resultados_usina').innerHTML='';return}
    fetch('/dashboard/servicos/buscar-usina?q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}})
     .then(function(r){return r.json()}).then(function(j){
      lista('resultados_usina',(j.usinas||[]).map(function(u){
       return opcao(String(u.nome),function(rot){escolheUsina(String(u.id),rot)})}))})
  },300));
  function escolheUsina(id,rotulo){estado.sistemaId=id;
   document.getElementById('usina_escolhida').textContent='⚡ '+rotulo;
   document.getElementById('usina_escolhida').classList.remove('hidden');
   document.getElementById('resultados_usina').innerHTML=''}

  function comprime(f){return new Promise(function(res,rej){
   var img=new Image(),u=URL.createObjectURL(f);
   img.onload=function(){var M=1600,r=Math.min(1,M/Math.max(img.width,img.height));
    var cv=document.createElement('canvas');cv.width=Math.round(img.width*r);cv.height=Math.round(img.height*r);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    cv.toBlob(function(bl){URL.revokeObjectURL(u);bl?res(bl):rej()},'image/jpeg',.72)};
   img.onerror=function(){URL.revokeObjectURL(u);rej()};img.src=u})}

  function pintaAnexos(){
   var d=document.getElementById('anexos');d.innerHTML='';
   estado.fotos.forEach(function(b,i){var img=document.createElement('img');img.src=URL.createObjectURL(b);
    img.className='cc-sv-mini';img.alt='Foto '+(i+1)+' (toque pra tirar)';img.onclick=function(){estado.fotos.splice(i,1);pintaAnexos()};d.appendChild(img)});
   estado.videos.forEach(function(f,i){var v=document.createElement('div');
    v.className='cc-sv-mini cc-sv-mini-vid';
    v.textContent='🎥 '+Math.round(f.size/1048576)+'MB (toque pra tirar)';
    v.onclick=function(){estado.videos.splice(i,1);pintaAnexos()};d.appendChild(v)})}

  function addFotos(inp){var fs=Array.prototype.slice.call(inp.files||[]);inp.value='';
   Promise.all(fs.map(comprime)).then(function(bs){estado.fotos=estado.fotos.concat(bs);pintaAnexos()})
   .catch(function(){alert('Falha ao ler a foto')})}
  function addVideo(inp){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;
   if(estado.videos.length>=MAX_VIDEOS){alert('Máximo de '+MAX_VIDEOS+' vídeos');return}
   if(f.size>MAX_VIDEO_MB*1048576){alert('Vídeo muito grande (máx '+MAX_VIDEO_MB+'MB) — grave um trecho mais curto');return}
   estado.videos.push(f);pintaAnexos()}

  function prog(t){document.getElementById('progresso').textContent=t}

  function salvar(){
   var tipo=document.getElementById('f_tipo').value;
   var nomeNovo=document.getElementById('f_nome_novo').value.trim();
   var telNovo=document.getElementById('f_tel_novo').value.trim();
   if(!estado.leadId&&!(nomeNovo&&telNovo)){alert('Escolha o cliente (ou preencha nome + telefone do cliente novo)');return}
   var btn=document.getElementById('salvar');btn.disabled=true;btn.textContent='Salvando…';
   var midias=estado.fotos.map(function(b,i){return{nome:'foto-'+(i+1)+'.jpg',tipoMidia:'foto',contentType:'image/jpeg'}})
    .concat(estado.videos.map(function(f,i){return{nome:'video-'+(i+1),tipoMidia:'video',contentType:f.type||'video/mp4'}}));
   fetch('/dashboard/servicos/nova',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({tipo:tipo,leadId:estado.leadId,clienteNovo:estado.leadId?null:{nome:nomeNovo,telefone:telNovo},
     sistemaId:estado.sistemaId,data:document.getElementById('f_data').value,
     atribuidoA:document.getElementById('f_atribuido').value||null,
     observacoes:document.getElementById('f_observacoes').value.trim(),midias:midias})})
   .then(function(r){return r.json()}).then(function(j){
    if(!j.ok)throw new Error(j.erro||'falha');
    var arquivos=estado.fotos.concat(estado.videos),ups=j.uploads||[],feitas=[],falhas=[];
    var fila=Promise.resolve();
    ups.forEach(function(u,i){fila=fila.then(function(){
     prog('Subindo '+(i+1)+' de '+ups.length+'…');
     return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
      .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia});
       else falhas.push(midias[i].nome+' (erro '+r.status+(r.status===413?' — arquivo grande demais pro cofre':'')+')')})
      .catch(function(){falhas.push(midias[i].nome+' (rede caiu no meio)')})})});
    return fila.then(function(){
     if(falhas.length)alert('⚠️ '+falhas.length+' arquivo(s) NÃO subiram:\\n'+falhas.join('\\n')+'\\n\\nO resto foi salvo. Vídeo grande é a causa mais comum — tente um vídeo mais curto.');
     return fetch('/dashboard/servicos/'+j.id+'/confirmar-midias',{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({midias:feitas})})}).then(function(){
     window.location='/dashboard/servicos/'+j.id+'?criado=1'})})
   .catch(function(e){alert('Falha ao salvar: '+e.message);btn.disabled=false;btn.textContent='💾 Salvar registro'})}
  </script>`;

  return layout('Novo serviço', body, user, false);
}


// ===== PÁGINA PÚBLICA DO LINK MÁGICO (Junior 06/08) =====
// Quem recebe o link trabalha DIRETO: sem login, sem senha, sem usuário.
// Página solta (fora do layout do dashboard), feita pra celular no sol.

export function renderCampoPublicoPage(s: ServicoRow, slug: string, guia: string[]): string {
  const dataBr = s.dataServico.split('-').reverse().join('/');
  const guiaHtml = guia.length
    ? `<ol class="guia">${guia.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ol>`
    : '<p class="dica">Registre fotos gerais do serviço.</p>';
  const concluido = s.status === 'concluido';

  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex">
<title>${escapeHtml(s.tipoNome)} — ${escapeHtml(s.clienteNome)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;color:#1c1917;line-height:1.55}
  .topo{background:linear-gradient(135deg,#0c4a6e 0%,#0891b2 100%);text-align:center;padding:18px 16px}
  .topo img{max-height:72px;max-width:70%}
  .wrap{max-width:560px;margin:0 auto;padding:16px}
  .cartao{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:14px}
  h1{font-size:19px;color:#0c4a6e;margin-bottom:2px}
  .sub{font-size:13px;color:#64748b}
  .quem{margin-top:8px;font-size:13px;background:#ecfeff;color:#0e7490;border-radius:8px;padding:6px 10px;display:inline-block}
  h2{font-size:15px;color:#0c4a6e;margin-bottom:8px}
  .guia{padding-left:22px;font-size:14px}
  .guia li{margin-bottom:6px}
  .dica{font-size:13px;color:#64748b}
  .botoes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}
  .botoes label{border:2px dashed #cbd5e1;border-radius:12px;padding:12px 6px;text-align:center;font-size:13px;color:#475569;cursor:pointer;background:#f8fafc}
  #anexos{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  #anexos img{width:72px;height:72px;object-fit:cover;border-radius:10px}
  #anexos .vid{width:72px;height:72px;border-radius:10px;background:#0f172a;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center}
  textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font-size:14px;margin-top:10px}
  .concluir{width:100%;margin-top:12px;padding:15px;border:none;border-radius:14px;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  .concluir:disabled{opacity:.6}
  #progresso{text-align:center;font-size:13px;color:#0891b2;margin-top:8px;min-height:18px}
  .feito{text-align:center;padding:30px 16px}
  .feito .check{font-size:52px}
  footer{text-align:center;font-size:11px;color:#94a3b8;padding:14px}
</style></head>
<body>
<div class="topo"><img src="${LOGO_PASTA_BASE64}" alt="EcoSunPower"></div>
<div class="wrap">
  <div class="cartao">
    <h1>🔧 ${escapeHtml(s.tipoNome)}</h1>
    <div class="sub">Cliente: <b>${escapeHtml(s.clienteNome)}</b> · dia ${escapeHtml(dataBr)}</div>
    ${s.campoNome ? `<div class="quem">👷 Serviço de: ${escapeHtml(s.campoNome)}</div>` : ''}
    ${s.observacoes ? `<p class="dica" style="margin-top:8px">📝 ${escapeHtml(s.observacoes)}</p>` : ''}
  </div>

  ${concluido ? `
  <div class="cartao feito">
    <div class="check">✅</div>
    <h2>Serviço já concluído — obrigado!</h2>
    <p class="dica">Se faltou algo, fala com o escritório que a gente reabre.</p>
  </div>` : `
  <div class="cartao">
    <h2>📷 Fotos pra tirar</h2>
    ${guiaHtml}
  </div>

  <div class="cartao">
    <h2>📤 Anexar e concluir</h2>
    <div class="botoes">
      <label>📷 Tirar foto<input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFotos(this)"></label>
      <label>🖼️ Galeria<input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label>🎬 Vídeo (máx 2)<input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
    <div id="anexos"></div>
    <textarea id="obs" rows="2" placeholder="Observações (opcional)"></textarea>
    <button class="concluir" id="btnConcluir" onclick="concluir()">✅ Concluir serviço</button>
    <div id="progresso"></div>
  </div>`}

  <footer>EcoSunPower — Diário de Serviços · link de trabalho seguro</footer>
</div>
${concluido ? '' : `<script>
var SLUG=${JSON.stringify(slug)},MAX_VIDEOS=2,MAX_VIDEO_MB=180;
var estado={fotos:[],videos:[]};
function comprime(f){return new Promise(function(ok,ruim){var img=new Image();var url=URL.createObjectURL(f);
 img.onload=function(){var m=1600,w=img.width,h=img.height;if(w>m||h>m){var r=Math.min(m/w,m/h);w=Math.round(w*r);h=Math.round(h*r)}
  var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  c.toBlob(function(b){URL.revokeObjectURL(url);b?ok(b):ruim()},'image/jpeg',0.72)};
 img.onerror=function(){URL.revokeObjectURL(url);ruim()};img.src=url})}
function pinta(){var d=document.getElementById('anexos');d.innerHTML='';
 estado.fotos.forEach(function(b,i){var img=document.createElement('img');img.src=URL.createObjectURL(b);
  img.onclick=function(){estado.fotos.splice(i,1);pinta()};d.appendChild(img)});
 estado.videos.forEach(function(f,i){var v=document.createElement('div');v.className='vid';v.textContent='🎬 '+(f.size/1048576|0)+'MB';
  v.onclick=function(){estado.videos.splice(i,1);pinta()};d.appendChild(v)});
 var n=estado.fotos.length+estado.videos.length;
 document.getElementById('btnConcluir').textContent=n?'✅ Concluir serviço ('+n+' anexo'+(n>1?'s':'')+')':'✅ Concluir serviço'}
function addFotos(inp){var fs=Array.prototype.slice.call(inp.files||[]);inp.value='';
 Promise.all(fs.map(comprime)).then(function(bs){estado.fotos=estado.fotos.concat(bs);pinta()})
 .catch(function(){prog('⚠️ Não consegui ler essa foto — tenta de novo ou use a Galeria');alert('Não consegui ler a foto — tenta de novo ou use a Galeria')})}
function addVideo(inp){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;
 if(estado.videos.length>=MAX_VIDEOS){alert('Máximo de '+MAX_VIDEOS+' vídeos');return}
 if(f.size>MAX_VIDEO_MB*1048576){alert('Vídeo muito grande (máx '+MAX_VIDEO_MB+'MB) — grave um trecho mais curto');return}
 estado.videos.push(f);pinta()}
function prog(t){document.getElementById('progresso').textContent=t}
function checa(r){
 return r.json().catch(function(){throw new Error('o servidor respondeu estranho (código '+r.status+')')})
  .then(function(j){if(!j.ok)throw new Error(j.erro||('falha no servidor (código '+r.status+')'));return j})}
function concluir(){
 if(!estado.fotos.length&&!estado.videos.length){if(!confirm('Nenhuma foto anexada ainda (elas aparecem em miniatura antes de enviar). Concluir mesmo assim, sem foto?'))return}
 var btn=document.getElementById('btnConcluir');btn.disabled=true;btn.textContent='Enviando…';
 var midias=estado.fotos.map(function(b,i){return{nome:'foto-'+(i+1)+'.jpg',tipoMidia:'foto',contentType:'image/jpeg'}})
  .concat(estado.videos.map(function(f,i){return{nome:'video-'+(i+1),tipoMidia:'video',contentType:f.type||'video/mp4'}}));
 var arquivos=estado.fotos.concat(estado.videos);
 var passoUploads=midias.length
  ? fetch('/dashboard/servicos/campo/'+SLUG+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:midias})}).then(checa)
  : Promise.resolve({uploads:[]});
 passoUploads.then(function(j){
  var ups=j.uploads||[],feitas=[],falhas=[],fila=Promise.resolve();
  ups.forEach(function(u,i){fila=fila.then(function(){
   prog('Subindo '+(i+1)+' de '+ups.length+'…');
   return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
    .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia});
     else falhas.push(midias[i].nome+' (erro '+r.status+')')})
    .catch(function(){falhas.push(midias[i].nome+' (rede caiu)')})})});
  return fila.then(function(){
   if(falhas.length&&!confirm('⚠️ '+falhas.length+' arquivo(s) NÃO subiram:\\n'+falhas.join('\\n')+'\\n\\nConcluir mesmo assim? (Cancelar = tentar de novo)'))
    throw new Error(falhas.length+' arquivo(s) não subiram — nada foi concluído, tenta de novo');
   prog('Registrando as fotos…');
   return fetch('/dashboard/servicos/campo/'+SLUG+'/confirmar-midias',{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:feitas})}).then(checa)})
  .then(function(){
   prog('Concluindo o serviço…');
   return fetch('/dashboard/servicos/campo/'+SLUG+'/concluir',{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({observacoes:document.getElementById('obs').value.trim()})}).then(checa)})
  .then(function(){prog('✅ Tudo certo!');window.location.reload()})})
 .catch(function(e){prog('❌ Não consegui enviar: '+e.message);alert('❌ Não consegui enviar: '+e.message);
  btn.disabled=false;pinta()})}
</script>`}
</body></html>`;
}

export function renderCampoLinkProblemaPage(motivo: 'nao_achado' | 'vencido'): string {
  const msg = motivo === 'vencido'
    ? { t: '⏰ Esse link venceu', d: 'Pede pro escritório mandar um link novo no seu zap — leva 10 segundos.' }
    : { t: '🔎 Link não encontrado', d: 'Confere se o link veio completo, ou pede um novo pro escritório.' };
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${msg.t}</title>
<style>body{font-family:sans-serif;text-align:center;padding:70px 24px;color:#334155;background:#f1f5f9}h1{font-size:22px;margin-bottom:10px}</style></head>
<body><h1>${msg.t}</h1><p>${msg.d}</p></body></html>`;
}
