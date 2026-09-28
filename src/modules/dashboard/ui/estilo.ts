// src/modules/dashboard/ui/estilo.ts
// Tokens + CSS do design system do Command Center (fase A).
//
// Fonte: common.css do protótipo aprovado (Desktop/PROTOTIPO-Command-Center/_fonte).
// Tudo com prefixo `cc-` — as telas antigas usam Tailwind e têm classes próprias
// (`.card`, `.kpi`, `.btn`…) que NÃO podem ser atingidas.
//
// Tema: os tokens nascem ESCUROS (navy da marca). `.cc-claro` redefine os mesmos
// nomes para as telas que ainda são claras (e o tenant que pediu tela clara).
// A cor da MARCA da empresa (`--marca`, de marca-empresa.ts) pinta o item ativo.

/** Fontes do design system: Space Grotesk (números) + Inter (texto). */
export const FONTES_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">`;

export const CSS_TOKENS = `
:root{
  --cc-bg:#0A1729; --cc-bg-glow:#16304F;
  --cc-surface:#0F2138; --cc-surface-2:#132942; --cc-surface-3:#183253;
  --cc-navy:#16304F;
  --cc-line:rgba(150,185,225,.10); --cc-line-2:rgba(150,185,225,.18);
  --cc-text:#EAF1F8; --cc-text-2:#C4D3E3; --cc-muted:#8CA3BC; --cc-faint:#5E7792;
  --cc-gold:#F0A500; --cc-gold-2:#fbbf24; --cc-gold-soft:rgba(240,165,0,.12);
  --cc-ok:#3DBB6E; --cc-ok-soft:rgba(61,187,110,.14);
  --cc-crit:#E4574B; --cc-crit-soft:rgba(228,87,75,.14);
  --cc-warn:#F2862E; --cc-warn-soft:rgba(242,134,46,.14);
  --cc-watch:#E3C84A; --cc-watch-soft:rgba(227,200,74,.13);
  --cc-info:#38BDF8; --cc-info-soft:rgba(56,189,248,.13);
  --cc-off:#7F90A6; --cc-off-soft:rgba(127,144,166,.16);
  --cc-panel-top:#0F2138; --cc-panel-bot:rgba(15,33,56,.92);
  --cc-sb-w:272px;
  --cc-r:16px; --cc-r-sm:10px;
  --cc-f-num:"Space Grotesk",system-ui,sans-serif;
  --cc-f-text:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.cc-claro{
  --cc-bg:#f8fafc; --cc-surface:#ffffff; --cc-surface-2:#f1f5f9; --cc-surface-3:#e2e8f0;
  --cc-line:rgba(15,23,42,.08); --cc-line-2:rgba(15,23,42,.14);
  --cc-text:#0f172a; --cc-text-2:#334155; --cc-muted:#64748b; --cc-faint:#94a3b8;
  --cc-gold:#d97706; --cc-gold-2:#b45309; --cc-gold-soft:rgba(245,158,11,.12);
  --cc-ok:#059669; --cc-crit:#dc2626; --cc-warn:#ea580c; --cc-watch:#a16207; --cc-info:#0284c7; --cc-off:#64748b;
  --cc-panel-top:#ffffff; --cc-panel-bot:#ffffff;
}
`;

