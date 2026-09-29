// src/modules/dashboard/ui/estatico.ts
// Arquivos ESTÁTICOS do painel — servidos por /dashboard/estatico/<nome>.<hash>.<ext>
// (perf/telas-leves, 28/09/2026).
//
// Antes, toda página do painel levava ~280 KB de HTML: a logo da casa embutida
// em base64 DUAS vezes (~108 KB cada) e ~33 KB de CSS do design system repetido.
// O dono disse que a lista de Leads estava "pesada" e a automação do Chrome
// chegava a congelar. Agora o navegador baixa isso UMA vez e guarda: o nome do
// arquivo leva o hash do conteúdo, então o cache é de 1 ano e qualquer mudança
// no CSS/logo gera outro nome (não existe "cache velho").
//
// MARCA DO TENANT: só a logo da CASA (EcoSun) vira arquivo aqui. A decisão de
// qual logo cada empresa vê continua em views.ts/marca-empresa.ts — tenant com
// logo própria vê a URL dele; tenant sem logo vê o nome em texto; nunca a nossa.
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { CSS_DESIGN_SYSTEM } from './estilo.js';
import { LOGO_NEGATIVA_WIDE_BASE64 } from './logo-negativa-wide.js';
import { CSS_MAPA_USINAS, JS_MAPA_USINAS, JS_MAPA_USINA } from './mapa-cliente.js';
import { CSS_ATENDIMENTO } from './css-atendimento.js';

/** Classes que telas ANTIGAS ainda usam dentro do corpo (moravam no <style> do layout). */
const CSS_LEGADO_LAYOUT = `
.ecosun-ativo{background:var(--marca)}
.ecosun-marca-texto{color:var(--marca)}
.ecosun-header{background:linear-gradient(135deg,#0c4a6e 0%,#075985 50%,#0369a1 100%);position:relative;overflow:hidden}
.accent-amber{border-left:4px solid #f59e0b}
.accent-sky{border-left:4px solid #0ea5e9}
.accent-emerald{border-left:4px solid #10b981}
.accent-violet{border-left:4px solid #8b5cf6}
.accent-rose{border-left:4px solid #f43f5e}
.accent-indigo{border-left:4px solid #6366f1}
details>summary{list-style:none}
details>summary::-webkit-details-marker{display:none}
`;

/** CSS comum de TODAS as telas do painel (design system cc- + classes antigas da casca). */
export const CSS_PAINEL = CSS_DESIGN_SYSTEM + CSS_LEGADO_LAYOUT;

/**
 * Telas RENOVADAS não carregam o Tailwind do CDN (~400 KB de JS que compila no
 * navegador a cada página). Mas o Tailwind também trazia o "preflight" (o reset
 * de base: box-sizing, margens, botões, links, listas…) e as telas foram
 * desenhadas com ele por baixo. Este arquivo é esse reset — o do Tailwind 3.4,
 * com os theme() já resolvidos — mais as DUAS utilidades que a casca e os
 * modais usam (`hidden` e `sm:inline`). Vai DEPOIS do CSS do painel, na mesma
 * posição em que o Tailwind injetava o dele. Visual idêntico, sem o JS.
 */
export const CSS_SEM_TAILWIND = `/* Reset de base (preflight do Tailwind 3.4, MIT) — só nas telas sem Tailwind */
*,::after,::before{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
::after,::before{--tw-content:''}
:host,html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";font-feature-settings:normal;font-variation-settings:normal;-webkit-tap-highlight-color:transparent}
body{margin:0;line-height:inherit}
hr{height:0;color:inherit;border-top-width:1px}
abbr:where([title]){text-decoration:underline dotted}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
a{color:inherit;text-decoration:inherit}
b,strong{font-weight:bolder}
code,kbd,pre,samp{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-feature-settings:normal;font-variation-settings:normal;font-size:1em}
small{font-size:80%}
sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}
sub{bottom:-.25em}
sup{top:-.5em}
table{text-indent:0;border-color:inherit;border-collapse:collapse}
button,input,optgroup,select,textarea{font-family:inherit;font-feature-settings:inherit;font-variation-settings:inherit;font-size:100%;font-weight:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;margin:0;padding:0}
button,select{text-transform:none}
button,input:where([type=button]),input:where([type=reset]),input:where([type=submit]){-webkit-appearance:button;background-color:transparent;background-image:none}
:-moz-focusring{outline:auto}
:-moz-ui-invalid{box-shadow:none}
progress{vertical-align:baseline}
::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}
[type=search]{-webkit-appearance:textfield;outline-offset:-2px}
::-webkit-search-decoration{-webkit-appearance:none}
::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}
summary{display:list-item}
blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre{margin:0}
fieldset{margin:0;padding:0}
legend{padding:0}
menu,ol,ul{list-style:none;margin:0;padding:0}
dialog{padding:0}
textarea{resize:vertical}
input::placeholder,textarea::placeholder{opacity:1;color:#9ca3af}
[role=button],button{cursor:pointer}
:disabled{cursor:default}
audio,canvas,embed,iframe,img,object,svg,video{display:block;vertical-align:middle}
img,video{max-width:100%;height:auto}
[hidden]:where(:not([hidden=until-found])){display:none}
/* As 2 utilidades do Tailwind que a casca (rodapé) e os modais (Fechou!/Perdido) usam */
.hidden{display:none}
@media (min-width:640px){.sm\\:inline{display:inline}}
`;

