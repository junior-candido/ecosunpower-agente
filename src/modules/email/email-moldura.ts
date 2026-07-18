// src/modules/email/email-moldura.ts
// Moldura de newsletter aplicada aos e-mails da jornada (email-sequence.ts) e
// às campanhas. Visual APROVADO pelo Junior 18/07 (preview "agora sim top"):
// header navy com a logo do ECOSSISTEMA (fundo transparente) + filete âmbar,
// imagem hero opcional, bloco de título opcional, conteúdo, CTA âmbar opcional,
// "Do nosso blog" em cards brancos e rodapé navy digno.
// HTML "email-client-safe": tabela única de 600px, TODO estilo inline, sem
// <style>/JS/fonte externa (Gmail/Outlook cortam ou ignoram isso).

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
  /** Imagem grande logo abaixo do header (campanha: FLUX; jornada: opcional). */
  heroImageUrl?: string;
  heroImageAlt?: string;
  /** Bloco de título: kicker (linha pequena âmbar) + título grande. */
  kicker?: string;
  titulo?: string;
  /** Botão CTA âmbar centralizado após o conteúdo. */
  ctaLabel?: string;
  ctaUrl?: string;
  ctaNota?: string;
  /** 💡 Dica de ouro: box destacado, linguagem simples, tira-dúvida (Junior 18/07). */
  dica?: { titulo: string; texto: string };
}

const NAVY = '#0b1220';         // header/rodapé
const AMBAR = '#e0a13a';        // filete/CTA/links
const TEXTO = '#2a3644';        // corpo
const FUNDO_PAGINA = '#e9edf2';
const FUNDO_BLOG = '#f2f5f8';
const FONTE = 'Arial, Helvetica, sans-serif';

// Logo oficial: a MESMA que o site usa no header/footer (fundo transparente).
const LOGO_PADRAO = 'https://www.ecosunpower.eng.br/logo-ecosun-ecossistema.png';
const SITE_PADRAO = 'https://www.ecosunpower.eng.br';

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function secaoHero(opts: MolduraOpts): string {
  if (!opts.heroImageUrl) return '';
  return `
            <tr>
              <td style="padding:0; line-height:0;">
                <img src="${escapeHtml(opts.heroImageUrl)}" alt="${escapeHtml(opts.heroImageAlt ?? 'Energia solar')}" width="600" style="display:block; width:100%; height:auto; border:0;" />
              </td>
            </tr>`;
}

function secaoTitulo(opts: MolduraOpts): string {
  if (!opts.titulo) return '';
  const kicker = opts.kicker
    ? `<p style="margin:0 0 6px; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${AMBAR}; font-weight:bold;">${escapeHtml(opts.kicker)}</p>`
    : '';
  return `
            <tr>
              <td style="padding:30px 40px 4px; font-family:${FONTE};">
                ${kicker}
                <h1 style="margin:0; font-size:26px; line-height:1.25; color:${NAVY};">${escapeHtml(opts.titulo)}</h1>
              </td>
            </tr>`;
}

function secaoCta(opts: MolduraOpts): string {
  if (!opts.ctaLabel || !opts.ctaUrl) return '';
  const nota = opts.ctaNota
    ? `<p style="margin:12px 0 0; font-family:${FONTE}; font-size:12px; color:#8a94a3;">${escapeHtml(opts.ctaNota)}</p>`
    : '';
  return `
            <tr>
              <td align="center" style="padding:22px 40px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:${AMBAR}; border-radius:8px;">
                      <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block; padding:15px 34px; font-family:${FONTE}; font-size:16px; font-weight:bold; color:${NAVY}; text-decoration:none;">${escapeHtml(opts.ctaLabel)}&nbsp;&rarr;</a>
                    </td>
                  </tr>
                </table>
                ${nota}
              </td>
            </tr>`;
}

function secaoDica(opts: MolduraOpts): string {
  if (!opts.dica) return '';
  return `
            <tr>
              <td style="padding:6px 40px 10px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#fbf6ec; border-left:4px solid ${AMBAR}; border-radius:0 8px 8px 0; padding:16px 18px; font-family:${FONTE};">
                      <p style="margin:0 0 4px; font-size:13px; letter-spacing:1px; text-transform:uppercase; font-weight:bold; color:${AMBAR};">💡 Dica de ouro</p>
                      <p style="margin:0; font-size:15px; line-height:1.55; color:${TEXTO};"><strong style="color:${NAVY};">${escapeHtml(opts.dica.titulo)}</strong> ${escapeHtml(opts.dica.texto)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

function secaoNoticias(noticias: NoticiaBlog[]): string {
  if (noticias.length === 0) return '';
  const cards = noticias
    .slice(0, 3)
    .map(
      (n) => `
                  <tr>
                    <td style="background:#ffffff; border-radius:8px; padding:14px 16px; font-family:${FONTE};">
                      <a href="${escapeHtml(n.link)}" style="text-decoration:none;">
                        <span style="display:block; font-size:15px; font-weight:bold; color:${NAVY}; line-height:1.4;">${escapeHtml(n.titulo)}</span>
                        <span style="display:block; margin-top:4px; font-size:13px; color:${AMBAR}; font-weight:bold;">Ler artigo &rarr;</span>
                      </a>
                    </td>
                  </tr>
                  <tr><td style="height:8px; line-height:8px; font-size:0;">&nbsp;</td></tr>`,
    )
    .join('');

  return `
            <tr>
              <td style="background:${FUNDO_BLOG}; padding:26px 40px 16px;">
                <p style="margin:0 0 14px; font-family:${FONTE}; font-size:13px; letter-spacing:1.5px; text-transform:uppercase; font-weight:bold; color:${NAVY};">📰 Do nosso blog</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}
                </table>
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
  <body style="margin:0; padding:0; background:${FUNDO_PAGINA};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO_PAGINA}; padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="background:${NAVY}; padding:26px 32px 22px; text-align:center;">
                <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(empresa)}" width="210" style="display:block; margin:0 auto; border:0; max-width:210px; height:auto;" />
              </td>
            </tr>
            <tr><td style="background:${AMBAR}; height:4px; line-height:4px; font-size:0;">&nbsp;</td></tr>${secaoHero(opts)}${secaoTitulo(opts)}
            <tr>
              <td style="background:#ffffff; padding:20px 40px 8px; color:${TEXTO}; font-family:${FONTE}; font-size:16px; line-height:1.65;">
                ${opts.conteudoHtml}
              </td>
            </tr>${secaoDica(opts)}${secaoCta(opts)}${secaoNoticias(opts.noticias ?? [])}
            <tr>
              <td style="background:${NAVY}; padding:22px 40px; text-align:center; font-family:${FONTE};">
                <p style="margin:0 0 6px; font-size:13px; color:#c9d2dc; font-weight:bold;">${escapeHtml(empresa)} — energia solar de ponta a ponta</p>
                <p style="margin:0 0 10px; font-size:12px;"><a href="${escapeHtml(siteUrl)}" style="color:${AMBAR}; text-decoration:none;">${escapeHtml(siteLabel)}</a></p>
                <p style="margin:0; font-size:11px; color:#6b7686;">Você recebe este e-mail porque conversou com a gente sobre energia solar.<br/>Não quer mais receber? <a href="${escapeHtml(opts.linkDescadastro)}" style="color:#8a94a3;">Descadastrar</a></p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0; font-family:${FONTE}; font-size:11px; color:#9aa4b0;">© ${escapeHtml(empresa)} · Brasília-DF</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
