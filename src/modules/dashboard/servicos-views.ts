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

function cardServico(s: ServicoRow): string {
  const midias = [
    s.fotos ? `${s.fotos} foto${s.fotos > 1 ? 's' : ''}` : '',
    s.videos ? `${s.videos} vídeo${s.videos > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  const badge = s.status === 'atribuido'
    ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">🟡 pendente</span>'
    : '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">🟢 concluído</span>';
  return `<a href="/dashboard/servicos/${s.id}" class="block bg-white rounded-2xl shadow-sm border border-slate-200 p-4 hover:border-sky-400 transition">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-slate-800">${escapeHtml(s.tipoNome)}</span>
      <span class="text-sm text-slate-500">${dataBr(s.dataServico)}</span>
    </div>
    <div class="flex items-center justify-between mt-1">
      <span class="text-sm text-slate-600">👤 ${escapeHtml(s.clienteNome)}</span>
      ${badge}
    </div>
    ${s.atribuidoNome ? `<div class="text-xs text-slate-400 mt-1">🛠️ ${escapeHtml(s.atribuidoNome)}</div>` : ''}
    ${midias ? `<div class="text-xs text-slate-400 mt-1">📎 ${midias}</div>` : ''}
  </a>`;
}

export function renderServicosPage(
  servicos: ServicoRow[],
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}</div>`
    : '';
  // Os SEUS pendentes vêm primeiro — é o que o instalador abre no campo.
  const meusPendentes = servicos.filter((s) => s.status === 'atribuido' && user && s.atribuidoA === user.id);
  const resto = servicos.filter((s) => !meusPendentes.includes(s));
  const secaoPendentes = meusPendentes.length
    ? `<div class="max-w-xl mb-6">
        <h2 class="text-sm font-bold text-amber-700 uppercase tracking-wide mb-2">🟡 Seus serviços pendentes</h2>
        <div class="space-y-3">${meusPendentes.map(cardServico).join('\n')}</div>
      </div>`
    : '';

  const body = `
  <div class="flex items-center justify-between mb-6">
    <div><h1 class="text-2xl font-bold text-slate-800">🔧 Serviços</h1>
    <p class="text-sm text-slate-500 mt-1">Registro de campo: visita, instalação, manutenção — tudo gravado no cliente.</p></div>
  </div>
  ${avisoHtml}
  <a href="/dashboard/servicos/novo" class="block w-full max-w-xl text-center px-5 py-4 mb-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-lg font-bold shadow">➕ Novo registro</a>
  ${secaoPendentes}
  <div class="space-y-3 max-w-xl">${resto.map(cardServico).join('\n') || (meusPendentes.length ? '' : '<p class="text-slate-400 py-8 text-center">Nenhum serviço registrado ainda.</p>')}</div>`;

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
  const badge = s.status === 'atribuido'
    ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">🟡 pendente</span>'
    : '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">🟢 concluído</span>';

  // Pendente? Vira a tela de TRABALHO do instalador: guia + anexos + concluir.
  const guia = s.status === 'atribuido' && GUIAS_FOTOS[s.tipoId]
    ? `<div class="mt-4 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200">
        <p class="text-sm font-semibold text-sky-900 mb-1">📷 Fotos pra tirar neste serviço:</p>
        <ol class="text-sm text-sky-800 list-decimal ml-5 space-y-0.5">${GUIAS_FOTOS[s.tipoId]!.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>
      </div>`
    : '';
  const completar = s.status === 'atribuido'
    ? `${guia}
    <div class="mt-4 grid grid-cols-2 gap-3">
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Fotos
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-4 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
    <div id="anexos" class="grid grid-cols-3 gap-2 mt-2"></div>
    <textarea id="f_obs_final" rows="2" placeholder="Observações finais…" class="mt-3 w-full border border-slate-300 rounded-xl px-4 py-3 text-base"></textarea>
    <button id="concluir" onclick="concluir()" class="mt-3 w-full px-5 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold shadow">✅ Concluir serviço</button>
    <div id="progresso" class="text-sm text-slate-500 text-center mt-2"></div>
    <script>
    var MAX_VIDEOS=2, MAX_VIDEO_MB=100, SID='${escapeHtml(s.id)}';
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
      img.className='w-full h-20 object-cover rounded-lg';img.onclick=function(){estado.fotos.splice(i,1);pintaAnexos()};d.appendChild(img)});
     estado.videos.forEach(function(f,i){var v=document.createElement('div');
      v.className='w-full h-20 rounded-lg bg-slate-800 text-white flex items-center justify-center text-xs';
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
      var ups=j.uploads||[],feitas=[],fila=Promise.resolve();
      ups.forEach(function(u,i){fila=fila.then(function(){
       prog('Subindo '+(i+1)+' de '+ups.length+'…');
       return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
        .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia})})})});
      return fila.then(function(){
       return fetch('/dashboard/servicos/'+SID+'/confirmar-midias',{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:feitas})})})
      .then(function(){
       return fetch('/dashboard/servicos/'+SID+'/concluir',{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({observacoes:document.getElementById('f_obs_final').value.trim()})})})
      .then(function(){window.location='/dashboard/servicos?ok='+encodeURIComponent('✅ Serviço concluído!')})})
     .catch(function(e){alert('Falha: '+e.message);btn.disabled=false;btn.textContent='✅ Concluir serviço'})}
    </script>`
    : '';

  const body = `
  <a href="/dashboard/servicos" class="text-sm text-slate-600 hover:underline">← Voltar</a>
  <div class="max-w-xl mt-3">
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-slate-800">${escapeHtml(s.tipoNome)}</span>
        <span class="text-sm text-slate-500">${dataBr(s.dataServico)}</span>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-sm text-slate-600">👤 ${escapeHtml(s.clienteNome)}</span>
        ${badge}
      </div>
      ${s.atribuidoNome ? `<div class="text-xs text-slate-400 mt-1">🛠️ Atribuído a ${escapeHtml(s.atribuidoNome)}</div>` : ''}
      ${s.observacoes ? `<p class="text-sm text-slate-700 mt-3 whitespace-pre-wrap">${escapeHtml(s.observacoes)}</p>` : ''}
    </div>
    ${fotos ? `<div class="grid grid-cols-2 gap-2 mt-4">${fotos}</div>` : ''}
    ${videos}
    ${completar}
  </div>`;
  return renderLayout({ active: 'servicos', title: s.tipoNome, body, user });
}

// Guia de fotos por tipo de serviço (pedido do Junior 29/07: "um guia escrito
// das fotos a serem enviadas"). Rascunho do Claude — o Junior ajusta o texto.
const GUIAS_FOTOS: Record<string, string[]> = {
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
  const guias = Object.entries(GUIAS_FOTOS).map(([tipo, itens]) =>
    `<div class="guia-fotos hidden mt-2 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200" data-tipo="${escapeHtml(tipo)}">
      <p class="text-sm font-semibold text-sky-900 mb-1">📷 Fotos pra tirar neste serviço:</p>
      <ol class="text-sm text-sky-800 list-decimal ml-5 space-y-0.5">${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>
    </div>`).join('');

  const body = `
  <div class="mb-5"><h1 class="text-2xl font-bold text-slate-800">➕ Novo registro</h1></div>
  <div class="max-w-xl space-y-4" id="form">
    <label class="block"><span class="text-sm font-medium text-slate-700">Tipo de serviço</span>
      <select id="f_tipo" onchange="mostraGuia()" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base">${opcoes}</select></label>
    ${guias}

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

    <label class="block"><span class="text-sm font-medium text-slate-700">Atribuir a (quem vai fazer)</span>
      <select id="f_atribuido" name="atribuido" class="mt-1 w-full border border-slate-300 rounded-xl px-4 py-3 text-base">
        <option value="">— eu mesmo, registro pronto —</option>
        ${opcoesUsuarios}
      </select>
      <span class="text-xs text-slate-500">Atribuiu a alguém? O serviço fica 🟡 pendente pra ele — as fotos podem ficar por conta dele na hora da obra.</span></label>

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

  function mostraGuia(){
   var t=document.getElementById('f_tipo').value;
   document.querySelectorAll('.guia-fotos').forEach(function(g){
    g.classList.toggle('hidden',g.getAttribute('data-tipo')!==t)})}
  mostraGuia();

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
     atribuidoA:document.getElementById('f_atribuido').value||null,
     observacoes:document.getElementById('f_observacoes').value.trim(),midias:midias})})
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
