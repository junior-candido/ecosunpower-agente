// src/modules/email/email-moldura.ts
// Moldura de newsletter aplicada aos 6 e-mails da jornada (email-sequence.ts):
// cabecalho com logo, o corpo do step (conteudoHtml), secao opcional de
// novidades do blog e rodape com descadastro. HTML "email-client-safe":
// tabela unica de 600px, TODO estilo inline, sem <style>/JS/fonte externa
// (Gmail/Outlook cortam ou ignoram isso).

export interface NoticiaBlog {
  titulo: string;
  link: string;
}

export interface MolduraOpts {
  conteudoHtml: string;
  linkDescadastro: string;
  noticias?: NoticiaBlog[];
  empresa?: string;
  siteUrl?: string;
  logoUrl?: string;
}

const COR_HEADER = '#0d1b2a';   // navy escuro
const COR_DESTAQUE = '#e0a13a'; // ambar da marca (links/CTA)
const COR_FUNDO_NOTICIAS = '#f4f6f8';
const COR_TEXTO_RODAPE = '#8a94a3';

const LOGO_PADRAO = 'https://www.ecosunpower.eng.br/logo-ecosunpower-white.png';
const SITE_PADRAO = 'https://www.ecosunpower.eng.br';

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function montarSecaoNoticias(noticias: NoticiaBlog[]): string {
  if (noticias.length === 0) return '';
  const itens = noticias
    .slice(0, 3)
    .map(
      (n) => `
        <p style="margin:0 0 10px; font-size:14px; line-height:1.5;">
          <a href="${escapeHtml(n.link)}" style="color:${COR_DESTAQUE}; text-decoration:none;">${escapeHtml(n.titulo)}</a>
        </p>`,
    )
    .join('');

  return `
    <tr>
      <td style="background:${COR_FUNDO_NOTICIAS}; padding:24px 32px;">
        <p style="margin:0 0 14px; font-size:14px; font-weight:bold; color:${COR_HEADER};">📰 Novidades do blog</p>
        ${itens}
      </td>
    </tr>`;
}

export function montarMolduraEmail(opts: MolduraOpts): string {
  const empresa = opts.empresa?.trim() || 'EcoSunPower';
  const siteUrl = opts.siteUrl?.trim() || SITE_PADRAO;
  const logoUrl = opts.logoUrl?.trim() || LOGO_PADRAO;
  const siteLabel = siteUrl.replace(/^https?:\/\//, '');

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0; padding:0; background:#eef1f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:${COR_HEADER}; padding:24px 32px; text-align:center;">
                <img src="${logoUrl}" alt="${escapeHtml(empresa)}" width="180" style="display:block; margin:0 auto; border:0; outline:none; text-decoration:none; max-width:180px; height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff; padding:32px; color:${COR_HEADER}; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6;">
                ${opts.conteudoHtml}
              </td>
            </tr>${montarSecaoNoticias(opts.noticias ?? [])}
            <tr>
              <td style="padding:20px 32px; text-align:center; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:${COR_TEXTO_RODAPE};">
                <p style="margin:0 0 6px;">${escapeHtml(empresa)} &middot; <a href="${siteUrl}" style="color:${COR_TEXTO_RODAPE};">${escapeHtml(siteLabel)}</a></p>
                <p style="margin:0;">Não quer mais receber? <a href="${opts.linkDescadastro}" style="color:${COR_DESTAQUE};">Descadastrar</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