/** Casca: menu lateral, barra do celular, área principal (escura ou clara). */
export const CSS_CASCA = `
/* <body> mantém as classes de sempre: ecosun-body (claro) e ecosun-body-dark (escuro). */
body.ecosun-body{margin:0;font-family:var(--cc-f-text);-webkit-font-smoothing:antialiased;min-height:100vh;color:#0f172a;
  background:radial-gradient(ellipse at top left, rgba(14,165,233,.08), transparent 50%),radial-gradient(ellipse at bottom right, rgba(245,158,11,.05), transparent 50%),#f8fafc}
body.ecosun-body.ecosun-body-dark{color:#EAF1F8;background:radial-gradient(900px 480px at 78% -8%, rgba(22,48,79,.95), transparent 70%),#0A1729}
.cc-shell{display:flex;min-height:100vh}

/* ---- Menu lateral ---- */
.cc-sb{position:sticky;top:0;height:100vh;width:var(--cc-sb-w);flex:none;color:#fff;
  background:linear-gradient(180deg,#0c4a6e 0%,#075985 55%,#0369a1 100%);
  display:flex;flex-direction:column;padding:20px 16px 16px;
  box-shadow:1px 0 0 rgba(255,255,255,.06),12px 0 40px rgba(0,0,0,.25)}
.cc-sb-logo{display:block;padding:4px 2px 16px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:12px;text-align:center}
.cc-sb-logo img{width:100%;max-height:96px;object-fit:contain;height:auto;display:block;margin:0 auto;filter:drop-shadow(0 4px 14px rgba(0,0,0,.25))}
.cc-sb-logo .cc-sb-nome{font-size:22px;font-weight:800;line-height:1.15;color:#fff;font-family:var(--cc-f-num)}
.cc-sb-logo small{display:block;margin-top:10px;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.62);font-weight:600}
.cc-nav{display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto;margin:0 -8px;padding:0 8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}
.cc-nav details>summary{list-style:none}
.cc-nav details>summary::-webkit-details-marker{display:none}
.cc-top-item{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:10px;cursor:pointer;user-select:none;
  color:rgba(255,255,255,.82);font-weight:500;font-size:14px;position:relative;transition:background .15s}
.cc-top-item:hover{background:rgba(255,255,255,.08);color:#fff}
.cc-top-item .cc-chev{margin-left:auto;color:rgba(255,255,255,.45);transition:transform .15s}
.cc-grp[open]>.cc-top-item .cc-chev{transform:rotate(90deg)}
.cc-top-item.cc-on{background:rgba(8,21,41,.38);color:#fff;font-weight:600;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.cc-top-item.cc-on::before{content:"";position:absolute;left:-8px;top:8px;bottom:8px;width:4px;border-radius:0 4px 4px 0;background:var(--marca)}
.cc-top-item.cc-on>.cc-i{color:var(--marca)}
.cc-top-item.cc-trancado{color:rgba(255,255,255,.5)}
.cc-sub{display:flex;flex-direction:column;gap:1px;margin:2px 0 6px 21px;padding-left:12px;border-left:1px solid rgba(255,255,255,.14)}
.cc-sub a{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;font-size:13px;color:rgba(255,255,255,.72);transition:background .15s}
.cc-sub a:hover{background:rgba(255,255,255,.08);color:#fff}
.cc-sub a.cc-on{color:#fff;font-weight:600;background:rgba(8,21,41,.32)}
.cc-sub a.cc-on::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--marca);flex:none;margin-left:-2px}
.cc-sub a.cc-lock{color:rgba(255,255,255,.42)}
.cc-sub a.cc-lock:hover{color:#fff;background:rgba(255,255,255,.05)}
.cc-sub a .cc-bdg,.cc-top-item .cc-bdg{margin-left:auto}
.cc-cadeado{margin-left:auto;font-size:11px;opacity:.75}
.cc-top-item .cc-cadeado+.cc-chev{margin-left:8px}
.cc-sep{height:1px;background:rgba(255,255,255,.10);margin:8px 6px}
.cc-bdg{font-family:var(--cc-f-num);font-size:11px;font-weight:700;padding:1px 7px;border-radius:99px;background:rgba(255,255,255,.14);color:#fff;line-height:1.5}
.cc-bdg-r{background:var(--cc-crit);color:#fff}
.cc-bdg-a{background:#fbbf24;color:#16304F}
.cc-top-item .cc-bdg+.cc-chev{margin-left:8px}
.cc-sb-foot{display:flex;flex-direction:column;gap:10px;padding-top:10px}
.cc-tvcard{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(8,21,41,.30);border:1px solid rgba(255,255,255,.10);font-size:12.5px;color:rgba(255,255,255,.85)}
.cc-tvcard:hover{border-color:rgba(251,191,36,.5)}
.cc-tvcard strong{color:#fff}
.cc-me{display:flex;align-items:center;gap:10px;padding:4px 4px 0}
.cc-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-family:var(--cc-f-num);font-weight:700;color:#16304F;background:linear-gradient(135deg,#fbbf24,#F0A500);flex:none}
.cc-me-txt{line-height:1.2;min-width:0;flex:1}
.cc-me-txt strong{display:block;font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-me-txt span{display:block;font-size:11.5px;color:rgba(255,255,255,.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-sair{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:rgba(255,255,255,.7);background:transparent;border:1px solid rgba(255,255,255,.14);cursor:pointer}
.cc-sair:hover{color:#fff;border-color:rgba(255,255,255,.35)}

/* ---- Coluna de conteúdo ---- */
.cc-col{flex:1;min-width:0;display:flex;flex-direction:column}
.cc-root{max-width:100%;min-width:0}
.cc-mtop{display:none}
.cc-main{flex:1;width:100%;margin:0 auto;padding:32px 24px;position:relative;z-index:0;max-width:80rem}
.cc-main.cc-largo{max-width:none;padding:26px 34px 40px}
.cc-rodape{width:100%;max-width:80rem;margin:24px auto 0;padding:20px 24px;font-size:12px;text-align:center;border-top:1px solid var(--cc-line-2);color:#64748b}
.cc-main.cc-largo~.cc-rodape{max-width:none}
.cc-escuro .cc-rodape{color:var(--cc-faint)}
.cc-claro .cc-rodape{border-color:#e2e8f0}
.cc-rodape .cc-row{justify-content:center;flex-wrap:wrap;gap:8px}
.cc-backdrop{display:none}

@media (max-width:1180px){ :root{--cc-sb-w:240px} .cc-main.cc-largo{padding:22px 24px 34px} }
@media (max-width:1023px){
  .cc-sb{position:fixed;top:0;left:0;bottom:0;height:auto;z-index:40;transform:translateX(-100%);visibility:hidden;transition:transform .25s ease,visibility 0s linear .25s;width:280px}
  .sidebar-open .cc-sb{transform:translateX(0);visibility:visible;transition:transform .25s ease,visibility 0s}
  .sidebar-open .cc-backdrop{display:block;position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:30}
  .cc-mtop{display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:20;padding:10px 16px;
    background:linear-gradient(90deg,#0c4a6e,#075985 55%,#0369a1);box-shadow:0 6px 20px rgba(0,0,0,.3);color:#fff}
  .cc-mtop img{height:44px;width:auto}
  .cc-mtop .cc-mtop-nome{font-weight:700;font-size:17px}
  .cc-mtop .cc-sp{flex:1}
  .cc-mtop .cc-ibtn{background:rgba(8,21,41,.35);border-color:rgba(255,255,255,.18);color:#fff}
  .cc-main{padding:20px 16px}
  .cc-main.cc-largo{padding:18px 16px 30px}
}
`;

