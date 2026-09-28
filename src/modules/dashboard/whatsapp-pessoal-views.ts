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
import type { ProgressoHistorico } from '../numero-pessoal-historico.js';

export interface WhatsappPessoalInput {
  user: DashUser | undefined;
  /** null = ainda não preparado. */
  numero: { instancia: string; ativo: boolean; donoNome: string | null; marcarLida?: boolean } | null;
  estado: EstadoConexao | null;
  /** Mensagem depois de uma ação (?ok=… / ?erro=…), já traduzida. */
  resultado?: { tom: 'ok' | 'erro' | 'atencao'; texto: string } | null;
  /** Sugestão de nome da instância. */
  sugestao?: string;
  /** Histórico (últimos N dias): o que já está no painel + a busca em andamento. */
  historico?: {
    resumo: { mensagens: number; conversas: number; conversasMais: boolean; maisAntiga: string | null } | null;
    progresso: ProgressoHistorico | null;
    dias: number;
    /** false = servidor sem a Evolution configurada (botão some). */
    disponivel: boolean;
  };
}

const RESULTADOS: Record<string, { tom: 'ok' | 'erro' | 'atencao'; texto: string }> = {
  criada: { tom: 'ok', texto: 'Conexão preparada. Agora leia o QR com o seu WhatsApp Business.' },
  webhook_falhou: { tom: 'atencao', texto: 'Conexão preparada, mas não consegui apontar o aviso de mensagens desta instância. Se as conversas não aparecerem, peça pra configurar o webhook dela na Evolution.' },
  nome_invalido: { tom: 'erro', texto: 'Nome inválido: use só letras, números, - ou _.' },
  instancia_ocupada: { tom: 'erro', texto: 'Essa conexão já existe no servidor do WhatsApp e não é sua. Fale com o suporte.' },
  evolution_falhou: { tom: 'erro', texto: 'O servidor do WhatsApp (Evolution) não respondeu. Tente de novo em instantes.' },
  erro_banco: { tom: 'erro', texto: 'Não consegui salvar. Tente de novo.' },
  desligado: { tom: 'ok', texto: 'Desligado: o painel parou de gravar as conversas deste número.' },
  religado: { tom: 'ok', texto: 'Religado: as conversas voltam a aparecer no painel.' },
  historico_pedido: { tom: 'ok', texto: 'Pronto para buscar o histórico: seu número foi desconectado. Leia o QR abaixo com o celular UMA vez — as conversas vão chegando aos poucos (acompanhe o contador).' },
  historico_sem_webhook: { tom: 'atencao', texto: 'Seu número foi desconectado para buscar o histórico, mas não consegui assinar o aviso do histórico nesta conexão. Leia o QR: o que o servidor já guardou entra; se o contador não subir depois, peça para ligar o evento MESSAGES_SET na Evolution.' },
  historico_falhou: { tom: 'erro', texto: 'O servidor do WhatsApp (Evolution) não aceitou ligar a busca do histórico. Nada foi desconectado. Tente de novo em instantes.' },
  historico_desligado: { tom: 'erro', texto: 'Religue o número no painel antes de buscar o histórico.' },
  leitura_ligada: { tom: 'ok', texto: 'Pronto: abrir a conversa no painel marca como lida no WhatsApp (✓✓ azul para o cliente).' },
  leitura_desligada: { tom: 'ok', texto: 'Pronto: abrir a conversa no painel NÃO marca mais como lida. Só o celular marca.' },
  leitura_sem_migration: { tom: 'erro', texto: 'Não consegui salvar a opção (falta atualizar o banco — migration 143).' },
};

const FUSO = 'America/Sao_Paulo';
const dataBR = (iso: string | null | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO }) : null);
const milhar = (n: number) => n.toLocaleString('pt-BR');

