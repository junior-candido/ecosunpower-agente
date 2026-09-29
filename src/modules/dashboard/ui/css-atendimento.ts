// src/modules/dashboard/ui/css-atendimento.ts
// CSS da tela de Atendimento (Leads › Conversas e ficha do lead). Mora aqui
// (e não em atendimento-views.ts) pra virar ARQUIVO estático com hash
// (ui/estatico.ts) e entrar no <head> — antes ia num <style> no fim do <body>
// e a tela pintava sem as colunas por ~0,5 s (a "piscada", 28/09/2026).

/** CSS só do Atendimento (tokens cc- → funciona nos dois temas). */
export const CSS_ATENDIMENTO = `
.cc-at-topo{display:contents}
/* troca suave de contato (28/09): nada de tela branca — esqueleto leve só se demorar */
.cc-at-chat{position:relative}
.cc-at-chat-topo:focus{outline:none}
/* aviso "Agendamento aguardando sua confirmação" (28/09) — dentro da coluna do chat */
.cc-at-agenda{margin:8px 18px 0;flex:0 0 auto;max-height:40vh;overflow-y:auto}
.cc-at-agenda-item{margin-top:8px}
.cc-at-agenda-botoes{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.cc-at-agenda-botoes form{display:inline-flex;margin:0}
.cc-at-agenda-sugerir{display:inline-flex;gap:6px;align-items:center}
.cc-at-agenda-sugerir input{min-width:0;width:200px;max-width:100%}
.cc-at-chat-topo:focus-visible{outline:2px solid var(--cc-gold-2);outline-offset:-2px}
.cc-at-chat-topo,.cc-at-assumido,.cc-at-cockpit>*{transition:opacity .15s}
.cc-at-carregando .cc-at-chat-topo,.cc-at-carregando .cc-at-assumido,.cc-at-cockpit.cc-at-carregando>*{opacity:.5}
.cc-at-chat.cc-at-carregando .cc-at-msgs>*{visibility:hidden}
.cc-at-esq{position:absolute;left:0;right:0;z-index:2;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:16px 18px;pointer-events:none;overflow:hidden;animation:ccEsqEntra .15s ease-out}
@keyframes ccEsqEntra{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cc-at-esq{animation:none}.cc-at-chat-topo,.cc-at-assumido,.cc-at-cockpit>*{transition:none}}
.cc-at-esq-b{flex:none;height:46px;border-radius:14px;background:var(--cc-surface-3);opacity:.7}
.cc-at-esq-eva{align-self:flex-end;background:rgba(61,187,110,.16)}
.cc-at-msg-otimista .cc-at-msg-h{opacity:.85}
.cc-at-aviso-envio{margin-bottom:6px}
.cc-at .cc-top{margin-bottom:14px}
.cc-at .cc-root h1,.cc-at h1{font-size:24px}
.cc-at-grade{display:grid;grid-template-columns:var(--at-l,minmax(300px,360px)) minmax(0,1fr) var(--at-r,minmax(300px,340px));gap:12px;height:calc(100vh - 168px);min-height:560px}
.cc-at-col{min-width:0;min-height:0;display:flex;flex-direction:column;background:linear-gradient(180deg,var(--cc-panel-top) 0%,var(--cc-panel-bot) 100%);border:1px solid var(--cc-line);border-radius:var(--cc-r);overflow:hidden}
/* alças de arrastar entre as colunas (só no computador) */
.cc-at-lista,.cc-at-cockpit{position:relative}
.cc-at-alca{position:absolute;top:0;bottom:0;width:10px;z-index:3;cursor:col-resize;touch-action:none;outline:none}
.cc-at-alca::after{content:"";position:absolute;top:50%;left:4px;width:2px;height:42px;margin-top:-21px;border-radius:2px;background:var(--cc-line-2);opacity:.6;transition:opacity .15s,background .15s}
.cc-at-alca:hover::after,.cc-at-alca:focus-visible::after,.cc-at-arrastando .cc-at-alca::after{opacity:1;background:var(--cc-gold-2)}
.cc-at-alca-l{right:0}
.cc-at-alca-r{left:0}
.cc-at-arrastando{cursor:col-resize;user-select:none}
/* lista */
.cc-at-lista-topo{padding:12px;border-bottom:1px solid var(--cc-line);display:flex;flex-direction:column;gap:8px}
.cc-at-busca{display:flex;gap:6px}
.cc-at-busca input[type=search]{flex:1;min-width:0}
.cc-at-chips{flex-wrap:wrap;gap:6px}
.cc-at-chips .cc-chip{min-height:26px;padding:3px 9px;font-size:12px}
.cc-at-itens{flex:1;overflow-y:auto;padding:6px}
.cc-at-item{display:flex;gap:10px;padding:10px;border-radius:12px;border:1px solid transparent}
.cc-at-item:hover{background:var(--cc-surface-2)}
.cc-at-item.cc-on{background:var(--cc-surface-3);border-color:rgba(251,191,36,.35)}
.cc-at-item-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.cc-at-l1{display:flex;align-items:baseline;gap:8px}
.cc-at-l1 strong{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-l1 time,.cc-at-tl-i time{font-size:11px;color:var(--cc-faint);flex:none;font-family:var(--cc-f-num)}
.cc-at-l2{display:flex;align-items:center;gap:8px}
.cc-at-prev{flex:1;min-width:0;font-size:12.5px;color:var(--cc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-espera{width:10px;height:10px;border-radius:50%;background:var(--cc-ok);flex:none;box-shadow:0 0 0 3px var(--cc-ok-soft)}
.cc-at-l3{display:flex;flex-wrap:wrap;gap:4px}
.cc-at-l3 .cc-pill{font-size:10.5px;padding:1px 7px}
.cc-at-canal{font-size:10.5px;color:var(--cc-info);border:1px solid rgba(56,189,248,.35);border-radius:99px;padding:0 7px}
/* avatar */
.cc-at-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;font-family:var(--cc-f-num);font-weight:700;font-size:16px;color:#0A1729}
.cc-at-av-g{width:64px;height:64px;font-size:26px}
.cc-at-av-0{background:linear-gradient(135deg,#fbbf24,#F0A500)} .cc-at-av-1{background:linear-gradient(135deg,#7dd3fc,#38BDF8)}
.cc-at-av-2{background:linear-gradient(135deg,#86efac,#3DBB6E)} .cc-at-av-3{background:linear-gradient(135deg,#c4b5fd,#a78bfa)}
.cc-at-av-4{background:linear-gradient(135deg,#fda4af,#E4574B)} .cc-at-av-5{background:linear-gradient(135deg,#fdba74,#F2862E)}
/* chat */
.cc-at-abas-cel{display:none}
.cc-at-chat-topo{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--cc-line)}
.cc-at-chat-id{flex:1;min-width:0}
.cc-at-chat-nome{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cc-at-chat-nome strong{font-family:var(--cc-f-num);font-size:18px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-at-chat-sub{font-size:12.5px;color:var(--cc-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-msgs{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:8px;background:radial-gradient(600px 300px at 50% 0%,rgba(56,189,248,.04),transparent 70%)}
.cc-at-dia{align-self:center;margin:8px 0}
.cc-at-dia span{font-size:11.5px;color:var(--cc-text-2);background:var(--cc-surface-3);border:1px solid var(--cc-line-2);padding:3px 12px;border-radius:99px}
.cc-at-msg{max-width:78%;padding:8px 12px 6px;border-radius:14px;border:1px solid var(--cc-line-2)}
.cc-at-msg-cli{align-self:flex-start;background:var(--cc-surface-3);border-top-left-radius:4px}
.cc-at-msg-eva{align-self:flex-end;background:rgba(61,187,110,.16);border-color:rgba(61,187,110,.35);border-top-right-radius:4px}
.cc-at-msg-q{font-size:11px;font-weight:700;color:var(--cc-muted);margin-bottom:2px}
.cc-at-msg-eva .cc-at-msg-q{color:var(--cc-ok)}
.cc-at-msg-t{font-size:14px;white-space:pre-wrap;word-break:break-word;color:var(--cc-text)}
.cc-at-msg-h{font-size:10.5px;color:var(--cc-faint);text-align:right;margin-top:2px;font-family:var(--cc-f-num)}
.cc-at-midia{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;padding:3px 9px;border-radius:8px;background:var(--cc-info-soft);color:var(--cc-text);margin-bottom:4px}
.cc-at-det summary{cursor:pointer;font-size:12px;color:var(--cc-muted);margin-top:4px}
.cc-at-compor{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid var(--cc-line)}
.cc-at-compor-campo{flex:1;min-width:0;min-height:40px;display:flex;align-items:center;padding:0 14px;border-radius:12px;border:1px dashed var(--cc-line-2);color:var(--cc-faint);font-size:13px}
.cc-at-zap{background:rgba(61,187,110,.18);border-color:rgba(61,187,110,.45)}
.cc-at-chat-topo .cc-at-assumir{margin:0;flex:none}
.cc-btn.cc-at-btn-assumir{background:var(--cc-gold-soft);border-color:rgba(251,191,36,.55);color:var(--cc-gold-2);font-weight:700}
.cc-at-assumido{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--cc-line);background:var(--cc-gold-soft)}
.cc-at-assumido-t{flex:1;min-width:0;font-size:13px;color:var(--cc-text-2)}
.cc-at-assumido-t strong{color:var(--cc-gold-2)}
.cc-at-assumido form{margin:0}
.cc-btn.cc-at-btn-devolver{border-color:rgba(61,187,110,.5);color:var(--cc-ok);font-weight:700}
.cc-at-evento{align-self:center;font-size:12px;color:var(--cc-text-2);background:var(--cc-surface-2);border:1px dashed var(--cc-line-2);padding:4px 12px;border-radius:99px;margin:4px 0;text-align:center}
.cc-at-evento-assumiu{border-color:rgba(251,191,36,.5);color:var(--cc-gold-2)}
.cc-at-evento-devolveu{border-color:rgba(61,187,110,.45);color:var(--cc-ok)}
.cc-at-msg-hum{background:var(--cc-info-soft);border-color:rgba(56,189,248,.45)}
.cc-at-msg-hum .cc-at-msg-q{color:var(--cc-info)}
.cc-at-msg-canal{margin-left:6px;font-weight:600;font-size:10.5px;color:var(--cc-muted)}
.cc-at-msg-falha{font-size:12px;color:var(--cc-crit);margin-top:4px;font-weight:600}
.cc-at-compor-on{flex-direction:column;align-items:stretch;gap:6px;padding:10px 14px}
.cc-at-compor .cc-aviso{margin:0}
.cc-at-janela{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--cc-text-2)}
.cc-at-janela-on strong{color:var(--cc-ok)}
.cc-at-janela-off strong{color:var(--cc-warn)}
.cc-at-janela-off svg{color:var(--cc-warn)}
.cc-at-via{margin-left:auto;font-size:11.5px;color:var(--cc-muted)}
.cc-at-zap-link{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--cc-ok)}
.cc-at-resp{display:flex;gap:8px;align-items:flex-end;margin:0}
.cc-at-resp textarea{flex:1;min-width:0;min-height:44px;max-height:180px;resize:vertical;border-radius:12px;font:inherit;font-size:14px}
.cc-btn.cc-at-enviar{background:linear-gradient(180deg,#3DBB6E,#2a9a57);color:#fff;border-color:transparent;height:44px;padding:0 18px;font-weight:700;flex:none;justify-content:center}
.cc-at-resp .cc-btn.cc-at-enviar{width:120px;padding:0}
.cc-btn.cc-at-enviar-arq{min-width:136px}
.cc-btn.cc-at-enviar:disabled{opacity:.6;cursor:wait}
.cc-at-modelos-det>summary{cursor:pointer;font-size:12.5px;color:var(--cc-info);font-weight:600}
.cc-at-modelo{display:flex;flex-direction:column;gap:8px;margin:6px 0 0}
.cc-at-modelo-lin{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:8px}
.cc-at-modelo select,.cc-at-modelo input{width:100%}
.cc-at-previa{padding:10px 12px;border-radius:12px;background:rgba(61,187,110,.10);border:1px solid rgba(61,187,110,.3);font-size:13.5px;white-space:pre-wrap;word-break:break-word;color:var(--cc-text)}
.cc-at-previa-t{display:block;font-size:11px;color:var(--cc-muted);margin-bottom:3px}
.cc-at-envio-lin{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.cc-at-custo{font-size:12px;color:var(--cc-muted);margin-right:auto}
.cc-at-nota{margin:0;font-size:11px;color:var(--cc-faint);line-height:1.35}
.cc-at-custo-aviso{color:var(--cc-muted)}
.cc-at-bloq{gap:8px;color:var(--cc-text-2);border-style:solid}
.cc-at-prontas,.cc-at-como{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.cc-at-como .cc-chip{min-height:26px;padding:3px 10px;font-size:12px}
.cc-at-prontas-t{font-size:11px;color:var(--cc-muted);margin-right:2px}
.cc-chip.cc-at-pronta{min-height:26px;padding:3px 10px;font-size:12px;cursor:pointer}
.cc-chip.cc-at-pronta:disabled{opacity:.45;cursor:not-allowed}
.cc-at-naolead{font-size:10.5px;color:var(--cc-muted);border:1px dashed var(--cc-line-2);border-radius:99px;padding:0 7px}
.cc-at-virar{margin:0;flex:none}
.cc-btn.cc-at-btn-virar{border-color:rgba(251,191,36,.55);color:var(--cc-gold-2);font-weight:700}
.cc-at-virar-bloco{margin-top:10px}
.cc-at-canal-whatsapp_business{color:var(--cc-gold-2);border-color:rgba(251,191,36,.45)}
.cc-at-vazio,.cc-at-chat-vazio{justify-content:center}
.cc-at-chat-vazio .cc-empty,.cc-at-vazio{margin:auto;max-width:360px;text-align:center}
/* W1 — mídia no balão e anexar */
.cc-at-foto{display:block;margin:2px 0 4px;border-radius:10px;overflow:hidden;width:260px;max-width:100%;aspect-ratio:1;background:var(--cc-surface-2)}
.cc-at-foto img{display:block;width:100%;height:100%;object-fit:contain}
.cc-at-audio{display:block;width:260px;max-width:100%;height:40px;margin:2px 0}
.cc-at-video{display:block;width:280px;max-width:100%;aspect-ratio:16/9;height:auto;object-fit:contain;border-radius:10px;background:#000;margin:2px 0}
/* ⬇ Baixar (um clique) */
.cc-at-baixar{display:inline-flex;align-items:center;gap:4px;margin:2px 0 4px;font-size:12px;font-weight:600;color:var(--cc-info);text-decoration:none}
.cc-at-baixar:hover{text-decoration:underline}
.cc-at-doc .cc-at-baixar{margin:0;flex:none}
.cc-at-anx .cc-at-baixar{margin:0}
.cc-btn.cc-at-baixar-tudo{margin-bottom:10px}
.cc-at-transc{margin-top:4px;padding:6px 9px;border-radius:8px;background:var(--cc-surface-2);font-size:12.5px;color:var(--cc-text-2);white-space:pre-wrap;word-break:break-word}
.cc-at-transc span{display:block;font-size:10.5px;font-weight:700;color:var(--cc-muted);margin-bottom:1px}
.cc-at-doc{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line);margin:2px 0 4px;min-width:min(250px,100%);flex-wrap:wrap}
.cc-at-doc-ic{font-size:22px;flex:none}
.cc-at-doc-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.cc-at-doc-txt{flex:1 1 120px}
.cc-at-doc-txt strong{font-size:13px;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cc-at-doc-txt small{font-size:11px;color:var(--cc-muted)}
.cc-at-doc .cc-link{font-size:12px;font-weight:600;flex:none}
.cc-at-anexo{display:flex;flex-direction:column;gap:6px;margin:0}
.cc-at-anexo-lin{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cc-at-clipe{position:relative;cursor:pointer}
.cc-at-js .cc-at-clipe input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}
.cc-at-legenda{flex:1 1 180px;min-width:0}
.cc-at-js .cc-at-anexo:not(.cc-at-tem) .cc-at-legenda,.cc-at-js .cc-at-anexo:not(.cc-at-tem) .cc-at-enviar-arq{display:none}
.cc-btn.cc-at-enviar-arq{height:36px;padding:0 14px}
.cc-at-anexo.cc-at-sem-legenda .cc-at-legenda{display:none}
#responder:has(.cc-at-anexo.cc-at-tem) .cc-at-prontas{display:none}
.cc-at-pode-gravar .cc-at-gravar{display:inline-flex}
.cc-btn.cc-at-gravando{border-color:var(--cc-crit);color:var(--cc-crit);font-weight:700}
.cc-at-anexo-prev{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px dashed var(--cc-line-2);background:var(--cc-surface-2)}
.cc-at-anexo-prev[hidden]{display:none}
.cc-at-anexo-prev img,.cc-at-anexo-prev video{width:72px;height:72px;object-fit:cover;border-radius:8px;flex:none;background:#000}
.cc-at-anexo-prev audio{width:220px;max-width:50%;flex:none}
.cc-at-anexo-ic{font-size:30px;flex:none}
.cc-at-anexo-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cc-at-anexo-info strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-at-anexo-info small{font-size:11px;color:var(--cc-muted)}
.cc-at-soltar .cc-at-msgs{outline:2px dashed var(--cc-gold-2);outline-offset:-8px;background:var(--cc-gold-soft)}
.cc-at-luz{position:fixed;inset:0;z-index:80;background:rgba(2,6,23,.88);display:none;align-items:center;justify-content:center;padding:24px}
.cc-at-luz.cc-on{display:flex}
.cc-at-luz img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.cc-at-luz-x{position:absolute;top:14px;right:14px;width:40px;height:40px;font-size:24px;background:var(--cc-surface-2);color:var(--cc-text)}
/* W3 — risquinhos e digitando */
.cc-at-tick{font-size:12.5px;font-weight:700;letter-spacing:-3px;margin-left:4px;color:var(--cc-muted)}
.cc-at-tick-lida{color:#53bdeb}
.cc-at-digitando{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--cc-text-2);padding:6px 12px;border-radius:14px;background:var(--cc-surface-3);border:1px solid var(--cc-line-2)}
.cc-at-dig-pts{display:inline-flex;gap:3px}
.cc-at-dig-pts i{width:6px;height:6px;border-radius:50%;background:var(--cc-muted);animation:ccDig 1.2s infinite ease-in-out}
.cc-at-dig-pts i:nth-child(2){animation-delay:.15s}
.cc-at-dig-pts i:nth-child(3){animation-delay:.3s}
@keyframes ccDig{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@media (prefers-reduced-motion:reduce){.cc-at-dig-pts i{animation:none}}
/* W2 — citar e reagir */
.cc-at-msg{position:relative}
.cc-at-acoes-btn{margin-left:auto;float:right;border:0;background:transparent;color:var(--cc-muted);font-size:16px;line-height:1;padding:0 2px 0 8px;cursor:pointer;opacity:.55}
.cc-at-msg:hover .cc-at-acoes-btn,.cc-at-acoes-btn:focus-visible{opacity:1;color:var(--cc-text)}
.cc-at-cita{display:flex;flex-direction:column;gap:1px;margin:2px 0 6px;padding:5px 9px;border-left:3px solid var(--cc-gold-2);border-radius:6px;background:var(--cc-surface-2);font-size:12px;min-width:0}
.cc-at-cita strong{font-size:11px;color:var(--cc-gold-2);font-weight:700}
.cc-at-cita span{color:var(--cc-text-2);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.cc-at-com-reacao{margin-bottom:12px}
.cc-at-reacoes{position:absolute;bottom:-13px;left:10px;display:inline-flex;align-items:center;gap:1px;padding:1px 6px;border-radius:99px;background:var(--cc-surface-3);border:1px solid var(--cc-line-2);font-size:13px;line-height:18px}
.cc-at-msg-eva .cc-at-reacoes{left:auto;right:10px}
.cc-at-reacoes small{font-size:10.5px;color:var(--cc-muted);margin-left:3px}
.cc-at-evento-reagiu{border-style:dotted}
.cc-at-citando{display:flex;align-items:flex-start;gap:8px}
.cc-at-citando[hidden]{display:none}
#responder:has(#cc-at-citando:not([hidden])) .cc-at-prontas{display:none}
.cc-at-citando .cc-at-cita{flex:1;margin:0}
.cc-at-citando-x{width:28px;height:28px;flex:none}
.cc-at-menu-msg{position:fixed;z-index:70;min-width:220px;padding:6px;border-radius:12px;background:var(--cc-surface);border:1px solid var(--cc-line-2);box-shadow:0 14px 34px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:4px}
.cc-at-menu-msg button{font:inherit;cursor:pointer;border:0;background:transparent;color:var(--cc-text);border-radius:8px}
.cc-at-menu-resp,.cc-at-menu-tirar{text-align:left;padding:7px 10px;font-size:13px;font-weight:600}
.cc-at-menu-resp:hover,.cc-at-menu-tirar:hover{background:var(--cc-surface-2)}
.cc-at-menu-tirar{color:var(--cc-muted);font-weight:500}
.cc-at-menu-emojis{display:flex;gap:2px;padding:2px}
.cc-at-menu-emojis button{font-size:20px;width:36px;height:36px}
.cc-at-menu-emojis button:hover{background:var(--cc-surface-2)}
/* cockpit */
.cc-at-cockpit{overflow-y:auto;padding:16px;gap:14px;scroll-margin-top:84px}
.cc-at-cockpit-vazio{justify-content:center;align-items:center}
.cc-at-idt{display:flex;gap:14px;align-items:flex-start}
.cc-at-idt-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.cc-at-nome{display:flex;align-items:center;gap:6px}
.cc-at-nome h2{font-size:20px;font-weight:700;line-height:1.2;min-width:0;overflow-wrap:anywhere}
.cc-at-lapis{position:relative}
.cc-at-lapis>summary{list-style:none;width:28px;height:28px;font-size:14px}
.cc-at-lapis>summary::-webkit-details-marker{display:none}
.cc-at-lapis[open]>form{position:absolute;z-index:20;top:34px;left:-140px;width:280px;padding:10px;border-radius:12px;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);box-shadow:0 14px 34px rgba(0,0,0,.35)}
.cc-at-idt-sub{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--cc-text-2)}
.cc-at-idt-sub svg{color:var(--cc-faint)}
.cc-at-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px}
.cc-at-origem{font-size:12px;color:var(--cc-muted)}
.cc-at-acoes{display:flex;gap:8px;align-items:center}
.cc-at-acoes>form,.cc-at-acoes>.cc-btn,.cc-at-acoes>button{flex:1 1 0;min-width:0}
.cc-at-acoes form{margin:0}
.cc-at-acoes .cc-btn{width:100%;justify-content:center;height:40px}
.cc-at-acoes>.cc-pill{flex:1 1 0;justify-content:center;text-align:center}
.cc-at-acoes .cc-mais>summary{height:40px}
.cc-at-acoes .cc-mais-menu .cc-btn{justify-content:flex-start;height:36px}
.cc-btn.cc-at-cad{background:linear-gradient(180deg,#38BDF8,#0284c7);color:#fff;border-color:transparent;box-shadow:0 6px 18px rgba(56,189,248,.25)}
.cc-btn.cc-at-cad.cc-btn-off{background:var(--cc-surface-2);color:var(--cc-muted);box-shadow:none;border-color:var(--cc-line-2)}
.cc-at-cad-info{display:flex;align-items:center;gap:6px;margin:0;font-size:12.5px;color:var(--cc-info)}
.cc-mais-sep{height:1px;background:var(--cc-line-2);margin:2px 0}
.cc-at-sec{border-top:1px solid var(--cc-line);padding-top:12px}
.cc-at-sec h3{font-size:14px;font-weight:700;margin:0 0 10px;display:flex;align-items:baseline;gap:8px}
.cc-at-sec h3 small{font-family:var(--cc-f-text);font-size:11.5px;font-weight:500;color:var(--cc-muted)}
.cc-at-dados{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}
.cc-at-dados>div{padding:9px 11px;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line);min-width:0}
.cc-at-dados dt{font-size:11px;color:var(--cc-muted);margin:0}
.cc-at-dados dd{margin:2px 0 0;font-family:var(--cc-f-num);font-size:15px;font-weight:600;color:var(--cc-text);overflow-wrap:anywhere}
.cc-at-int{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.cc-at-int-t{font-size:11.5px;color:var(--cc-muted);margin-right:2px}
.cc-at-tag{font-size:12px;padding:3px 10px;border-radius:99px;background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.4);color:var(--cc-text)}
.cc-at-email{display:flex;align-items:center;gap:6px;margin:10px 0 0;font-size:12.5px;color:var(--cc-text-2)}
.cc-at-nada{margin:0;font-size:13px;color:var(--cc-muted)}
.cc-at-linha{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap}
.cc-at-linha input[type=text]{flex:1 1 140px;min-width:0}
.cc-at-linha input[type=datetime-local]{flex:0 1 150px;min-width:0}
.cc-at-linha select{flex:0 0 auto}
.cc-at-linha-tarefa input[type=text]{flex-basis:100%}
.cc-at-linha-tarefa input[type=datetime-local]{flex:1 1 150px}
.cc-at-linha .cc-ibtn,.cc-at-linha .cc-btn{flex:none}
.cc-at-tarefas{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.cc-at-tarefa{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--cc-line)}
.cc-at-tarefa form{margin:0}
.cc-at-tarefa .cc-ibtn{width:30px;height:30px;font-size:14px}
.cc-at-ok{color:var(--cc-ok)}
.cc-at-tarefa-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cc-at-tarefa-txt strong{font-size:13px;font-weight:600}
.cc-at-tarefa-txt small{font-size:11.5px;color:var(--cc-muted);display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.cc-at-tl{list-style:none;margin:8px 0 0;padding:0}
.cc-at-tl-i{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--cc-line)}
.cc-at-tl-i:last-child{border-bottom:0}
.cc-at-tl-ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:var(--cc-surface-3);flex:none;font-size:12px}
.cc-at-tl-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;font-size:12.5px}
.cc-at-tl-txt strong{font-weight:600}
.cc-at-tl-txt span{color:var(--cc-text-2)}
.cc-at-anx-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.cc-at-anx{min-width:0;display:flex;flex-direction:column;gap:4px}
.cc-at-anx small{font-size:11px;color:var(--cc-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-at-anx-img,.cc-at-anx-prev{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;aspect-ratio:1;width:100%;border-radius:10px;border:1px solid var(--cc-line);background:var(--cc-surface-2);object-fit:cover;font-size:12px;color:var(--cc-text-2)}
.cc-at-anx-prev audio{width:100%}
.cc-at-contato{display:flex;gap:8px;border-top:1px solid var(--cc-line);padding-top:12px;margin-top:auto}
.cc-at-contato .cc-btn{flex:1;justify-content:center}
/* janelinhas */
.cc-modal{position:fixed;inset:0;z-index:50;background:rgba(2,6,23,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.cc-modal.hidden{display:none}
.cc-modal-caixa{width:100%;max-width:460px;background:var(--cc-surface);border:1px solid var(--cc-line-2);border-radius:16px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.4)}
.cc-modal-caixa h3{font-size:17px;font-weight:700}
.cc-modal-caixa .cc-hint{margin:4px 0 14px;font-size:13px;color:var(--cc-muted)}
.cc-modal-caixa select,.cc-modal-caixa textarea,.cc-modal-caixa input{width:100%}
.cc-f-coluna{display:flex;flex-direction:column;gap:12px}
.cc-modal-bot{margin-top:4px;gap:8px;flex-wrap:wrap}
/* telas médias: com lead aberto, a lista dá lugar ao chat + cockpit */
@media (max-width:1279px){
  .cc-at-com-lead .cc-at-grade{grid-template-columns:minmax(0,1fr) minmax(290px,340px)}
  .cc-at-com-lead .cc-at-lista{display:none}
  .cc-at-com-lead .cc-at-abas-cel{display:flex}
  .cc-at-com-lead .cc-at-aba{display:none}
  .cc-at-grade{grid-template-columns:minmax(280px,340px) minmax(0,1fr)}
  .cc-at-alca{display:none}
  .cc-at:not(.cc-at-com-lead) .cc-at-cockpit{display:none}
}
.cc-at-abas-cel{align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--cc-line)}
.cc-at-voltar{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--cc-gold-2);margin-right:auto}
.cc-at-voltar svg{transform:rotate(180deg)}
/* celular: uma coluna — lista → (toque) chat → aba Resumo */
@media (max-width:900px){
  .cc-at .cc-top{margin-bottom:10px}
  .cc-at-com-lead .cc-top{display:none}
  .cc-at-grade,.cc-at-com-lead .cc-at-grade{display:block;height:auto;min-height:0}
  .cc-at-col{border-radius:14px}
  .cc-at:not(.cc-at-com-lead) .cc-at-chat,.cc-at:not(.cc-at-com-lead) .cc-at-cockpit{display:none}
  .cc-at-lista .cc-at-itens{overflow:visible}
  .cc-at-com-lead .cc-at-lista{display:none}
  .cc-at-com-lead .cc-at-aba{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:99px;font-size:13px;font-weight:600;color:var(--cc-muted);border:1px solid var(--cc-line-2)}
  .cc-at-com-lead .cc-at-aba-conversa{color:var(--cc-gold-2);border-color:rgba(251,191,36,.6);background:var(--cc-gold-soft)}
  .cc-at-com-lead .cc-at-chat{height:calc(100vh - 96px);min-height:480px}
  .cc-at-com-lead .cc-at-cockpit{display:none}
  .cc-at-grade:has(.cc-at-cockpit:target) .cc-at-chat,.cc-at-grade:has(.cc-at-cockpit :target) .cc-at-chat{display:none}
  .cc-at-com-lead .cc-at-cockpit:target,.cc-at-com-lead .cc-at-cockpit:has(:target){display:flex}
  .cc-at-cockpit .cc-at-abas-voltar{display:flex}
  .cc-at-msg{max-width:86%}
  .cc-at-compor{flex-wrap:wrap}
  .cc-at-compor-campo{flex-basis:100%}
  .cc-at-zap{width:100%;justify-content:center}
  .cc-at-modelo-lin{grid-template-columns:1fr}
  .cc-at-via{margin-left:0}
  .cc-at-chat-topo{flex-wrap:wrap}
  .cc-at-lapis[open]>form{left:auto;right:-8px;width:calc(100vw - 64px)}
}
.cc-at-abas-voltar{display:none;gap:6px;align-items:center;margin:-4px 0 2px}
.cc-at-abas-voltar a{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:99px;font-size:13px;font-weight:600;color:var(--cc-muted);border:1px solid var(--cc-line-2)}
.cc-at-abas-voltar a.cc-on{color:var(--cc-gold-2);border-color:rgba(251,191,36,.6);background:var(--cc-gold-soft)}
`;