/** Componentes (ui/componentes.ts). */
export const CSS_COMPONENTES = `
.cc-root,.cc-root *{box-sizing:border-box}
.cc-root{font-family:var(--cc-f-text);color:var(--cc-text);font-size:14px;line-height:1.45}
.cc-root a{color:inherit;text-decoration:none}
.cc-root h1,.cc-root h2,.cc-root h3,.cc-num,.cc-val,.cc-big{font-family:var(--cc-f-num);font-variant-numeric:tabular-nums;margin:0}
svg.cc-i{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
svg.cc-i.cc-i-sm{width:15px;height:15px}
svg.cc-i.cc-i-xs{width:13px;height:13px}
.cc-muted{color:var(--cc-muted)} .cc-faint{color:var(--cc-faint)}
.cc-gold{color:var(--cc-gold)} .cc-okc{color:var(--cc-ok)} .cc-critc{color:var(--cc-crit)} .cc-warnc{color:var(--cc-warn)} .cc-infoc{color:var(--cc-info)}
.cc-row{display:flex;align-items:center;gap:10px}
.cc-row-wrap{flex-wrap:wrap;gap:14px}
.cc-sp{flex:1}

/* cabeçalho */
.cc-top{display:flex;align-items:flex-start;gap:24px;margin-bottom:22px}
.cc-ttl{flex:1;min-width:0}
.cc-eyebrow{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--cc-muted);font-weight:500;margin-bottom:6px;flex-wrap:wrap}
.cc-live{display:inline-flex;align-items:center;gap:6px;color:var(--cc-ok);font-weight:600}
.cc-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cc-ok);box-shadow:0 0 0 4px rgba(61,187,110,.18)}
.cc-root h1{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.cc-subt{color:var(--cc-muted);margin:6px 0 0;font-size:14px;max-width:640px}
.cc-crumb{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--cc-muted);margin-bottom:8px;flex-wrap:wrap}
.cc-crumb a:hover{color:var(--cc-gold-2)}
.cc-crumb .cc-cur{color:var(--cc-text-2)}
.cc-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.cc-sel{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border-radius:10px;background:var(--cc-surface);border:1px solid var(--cc-line-2);font-size:13px;color:var(--cc-text-2);white-space:nowrap}
.cc-sel em{font-style:normal;color:var(--cc-faint);font-size:12px}
.cc-sel svg{color:var(--cc-faint)}
.cc-selo-fase{white-space:nowrap;display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--cc-gold-2);border:1px dashed rgba(251,191,36,.55);padding:3px 9px;border-radius:99px;background:rgba(251,191,36,.06)}

/* botões */
.cc-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid var(--cc-line-2);background:var(--cc-surface-2);color:var(--cc-text);white-space:nowrap;cursor:pointer}
.cc-btn:hover{border-color:rgba(251,191,36,.5)}
.cc-btn-gold{background:linear-gradient(180deg,#fbbf24,#F0A500);color:#1b2a3f;border-color:transparent;box-shadow:0 6px 18px rgba(240,165,0,.25)}
.cc-btn-sm{height:30px;padding:0 11px;font-size:12.5px;border-radius:8px}
.cc-ibtn{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--cc-surface);border:1px solid var(--cc-line-2);color:var(--cc-text-2);position:relative;cursor:pointer;font-size:20px;line-height:1}
.cc-link{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:var(--cc-gold-2);font-weight:600}
.cc-link:hover{text-decoration:underline}

/* painel */
.cc-panel{background:linear-gradient(180deg,var(--cc-panel-top) 0%,var(--cc-panel-bot) 100%);border:1px solid var(--cc-line);border-radius:var(--cc-r);padding:20px 22px;min-width:0;position:relative}
.cc-claro .cc-panel{box-shadow:0 1px 2px rgba(15,23,42,.05)}
.cc-ph{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.cc-ph h3{font-size:16px;font-weight:600;letter-spacing:-.01em}
.cc-hint{font-size:12.5px;color:var(--cc-muted)}
.cc-clk{cursor:pointer;transition:border-color .15s,transform .15s}
.cc-clk:hover{border-color:rgba(251,191,36,.35)}
.cc-lbl-s{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--cc-faint);font-weight:600}
.cc-big{font-weight:600;letter-spacing:-.02em}

/* KPIs */
.cc-kstrip{display:grid;grid-template-columns:repeat(var(--n,8),minmax(0,1fr));background:var(--cc-surface);border:1px solid var(--cc-line);border-radius:var(--cc-r);overflow:hidden}
.cc-kpi{display:block;padding:16px 18px 15px;border-left:1px solid var(--cc-line);min-width:0;position:relative}
.cc-kpi:first-child{border-left:0}
a.cc-kpi:hover{background:rgba(255,255,255,.025)}
.cc-kpi .cc-lbl{font-size:12.5px;color:var(--cc-muted);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-kpi .cc-val{font-size:27px;font-weight:600;letter-spacing:-.02em;margin-top:6px;line-height:1.05;white-space:nowrap}
.cc-kpi .cc-val small{font-size:14px;color:var(--cc-muted);font-weight:500;margin-left:3px;letter-spacing:0}
.cc-kpi .cc-val small.cc-pre{margin:0 3px 0 0}
.cc-kpi .cc-dl{margin-top:7px;font-size:12px;color:var(--cc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-kpi-vazio .cc-val{color:var(--cc-faint)}
.cc-kpi-hl .cc-val{color:var(--cc-gold-2)}
.cc-up{color:var(--cc-ok);font-weight:600} .cc-dn{color:var(--cc-crit);font-weight:600}

/* status */
.cc-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;white-space:nowrap}
.cc-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.cc-s-ok{color:var(--cc-ok);background:var(--cc-ok-soft)}
.cc-s-crit{color:var(--cc-crit);background:var(--cc-crit-soft)}
.cc-s-warn{color:var(--cc-warn);background:var(--cc-warn-soft)}
.cc-s-watch{color:var(--cc-watch);background:var(--cc-watch-soft)}
.cc-s-info{color:var(--cc-info);background:var(--cc-info-soft)}
.cc-s-off{color:var(--cc-off);background:var(--cc-off-soft)}
.cc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.cc-d-ok{background:var(--cc-ok)} .cc-d-crit{background:var(--cc-crit)} .cc-d-warn{background:var(--cc-warn)} .cc-d-watch{background:var(--cc-watch)} .cc-d-info{background:var(--cc-info)} .cc-d-off{background:var(--cc-off)}

/* tabela */
.cc-tbl-wrap{overflow-x:auto}
.cc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.cc-tbl th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--cc-faint);font-weight:600;padding:10px;border-bottom:1px solid var(--cc-line-2);white-space:nowrap;background:rgba(0,0,0,.08)}
.cc-tbl td{padding:11px 10px;border-bottom:1px solid var(--cc-line);vertical-align:middle;white-space:nowrap}
.cc-tbl tr:last-child td{border-bottom:0}
.cc-tbl .cc-tr-link{cursor:pointer}
.cc-tbl tbody tr:hover td{background:rgba(255,255,255,.025)}
.cc-tbl .cc-r{text-align:right}
.cc-tbl .cc-n{font-family:var(--cc-f-num);font-variant-numeric:tabular-nums}

/* barra */
.cc-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.cc-bar i{display:block;height:100%;border-radius:99px;background:var(--cc-ok)}

/* sparkline */
.cc-spark{display:block;width:100%;height:38px}
.cc-spark-vazio{display:grid;place-items:center;font-size:11px;color:var(--cc-faint);border:1px dashed var(--cc-line-2);border-radius:8px}

/* estado vazio */
.cc-empty{display:flex;align-items:flex-start;gap:12px;padding:16px;border-radius:12px;border:1px dashed var(--cc-line-2);background:rgba(0,0,0,.10);color:var(--cc-text-2)}
.cc-claro .cc-empty{background:#f8fafc}
.cc-empty b{display:block;font-size:13.5px;font-weight:600;color:var(--cc-text)}
.cc-empty p{margin:3px 0 0;font-size:12.5px;color:var(--cc-muted);line-height:1.45}
.cc-empty-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:var(--cc-surface-3);color:var(--cc-gold-2)}
.cc-empty-construcao{border-color:rgba(251,191,36,.35)}
.cc-empty-sm{padding:10px 12px}

/* avisos da Central de Atenção (fase B) */
.cc-evs{display:flex;flex-direction:column;gap:9px}
.cc-ev{--c:var(--cc-info);display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;position:relative;padding:11px 12px 11px 16px;border-radius:12px;background:rgba(255,255,255,.028);border:1px solid var(--cc-line)}
.cc-ev::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--c)}
.cc-ev>*:not(.cc-btn){grid-column:1}
.cc-ev>.cc-btn{grid-column:2;grid-row:1/span 4}
.cc-ev-m{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--cc-muted);flex-wrap:wrap}
.cc-ev-sv{font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}
.cc-ev-t{font-size:13.5px;font-weight:600;margin-top:2px;line-height:1.3;color:var(--cc-text)}
.cc-ev-d{font-size:12px;color:var(--cc-muted);margin-top:2px;line-height:1.35}
.cc-ev-imp{font-size:12px;margin-top:2px}
.cc-ev-imp b{font-family:var(--cc-f-num);font-weight:600;color:var(--c)}
.cc-ev-critico{--c:var(--cc-crit);background:linear-gradient(90deg,rgba(228,87,75,.10),rgba(255,255,255,.02) 60%)}
.cc-ev-atencao{--c:var(--cc-warn)} .cc-ev-acompanhar{--c:var(--cc-watch)} .cc-ev-oportunidade{--c:var(--cc-ok)} .cc-ev-info{--c:var(--cc-info)}
.cc-btn-crit{background:var(--cc-crit);border-color:transparent;color:#fff}
.cc-falha{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:12.5px;color:var(--cc-text-2);background:var(--cc-crit-soft);border:1px solid rgba(228,87,75,.35)}
.cc-falha svg{color:var(--cc-crit);margin-top:1px}

/* ações recomendadas (hero) */
.cc-act{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--cc-line)}
.cc-act-n{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-family:var(--cc-f-num);font-weight:700;font-size:14px;background:var(--cc-surface-3);color:var(--cc-text-2)}
.cc-act b{display:block;font-size:14px;font-weight:600;line-height:1.3;color:var(--cc-text)}
.cc-act small{display:block;font-size:12.5px;color:var(--cc-muted);margin-top:2px}
.cc-act-1{background:linear-gradient(90deg,rgba(240,165,0,.14),rgba(240,165,0,.04));border-color:rgba(251,191,36,.45)}
.cc-act-1 .cc-act-n{background:var(--cc-gold);color:#16304F}
.cc-act-tag{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--cc-gold-2);margin-bottom:3px;display:block}

/* chips */
.cc-chips{display:flex;gap:7px;flex-wrap:wrap}
.cc-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:4px 11px;border-radius:99px;border:1px solid var(--cc-line-2);font-size:12.5px;color:var(--cc-text-2);background:var(--cc-surface);white-space:nowrap}
.cc-chip b{font-family:var(--cc-f-num);font-weight:600}
.cc-chip-ok{border-color:rgba(61,187,110,.45);color:var(--cc-ok)}
.cc-chip-warn{border-color:rgba(242,134,46,.5);color:var(--cc-warn)}
a.cc-chip:hover{border-color:rgba(251,191,36,.5)}
.cc-chip-on{border-color:rgba(251,191,36,.6);color:var(--cc-gold-2);background:var(--cc-gold-soft)}

/* gráfico da curva (SVG sem JS; eixos em HTML pra não esticar o texto) */
.cc-chart{display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-rows:auto 200px 22px;column-gap:8px}
.cc-chart-un{grid-column:1/-1;font-size:11px;color:var(--cc-faint);margin-bottom:6px}
.cc-chart-y{position:relative;font-size:11px;color:var(--cc-faint);font-family:var(--cc-f-num)}
.cc-chart-y span{position:absolute;right:0;transform:translateY(-50%)}
.cc-chart-plot{position:relative;border-bottom:1px solid var(--cc-line-2)}
.cc-chart-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cc-chart-x{grid-column:2;position:relative;font-size:11px;color:var(--cc-faint)}
.cc-chart-x span{position:absolute;top:5px;transform:translateX(-50%);white-space:nowrap}
.cc-bar-real{fill:var(--cc-gold);opacity:.85}
.cc-bar-real:hover{opacity:1}
.cc-linha-esp{fill:none;stroke:var(--cc-text-2);stroke-width:2;stroke-dasharray:5 4;vector-effect:non-scaling-stroke}
.cc-grade{stroke:var(--cc-line);stroke-width:1;vector-effect:non-scaling-stroke}
.cc-chart-leg{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--cc-text-2);margin-top:10px}
.cc-chart-leg span{display:inline-flex;align-items:center;gap:7px}
.cc-sw-real{display:inline-block;width:12px;height:10px;border-radius:2px;background:var(--cc-gold)}
.cc-sw-esp{display:inline-block;width:18px;border-top:2px dashed var(--cc-text-2)}

@media (max-width:760px){
  .cc-top{flex-direction:column;gap:14px}
  .cc-tools{justify-content:flex-start}
  .cc-root h1{font-size:25px}
  .cc-kstrip{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .cc-kpi{border-left:0;border-top:1px solid var(--cc-line)}
  .cc-kpi:nth-child(even){border-left:1px solid var(--cc-line)}
  .cc-kpi:nth-child(-n+2){border-top:0}
  .cc-kpi .cc-val{font-size:23px}
  .cc-panel{padding:16px}
  .cc-hide-m{display:none!important}
  .cc-ev{grid-template-columns:minmax(0,1fr)}
  .cc-ev>.cc-btn{grid-column:1;grid-row:auto;justify-self:start;margin-top:8px}
  .cc-act{grid-template-columns:26px minmax(0,1fr)}
  .cc-act>.cc-btn{grid-column:2;justify-self:start}
  .cc-chart{grid-template-columns:36px minmax(0,1fr);grid-template-rows:auto 160px 22px}
}
`;

/** Todo o CSS do design system, pronto para ir num <style>. */
export const CSS_DESIGN_SYSTEM = CSS_TOKENS + CSS_CASCA + CSS_COMPONENTES;
