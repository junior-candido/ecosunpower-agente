// src/modules/dashboard/whatsapp-pessoal-views.ts
// "Meu WhatsApp no painel" (Atendimento Parte 2b, 28/09/2026). O dono (admin
// da EcoSun) conecta o WhatsApp Business PESSOAL dele por QR code na Evolution
// — o "plano B" enquanto a coexistência oficial da Meta não sai. Tela no
// padrão cc- (sem Tailwind), tema escuro.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { EstadoConexao } from '../evolution-conexao.js';
import { cabecalhoPagina, aviso } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

export interface WhatsappPessoalInput {
  user: DashUser | undefined;
  /** null = ainda não preparado. */
  numero: { instancia: string; ativo: boolean; donoNome: string | null } | null;
  estado: EstadoConexao | null;
  /** Mensagem depois de uma ação (?ok=… / ?erro=…), já traduzida. */
  resultado?: { tom: 'ok' | 'erro' | 'atencao'; texto: string } | null;
  /** Sugestão de nome da instância. */
  sugestao?: string;
}

const RESULTADOS: Record<string, { tom: 'ok' | 'erro' | 'atencao'; texto: string }> = {
  criada: { tom: 'ok', texto: 'Conexão preparada. Agora leia o QR com o seu WhatsApp Business.' },
  webhook_falhou: { tom: 'atencao', texto: 'Conexão preparada, mas não consegui apontar o aviso de mensagens desta instância. Se as conversas não aparecerem, peça pra configurar o webhook dela na Evolution.' },
  nome_invalido: { tom: 'erro', texto: 'Nome inválido: use só letras, números, - ou _.' },
  instancia_ocupada: { tom: 'erro', texto: 'Esse nome já é o número de uma assistente (da Eva ou de um cliente). Escolha outro.' },
  evolution_falhou: { tom: 'erro', texto: 'O servidor do WhatsApp (Evolution) não respondeu. Tente de novo em instantes.' },
  erro_banco: { tom: 'erro', texto: 'Não consegui salvar. Tente de novo.' },
  desligado: { tom: 'ok', texto: 'Desligado: o painel parou de gravar as conversas deste número.' },
  religado: { tom: 'ok', texto: 'Religado: as conversas voltam a aparecer no painel.' },
};

export function resultadoWhatsappPessoal(chave: unknown): WhatsappPessoalInput['resultado'] {
  return typeof chave === 'string' && Object.prototype.hasOwnProperty.call(RESULTADOS, chave) ? RESULTADOS[chave] : null;
}

export function renderWhatsappPessoalPage(p: WhatsappPessoalInput): string {
  const cab = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Conversas', href: '/dashboard/leads/conversas' }, { rotulo: 'Meu WhatsApp' }],
    titulo: 'Meu WhatsApp no painel',
    subtitulo: 'Seu WhatsApp Business pessoal dentro da tela de Conversas. Só você vê.',
  });
  const res = p.resultado ? aviso({ tom: p.resultado.tom === 'atencao' ? 'atencao' : p.resultado.tom, texto: p.resultado.texto }) : '';
  const regras = `<ul class="cc-wp-regras">
      <li>🔒 <strong>Só você vê</strong> as conversas deste número no painel.</li>
      <li>🤖 <strong>A Eva nunca responde aqui.</strong> Ela continua só no número oficial dela.</li>
      <li>👥 Aparecem <strong>todas</strong> as conversas. Quem ainda não é lead ganha o botão <strong>Virar lead</strong>.</li>
      <li>🔁 Mesmo cliente nos dois números = <strong>um lead só</strong> (pelo telefone).</li>
      <li>⚠️ É conexão por QR (não oficial da Meta): pode cair. Se cair, volte aqui e leia o QR de novo.</li>
    </ul>`;

  let corpo: string;
  if (!p.numero) {
    corpo = `<div class="cc-wp-grade">
      <section class="cc-panel cc-wp-card">
        <h2>Preparar a conexão</h2>
        <p class="cc-muted">Cria a conexão do seu número no servidor do WhatsApp. Depois aparece o QR para você ler com o celular.</p>
        <form class="cc-form cc-wp-form" method="POST" action="/dashboard/whatsapp/pessoal/criar">
          <label class="cc-campo"><span>Nome da conexão</span><input type="text" name="instancia" value="${escapeHtml(p.sugestao ?? 'junior-business')}" pattern="[A-Za-z0-9_-]{1,64}" maxlength="64" required></label>
          <button type="submit" class="cc-btn cc-wp-ok">Preparar e mostrar o QR</button>
        </form>
      </section>
      <section class="cc-panel cc-wp-card"><h2>Como funciona</h2>${regras}</section>
    </div>`;
  } else {
    const aberto = p.estado === 'open';
    const inst = escapeHtml(p.numero.instancia);
    const liga = p.numero.ativo
      ? `<form method="POST" action="/dashboard/whatsapp/pessoal/desligar" onsubmit="return confirm('Parar de gravar as conversas deste número no painel?')"><button type="submit" class="cc-btn cc-btn-sm cc-btn-ghost">Desligar do painel</button></form>`
      : `<form method="POST" action="/dashboard/whatsapp/pessoal/religar"><button type="submit" class="cc-btn cc-btn-sm">Religar no painel</button></form>`;
    corpo = `<div class="cc-wp-grade">
      <section class="cc-panel cc-wp-card cc-wp-qr">
        <div id="wp-estado" class="cc-wp-estado ${aberto ? 'cc-wp-on' : ''}"><span class="cc-wp-bol"></span><span id="wp-estado-t">${aberto ? 'Conectado' : 'Aguardando conexão'}</span></div>
        <div id="wp-qr-box"${aberto ? ' hidden' : ''}>
          <img id="wp-qr" alt="QR Code do WhatsApp" class="cc-wp-img" hidden>
          <p id="wp-aviso" class="cc-hint">Gerando QR…</p>
          <p id="wp-erro" class="cc-wp-erro" hidden></p>
        </div>
        <div id="wp-ok-box"${aberto ? '' : ' hidden'} class="cc-wp-okbox">
          <div class="cc-wp-grande">✅</div>
          <p><strong>Seu WhatsApp está no painel.</strong></p>
          <p class="cc-muted">As conversas aparecem em <a class="cc-link" href="/dashboard/leads/conversas">Conversas</a> com o selo 👤.</p>
        </div>
        ${p.numero.ativo ? '' : `<p class="cc-wp-erro">Desligado do painel: nada deste número está sendo gravado.</p>`}
      </section>
      <section class="cc-panel cc-wp-card">
        <h2>Como conectar (1 minuto)</h2>
        <ol class="cc-wp-passos">
          <li>Pegue o celular com o <strong>WhatsApp Business</strong> do seu número.</li>
          <li>Toque nos <strong>⋮ três pontinhos</strong> (iPhone: <strong>Configurações</strong>).</li>
          <li><strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>.</li>
          <li>Aponte a câmera para o QR ao lado. A bolinha fica verde.</li>
        </ol>
        ${regras}
        <div class="cc-row cc-wp-rodape"><span class="cc-faint">Conexão: <code>${inst}</code></span><span class="cc-sp"></span>${liga}</div>
      </section>
    </div>`;
  }

  const body = `<div class="cc-root cc-wp">${cab}${res}${corpo}</div><style>${CSS_WP}</style>`;
  const scripts = p.numero ? `<script>${SCRIPT_WP}</script>` : undefined;
  return renderLayout({ active: 'conversas', title: 'Meu WhatsApp', body, scripts, user: p.user, tailwind: false, dark: temaDaTela(p.user, 'escuro') === 'escuro' });
}

