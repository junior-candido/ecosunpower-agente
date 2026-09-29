// src/modules/dashboard/cobrar-views.ts
// Tela "Cobrar cliente" (/dashboard/cobrar): gera o link de pagamento
// (InfinitePay) — par Pix + cartão (taxa da maquininha embutida no cartão,
// conta feita no SERVIDOR) ou link único. Saiu do router.ts (R20).
// Renovação do miolo — R20 (29/09/2026): era uma página solta (sem menu);
// agora vem dentro da casca do painel, no padrão cc-. Mesmos ids que o script
// usa (d, v, parc, t, p, b, e, r, l, c, w) e os mesmos dois fetch
// (/dashboard/cobrancas e /dashboard/cobrancas/par).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { cabecalhoPagina, cartaoSecao, botao, aviso as avisoCc } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

const CSS_COBRAR = `
.cc-cb{max-width:640px}
.cc-cb-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}
.cc-cb-form .cc-cb-cheia{grid-column:1/-1}
.cc-cb-botoes{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.cc-cb-botoes .cc-btn{justify-content:center;width:100%;min-height:44px}
.cc-cb-botoes .cc-btn:disabled{opacity:.5;cursor:not-allowed}
.cc-cb-err{color:var(--cc-crit);font-size:13.5px;margin-top:12px;min-height:1px}
.cc-cb-err:empty{display:none}
.cc-cb-res{display:none;margin-top:16px}
.cc-cb-res .cc-rot{display:block;margin-bottom:6px}
.cc-cb-link{display:block;overflow-wrap:anywhere;word-break:break-word;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);border-radius:10px;padding:12px;color:var(--cc-gold);font-size:13.5px;line-height:1.5;text-decoration:none}
.cc-cb-row{display:flex;gap:10px;margin-top:10px}
.cc-cb-row .cc-btn{flex:1;justify-content:center;min-height:44px}
.cc-cb-dica{margin:0;font-size:12.5px;color:var(--cc-muted);line-height:1.5}
@media (max-width:760px){.cc-cb-form{grid-template-columns:minmax(0,1fr)}.cc-cb-row{flex-direction:column}}
`;

const ROTULO_PAR = 'Gerar par: Pix + cartão (taxa repassada)';
const ROTULO_UNICO = 'Gerar link único (valor exato, sem repasse)';

