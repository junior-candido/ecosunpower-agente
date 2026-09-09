// src/modules/relatorios/pasta/email.ts
//
// O E-MAIL DA PASTA DIGITAL — um botão, nenhum anexo.
//
// Junior, entregando a usina da Tatiane (09/09/2026): "quero enviar pelo zap e
// por email agora" · "no email, poderá mandar somente o link de abrir a pasta
// camuflado, tenha acesso ao ebook pós instalação" · "e no email deve ter um
// quadro bonitinho, minha logo, parabéns por ter escolhido a EcoSunPower, o
// número da agente virtual, o meu número, instagram, link de avaliação" ·
// "tipo dando os parabéns ao cliente por ter escolhido a EcoSunPower, um
// desenho da jornada dele" · "informando por que ele deve guardar esse
// documento".
//
// O WhatsApp já entregava a pasta assim (template `pasta_digital_v1`, com botão
// apontando pra /pasta/<slug>). O e-mail não existia — esta é a metade que
// faltava, e usa exatamente o MESMO link.
//
// POR QUE NENHUM ANEXO: o material da usina passa de 20 MB (projeto, TRT,
// parecer, fotos aéreas, manuais). Anexo desse tamanho volta como bounce em
// boa parte dos provedores — e bounce é silencioso, ninguém fica sabendo. No
// link o cliente abre do celular, quantas vezes quiser, e a gente ainda vê o
// acesso (`incrementarAcessoPasta`).
//
// POR QUE TUDO EM <table>: Gmail, Outlook e o app do iPhone descartam SVG,
// flexbox e grid. A jornada é desenhada com tabela e círculo de borda
// arredondada, que é o que sobrevive em todo cliente de e-mail.
import { escapeHtml } from '../../email/email-moldura.js';

const NAVY = '#0b1220';
const AMBAR = '#e0a13a';
const TEXTO = '#2a3644';
const SUAVE = '#5b6878';
const VERDE = '#1b7a57';

export interface DadosEmailPasta {
  primeiroNome: string;
  /** O mesmo link do WhatsApp: <base>/pasta/<slug>. */
  link: string;
  empresa: string;
  /** Assistente virtual — atende a qualquer hora. */
  telefoneAssistente?: string;
  /** O responsável técnico, pra quando a pessoa quiser falar com gente. */
  telefoneResponsavel?: string;
  nomeResponsavel?: string;
  instagramUrl?: string;
  avaliacaoUrl?: string;
}

/** As etapas que o cliente percorreu, da proposta até a usina girando. */
export const JORNADA: ReadonlyArray<{ titulo: string; detalhe: string }> = [
  { titulo: 'Estudo e proposta', detalhe: 'Olhamos sua conta de luz e dimensionamos o sistema certo pra você' },
  { titulo: 'Contrato assinado', detalhe: 'Combinado fechado, prazos e condições no papel' },
  { titulo: 'Projeto elétrico', detalhe: 'Engenharia, memorial e a documentação técnica da sua usina' },
  { titulo: 'Aprovação na concessionária', detalhe: 'Parecer de acesso aprovado — autorização pra ligar na rede' },
  { titulo: 'Instalação', detalhe: 'Equipe própria no seu telhado, com registro de cada etapa' },
  { titulo: 'Troca do medidor', detalhe: 'A concessionária instalou o medidor que conta os dois sentidos' },
  { titulo: 'Sua usina gerando', detalhe: 'Pronto: a partir de agora ela trabalha todo dia por você' },
];

/** Por que guardar o material — cada motivo é um momento em que ele é pedido. */
export const MOTIVOS_GUARDAR: ReadonlyArray<string> = [
  'Para <strong>acionar garantia</strong>: o fabricante pede a nota fiscal e o número de série dos equipamentos.',
  'Para <strong>vender ou alugar o imóvel</strong>: a usina valoriza a casa, e quem compra quer ver o projeto.',
  'Para <strong>ampliar o sistema</strong> depois: quem for projetar precisa saber exatamente o que já existe.',
  'Para <strong>contratar seguro</strong>: a seguradora pede o projeto e a nota fiscal.',
  'Para <strong>trocar a titularidade</strong> na concessionária, se a casa mudar de dono.',
];

/** Assunto: a pessoa tem que reconhecer sem abrir. */
export function assuntoDaPasta(nomeCompleto: string, empresa: string): string {
  const primeiro = (nomeCompleto ?? '').trim().split(/\s+/)[0] ?? '';
  const marca = (empresa ?? '').trim() || 'EcoSunPower';
  return primeiro
    ? `${primeiro}, sua usina está no ar — todo o material da ${marca}`
    : `Sua usina está no ar — todo o material da ${marca}`;
}

