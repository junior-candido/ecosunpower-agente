// src/modules/dashboard/servicos-views.ts
// Diário de Serviços (F1) — telas MOBILE-FIRST: o instalador usa no celular,
// no sol, com luva. Botão grande, campo grande, pouco texto.
// Fluxo do novo registro: 1) POST /dashboard/servicos/nova (JSON, sem os
// arquivos) → volta {id, uploads:[{url}]}; 2) navegador sobe cada arquivo
// DIRETO pro Storage (PUT na URL assinada — vídeo não passa pelo Express);
// 3) POST /servicos/:id/confirmar-midias com o que subiu → lista.
import { renderLayout, escapeHtml } from './views.js';
import { LOGO_PASTA_BASE64 } from '../relatorios/pasta/logo-pasta.js';
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
    <a href="/dashboard/servicos/lixeira" class="text-sm text-slate-400 hover:text-slate-600 hover:underline">🗑️ Lixeira</a>
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
  podeReabrir = false,
  envioZap?: { pode: boolean; telAtribuido: string | null; criadoAgora?: boolean },
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
    <div class="mt-4 grid grid-cols-3 gap-2">
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Tirar foto
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🖼️ Galeria
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
    <div id="anexos" class="grid grid-cols-3 gap-2 mt-2"></div>
    <textarea id="f_obs_final" rows="2" placeholder="Observações finais…" class="mt-3 w-full border border-slate-300 rounded-xl px-4 py-3 text-base"></textarea>
    <button id="concluir" onclick="concluir()" class="mt-3 w-full px-5 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold shadow">✅ Concluir serviço</button>
    <div id="progresso" class="text-sm text-slate-500 text-center mt-2"></div>
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
    </script>`
    : '';

  // 📤 Enviar pelo zap (quem pode editar): reenvio pro atribuído ou número
  // avulso — avulso escolhe entre acesso temporário criado na hora ou só as
  // informações. Pedido do Junior 30/07.
  const faixaCriado = envioZap?.criadoAgora
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">✅ Serviço criado!${envioZap.pode ? ' Quer mandar as informações no zap de quem vai fazer? Use o botão aqui embaixo.' : ''}</div>`
    : '';
  const opcaoAtribuido = s.atribuidoA
    ? (envioZap?.telAtribuido
      ? `<label class="flex items-center gap-2 text-sm"><input type="radio" name="z_destino" value="atribuido" checked onchange="zapModo()"> Pro atribuído: <b>${escapeHtml(s.atribuidoNome ?? '')}</b> (${escapeHtml(envioZap.telAtribuido)})</label>`
      : `<p class="text-sm text-amber-700">⚠️ ${escapeHtml(s.atribuidoNome ?? 'O atribuído')} está sem telefone cadastrado — <a class="underline" href="/dashboard/usuarios">cadastre na tela Usuários</a> ou use "Outro número".</p>`)
    : '';
  const zapHtml = envioZap?.pode ? `
    <button onclick="document.getElementById('zap_modal').classList.remove('hidden')" class="mt-4 w-full px-5 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold shadow">📤 Enviar pelo zap</button>
    <div id="zap_modal" class="hidden mt-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
      ${opcaoAtribuido}
      <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_destino" value="avulso" ${s.atribuidoA && envioZap.telAtribuido ? '' : 'checked'} onchange="zapModo()"> Outro número</label>
      <div id="z_avulso" class="space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <input id="z_nome" placeholder="Nome" class="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          <input id="z_tel" placeholder="Telefone (zap)" inputmode="tel" class="border border-slate-300 rounded-xl px-3 py-2 text-sm">
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_modo" value="acesso" checked> 🪄 Mandar o serviço por LINK (toca e trabalha — sem senha, sem cadastro)</label>
        <div class="flex items-center gap-2 text-xs text-slate-500 pl-6">link vale por
          <input id="z_dias" type="number" min="1" max="60" value="7" class="w-14 border border-slate-300 rounded-lg px-2 py-1 text-sm text-center"> dias
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="radio" name="z_modo" value="info"> 📄 Só as informações (endereço + roteiro de fotos, sem link)</label>
      </div>
      <button id="z_enviar" onclick="zapEnviar()" class="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Enviar</button>
      <div id="z_status" class="text-sm text-center text-slate-500"></div>
    </div>
    <script>
    function zapModo(){
     var d=document.querySelector('input[name="z_destino"]:checked');
     document.getElementById('z_avulso').style.display=(d&&d.value==='avulso')?'':'none'}
    zapModo();
    function zapEnviar(){
     var d=document.querySelector('input[name="z_destino"]:checked');
     var m=document.querySelector('input[name="z_modo"]:checked');
     var corpo={destino:d?d.value:'avulso'};
     if(corpo.destino==='avulso'){
      corpo.telefone=document.getElementById('z_tel').value.trim();
      corpo.nome=document.getElementById('z_nome').value.trim();
      corpo.modo=m?m.value:'info';
      corpo.dias=parseInt(document.getElementById('z_dias').value,10)||7;
      if(!corpo.telefone){alert('Informe o telefone');return}
      if(corpo.modo==='acesso'&&!corpo.nome){alert('Informe o nome de quem vai fazer');return}}
     var btn=document.getElementById('z_enviar');btn.disabled=true;btn.textContent='Enviando…';
     fetch('/dashboard/servicos/${escapeHtml(s.id)}/enviar-zap',{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(corpo)})
     .then(function(r){return r.json()}).then(function(j){
      btn.disabled=false;btn.textContent='Enviar';
      if(!j.ok)throw new Error(j.erro||'falha');
      document.getElementById('z_status').textContent='✅ Enviado!'+(j.aviso?' '+j.aviso:'')})
     .catch(function(e){btn.disabled=false;btn.textContent='Enviar';
      document.getElementById('z_status').textContent='❌ '+e.message})}
    </script>` : '';

  const body = `
  <a href="/dashboard/servicos" class="text-sm text-slate-600 hover:underline">← Voltar</a>
  <div class="max-w-xl mt-3">
    ${faixaCriado}
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
    ${zapHtml}
    ${s.status === 'concluido' && podeReabrir ? `
    <details class="mt-5"><summary class="text-sm text-amber-700 cursor-pointer select-none">🔄 Faltou algo? Reabrir o serviço</summary>
      <form method="post" action="/dashboard/servicos/${s.id}/reabrir" class="mt-2 flex gap-2">
        <input name="motivo" placeholder="O que faltou? (vai no zap do instalador)" class="flex-1 border border-slate-300 rounded-xl px-4 py-2 text-sm">
        <button class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">Reabrir</button>
      </form>
      <p class="text-xs text-slate-500 mt-1">Reabrir reativa o acesso do instalador (se temporário) e avisa ele no zap; ao concluir de novo, expira de novo.</p>
    </details>` : ''}
    ${podeReabrir && s.campoSlug ? (() => {
      const vencido = s.campoExpiraEm ? new Date(s.campoExpiraEm).getTime() < Date.now() : false;
      const venceBr = s.campoExpiraEm ? new Date(s.campoExpiraEm).toLocaleDateString('pt-BR') : '';
      return vencido
        ? `<div class="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
             🕰 O link de campo${s.campoNome ? ` do(a) <b>${escapeHtml(s.campoNome)}</b>` : ''} <b>venceu</b> (${escapeHtml(venceBr)}) — reenvie pelo 📤 pra gerar um novo.
           </div>`
        : `<div class="mt-4 bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
             <div class="text-xs font-bold text-cyan-800 uppercase tracking-wide mb-1">🪄 Link de campo${s.campoNome ? ` — ${escapeHtml(s.campoNome)}` : ''} <span class="font-normal normal-case text-cyan-600">(vale até ${escapeHtml(venceBr)})</span></div>
             <div class="flex items-center gap-2">
               <code id="linkCampo" class="flex-1 text-xs bg-white border border-cyan-200 rounded-lg px-2 py-1.5 text-cyan-900 break-all"></code>
               <button onclick="navigator.clipboard.writeText(document.getElementById('linkCampo').textContent).then(()=>{this.textContent='✅'})" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold whitespace-nowrap">📋 copiar</button>
             </div>
             <p class="text-xs text-cyan-700 mt-1">Manda pelo seu zap — quem tocar trabalha direto, sem senha.</p>
             <script>document.getElementById('linkCampo').textContent = window.location.origin + '/dashboard/servicos/campo-${escapeHtml(s.campoSlug)}';</script>
           </div>`;
    })() : ''}
    ${podeReabrir ? `
    <form method="post" action="/dashboard/servicos/${s.id}/excluir" class="mt-4 text-right"
      onsubmit="return confirm('Mover este serviço pra Lixeira? Dá pra restaurar quando quiser (nada é apagado).')">
      <button class="text-xs text-slate-400 hover:text-rose-600 hover:underline">🗑️ Excluir (vai pra Lixeira, dá pra desfazer)</button>
    </form>` : ''}
  </div>`;
  return renderLayout({ active: 'servicos', title: s.tipoNome, body, user });
}