export function renderCobrarPage(opts: { off: boolean; user?: DashUser }): string {
  const { off, user } = opts;
  const desl = off ? { disabled: 'disabled' } : {};
  const campos = `<div class="cc-form cc-cb-form">
  <label class="cc-campo cc-cb-cheia"><span>Descrição</span><input id="d" placeholder="ex: Reorganização e limpeza — Superbom"></label>
  <label class="cc-campo cc-cb-cheia"><span>Valor que VOCÊ quer receber (R$)</span><input id="v" inputmode="decimal" placeholder="ex: 15.000,00"></label>
  <label class="cc-campo"><span>Parcelas no cartão (até)</span><select id="parc">${[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n) => `<option value="${n}">${n}×</option>`).join('')}</select></label>
  <label class="cc-campo"><span>Telefone do cliente (opcional)</span><input id="t" inputmode="tel" placeholder="ex: 5561999998888"></label>
  <p class="cc-cb-dica cc-cb-cheia">No par, a taxa da maquininha vai embutida só no link do cartão — no Pix o cliente paga o valor exato. O telefone vincula a cobrança ao cliente e já preenche os dados dele no pagamento.</p>
</div>
<div class="cc-cb-botoes">
  ${botao({ rotulo: ROTULO_PAR, tom: 'ouro', icone: 'wallet', attrs: { id: 'p', ...desl } })}
  ${botao({ rotulo: ROTULO_UNICO, icone: 'send', attrs: { id: 'b', ...desl } })}
</div>
<div class="cc-cb-err" id="e" role="alert"></div>
<div class="cc-cb-res" id="r"><span class="cc-rot">Link gerado — mande pro cliente:</span><a class="cc-cb-link" id="l" target="_blank" rel="noopener"></a>
  <div class="cc-cb-row">${botao({ rotulo: 'Copiar', attrs: { id: 'c' } })}${botao({ rotulo: 'Enviar no WhatsApp', icone: 'wa', attrs: { id: 'w' } })}</div>
</div>`;
  const body = `<div class="cc-root cc-cb">
${cabecalhoPagina({
    trilha: [{ rotulo: 'Financeiro', href: '/dashboard/financeiro' }, { rotulo: 'Cobrar cliente' }],
    titulo: 'Cobrar cliente',
    subtitulo: 'Gera um link de pagamento (Pix ou cartão) pra mandar pro cliente.',
  })}
${off ? avisoCc({ tom: 'atencao', texto: 'Falta configurar a InfinitePay no servidor (INFINITEPAY_HANDLE) pra ativar a cobrança.' }) : ''}
${cartaoSecao({ titulo: 'Nova cobrança', corpoHtml: campos })}
</div>`;
  const scripts = `<script>
var b=document.getElementById('b');
var ROT_P=${JSON.stringify(ROTULO_PAR)},ROT_B=${JSON.stringify(ROTULO_UNICO)};
function rotulo(bt,txt){var s=bt.firstElementChild;bt.textContent=txt;if(s)bt.insertBefore(s,bt.firstChild);}
function brl(n){return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
// PAR: Pix (valor líquido) + cartão N× (taxa da maquininha embutida, conta no SERVIDOR).
document.getElementById('p').onclick=async function(){
  var p=this,d=document.getElementById('d').value.trim(),v=document.getElementById('v').value.trim(),t=document.getElementById('t').value.trim();
  var e=document.getElementById('e');e.textContent='';
  if(!d||!v){e.textContent='Preencha descrição e valor.';return;}
  p.disabled=true;rotulo(p,'Gerando o par…');
  try{
    var resp=await fetch('/dashboard/cobrancas/par',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({descricao:d,liquido:v,parcelas:document.getElementById('parc').value,telefone:t})});
    var j=await resp.json();
    if(!resp.ok||!j.links){e.textContent=j.erro||'Falha ao gerar.';return;}
    var pix=j.links[0],car=j.links[1];
    var msg=d+'\\nEscolha como pagar 👇\\n\\n▪️ Pix à vista: R$ '+brl(pix.valorCentavos/100)+'\\n'+pix.link+
      '\\n\\n▪️ Cartão em até '+j.parcelas+'× de R$ '+brl(car.parcelaCentavos/100)+' (total R$ '+brl(car.valorCentavos/100)+')\\n'+car.link;
    var l=document.getElementById('l');l.href=pix.link;l.textContent=msg;l.style.whiteSpace='pre-wrap';
    document.getElementById('r').style.display='block';
    document.getElementById('c').onclick=function(){navigator.clipboard.writeText(msg);rotulo(this,'Copiado!');};
    document.getElementById('w').onclick=function(){window.open('https://wa.me/'+(t.replace(/\\D/g,''))+'?text='+encodeURIComponent(msg),'_blank');};
  }catch(err){e.textContent='Erro de rede.';}
  finally{p.disabled=false;rotulo(p,ROT_P);}
};
b.onclick=async function(){
  var d=document.getElementById('d').value.trim(),v=document.getElementById('v').value.trim(),t=document.getElementById('t').value.trim();
  var e=document.getElementById('e');e.textContent='';
  if(!d||!v){e.textContent='Preencha descrição e valor.';return;}
  b.disabled=true;rotulo(b,'Gerando…');
  try{
    var resp=await fetch('/dashboard/cobrancas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({descricao:d,valor:v,telefone:t})});
    var j=await resp.json();
    if(!resp.ok||!j.link){e.textContent=j.erro||'Falha ao gerar.';return;}
    var l=document.getElementById('l');l.href=j.link;l.textContent=j.link;l.style.whiteSpace='';
    document.getElementById('r').style.display='block';
    document.getElementById('c').onclick=function(){navigator.clipboard.writeText(j.link);rotulo(this,'Copiado!');};
    var msg='Segue o link pra pagamento (Pix ou cartão): '+j.link;
    document.getElementById('w').onclick=function(){window.open('https://wa.me/'+(t.replace(/\\D/g,''))+'?text='+encodeURIComponent(msg),'_blank');};
  }catch(err){e.textContent='Erro de rede.';}
  finally{b.disabled=false;rotulo(b,ROT_B);}
};
</script>`;
  return renderLayout({
    active: 'cobrar', title: 'Cobrar cliente', user, body, scripts,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro',
    cabeca: `<style>${CSS_COBRAR}</style>`,
  });
}