interface ArquivoEstatico {
  tipo: string;
  corpo: Buffer;
  hash: string;
  url: string;
}

const TIPO_DA_EXTENSAO = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  png: 'image/png',
} as const;

function arquivo(nome: string, ext: keyof typeof TIPO_DA_EXTENSAO, corpo: Buffer): ArquivoEstatico {
  const hash = createHash('sha256').update(corpo).digest('hex').slice(0, 10);
  return {
    tipo: TIPO_DA_EXTENSAO[ext],
    corpo,
    hash,
    url: `/dashboard/estatico/${nome}.${hash}.${ext}`,
  };
}

const ARQUIVOS: ReadonlyMap<string, ArquivoEstatico> = new Map([
  ['painel.css', arquivo('painel', 'css', Buffer.from(CSS_PAINEL, 'utf-8'))],
  ['sem-tailwind.css', arquivo('sem-tailwind', 'css', Buffer.from(CSS_SEM_TAILWIND, 'utf-8'))],
  ['logo-casa.png', arquivo('logo-casa', 'png', Buffer.from(LOGO_NEGATIVA_WIDE_BASE64.slice(LOGO_NEGATIVA_WIDE_BASE64.indexOf(',') + 1), 'base64'))],
  // Mapa das Usinas (Command Center + mini-mapa da usina)
  ['mapa-usinas.css', arquivo('mapa-usinas', 'css', Buffer.from(CSS_MAPA_USINAS, 'utf-8'))],
  ['mapa-usinas.js', arquivo('mapa-usinas', 'js', Buffer.from(JS_MAPA_USINAS, 'utf-8'))],
  ['mapa-usina.js', arquivo('mapa-usina', 'js', Buffer.from(JS_MAPA_USINA, 'utf-8'))],
  // Atendimento (Leads › Conversas e ficha do lead): a grade de 3 colunas. No
  // <head>, não no fim do <body> — senão a tela pisca sem as colunas (28/09).
  ['atendimento.css', arquivo('atendimento', 'css', Buffer.from(CSS_ATENDIMENTO, 'utf-8'))],
]);

export const URL_CSS_PAINEL = ARQUIVOS.get('painel.css')!.url;
export const URL_CSS_SEM_TAILWIND = ARQUIVOS.get('sem-tailwind.css')!.url;
/** Logo OFICIAL da casa (negativa-wide) — só a EcoSun vê (views.ts decide). */
export const URL_LOGO_CASA = ARQUIVOS.get('logo-casa.png')!.url;
export const URL_CSS_MAPA_USINAS = ARQUIVOS.get('mapa-usinas.css')!.url;
export const URL_JS_MAPA_USINAS = ARQUIVOS.get('mapa-usinas.js')!.url;
export const URL_JS_MAPA_USINA = ARQUIVOS.get('mapa-usina.js')!.url;
export const URL_CSS_ATENDIMENTO = ARQUIVOS.get('atendimento.css')!.url;

const NOME_ARQUIVO = /^([a-z-]+)\.([0-9a-f]{10})\.(css|js|png)$/;

/**
 * GET /dashboard/estatico/:arquivo — PÚBLICA (a tela de login e o navegador
 * buscam sem cookie; nada aqui é dado de cliente). Hash certo = cache de 1 ano
 * imutável. Hash velho (aba aberta antes do deploy) = entrega o atual, sem
 * cache longo, pra não quebrar a tela no meio da troca.
 */
export function servirEstatico(req: Request, res: Response): void {
  const m = NOME_ARQUIVO.exec(String(req.params.arquivo ?? ''));
  const arq = m ? ARQUIVOS.get(`${m[1]}.${m[3]}`) : undefined;
  if (!m || !arq) {
    res.status(404).type('text/plain').send('não encontrado');
    return;
  }
  res.setHeader('Content-Type', arq.tipo);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', m[2] === arq.hash ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.send(arq.corpo);
}