const SCRIPT_WP = `(function(){
var img=document.getElementById('wp-qr'),box=document.getElementById('wp-qr-box'),ok=document.getElementById('wp-ok-box'),est=document.getElementById('wp-estado'),t=document.getElementById('wp-estado-t'),av=document.getElementById('wp-aviso'),er=document.getElementById('wp-erro');
if(!img)return;var conectado=est&&est.classList.contains('cc-wp-on'),parado=false;
function pintar(e){if(e==='inexistente'){parado=true;er.textContent='A conexão não foi encontrada no servidor do WhatsApp. Prepare de novo.';er.hidden=false;return;}
if(e==='open'){if(!conectado){conectado=true;box.hidden=true;ok.hidden=false;est.classList.add('cc-wp-on');t.textContent='Conectado';}}
else if(e==='close'||e==='connecting'){if(conectado){conectado=false;ok.hidden=true;box.hidden=false;est.classList.remove('cc-wp-on');t.textContent='Aguardando conexão';qr();}}}
function qr(){if(parado||conectado)return;fetch('/dashboard/whatsapp/pessoal/qr.json',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;pintar(j.estado);if(j.base64){img.src=j.base64;img.hidden=false;av.textContent='O QR se renova sozinho.';}}).catch(function(){});}
function estado(){if(parado)return;fetch('/dashboard/whatsapp/pessoal/estado.json',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j)pintar(j.estado);}).catch(function(){});}
qr();setInterval(qr,20000);setInterval(estado,5000);
})();`;

const CSS_WP = `
.cc-wp-grade{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;max-width:1000px;margin-top:12px}
.cc-wp-card{padding:20px;display:flex;flex-direction:column;gap:10px}
.cc-wp-card h2{font-size:16px;font-weight:700;margin:0}
.cc-wp-form{display:flex;flex-direction:column;gap:10px}
.cc-wp-form input{width:100%}
.cc-btn.cc-wp-ok{background:linear-gradient(180deg,#3DBB6E,#2a9a57);color:#fff;border-color:transparent;font-weight:700;justify-content:center}
.cc-wp-regras,.cc-wp-passos{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:var(--cc-text-2)}
.cc-wp-passos{list-style:decimal}
.cc-wp-regras{list-style:none;padding-left:0}
.cc-wp-qr{align-items:center;text-align:center}
.cc-wp-estado{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:99px;font-size:13px;font-weight:700;background:var(--cc-warn-soft);color:var(--cc-warn)}
.cc-wp-estado.cc-wp-on{background:var(--cc-ok-soft);color:var(--cc-ok)}
.cc-wp-bol{width:9px;height:9px;border-radius:50%;background:currentColor}
.cc-wp-img{width:272px;height:272px;max-width:100%;border-radius:14px;border:1px solid var(--cc-line-2);background:#fff;object-fit:contain;margin-top:8px}
.cc-wp-erro{color:var(--cc-crit);font-size:13px}
.cc-wp-okbox{padding:24px 0}
.cc-wp-grande{font-size:48px}
.cc-wp-rodape{margin-top:8px;align-items:center;gap:8px}
.cc-wp-rodape form{margin:0}
@media (max-width:900px){.cc-wp-grade{grid-template-columns:1fr}}
`;
