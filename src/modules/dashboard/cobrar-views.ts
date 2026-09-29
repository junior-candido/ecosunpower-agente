// src/modules/dashboard/cobrar-views.ts
// Tela "Cobrar cliente" (/dashboard/cobrar): gera o link de pagamento
// (InfinitePay) — par Pix + cartão ou link único. Saiu do router.ts (R20).
import type { DashUser } from './permissions.js';

export function renderCobrarPage(opts: { off: boolean; user?: DashUser }): string {
  const { off } = opts;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cobrar cliente</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0b1c2b;color:#eaf2f8;margin:0;padding:24px}
.card{max-width:520px;margin:0 auto;background:#12324a;border-radius:14px;padding:22px}
h1{font-size:19px;margin:0 0 4px}p.sub{color:#9fb6c7;font-size:13px;margin:0 0 16px}
label{display:block;font-size:13px;color:#c4d6e4;margin:12px 0 4px}
input,select{width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #2a4a63;background:#0e2233;color:#fff;font-size:15px}
button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#17a6e0;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:disabled{opacity:.5}.res{margin-top:18px;display:none}.res a.link{display:block;word-break:break-all;background:#0e2233;border:1px solid #2a4a63;border-radius:9px;padding:11px;color:#17a6e0;font-size:13px}
.row{display:flex;gap:10px;margin-top:10px}.row button{margin:0;background:#1fa968}.row button.copy{background:#2a4a63}
.err{color:#ff9a9a;font-size:13px;margin-top:12px}.off{background:#5a3d00;color:#ffd27a;padding:12px;border-radius:9px;font-size:13px;margin-bottom:14px}</style></head>
<body><div class="card"><h1>💳 Cobrar cliente</h1><p class="sub">Gera um link de pagamento (Pix ou cartão) pra mandar pro cliente.</p>
${off ? '<div class="off">⚠️ Falta configurar o <b>INFINITEPAY_HANDLE</b> no servidor pra ativar a cobrança.</div>' : ''}
<label>Descrição</label><input id="d" placeholder="ex: Reorganização e limpeza — Superbom">
<label>Valor que VOCÊ quer receber (R$)</label><input id="v" inputmode="decimal" placeholder="ex: 15.000,00">
<label>Parcelas máximas no cartão (taxa da maquininha embutida no link do cartão)</label>
<select id="parc">${[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n) => `<option value="${n}">${n}×</option>`).join('')}</select>
<label>Telefone do cliente (opcional — vincula ao lead)</label><input id="t" placeholder="ex: 5561999998888">
<button id="p" ${off ? 'disabled' : ''} style="background:#1fa968">💰 Gerar PAR: Pix + Cartão (taxa repassada)</button>
<button id="b" ${off ? 'disabled' : ''} style="margin-top:10px;background:#2a4a63">Gerar link único (valor exato, sem repasse)</button>
<div class="err" id="e"></div>
<div class="res" id="r"><label>Link gerado — manda pro cliente:</label><a class="link" id="l" target="_blank"></a>
<div class="row"><button class="copy" id="c">Copiar</button><button id="w">Enviar no WhatsApp</button></div></div></div>
<script>
var b=document.getElementById('b');
function brl(n){return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
// PAR: Pix (valor líquido) + cartão N× (taxa da maquininha embutida, conta no SERVIDOR).
document.getElementById('p').onclick=async function(){
  var p=this,d=document.getElementById('d').value.trim(),v=document.getElementById('v').value.trim(),t=document.getElementById('t').value.trim();
  var e=document.getElementById('e');e.textContent='';
  if(!d||!v){e.textContent='Preencha descrição e valor.';return;}
  p.disabled=true;p.textContent='Gerando o par…';
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
    document.getElementById('c').onclick=function(){navigator.clipboard.writeText(msg);this.textContent='Copiado!';};
    document.getElementById('w').onclick=function(){window.open('https://wa.me/'+(t.replace(/\\D/g,''))+'?text='+encodeURIComponent(msg),'_blank');};
  }catch(err){e.textContent='Erro de rede.';}
  finally{p.disabled=false;p.textContent='💰 Gerar PAR: Pix + Cartão (taxa repassada)';}
};
b.onclick=async function(){
  var d=document.getElementById('d').value.trim(),v=document.getElementById('v').value.trim(),t=document.getElementById('t').value.trim();
  var e=document.getElementById('e');e.textContent='';
  if(!d||!v){e.textContent='Preencha descrição e valor.';return;}
  b.disabled=true;b.textContent='Gerando…';
  try{
    var resp=await fetch('/dashboard/cobrancas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({descricao:d,valor:v,telefone:t})});
    var j=await resp.json();
    if(!resp.ok||!j.link){e.textContent=j.erro||'Falha ao gerar.';return;}
    var l=document.getElementById('l');l.href=j.link;l.textContent=j.link;
    document.getElementById('r').style.display='block';
    document.getElementById('c').onclick=function(){navigator.clipboard.writeText(j.link);this.textContent='Copiado!';};
    var msg='Segue o link pra pagamento (Pix ou cartão): '+j.link;
    document.getElementById('w').onclick=function(){window.open('https://wa.me/'+(t.replace(/\\D/g,''))+'?text='+encodeURIComponent(msg),'_blank');};
  }catch(err){e.textContent='Erro de rede.';}
  finally{b.disabled=false;b.textContent='Gerar link de pagamento';}
};
</script></body></html>`;
}
