// tests/helpers/teto-tailwind.ts
// Detector de utilitário Tailwind no miolo das telas renovadas (usado pelo
// teto tests/miolo-sem-tailwind.test.ts e pelos testes de cada fatia).
// Exceção só com comentário `// tailwind-ok: <motivo>` na MESMA linha.

export const RE_TAILWIND = /\b(bg|text|border|ring|from|to)-(white|black|slate|gray|zinc|sky|cyan|amber|emerald|rose|red|green|yellow|indigo|violet)(-\d{2,3})?\b|\b(p|px|py|m|mx|my|mt|mb|gap|space-[xy])-\d|\brounded(-\w+)?\b|\bgrid-cols-\d/;

/** Corpo (texto) de uma função `function nome(`, casando parênteses e chaves. */
export function corpoDaFuncao(fonte: string, nome: string): string {
  const i = fonte.search(new RegExp(`function ${nome}\\s*[(<]`));
  if (i === -1) throw new Error(`função ${nome} não encontrada`);
  // Pula a assinatura inteira (parâmetro pode ter objeto literal e default com
  // chamada). O corpo é o 1º "{" depois dela.
  let p = 0; let j = fonte.indexOf('(', i);
  for (; j < fonte.length; j++) { if (fonte[j] === '(') p++; else if (fonte[j] === ')') { p--; if (p === 0) break; } }
  const abre = fonte.indexOf('{', j);
  let prof = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === '{') prof++;
    else if (fonte[k] === '}') { prof--; if (prof === 0) return fonte.slice(abre, k + 1); }
  }
  return fonte.slice(abre);
}

/** Linhas do trecho que têm utilitário Tailwind (fora comentários e `tailwind-ok`). */
export function linhasComTailwind(trecho: string): string[] {
  return trecho.split('\n')
    .filter((l) => !l.includes('tailwind-ok'))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => RE_TAILWIND.test(l))
    .map((l) => l.trim().slice(0, 140));
}
