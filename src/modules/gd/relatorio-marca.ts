// Marca da empresa no relatório de GD. Cada tenant sai com a SUA marca: logo
// da EcoSun só aparece no PDF da própria EcoSun (vazamento de marca foi o
// problema de set/2026 — ver dashboard/marca-empresa.ts).

import type { EmpresaConfig } from '../empresa-config.js';
import { ehEcosun } from '../empresa-config.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64, LOGO_VAZIA } from '../proposal/assets/logo-base64.js';
import { LOGO_PASTA_BASE64 } from '../relatorios/pasta/logo-pasta.js';

export interface MarcaRelatorio {
  nomeFantasia: string;
  /** data: URI ou URL https; null = escrever o nome da empresa. */
  logoSrc: string | null;
  cor: string;
  telefone: string | null;
  email: string;
  site: string;
  rodapeRt: string;
  /** true = logo "ecosun png" (prata, feita pra fundo escuro) — não precisa de caixa branca. */
  ehCasa?: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;
const COR_PADRAO = '#16304F';

export function telefoneBonito(t: string | null): string | null {
  if (!t) return null;
  const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export async function marcaDoRelatorio(
  e: EmpresaConfig,
  deps: { baixarLogo: (caminho: string) => Promise<string | null> },
): Promise<MarcaRelatorio> {
  const casa = ehEcosun(e);
  const caminho = (e.logoStoragePath ?? '').trim();
  let logoSrc: string | null = null;
  // Só https: o Puppeteer busca a URL no servidor; http:// (sem TLS) fica sem logo.
  if (/^https:\/\//i.test(caminho)) {
    logoSrc = caminho;
  } else if (caminho && !/^[a-z]+:/i.test(caminho)) {
    const baixada = await deps.baixarLogo(caminho);
    // obterLogoBase64 devolve logo da EcoSun (antiga ou nova) quando falha: num tenant isso é vazamento.
    const ehLogoDaCasa = baixada === LOGO_ECOSUNPOWER_BRANCO_BASE64 || baixada === LOGO_PASTA_BASE64;
    // LOGO_VAZIA = tenant sem logo (falha no download): escreve o nome no lugar.
    logoSrc = baixada && baixada !== LOGO_VAZIA && (casa || !ehLogoDaCasa) ? baixada : null;
  } else if (!caminho && casa) {
    logoSrc = LOGO_PASTA_BASE64;
  }
  const cor = HEX.test((e.corMarca ?? '').trim()) ? (e.corMarca as string).trim() : COR_PADRAO;
  const rt = [e.rtNome, e.rtTitulo, e.rtRegistro ? `registro ${e.rtRegistro}` : null].filter(Boolean).join(' — ');
  return {
    nomeFantasia: e.nomeFantasia,
    logoSrc,
    cor,
    telefone: telefoneBonito(e.telefoneAtendente),
    email: e.email,
    site: e.siteUrl.replace(/^https?:\/\//, ''),
    rodapeRt: rt,
    ehCasa: casa,
  };
}
