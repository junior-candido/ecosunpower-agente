// src/modules/dashboard/whatsapp-views.ts
// Tela "Conectar WhatsApp" do tenant: QR grande que se renova sozinho +
// estado ao vivo. Feita pra cliente leigo fazer sem ninguém na linha
// (lição Conquista Solar 28/08: código ditado por telefone não funciona).
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { EstadoConexao } from '../evolution-conexao.js';

export function renderWhatsappPage(input: {
  user: DashUser | undefined;
  instancia: string | null;
  estado: EstadoConexao;
}): string {
  const { user, instancia, estado } = input;
  const marca = escapeHtml(user?.companyNome ?? 'sua empresa');

  let body: string;
  if (!instancia) {
    body = `<div class="mb-6"><h1 class="text-2xl font-bold text-slate-800">📱 Conectar WhatsApp</h1></div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-xl text-slate-600">
      O WhatsApp de <b>${marca}</b> ainda não foi preparado pela EcoSunPower. Fale com a gente que ativamos em minutos.
    </div>`;
  } else {
    body = `
<div class="mb-6"><h1 class="text-2xl font-bold text-slate-800">📱 Conectar WhatsApp</h1>
<p class="text-slate-500 mt-1">É o número que a sua assistente vai usar pra atender os clientes. Conecta uma vez; se cair, volta aqui.</p></div>

<div class="grid md:grid-cols-2 gap-6 max-w-4xl">
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
    <div id="estado" data-estado="${escapeHtml(estado)}" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-4 ${estado === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
      <span id="estado-bolinha" class="w-2.5 h-2.5 rounded-full ${estado === 'open' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}"></span>
      <span id="estado-texto">${estado === 'open' ? 'Conectado' : 'Aguardando conexão'}</span>
    </div>
    <div id="qr-box" class="${estado === 'open' ? 'hidden' : ''}">
      <img id="qr" alt="QR Code do WhatsApp" class="mx-auto w-72 h-72 rounded-xl border border-slate-200 bg-slate-50 object-contain">
      <p id="qr-aviso" class="text-xs text-slate-400 mt-2">Gerando QR…</p>
      <p id="qr-erro" class="hidden text-sm text-rose-700 mt-3"></p>
    </div>
    <div id="ok-box" class="${estado === 'open' ? '' : 'hidden'} py-10">
      <div class="text-6xl">✅</div>
      <p class="text-lg font-semibold text-slate-800 mt-3">WhatsApp conectado!</p>
      <p class="text-sm text-slate-500 mt-1">Manda um "oi" pro número de outro celular pra ver a assistente responder.</p>
    </div>
  </div>

  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-slate-700">
    <h2 class="font-bold text-slate-800 mb-3">Como conectar (1 minuto)</h2>
    <ol class="list-decimal ml-5 space-y-2 text-sm">
      <li>Pegue o <b>celular com o chip do WhatsApp da empresa</b>.</li>
      <li>Abra o WhatsApp → toque nos <b>⋮ três pontinhos</b> (iPhone: <b>Configurações</b>).</li>
      <li>Toque em <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>.</li>
      <li>Aponte a câmera pro QR aqui ao lado. Pronto — a bolinha fica verde.</li>
    </ol>
    <p class="text-xs text-slate-400 mt-6">Instância: <code>${escapeHtml(instancia)}</code></p>
  </div>
</div>`;
  }

  const scripts = instancia ? `
<script>
(function(){
  var img=document.getElementById('qr'), estadoEl=document.getElementById('estado'), txt=document.getElementById('estado-texto'), bol=document.getElementById('estado-bolinha');
  var qrBox=document.getElementById('qr-box'), okBox=document.getElementById('ok-box'), aviso=document.getElementById('qr-aviso'), erro=document.getElementById('qr-erro');
  var conectado=false, parado=false, seq=0, tQr=null, tEstado=null;
  var CL_OK='inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-4 bg-emerald-100 text-emerald-800';
  var CL_ESPERA='inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-4 bg-amber-100 text-amber-800';
  function parar(msg){ parado=true; clearInterval(tQr); clearInterval(tEstado); img.removeAttribute('src'); aviso.classList.add('hidden'); erro.textContent=msg; erro.classList.remove('hidden'); }
  function pintar(estado){
    if(estado==='inexistente'){ parar('A conexão do WhatsApp da sua empresa não foi encontrada. Fale com a EcoSunPower.'); return; }
    if(estado==='erro'){ aviso.textContent='Sem resposta do servidor do WhatsApp. Tentando de novo…'; return; }
    if(estado==='desconhecido'){ return; } // falha passageira de leitura: não muda a tela
    if(estado==='open'){
      if(!conectado){ conectado=true; qrBox.classList.add('hidden'); okBox.classList.remove('hidden'); estadoEl.className=CL_OK; bol.className='w-2.5 h-2.5 rounded-full bg-emerald-500'; txt.textContent='Conectado'; }
    } else if(conectado){
      conectado=false; okBox.classList.add('hidden'); qrBox.classList.remove('hidden'); estadoEl.className=CL_ESPERA; bol.className='w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse'; txt.textContent='Aguardando conexão'; img.removeAttribute('src'); aviso.textContent='Gerando QR…'; qr();
    }
  }
  function qr(){
    if(parado||conectado) return;
    var meu=++seq;
    return fetch('/dashboard/whatsapp/qr.json',{credentials:'same-origin'}).then(function(r){ if(r.redirected||!r.ok){ location.reload(); return null; } return r.json(); }).then(function(j){
      if(!j||meu!==seq) return;
      pintar(j.estado);
      if(j.base64){ img.src=j.base64; aviso.textContent='O QR se renova sozinho. Aponte a câmera do WhatsApp.'; }
      else if(j.estado!=='open'&&!parado){ aviso.textContent='Gerando QR…'; setTimeout(qr,3000); }
    }).catch(function(){});
  }
  function estado(){ if(parado) return; fetch('/dashboard/whatsapp/estado.json',{credentials:'same-origin'}).then(function(r){ if(r.redirected||!r.ok){ location.reload(); return null; } return r.json(); }).then(function(j){ if(j) pintar(j.estado); }).catch(function(){}); }
  qr();
  tQr=setInterval(qr, 20000);
  tEstado=setInterval(estado, 5000);
})();
</script>` : undefined;

  return renderLayout({ active: 'whatsapp', title: 'Conectar WhatsApp', body, scripts, user });
}