// Lixeira: excluído some da lista mas volta com 1 clique (Junior 05/08:
// "excluir sempre com opção de desfazer").
export function renderLixeiraServicosPage(servicos: ServicoRow[], user: DashUser | undefined): string {
  const linhas = servicos.map((s) => `
    <div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div>
        <div class="font-semibold text-slate-700">${escapeHtml(s.tipoNome)} — ${escapeHtml(s.clienteNome)}</div>
        <div class="text-xs text-slate-400">dia ${escapeHtml(s.dataServico.split('-').reverse().join('/'))}</div>
      </div>
      <form method="post" action="/dashboard/servicos/${s.id}/restaurar">
        <button class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">♻️ Restaurar</button>
      </form>
    </div>`).join('\n');

  const body = `
  <div class="mb-6">
    <a href="/dashboard/servicos" class="text-sky-600 text-sm hover:underline">← Voltar aos serviços</a>
    <h1 class="text-2xl font-bold text-slate-800 mt-2">🗑️ Lixeira de serviços</h1>
    <p class="text-sm text-slate-500 mt-1">Nada aqui foi apagado — restaure quando quiser.</p>
  </div>
  <div class="space-y-3 max-w-xl">${linhas || '<p class="text-slate-400 py-8 text-center">Lixeira vazia. 🌱</p>'}</div>`;
  return renderLayout({ active: 'servicos', title: 'Lixeira de serviços', body, user });
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

    <div class="grid grid-cols-3 gap-2">
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">📷 Tirar foto
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🖼️ Galeria
        <input type="file" accept="image/*" multiple style="display:none" onchange="addFotos(this)"></label>
      <label class="block text-center px-2 py-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer">🎥 Vídeo (máx 2)
        <input type="file" accept="video/*" style="display:none" onchange="addVideo(this)"></label>
    </div>
    <div id="anexos" class="grid grid-cols-3 gap-2"></div>

    <button id="salvar" onclick="salvar()" class="w-full px-5 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold shadow">💾 Salvar registro</button>
    <div id="progresso" class="text-sm text-slate-500 text-center"></div>
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

  return renderLayout({ active: 'servicos', title: 'Novo serviço', body, user });
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
  v.onclick=function(){estado.videos.splice(i,1);pinta()};d.appendChild(v)})}
