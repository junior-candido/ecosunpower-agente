// tests/helpers/contrato-tela.ts
// "Contrato da tela" (renovação do miolo, 28/09/2026): tudo que, se mudar, muda
// o COMPORTAMENTO da tela — não a aparência. Cada fatia grava o contrato da tela
// ANTIGA num teste e a tela nova tem que devolver o MESMO objeto.
//
// O que entra:
//  - formularios: method + action + enctype + campos (name + type) de cada <form>
//  - fetches:     o 1º argumento de cada fetch(…) (URL montada no script)
//  - links:       href="/dashboard…" únicos
//  - ids:         todo id citado por getElementById / querySelector('#…'),
//                 e quais deles NÃO existem na página (idsAusentes)
//  - seletores:   seletores usados por script (querySelector(All), closest,
//                 draggable/handle do Sortable)
//  - dataAttrs:   data-* lidos por script (dataset.x / [data-x])
//  - confirms:    o argumento de cada confirm(…)
//  - scriptsExternos: <script src> (CDN pinado igual)
// Tudo ordenado: mudar a ORDEM dos atributos ou dos blocos na página não muda
// o contrato; mudar um name, uma action ou um confirm muda.

export interface CampoContrato { name: string; type: string }
export interface FormContrato { method: string; action: string; enctype: string; campos: CampoContrato[] }
export interface ContratoTela {
  formularios: FormContrato[];
  fetches: string[];
  links: string[];
  ids: string[];
  idsAusentes: string[];
  seletores: string[];
  dataAttrs: string[];
  confirms: string[];
  scriptsExternos: string[];
}

const unicos = (xs: string[]): string[] => [...new Set(xs)].sort();

/** O navegador decodifica entidades nos atributos: `&amp;` e `&` são o mesmo link. */
export function decodificar(s: string): string {
  return s.replace(/&(amp|quot|lt|gt|#0*39|#x0*27);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    return k === 'amp' ? '&' : k === 'quot' ? '"' : k === 'lt' ? '<' : k === 'gt' ? '>' : "'";
  });
}

/** Atributos de uma tag de abertura: nome (minúsculo) → valor (sem aspas). */
export function atributosDe(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const corpo = tag.replace(/^<\s*[\w-]+/, '').replace(/\/?>$/, '');
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo))) {
    const nome = m[1].toLowerCase();
    if (!(nome in out)) out[nome] = decodificar(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Texto entre o "(" que começa em `inicio` e o ")" que fecha (conta parênteses e aspas). */
function argumento(texto: string, inicio: number): string {
  let prof = 0;
  let aspas: string | null = null;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '\\') { i++; continue; }
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { aspas = c; continue; }
    if (c === '(') prof++;
    else if (c === ')') { prof--; if (prof === 0) return texto.slice(inicio + 1, i); }
  }
  return texto.slice(inicio + 1);
}

const normaliza = (s: string): string => s.replace(/\s+/g, ' ').trim();

function camposDe(htmlDoForm: string): CampoContrato[] {
  const campos: CampoContrato[] = [];
  const re = /<(input|select|textarea|button)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(htmlDoForm))) {
    const tag = m[1].toLowerCase();
    const a = atributosDe(m[0]);
    if (!a.name) continue;
    const type = tag === 'input' ? (a.type || 'text').toLowerCase()
      : tag === 'button' ? `button:${(a.type || 'submit').toLowerCase()}${a.value !== undefined ? `=${a.value}` : ''}`
      : tag;
    campos.push({ name: a.name, type });
  }
  return campos.sort((x, y) => (x.name + x.type).localeCompare(y.name + y.type));
}

