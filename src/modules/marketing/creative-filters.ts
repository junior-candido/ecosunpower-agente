// src/modules/marketing/creative-filters.ts
import type { CreativePackage, Persona, FilterResult, CreativeFilterResults } from './types.js';

function copyTexts(pkg: CreativePackage): string {
  return pkg.copies.map((c) => `${c.headline} ${c.body} ${c.cta}`).join(' ');
}

export function blocklistFilter(pkg: CreativePackage, persona: Persona): FilterResult {
  const text = copyTexts(pkg).toLowerCase();
  for (const palavra of persona.palavras_proibidas) {
    if (text.includes(palavra.toLowerCase())) {
      return { passed: false, reason: `Palavra proibida encontrada: "${palavra}"` };
    }
  }
  return { passed: true };
}

const ENGENHEIRO_REGEX = /\bengenheir[oa]s?\b/i;

export function marcaFilter(pkg: CreativePackage): FilterResult {
  const text = copyTexts(pkg);
  if (ENGENHEIRO_REGEX.test(text)) {
    return { passed: false, reason: 'Use "Responsável Técnico CREA/CFT" em vez de "engenheiro"' };
  }
  return { passed: true };
}

const CRIT_700_REGEX = /R\$\s*700|700\s*reais|acima de R\$\s*[5-9]\d\d|conta alta/i;

export function criterio700Filter(pkg: CreativePackage, persona: Persona): FilterResult {
  if (persona.conta_minima_brl === 0) return { passed: true };  // off-grid nao precisa
  const text = copyTexts(pkg);
  if (!CRIT_700_REGEX.test(text)) {
    return { passed: true, reason: 'Nao menciona criterio R$ 700 — info, nao bloqueio' };
  }
  return { passed: true };
}

export function applyAllFilters(pkg: CreativePackage, persona: Persona): CreativeFilterResults {
  const blocklist = blocklistFilter(pkg, persona);
  const marca = marcaFilter(pkg);
  const criterio_700 = criterio700Filter(pkg, persona);
  const overall_passed = blocklist.passed && marca.passed && criterio_700.passed;
  return { blocklist, marca, criterio_700, overall_passed };
}