/** Telefone brasileiro só com dígitos vira (61) 99880-5002. */
function formatarTelefone(bruto: string): string {
  const d = (bruto ?? '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto ?? '';
}

/** A jornada desenhada: círculo com ✓, linha ligando, último em destaque. */
export function jornadaHtml(): string {
  const linhas = JORNADA.map((etapa, i) => {
    const ultimo = i === JORNADA.length - 1;
    const cor = ultimo ? AMBAR : VERDE;
    const traco = ultimo
      ? ''
      : `<div style="width:2px; height:16px; background:#d5dde6; margin:4px auto 0;"></div>`;
    return `<tr>
      <td width="42" valign="top" style="padding:0 0 2px;">
        <div style="width:26px; height:26px; line-height:26px; border-radius:13px; background:${cor};
                    color:#ffffff; text-align:center; font-family:Arial,Helvetica,sans-serif;
                    font-size:14px; font-weight:bold;">&#10003;</div>
        ${traco}
      </td>
      <td valign="top" style="padding:0 0 14px;">
        <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:bold;
                  color:${ultimo ? NAVY : TEXTO};">${escapeHtml(etapa.titulo)}${ultimo ? ' &#9733;' : ''}</p>
        <p style="margin:2px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:14px;
                  line-height:1.5; color:${SUAVE};">${escapeHtml(etapa.detalhe)}</p>
      </td>
    </tr>`;
  }).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:#f4f7fa; border-radius:10px; margin:26px 0;">
    <tr><td style="padding:22px 22px 6px;">
      <p style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif; font-size:13px;
                letter-spacing:.08em; text-transform:uppercase; color:#8a97a6;">O caminho que percorremos juntos</p>
    </td></tr>
    <tr><td style="padding:0 22px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
    </td></tr>
  </table>`;
}

/** O box do "guarde isso" — com o motivo, não só o pedido. */
export function guardarHtml(): string {
  const itens = MOTIVOS_GUARDAR.map(
    (m) => `<li style="margin-bottom:9px;">${m}</li>`,
  ).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #e3e9f0; border-left:4px solid ${NAVY}; border-radius:10px; margin:26px 0;">
    <tr><td style="padding:20px 22px;">
      <p style="margin:0 0 10px; font-family:Arial,Helvetica,sans-serif; font-size:17px;
                font-weight:bold; color:${NAVY};">&#128194; Guarde este link — você vai precisar dele</p>
      <p style="margin:0 0 12px; font-family:Arial,Helvetica,sans-serif; font-size:15px;
                line-height:1.6; color:${TEXTO};">
        Uma usina dura mais de 25 anos, e nesse tempo esses documentos são pedidos mais de uma vez:
      </p>
      <ul style="margin:0; padding-left:20px; font-family:Arial,Helvetica,sans-serif;
                 font-size:15px; line-height:1.6; color:${TEXTO};">${itens}</ul>
      <p style="margin:12px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:14px;
                line-height:1.6; color:${SUAVE};">
        O link não vence. Dá pra salvar nos favoritos do celular ou guardar este e-mail.
      </p>
    </td></tr>
  </table>`;
}

function linhaContato(emoji: string, titulo: string, valor: string, href?: string): string {
  const conteudo = href
    ? `<a href="${escapeHtml(href)}" style="color:${NAVY}; text-decoration:none; font-weight:bold;">${escapeHtml(valor)}</a>`
    : `<span style="color:${NAVY}; font-weight:bold;">${escapeHtml(valor)}</span>`;
  return `<tr>
    <td style="padding:9px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.4;">
      <span style="font-size:17px;">${emoji}</span>&nbsp;&nbsp;<span style="color:${SUAVE};">${escapeHtml(titulo)}</span><br>
      <span style="padding-left:27px; display:inline-block;">${conteudo}</span>
    </td>
  </tr>`;
}

/** O quadro de contatos: assistente, responsável técnico e Instagram. */
export function contatosHtml(d: DadosEmailPasta): string {
  const contatos: string[] = [];
  if (d.telefoneAssistente) {
    contatos.push(linhaContato('&#129302;', 'Nossa assistente, a qualquer hora',
      formatarTelefone(d.telefoneAssistente),
      `https://wa.me/${d.telefoneAssistente.replace(/\D/g, '')}`));
  }
  if (d.telefoneResponsavel) {
    const quem = d.nomeResponsavel
      ? `${d.nomeResponsavel} — Responsável Técnico`
      : 'Responsável Técnico';
    contatos.push(linhaContato('&#128119;', quem,
      formatarTelefone(d.telefoneResponsavel),
      `https://wa.me/${d.telefoneResponsavel.replace(/\D/g, '')}`));
  }
  if (d.instagramUrl) {
    const arroba = '@' + (d.instagramUrl.replace(/\/+$/, '').split('/').pop() ?? 'ecosunpower');
    contatos.push(linhaContato('&#128248;', 'Acompanhe as obras no Instagram', arroba, d.instagramUrl));
  }
  if (!contatos.length) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:#f4f7fa; border-radius:10px; border-left:4px solid ${AMBAR}; margin:26px 0 10px;">
    <tr><td style="padding:18px 22px 6px;">
      <p style="margin:0 0 4px; font-family:Arial,Helvetica,sans-serif; font-size:13px;
                letter-spacing:.08em; text-transform:uppercase; color:#8a97a6;">Quando precisar da gente</p>
    </td></tr>
    <tr><td style="padding:0 22px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${contatos.join('')}</table>
    </td></tr>
  </table>`;
}

/**
 * O corpo da carta — vai dentro de `montarMolduraEmail`, que já põe a logo no
 * topo. O link aparece também como texto: nem todo cliente de e-mail desenha
 * botão, e o material não pode depender disso pra ser alcançado.
 */
export function corpoDaPasta(d: DadosEmailPasta): string {
  const nome = escapeHtml((d.primeiroNome ?? '').trim());
  const marca = escapeHtml((d.empresa ?? '').trim() || 'EcoSunPower');
  const link = escapeHtml(d.link);
  const saudacao = nome ? `Parabéns, ${nome}!` : 'Parabéns!';

  const blocoAvaliacao = d.avaliacaoUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
         <tr><td align="center" style="padding:22px; background:#fff7e8; border-radius:10px;">
           <p style="margin:0 0 6px; font-family:Arial,Helvetica,sans-serif; font-size:16px;
                     font-weight:bold; color:${TEXTO};">Ficou satisfeito com o serviço?</p>
           <p style="margin:0 0 14px; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${SUAVE};">
             Sua avaliação ajuda outras famílias a confiarem na gente. Leva 30 segundos.
           </p>
           <a href="${escapeHtml(d.avaliacaoUrl)}"
              style="display:inline-block; background:${NAVY}; color:#ffffff; text-decoration:none;
                     font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold;
                     padding:12px 26px; border-radius:8px;">&#11088; Deixar minha avaliação</a>
         </td></tr>
       </table>`
    : '';

  return `
<p style="margin:0 0 14px; font-family:Arial,Helvetica,sans-serif; font-size:21px; font-weight:bold; color:${NAVY};">
  ${saudacao}
</p>
<p style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:1.65; color:${TEXTO};">
  Obrigado por ter escolhido a ${marca}. Sua usina está instalada, o medidor já foi trocado
  e o sistema está gerando — a partir de agora ele trabalha todo dia por você.
</p>
${jornadaHtml()}
<p style="margin:0 0 6px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:1.65; color:${TEXTO};">
  Reunimos <strong>tudo da sua usina num lugar só</strong>:
</p>
<ul style="margin:0 0 18px; padding-left:22px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:1.8; color:${TEXTO};">
  <li>O <strong>projeto elétrico</strong> completo e a <strong>documentação técnica</strong></li>
  <li>As <strong>fotos</strong> da instalação, inclusive as aéreas</li>
  <li>Os <strong>manuais</strong> e a <strong>garantia</strong> dos equipamentos</li>
  <li>A <strong>nota fiscal</strong> e a aprovação da concessionária</li>
</ul>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;">
  <tr><td align="center">
    <a href="${link}" style="display:inline-block; background:${AMBAR}; color:${NAVY}; text-decoration:none;
              font-family:Arial,Helvetica,sans-serif; font-size:17px; font-weight:bold;
              padding:15px 34px; border-radius:8px;">Acessar meu material &#8594;</a>
  </td></tr>
</table>
<p style="margin:0 0 8px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:${SUAVE}; text-align:center;">
  Abre pelo celular, quando quiser. Se o botão não funcionar, use este endereço:<br>
  <a href="${link}" style="color:${NAVY}; word-break:break-all;">${link}</a>
</p>
${guardarHtml()}
${contatosHtml(d)}
${blocoAvaliacao}
`.trim();
}