/** "12 conversa(s) · 3.480 mensagem(ns) no painel · a mais antiga é de 01/07/2026". PURA. */
export function textoTotaisHistorico(r: NonNullable<WhatsappPessoalInput['historico']>['resumo']): string {
  if (!r) return 'Não consegui ler o total agora.';
  if (r.mensagens === 0) return 'Nenhuma mensagem deste número no painel ainda.';
  const antiga = dataBR(r.maisAntiga);
  return `${milhar(r.conversas)}${r.conversasMais ? '+' : ''} conversa(s) · ${milhar(r.mensagens)} mensagem(ns) no painel${antiga ? ` · a mais antiga é de ${antiga}` : ''}`;
}

/** "Importando… 35 conversa(s) / 1.200 mensagem(ns) importada(s) (400 na fila)". PURA. */
export function textoProgressoHistorico(p: ProgressoHistorico | null): string {
  if (!p) return '';
  const antiga = dataBR(p.maisAntiga);
  const base = `${milhar(p.conversas)} conversa(s) / ${milhar(p.gravadas)} mensagem(ns) importada(s)${antiga ? ` · a mais antiga trazida é de ${antiga}` : ''}`;
  if (p.emAndamento) return `Importando… ${base}${p.naFila ? ` (${milhar(p.naFila)} na fila)` : ''}`;
  return `Última busca: ${base}${p.repetidas ? ` · ${milhar(p.repetidas)} já estavam no painel` : ''}${p.falhas ? ` · ${p.falhas} lote(s) falharam — busque de novo` : ''}`;
}

