// src/modules/dashboard/whatsapp-views.ts
// Tela "Conectar WhatsApp" do tenant: QR grande que se renova sozinho +
// estado ao vivo. Feita pra cliente leigo fazer sem ninguém na linha
// (lição Conquista Solar 28/08: código ditado por telefone não funciona).
// Renovação do miolo — R19 (28/09/2026): o MESMO polling (whatsapp/qr.json a
// cada 20 s, whatsapp/estado.json a cada 5 s) e os mesmos ids; estado em pílula
// (conectado / aguardando / caiu), QR em largura total no celular, sem Tailwind.
import { escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { EstadoConexao } from '../evolution-conexao.js';
import { cabecalhoPagina, cartaoSecao, estadoVazio, icone } from './ui/componentes.js';
import { paginaConfiguracoes } from './configuracoes-casca.js';

const CSS_WHATSAPP = `
.cc-wa-grade{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;max-width:960px}
.cc-cf .cc-wa-grade .cc-panel{margin:0}
.cc-wa-qrp{text-align:center}
.cc-cf-estado{font-size:13px;padding:6px 12px;margin-bottom:16px}
.cc-cf-estado::before{display:none}
.cc-cf-estado .cc-dot{width:9px;height:9px}
.cc-wa-pulsa{animation:cc-wa-pulsa 1.4s ease-in-out infinite}
@keyframes cc-wa-pulsa{50%{opacity:.35}}
.cc-wa-qr img{display:block;margin:0 auto;width:288px;height:288px;max-width:100%;border-radius:14px;border:1px solid var(--cc-line-2);background:#fff;object-fit:contain}
.cc-wa-aviso{margin:10px 0 0;font-size:12px;color:var(--cc-faint)}
.cc-wa-erro{margin:12px 0 0;font-size:13.5px;color:var(--cc-crit)}
.cc-wa-ok{padding:28px 0}
.cc-wa-ok-ic{width:64px;height:64px;margin:0 auto;border-radius:50%;display:grid;place-items:center;color:var(--cc-ok);background:var(--cc-ok-soft)}
.cc-wa-ok-ic .cc-i{width:30px;height:30px}
.cc-wa-ok strong{display:block;margin-top:12px;font-size:17px;color:var(--cc-text)}
.cc-wa-ok p{margin:6px 0 0;font-size:13px;color:var(--cc-muted)}
.cc-wa-passos{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px;font-size:13.5px;color:var(--cc-text-2);line-height:1.5}
.cc-wa-passos strong{color:var(--cc-text)}
.cc-wa-inst{margin:18px 0 0;font-size:12px;color:var(--cc-faint)}
.cc-wa-inst code{font-size:12px;color:var(--cc-text-2);overflow-wrap:anywhere}
@media (max-width:1023px){.cc-wa-grade{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.cc-wa-qr img{width:100%;height:auto;aspect-ratio:1/1}}
`;

// Pílula do estado. O script troca estas MESMAS classes (CL_OK/CL_ESPERA/CL_CAIU).
const PILULA = {
  ok: { cl: 'cc-pill cc-s-ok cc-cf-estado', bol: 'cc-dot cc-d-ok', txt: 'Conectado' },
  espera: { cl: 'cc-pill cc-s-warn cc-cf-estado', bol: 'cc-dot cc-d-warn cc-wa-pulsa', txt: 'Aguardando conexão' },
  caiu: { cl: 'cc-pill cc-s-crit cc-cf-estado', bol: 'cc-dot cc-d-crit', txt: 'Caiu — leia o QR de novo' },
} as const;

export function renderWhatsappPage(input: {
  user: DashUser | undefined;
  instancia: string | null;
  estado: EstadoConexao;
}): string {
  const { user, instancia, estado } = input;
  const marca = escapeHtml(user?.companyNome ?? 'sua empresa');
  const cabecalhoHtml = cabecalhoPagina({
    trilha: [{ rotulo: 'Configurações' }, { rotulo: 'WhatsApp' }],
    titulo: 'Conectar WhatsApp',
    subtitulo: 'É o número que a sua assistente vai usar pra atender os clientes. Conecta uma vez; se cair, volta aqui.',
  });

  let body: string;
  if (!instancia) {
    body = cartaoSecao({ titulo: 'WhatsApp da empresa', corpoHtml: `${estadoVazio({ tipo: 'sem_dado', titulo: 'Ainda não preparado', icone: 'wa' })}
      <p class="cc-cf-nota">O WhatsApp de <strong>${marca}</strong> ainda não foi preparado pelo suporte da plataforma. Fale com o suporte que ativamos em minutos.</p>` });
  } else {
    const p = estado === 'open' ? PILULA.ok : estado === 'close' ? PILULA.caiu : PILULA.espera;
    const aberto = estado === 'open';
    body = `
<div class="cc-wa-grade">
  ${cartaoSecao({ titulo: 'Conexão', classe: 'cc-wa-qrp', corpoHtml: `
    <span id="estado" data-estado="${escapeHtml(estado)}" class="${p.cl}">
      <span id="estado-bolinha" class="${p.bol}"></span>
      <span id="estado-texto">${p.txt}</span>
    </span>
    <div id="qr-box" class="cc-wa-qr${aberto ? ' hidden' : ''}">
      <img id="qr" alt="QR Code do WhatsApp">
      <p id="qr-aviso" class="cc-wa-aviso">Gerando QR…</p>
      <p id="qr-erro" class="cc-wa-erro hidden"></p>
    </div>
    <div id="ok-box" class="cc-wa-ok${aberto ? '' : ' hidden'}">
      <div class="cc-wa-ok-ic">${icone('check')}</div>
      <strong>WhatsApp conectado!</strong>
      <p>Manda um "oi" pro número de outro celular pra ver a assistente responder.</p>
    </div>` })}
  ${cartaoSecao({ titulo: 'Como conectar (1 minuto)', corpoHtml: `
    <ol class="cc-wa-passos">
      <li>Pegue o <strong>celular com o chip do WhatsApp da empresa</strong>.</li>
      <li>Abra o WhatsApp → toque nos <strong>⋮ três pontinhos</strong> (iPhone: <strong>Configurações</strong>).</li>
      <li>Toque em <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>.</li>
      <li>Aponte a câmera pro QR da conexão. Pronto — a bolinha fica verde.</li>
    </ol>
    <p class="cc-wa-inst">Instância: <code>${escapeHtml(instancia)}</code></p>` })}
</div>`;
  }

  const scripts = instancia ? `
<script>
(function(){
  var img=document.getElementById('qr'), estadoEl=document.getElementById('estado'), txt=document.getElementById('estado-texto'), bol=document.getElementById('estado-bolinha');
  var qrBox=document.getElementById('qr-box'), okBox=document.getElementById('ok-box'), aviso=document.getElementById('qr-aviso'), erro=document.getElementById('qr-erro');
  var conectado=false, parado=false, seq=0, tQr=null, tEstado=null;
  var CL_OK='${PILULA.ok.cl}', BOL_OK='${PILULA.ok.bol}';
  var CL_ESPERA='${PILULA.espera.cl}', BOL_ESPERA='${PILULA.espera.bol}';
  var CL_CAIU='${PILULA.caiu.cl}', BOL_CAIU='${PILULA.caiu.bol}';
  function parar(msg){ parado=true; clearInterval(tQr); clearInterval(tEstado); img.removeAttribute('src'); aviso.classList.add('hidden'); erro.textContent=msg; erro.classList.remove('hidden'); }
  function pintar(estado){
    if(estado==='inexistente'){ parar('A conexão do WhatsApp da sua empresa não foi encontrada. Fale com o suporte.'); return; }
    if(estado==='erro'){ aviso.textContent='Sem resposta do servidor do WhatsApp. Tentando de novo…'; return; }
    if(estado==='desconhecido'){ return; } // falha passageira de leitura: não muda a tela
    if(estado==='open'){
      if(!conectado){ conectado=true; qrBox.classList.add('hidden'); okBox.classList.remove('hidden'); }
      estadoEl.className=CL_OK; bol.className=BOL_OK; txt.textContent='${PILULA.ok.txt}';
      return;
    }
    var caiu=estado==='close';
    estadoEl.className=caiu?CL_CAIU:CL_ESPERA; bol.className=caiu?BOL_CAIU:BOL_ESPERA; txt.textContent=caiu?'${PILULA.caiu.txt}':'${PILULA.espera.txt}';
    if(conectado){
      conectado=false; okBox.classList.add('hidden'); qrBox.classList.remove('hidden'); img.removeAttribute('src'); aviso.textContent='Gerando QR…'; qr();
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

  return paginaConfiguracoes({
    active: 'whatsapp', secao: 'whatsapp', title: 'Conectar WhatsApp', user, css: CSS_WHATSAPP, scripts,
    cabecalhoHtml, corpoHtml: body,
  });
}