export function contratoDaTela(html: string): ContratoTela {
  // Formulários
  const formularios: FormContrato[] = [];
  const reForm = /<form\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = reForm.exec(html))) {
    const a = atributosDe(m[0]);
    const fim = html.indexOf('</form>', m.index);
    const dentro = html.slice(m.index + m[0].length, fim === -1 ? undefined : fim);
    formularios.push({
      method: (a.method || 'GET').toUpperCase(),
      action: a.action ?? '',
      enctype: a.enctype ?? '',
      campos: camposDe(dentro),
    });
  }
  formularios.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

  // Código que roda: <script> inline + atributos on*="…"
  const scripts: string[] = [];
  const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const externos: string[] = [];
  while ((m = reScript.exec(html))) {
    const a = atributosDe(`<script ${m[1]}>`);
    if (a.src) externos.push(a.src);
    else if (!/application\/(ld\+)?json/i.test(a.type ?? '')) scripts.push(m[2]);
  }
  const reOn = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
  while ((m = reOn.exec(html))) scripts.push(decodificar(m[2] ?? m[3] ?? ''));
  const codigo = scripts.join('\n');

  const fetches: string[] = [];
  const confirms: string[] = [];
  const reChamada = /\b(fetch|confirm)\s*\(/g;
  while ((m = reChamada.exec(codigo))) {
    const arg = argumento(codigo, m.index + m[0].length - 1);
    if (m[1] === 'fetch') fetches.push(normaliza(arg.split(/,\s*\{/)[0]));
    else confirms.push(normaliza(arg));
  }

  const ids: string[] = [];
  const seletores: string[] = [];
  const dataAttrs: string[] = [];
  const reId = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reId.exec(codigo))) ids.push(m[1]);
  const reSel = /(?:querySelector(?:All)?|closest)\(\s*(['"])(.*?)\1\s*\)/g;
  while ((m = reSel.exec(codigo))) {
    seletores.push(m[2]);
    for (const h of m[2].matchAll(/#([\w-]+)/g)) ids.push(h[1]);
    for (const d of m[2].matchAll(/\[(data-[\w-]+)/g)) dataAttrs.push(d[1]);
  }
  const reSort = /\b(draggable|handle|filter)\s*:\s*(['"])(.*?)\2/g;
  while ((m = reSort.exec(codigo))) seletores.push(`${m[1]}:${m[3]}`);
  const reDataset = /\.dataset\.([A-Za-z]\w*)/g;
  while ((m = reDataset.exec(codigo))) dataAttrs.push('data-' + m[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));

  const idsNaPagina = new Set<string>();
  const reIdAttr = /\sid\s*=\s*["']([^"']+)["']/g;
  while ((m = reIdAttr.exec(html))) idsNaPagina.add(m[1]);

  const links: string[] = [];
  const reHref = /href\s*=\s*["'](\/dashboard[^"']*)["']/g;
  while ((m = reHref.exec(html))) links.push(decodificar(m[1]));

  const idsU = unicos(ids);
  return {
    formularios,
    fetches: unicos(fetches),
    links: unicos(links),
    ids: idsU,
    idsAusentes: idsU.filter((i) => !idsNaPagina.has(i)),
    seletores: unicos(seletores),
    dataAttrs: unicos(dataAttrs),
    confirms: unicos(confirms),
    scriptsExternos: unicos(externos),
  };
}

// ---------------------------------------------------------------------------
// Mudança DELIBERADA de contrato (decisão do Junior), escrita às claras.
// O JSON gravado da tela antiga NÃO é regravado: o teste aplica aqui o que
// saiu e o que entrou, item por item — quem revisa vê exatamente a troca.
// ---------------------------------------------------------------------------
export interface MudancaContrato {
  /** Por quê (vai na mensagem do teste). */
  motivo: string;
  sai?: Partial<Record<Exclude<keyof ContratoTela, 'formularios'>, string[]>> & { formularios?: FormContrato[] };
  entra?: Partial<Record<Exclude<keyof ContratoTela, 'formularios'>, string[]>> & { formularios?: FormContrato[] };
  /**
   * Sai SE estiver no contrato gravado (não lança se não estiver). Só para
   * mudança do MENU LATERAL que depende do papel do usuário do caso (um item
   * pode já estar escondido naquele papel) — nunca para o miolo da tela.
   */
  saiSeHouver?: Partial<Record<'links', string[]>>;
}

export function aplicarMudancas(base: ContratoTela, ...mudancas: MudancaContrato[]): ContratoTela {
  const out: ContratoTela = JSON.parse(JSON.stringify(base));
  const chaveForm = (f: FormContrato) => JSON.stringify(f);
  for (const m of mudancas) {
    for (const [k, v] of Object.entries(m.saiSeHouver ?? {})) {
      (out as any)[k] = ((out as any)[k] as string[]).filter((x) => !(v as string[]).includes(x));
    }
    for (const [k, v] of Object.entries(m.sai ?? {})) {
      if (k === 'formularios') {
        const tira = new Set((v as FormContrato[]).map(chaveForm));
        for (const f of v as FormContrato[]) {
          if (!out.formularios.some((x) => chaveForm(x) === chaveForm(f))) throw new Error(`[${m.motivo}] formulário que devia sair não existia: ${chaveForm(f)}`);
        }
        out.formularios = out.formularios.filter((x) => !tira.has(chaveForm(x)));
      } else {
        const lista = (out as any)[k] as string[];
        for (const item of v as string[]) {
          if (!lista.includes(item)) throw new Error(`[${m.motivo}] "${item}" devia sair de ${k}, mas não existia`);
        }
        (out as any)[k] = lista.filter((x) => !(v as string[]).includes(x));
      }
    }
    for (const [k, v] of Object.entries(m.entra ?? {})) {
      if (k === 'formularios') {
        out.formularios = [...out.formularios, ...(v as FormContrato[])]
          .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      } else {
        (out as any)[k] = unicos([...(out as any)[k], ...(v as string[])]);
      }
    }
  }
  return out;
}