/** W3 — confirmação de leitura: a opção do dono (e o que o painel mostra). PURA. */
export function cartaoLeitura(ligado: boolean): string {
  return `<section class="cc-panel cc-wp-card cc-wp-leitura" id="wp-leitura">
        <h2>Confirmação de leitura</h2>
        <p class="cc-muted">${ligado
    ? '<strong>Ligada:</strong> quando você abre uma conversa deste número no painel, as mensagens recebidas ficam como <strong>lidas</strong> no WhatsApp (o cliente vê ✓✓ azul) — igual a abrir no celular.'
    : '<strong>Desligada:</strong> abrir a conversa no painel não avisa o cliente. As mensagens só ficam lidas quando você abre no celular.'}</p>
        <form method="POST" action="/dashboard/whatsapp/pessoal/leitura"><input type="hidden" name="marcar" value="${ligado ? '0' : '1'}"><button type="submit" class="cc-btn cc-btn-sm${ligado ? ' cc-btn-ghost' : ' cc-wp-ok'}">${ligado ? 'Desligar a confirmação de leitura' : 'Ligar a confirmação de leitura'}</button></form>
        <p class="cc-hint">Nas conversas aparecem os risquinhos do que você manda (✓ enviada · ✓✓ entregue · <span class="cc-wp-azul">✓✓</span> lida) e o "digitando…" do cliente, quando o WhatsApp avisa.</p>
      </section>`;
}

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
          <p class="cc-faint">Nome da conexão: <code>${escapeHtml(p.sugestao ?? '')}</code></p>
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
    const h = p.historico;
    const pediu = p.resultado === RESULTADOS.historico_pedido || p.resultado === RESULTADOS.historico_sem_webhook;
    const vivo = !!h && (pediu || !!h.progresso?.emAndamento);
    const cartaoHistorico = h ? `<section class="cc-panel cc-wp-card cc-wp-hist" id="wp-hist"${vivo ? ' data-vivo="1"' : ''}>
        <h2>Histórico das conversas (últimos ${h.dias} dias)</h2>
        <p class="cc-muted">Traz para o painel as conversas <strong>individuais</strong> dos últimos ${h.dias} dias do seu WhatsApp — sem grupos, sem status e sem os avisos da Eva ou da equipe. Fotos, áudios e arquivos antigos entram só como marcador (📷 foto, 🎤 áudio): nada é baixado. Continua só você vendo.</p>
        <p class="cc-wp-hist-num" id="wp-hist-num">${escapeHtml(textoTotaisHistorico(h.resumo))}</p>
        <p class="cc-wp-hist-prog" id="wp-hist-prog"${h.progresso ? '' : ' hidden'}>${escapeHtml(textoProgressoHistorico(h.progresso))}</p>
        ${h.disponivel && p.numero.ativo ? `<form method="POST" action="/dashboard/whatsapp/pessoal/historico" onsubmit="return confirm('Para buscar o histórico, o WhatsApp precisa ser conectado de novo: o painel desconecta seu número e mostra o QR. Leia UMA vez com o celular. Continuar?')"><button type="submit" class="cc-btn cc-wp-ok">Buscar histórico (reconectar)</button></form>` : ''}
        <p class="cc-hint">Por que reconectar: o WhatsApp só manda o histórico no momento em que o aparelho é conectado. Depois de ler o QR, deixe o celular ligado e com internet — as conversas chegam aos poucos (pode levar alguns minutos). Pode repetir quando quiser: nada é duplicado.</p>
      </section>` : '';
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
      ${cartaoHistorico}
      ${cartaoLeitura(p.numero.marcarLida !== false)}
    </div>`;
  }

  const body = `<div class="cc-root cc-wp">${cab}${res}${corpo}</div><style>${CSS_WP}</style>`;
  const scripts = p.numero ? `<script>${SCRIPT_WP}</script>${p.historico ? `<script>${SCRIPT_HIST}</script>` : ''}` : undefined;
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

/**
 * Contador do histórico: pergunta o progresso a cada 5 s por até 30 min depois
 * de pedir a busca (ou enquanto importa), só com a aba visível. Texto por
 * textContent (nada vira HTML).
 */
export const SCRIPT_HIST = `(function(){
var card=document.getElementById('wp-hist');if(!card||card.getAttribute('data-vivo')!=='1'||!window.fetch)return;
var num=document.getElementById('wp-hist-num'),prog=document.getElementById('wp-hist-prog'),voltas=0,t=null;
function milhar(n){return Number(n||0).toLocaleString('pt-BR');}
function data(iso){if(!iso)return null;var d=new Date(iso);return isNaN(d.getTime())?null:d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});}
function totais(r){if(!r)return null;if(!r.mensagens)return 'Nenhuma mensagem deste número no painel ainda.';var a=data(r.maisAntiga);return milhar(r.conversas)+(r.conversasMais?'+':'')+' conversa(s) · '+milhar(r.mensagens)+' mensagem(ns) no painel'+(a?' · a mais antiga é de '+a:'');}
function progresso(p){if(!p)return '';var a=data(p.maisAntiga),b=milhar(p.conversas)+' conversa(s) / '+milhar(p.gravadas)+' mensagem(ns) importada(s)'+(a?' · a mais antiga trazida é de '+a:'');
if(p.emAndamento)return 'Importando… '+b+(p.naFila?' ('+milhar(p.naFila)+' na fila)':'');return 'Última busca: '+b+(p.repetidas?' · '+milhar(p.repetidas)+' já estavam no painel':'')+(p.falhas?' · '+p.falhas+' lote(s) falharam — busque de novo':'');}
function tique(){if(document.hidden)return;voltas++;if(voltas>360){if(t)clearInterval(t);return;}
fetch('/dashboard/whatsapp/pessoal/historico.json',{credentials:'same-origin',headers:{'Accept':'application/json'}}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;
if(j.progresso){prog.textContent=progresso(j.progresso);prog.hidden=false;}var tt=totais(j.resumo);if(tt)num.textContent=tt;}).catch(function(){});}
t=setInterval(tique,5000);tique();
})();`;


const CSS_WP = `
.cc-wp-hist{grid-column:1/-1}
.cc-wp-leitura form{margin:0}
.cc-wp-azul{color:#53bdeb;font-weight:700}
.cc-wp-hist-num{font-size:15px;font-weight:700;margin:0}
.cc-wp-hist-prog{font-size:13.5px;color:var(--cc-text-2);margin:0}
.cc-wp-hist form{margin:0}
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
