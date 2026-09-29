// src/modules/dashboard/ui/css-command-center.ts
// CSS do Command Center e da Central de Atenção. Mora aqui (e não em
// command-center-views.ts) pra virar ARQUIVO estático com hash (ui/estatico.ts)
// e entrar no <head> — antes ia num <style> no fim do <body> e a tela de
// ENTRADA de todo mundo (R5) pintava sem ele e depois pulava (a "piscada").

/** CSS só do Command Center / Central (tokens cc- → funciona nos dois temas). */
export const CSS_COMMAND_CENTER = `
.cc-cc .cc-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);border-radius:20px;overflow:hidden;border:1px solid rgba(251,191,36,.22);
  background:linear-gradient(120deg,#12304f 0%,#0f2640 45%,#0f2138 100%);box-shadow:0 20px 50px rgba(0,0,0,.28);margin-bottom:18px;position:relative}
.cc-cc .cc-hero::after{content:"";position:absolute;right:-120px;top:-160px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(240,165,0,.16),transparent 65%);pointer-events:none}
.cc-cc .cc-hero-l{padding:24px 28px}
.cc-cc .cc-who{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cc-cc .cc-eva-av{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#0369a1,#16304F);border:1px solid rgba(251,191,36,.45);color:#fbbf24}
.cc-cc .cc-hero-l h2{font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;color:#fff}
.cc-cc .cc-hero-l>p{margin:10px 0 0;color:var(--cc-text-2);font-size:15px;line-height:1.55;max-width:560px}
.cc-cc .cc-hero-l>p b{color:#fff;font-weight:600}
.cc-cc .cc-changed{margin-top:16px}
.cc-cc .cc-changed .cc-lbl-s{margin-bottom:8px;display:block}
.cc-cc .cc-hero-r{padding:20px 22px;border-left:1px solid var(--cc-line);background:rgba(6,16,30,.28);display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
.cc-cc .cc-hh{display:flex;align-items:center;gap:10px;margin-bottom:2px}
.cc-cc .cc-hero-r .cc-empty{flex:1;align-items:center}

/* linha 1 = altura da curva; a sobra da coluna da Central vai pra linha 2 (sem buraco entre os painéis) */
.cc-cc .cc-board{display:grid;grid-template-columns:minmax(0,1fr) 452px;grid-template-rows:auto 1fr;grid-template-areas:"gen att" "map att";gap:18px;margin-top:18px;align-items:start}
.cc-cc .cc-a-gen{grid-area:gen}.cc-cc .cc-a-map{grid-area:map}
.cc-cc .cc-a-att{grid-area:att;background:linear-gradient(180deg,#132b47 0%,#0f2138 60%);border-color:rgba(150,185,225,.16);box-shadow:0 18px 44px rgba(0,0,0,.25);display:flex;flex-direction:column}
/* A Central não empurra a altura do quadro: acompanha a coluna da esquerda (mín. 560 px) e rola por dentro. */
.cc-cc .cc-board .cc-a-att{contain:size;min-height:560px;align-self:stretch}
.cc-cc .cc-board .cc-a-att .cc-evs{flex:1;min-height:0;overflow:auto;padding-right:4px;margin-right:-4px}
.cc-cc .cc-a-genmap{grid-column:1;grid-row:1/span 2;align-self:stretch;justify-content:center;padding:32px 40px}
.cc-cc .cc-a-genmap .cc-btn-tranc{margin-top:10px}
.cc-cc .cc-a-att .cc-ph h3{font-size:18px}
.cc-cc .cc-gsum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.cc-cc .cc-gsum>div{padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.16);border:1px solid var(--cc-line)}
.cc-cc .cc-gsum .cc-big{font-size:20px;margin-top:3px}
.cc-cc .cc-gsum .cc-big small{font-size:12px;color:var(--cc-muted);font-weight:500}
.cc-cc .cc-txt-crit{color:var(--cc-crit)!important}.cc-cc .cc-txt-warn{color:var(--cc-warn)!important}.cc-cc .cc-txt-ok{color:var(--cc-ok)!important}
.cc-cc .cc-nota{font-size:12px;color:var(--cc-muted);margin:8px 0 0}
.cc-cc .cc-det{margin-top:10px;font-size:12.5px;color:var(--cc-muted)}
.cc-cc .cc-det summary{cursor:pointer;color:var(--cc-text-2)}
.cc-cc .cc-det .cc-tbl-wrap{max-height:260px;overflow:auto;margin-top:8px}
.cc-cc .cc-mapwrap{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:18px;align-items:start}
.cc-cc .cc-cidades{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;font-size:13px}
.cc-cc .cc-cidades li{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.028);border:1px solid var(--cc-line)}
.cc-cc .cc-cidades .cc-cid{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cc-text-2)}
.cc-cc .cc-cidades b{font-family:var(--cc-f-num);font-weight:600}
.cc-cc .cc-mleg{display:flex;flex-direction:column;gap:9px;font-size:13px}
.cc-cc .cc-ln{display:flex;align-items:center;gap:9px}
.cc-cc .cc-ln b{margin-left:auto;font-family:var(--cc-f-num);font-weight:600;color:var(--cc-text)}
.cc-cc .cc-ln b.cc-txt{color:var(--cc-text-2)}
.cc-cc .cc-mleg .cc-bar{margin:-2px 0 2px 17px}
.cc-cc .cc-bar-normal i{background:var(--cc-ok)}.cc-cc .cc-bar-atencao i{background:var(--cc-warn)}
.cc-cc .cc-bar-critico i{background:var(--cc-crit)}.cc-cc .cc-bar-sem_comunicacao i{background:var(--cc-off)}
.cc-cc .cc-mleg hr{border:0;border-top:1px solid var(--cc-line);margin:4px 0}
.cc-cc .cc-sevs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px}
.cc-cc .cc-sev{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 7px;border-radius:8px;background:rgba(0,0,0,.2);border:1px solid var(--cc-line);color:var(--cc-text-2)}
.cc-cc a.cc-sev:hover{border-color:rgba(251,191,36,.4)}
.cc-cc .cc-sev b{font-family:var(--cc-f-num);color:var(--cc-text)}

.cc-cc .cc-a-mapa{margin-top:18px}
.cc-cc .cc-depts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin-top:18px}
.cc-cc .cc-dept{padding:16px 16px 12px;border-radius:14px;background:var(--cc-surface);border:1px solid var(--cc-line);display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
.cc-cc .cc-dept:hover{border-color:rgba(251,191,36,.35);transform:translateY(-1px)}
.cc-cc .cc-dh{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;color:var(--cc-text-2)}
.cc-cc .cc-dh .cc-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--cc-surface-3);color:var(--cc-gold-2)}
.cc-cc .cc-dh .cc-go{margin-left:auto;color:var(--cc-faint)}
.cc-cc .cc-dept .cc-big{font-size:26px;margin-top:12px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-cc .cc-dept .cc-big small{font-size:13px;color:var(--cc-muted);font-weight:500;font-family:var(--cc-f-text)}
.cc-cc .cc-dept .cc-big small.cc-pre{font-size:15px;color:var(--cc-text-2);margin-right:2px}
.cc-cc .cc-s1{font-size:12.5px;color:var(--cc-muted);margin-top:6px;min-height:36px}
.cc-cc .cc-st{margin-top:10px;font-size:12px;display:flex;align-items:center;gap:6px;color:var(--cc-text-2);min-width:0}
.cc-cc .cc-st .cc-dot{flex:none}
.cc-cc .cc-st-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-cc .cc-foot{margin-top:26px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--cc-faint)}

/* Vitrine: bloco de módulo fora do plano (cadeado, sem número) */
.cc-cc .cc-tranc{display:flex;flex-direction:column;gap:9px;align-items:flex-start;border-style:dashed;border-color:rgba(251,191,36,.28)}
.cc-cc .cc-tranc-h{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:13.5px;color:var(--cc-text)}
.cc-cc .cc-tranc-h b{font-weight:600}
.cc-cc .cc-tranc-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;background:rgba(251,191,36,.10);color:var(--cc-gold-2)}
.cc-cc .cc-tranc-tag{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--cc-faint)}
.cc-cc .cc-tranc p{margin:0;font-size:12.5px;line-height:1.45;color:var(--cc-muted);max-width:52ch}
.cc-cc .cc-tranc-g{list-style:none;margin:2px 0 4px;padding:0;display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--cc-text-2)}
.cc-cc .cc-tranc-g li{display:flex;align-items:center;gap:8px}
.cc-cc .cc-tranc-g .cc-i{color:var(--cc-ok);flex:none}
.cc-cc .cc-btn-tranc{white-space:normal;height:auto;min-height:32px;padding:6px 12px;line-height:1.25;margin-top:auto}
.cc-cc .cc-kpi.cc-kpi-tranc{grid-column:span 2;border-top:0;border-bottom:0;border-right:0;border-left:1px dashed var(--cc-line-2);background:rgba(251,191,36,.03)}
.cc-cc .cc-kpi.cc-kpi-tranc:first-child{border-left:0}
.cc-cc .cc-kpi.cc-tranc-linha{grid-column:1/-1;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px 16px;border-left:0;border-top:1px dashed var(--cc-line-2);padding:12px 18px}
.cc-cc .cc-kpi.cc-tranc-linha p{flex:1;min-width:220px;max-width:none}
.cc-cc .cc-kpi.cc-tranc-linha .cc-btn-tranc{margin-top:0}
.cc-cc .cc-dept.cc-dept-tranc{background:rgba(251,191,36,.03)}
.cc-cc .cc-dept.cc-dept-tranc:hover{transform:none}
.cc-cc .cc-panel-tranc{padding:26px 28px}
.cc-cc .cc-panel-tranc .cc-tranc-h{font-size:17px}

/* Central de Atenção — página */
.cc-att-page .cc-kstrip-sev{margin-bottom:18px}
.cc-att-page .cc-att-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
.cc-att-page .cc-filtros{margin-bottom:14px;align-items:center}
.cc-att-page .cc-grupo-sev{margin-bottom:18px}
.cc-att-page .cc-grupo-t{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;margin:0 0 10px;color:var(--cc-text)}
.cc-att-page .cc-fontes-l{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;font-size:13px}
.cc-att-page .cc-fontes-l li{display:flex;align-items:center;gap:9px;color:var(--cc-text-2)}
.cc-att-page .cc-fontes-l li>span:nth-child(2){flex:1;min-width:0}
.cc-att-page .cc-fontes-off li{color:var(--cc-muted)}

@media (max-width:1280px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr) 400px}
  .cc-cc .cc-depts{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cc-cc .cc-kstrip-cc{--n:4!important}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(n+5){border-top:1px solid var(--cc-line)}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(5){border-left:0}
}
@media (max-width:980px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr);grid-template-areas:"att" "gen" "map"}
  .cc-cc .cc-board .cc-a-att{contain:none;min-height:0}
  .cc-cc .cc-board .cc-a-att .cc-evs{overflow:visible;padding-right:0;margin-right:0}
  .cc-cc .cc-a-genmap{grid-column:auto;grid-row:auto}
  .cc-att-page .cc-att-grid{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:760px){
  /* Celular: a Central de Atenção sobe logo depois do resumo do dia (spec §16). */
  .cc-cc:not(.cc-att-page) .cc-wrap{display:flex;flex-direction:column;gap:16px}
  .cc-cc:not(.cc-att-page) .cc-wrap>*{margin:0!important}
  .cc-cc .cc-board{display:contents}
  .cc-cc .cc-hero{order:1} .cc-cc .cc-a-att{order:2} .cc-cc .cc-kstrip-cc{order:3} .cc-cc .cc-a-gen{order:4}
  .cc-cc .cc-a-map{order:5} .cc-cc .cc-a-genmap{order:4} .cc-cc .cc-a-mapa{order:6} .cc-cc .cc-depts{order:7} .cc-cc .cc-foot{order:8}
  .cc-cc .cc-hero{grid-template-columns:minmax(0,1fr)} .cc-cc .cc-hero-r{border-left:0;border-top:1px solid var(--cc-line)}
  .cc-cc .cc-hero-l{padding:20px} .cc-cc .cc-hero-l h2{font-size:24px}
  .cc-cc .cc-gsum{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-cc .cc-mapwrap{grid-template-columns:minmax(0,1fr)}
  .cc-cc .cc-depts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-cc .cc-depts .cc-dept:last-child{grid-column:1/-1}
  .cc-cc .cc-dept .cc-big{white-space:normal}
  .cc-cc .cc-foot{display:none}
}
`;
