// Marca da empresa nos trechos de FUNDO ESCURO das propostas (solar e serviço).
// Compartilhado por template.ts e service-render.ts — 30/09/2026.
import { ehEcosun } from '../empresa-config.js';
import { escapeHtml } from './format.js';
import { LOGO_ECOSUNPOWER_DARK_BASE64, LOGO_VAZIA } from './assets/logo-base64.js';

/**
 * Marca no FUNDO ESCURO (topo, chamada final, rodapé) — 30/09/2026.
 * EcoSun: a logo prata de sempre (saída idêntica). Empresa cliente: a logo DELA
 * numa caixa clara (a logo comum some no fundo escuro); sem logo, o NOME escrito.
 * Nunca a logo da EcoSun num tenant.
 */
export function marcaFundoEscuro(cls: '' | ' cta' | ' foot', logo: string, nome: string): string {
  if (ehEcosun()) return `<img class="brand-logo${cls}" src="${LOGO_ECOSUNPOWER_DARK_BASE64}" alt="${escapeHtml(nome)}">`;
  // Só imagem embutida png/jpeg/webp chega ao src (defesa: hoje sempre vem de obterLogoBase64).
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) logo = LOGO_VAZIA;
  if (logo === LOGO_VAZIA) {
    const tam = cls === ' foot' ? 20 : cls === ' cta' ? 26 : 34;
    const centro = cls === ' cta' ? 'text-align:center;margin:0 auto 26px;' : cls === ' foot' ? 'margin-bottom:12px;' : '';
    return `<div class="brand-name${cls}" style="${centro}font-size:${tam}px;font-weight:800;color:#fff;letter-spacing:.2px">${escapeHtml(nome)}</div>`;
  }
  return `<img class="brand-logo${cls}" src="${logo}" alt="${escapeHtml(nome)}" style="background:#fff;padding:8px 14px;border-radius:12px;filter:none;box-sizing:content-box">`;
}