function addFotos(inp){var fs=Array.prototype.slice.call(inp.files||[]);inp.value='';
 Promise.all(fs.map(comprime)).then(function(bs){estado.fotos=estado.fotos.concat(bs);pinta()})
 .catch(function(){alert('Falha ao ler a foto')})}
function addVideo(inp){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;
 if(estado.videos.length>=MAX_VIDEOS){alert('Máximo de '+MAX_VIDEOS+' vídeos');return}
 if(f.size>MAX_VIDEO_MB*1048576){alert('Vídeo muito grande (máx '+MAX_VIDEO_MB+'MB) — grave um trecho mais curto');return}
 estado.videos.push(f);pinta()}
function prog(t){document.getElementById('progresso').textContent=t}
function concluir(){
 if(!estado.fotos.length&&!estado.videos.length){if(!confirm('Concluir sem nenhuma foto?'))return}
 var btn=document.getElementById('btnConcluir');btn.disabled=true;btn.textContent='Enviando…';
 var midias=estado.fotos.map(function(b,i){return{nome:'foto-'+(i+1)+'.jpg',tipoMidia:'foto',contentType:'image/jpeg'}})
  .concat(estado.videos.map(function(f,i){return{nome:'video-'+(i+1),tipoMidia:'video',contentType:f.type||'video/mp4'}}));
 var arquivos=estado.fotos.concat(estado.videos);
 fetch('/dashboard/servicos/campo/'+SLUG+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:midias})})
 .then(function(r){return r.json()}).then(function(j){
  if(!j.ok)throw new Error(j.erro||'falha');
  var ups=j.uploads||[],feitas=[],falhas=[],fila=Promise.resolve();
  ups.forEach(function(u,i){fila=fila.then(function(){
   prog('Subindo '+(i+1)+' de '+ups.length+'…');
   return fetch(u.url,{method:'PUT',headers:{'Content-Type':midias[i].contentType},body:arquivos[i]})
    .then(function(r){if(r.ok)feitas.push({path:u.path,tipoMidia:midias[i].tipoMidia});
     else falhas.push(midias[i].nome+' (erro '+r.status+')')})
    .catch(function(){falhas.push(midias[i].nome+' (rede caiu)')})})});
  return fila.then(function(){
   if(falhas.length)alert('⚠️ '+falhas.length+' arquivo(s) não subiram:\\n'+falhas.join('\\n'));
   return fetch('/dashboard/servicos/campo/'+SLUG+'/confirmar-midias',{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({midias:feitas})})})
  .then(function(){
   return fetch('/dashboard/servicos/campo/'+SLUG+'/concluir',{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({observacoes:document.getElementById('obs').value.trim()})})})
  .then(function(){window.location.reload()})})
 .catch(function(e){alert('Falha: '+e.message);btn.disabled=false;btn.textContent='✅ Concluir serviço'})}
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
