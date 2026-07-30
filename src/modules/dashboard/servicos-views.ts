// src/modules/dashboard/servicos-views.ts
// Diário de Serviços (F1) — telas MOBILE-FIRST: o instalador usa no celular,
// no sol, com luva. Botão grande, campo grande, pouco texto.
// Fluxo do novo registro: 1) POST /dashboard/servicos/nova (JSON, sem os
// arquivos) → volta {id, uploads:[{url}]}; 2) navegador sobe cada arquivo
// DIRETO pro Storage (PUT na URL assinada — vídeo não passa pelo Express);
// 3) POST /servicos/:id/confirmar-midias com o que subiu → lista.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { ServicoRow, TipoServico } from './servicos-store.js';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

export function renderServicosPage(
  servicos: ServicoRow[],
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}</div>`
    : '';
  const cards = servicos.map((s) => {
    const midias = [
      s.fotos ? `${s.fotos} foto${s.fotos > 1 ? 's' : ''}` : '',
      s.videos ? `${s.videos} vídeo${s.videos > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');
    return `<a href="/dashboard/servicos/${s.id}" class="block bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:border-sky-400 transition">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-slate-800">${escapeHtml(s.tipoNome)}</span>
        <span class="text-sm text-slate-500">${dataBr(s.dataServico)}</span>
      </div>
      <div class="text-sm text-slate-600 mt-1">👤 ${escapeHtml(s.clienteNome)}</div>
      ${midias ? `<div class="text-xs text-slate-400 mt-1">📎 ${midias}</div>` : ''}
    </a>`;
  }).join('\n');

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl font-bold text-slate-800">🔧 Serviços</h1>
    <p class="text-sm text-slate-500 mt-1">Registro de campo: visita, instalação, manutenção — tudo gravado no cliente.</p></div>
  </div>
  ${avisoHtml}
  <a href="/dashboard/servicos/novo" class="block w-full max-w-xl text-center px-5 py-4 mb-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-lg font-bold shadow">➕ Novo registro</a>
  <div class="space-y-3 max-w-xl">${cards || '<p class="text-slate-400 py-8 text-center">Nenhum serviço registrado ainda.</p>'}</div>`;

  return renderLayout({ active: 'servicos', title: 'Serviços', body, user });
}

export function renderDetalheServicoPage(
  s: ServicoRow,
  midias: { tipoMidia: string; url: string }[],
  user: DashUser | undefined,
): string {
  const fotos = midias.filter((m) => m.tipoMidia === 'foto')
    .map((m) => `<a href="${escapeHtml(m.url)}" target="_blank"><img src="${escapeHtml(m.url)}" class="w-full h-36 object-cover rounded-xl"></a>`).join('');
  const videos = midias.filter((m) => m.tipoMidia === 'video')
    .map((m) => `<video src="${escapeHtml(m.url)}" controls preload="metadata" class="w-full rounded-xl mt-3"></video>`).join('');
  const body = `
  <a href="/dashboard/servicos" class="text-sm text-slate-600 hover:underline">← Voltar</a>
  <div class="max-w-xl mt-3">
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-slate-800">${escapeHtml(s.tipoNome)}</span>
        <span class="text-sm text-slate-500">${dataBr(s.dataServico)}</span>
      </div>
      <div class="text-sm text-slate-600 mt-1">👤 ${escapeHtml(s.clienteNome)}</div>
      ${s.observacoes ? `<p class="text-sm text-slate-700 mt-3 whitespace-pre-wrap">${escapeHtml(s.observacoes)}</p>` : ''}
    </div>
    ${fotos ? `<div class="grid grid-cols-2 gap-2 mt-4">${fotos}</div>` : ''}
    ${videos}
  </div>`;
  return renderLayout({ active: 'servicos', title: s.tipoNome, body, user });
}

export function renderNovoServicoPage(tipos: TipoServico[], user: DashUser | undefined): string {
  const opcoes = tipos.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nome)}</option>`).join('');
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const body = `
  <div class="mb-5"><h1 class="text-2xl font-bold text-slate-800">➕ Novo registro</h1></div>
  <div class="max-w-xl space-y-4" id="form">
    <label class="block"><span class="text-sm font-medium text-slate-700">Tipo de serviço</span>
      <select id="f_tipo" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base">${opcoes}</select></label>

    <div class="block"><span class="text-sm font-medium text-slate-700">Cliente</span>
      <input id="f_busca" placeholder="Busque por nome ou telefone…" autocomplete="off" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base">
      <div id="resultados" class="mt-1 space-y-1"></div>
      <div id="escolhido" class="hidden mt-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm"></div>
      <button type="button" onclick="clienteNovo()" class="mt-2 text-sm text-sky-700 underline">➕ Cliente novo (nome + telefone)</button>
      <div id="novo_cliente" class="hidden mt-2 grid grid-cols-2 gap-2">
        <input id="f_nome_novo" placeholder="Nome" class="border border-slate-300 rounded-xl px-3 py-3">
        <input id="f_tel_novo" placeholder="Telefone (zap)" inputmode="tel" class="border border-slate-300 rounded-xl px-3 py-3">
      </div>
    </div>

    <div class="block"><span class="text-sm font-medium text-slate-700">Usina (opcional)</span>
      <input id="f_busca_usina" placeholder="Busque a usina, se for o caso…" autocomplete="off" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base">
      <div id="resultados_usina" class="mt-1 space-y-1"></div>
      <div id="usina_escolhida" class="hidden mt-2 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-sm"></div>
    </div>

    <label class="block"><span class="text-sm font-medium text-slate-700">Data do serviço</span>
      <input type="date" name="data" id="f_data" value="${hoje}" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base"></label>

    <label class="block"><span class="text-sm font-medium text-slate-700">Observações</span>
      <textarea id="f_observacoes" name="observacoes" rows="3" placeholder="O que foi visto/feito…" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base"></textarea></label>

    <div class="grid grid-cols-2 gap-3">
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Fotos
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
    <div id="anexos" class="grid grid-cols-3 gap-2"></div>

    <button id="salvar" onclick="salvar()" class="w-full px-5 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold shadow">💾 Salvar registro</button>
    <div id="progresso" class="text-sm text-slate-500 text-center"></div>
  </div>

  <script>
  var MAX_VIDEOS=2, MAX_VIDEO_MB=100;
  var estado={leadId:null,sistemaId:null,fotos:[],videos:[]};

  function debounce(f,ms){var t;return function(){var a=arguments;clearTimeout(t);t=setTimeout(function(){f.apply(null,a)},ms)}}

  document.getElementById('f_busca').addEventListener('input',debounce(function(e){
    var q=e.target.value.trim();if(q.length<2){document.getElementById('resultados').innerHTML='';return}
    fetch('/dashboard/servicos/buscar-cliente?q='+encodeURIComponent(q),{headers:{'Accept':'application/json'}})
     .then(function(r){return r.json()}).then(function(j){
      document.getElementById('resultados').innerHTML=(j.clientes||[]).map(function(c){
       return '<button type="button" onclick="escolheCliente(\\''+c.id+'\\',this.textContent)" class="block w-full text-left px-4 py-2 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 text-sm">'+c.nome+(c.telefone?' · '+c.telefone:'')+'</button>'}).join('')})
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
      document.getElementById('resultados_usina').innerHTML=(j.usinas||[]).map(function(u){
       return '<button type="button" onclick="escolheUsina(\\''+u.id+'\\',this.textContent)" class="block w-full text-left px-4 py-2 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 text-sm">'+u.nome+'</button>'}).join('')})
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
    img.className='w-full h-20 object-cover rounded-lg';img.onclick=function(){estado.fotos.splice(i,1);pintaAnexos()};d.appendChild(img)});
   estado.videos.forEach(function(f,i){var v=document.createElement('div');
    v.className='w-full h-20 rounded-lg bg-slate-800 text-white flex items-center justify-center text-xs';
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
     observacoes:document.getElementById('f_observacoes').value.trim(),midias:midias}})
   .then(function(r){return r.json()}).then(function(j){
    if(!j.ok)throw new Error(j.erro||'falha');
    var arquivos=estado.fotos.concat(estado.videos),ups=j.uploads||[],feitas=[];
    var fila=Promise.resolve();
    ups.forEach(function(u,i){fila=fila.then(function(){
     prog('Subindo '+(i+1)+' de '+ups.length+'…');
     return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
      .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia})})})});
    return fila.then(function(){
     return fetch('/dashboard/servicos/'+j.id+'/confirmar-midias',{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({midias:feitas})})}).then(function(){
     window.location='/dashboard/servicos?ok='+encodeURIComponent('Registro salvo!'+(ups.length?' ('+feitas.length+'/'+ups.length+' arquivos)':''))})})
   .catch(function(e){alert('Falha ao salvar: '+e.message);btn.disabled=false;btn.textContent='💾 Salvar registro'})}
  </script>`;

  return renderLayout({ active: 'servicos', title: 'Novo serviço', body, user });
}
