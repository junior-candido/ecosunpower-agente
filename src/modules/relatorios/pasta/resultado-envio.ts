// src/modules/relatorios/pasta/resultado-envio.ts
// A tela que aparece depois de um botão "Enviar" do dashboard: Pasta Digital
// e relatório mensal da usina (27/09/2026 — mesma tela, sem duplicar).
//
// 23/09/2026: o botão disparava zap + e-mail, mas só olhava o zap — se o
// e-mail não saía (cliente sem e-mail, provedor recusou), a tela redirecionava
// como se tudo tivesse ido. Agora cada canal mostra o que aconteceu de verdade.

export interface ResultadoCanal {
  ok: boolean;
  reason?: string;
  para?: string | null;
  /** Saiu, mas com ressalva que o operador precisa ler (ex.: foi como mensagem comum). */
  aviso?: string;
  /** Detalhe técnico do erro (mensagem do provedor), entre parênteses. */
  detalhe?: string;
}

export interface ResultadoEnvioPasta {
  pastaId: string;
  zap: ResultadoCanal;
  /** null = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  email: ResultadoCanal | null;
}

export interface TelaResultadoEnvio {
  tituloOk: string;
  tituloConfira: string;
  voltarHref: string;
  voltarTexto: string;
  zap: ResultadoCanal;
  email: ResultadoCanal | null;
  linkPublico?: string | null;
}

const MOTIVO_ZAP: Record<string, string> = {
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
  opt_out: 'cliente pediu pra não receber mensagens',
  sem_phone: 'cliente sem telefone cadastrado',
  telefone_invalido: 'o telefone do cliente está errado no cadastro (confira DDD e número)',
  ja_enviada: 'essa pasta já tinha sido enviada',
  sem_canal: 'a empresa ainda não conectou o WhatsApp dela (Configurações → WhatsApp) — a mensagem nunca sai pelo número de outra empresa',
  modelo_nao_aprovado: 'aguardando aprovação do modelo na Meta — e o cliente não falou com a gente nas últimas 24 horas, então a mensagem comum também não saiu',
  bloqueado_lgpd: 'esse número é de outra empresa da plataforma — bloqueado pela trava de privacidade (LGPD); confira o telefone do cliente',
  falha_envio: 'o WhatsApp recusou o envio',
};

const MOTIVO_EMAIL: Record<string, string> = {
  sem_email: 'o cliente não tem e-mail cadastrado',
  email_invalido: 'o e-mail do cliente está errado no cadastro',
  opt_out: 'cliente pediu pra não receber mensagens',
  falha_envio: 'o provedor de e-mail recusou o envio',
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
};

/** Motivo em português claro (SEM escapar — quem desenha escapa). Desconhecido volta cru. */
export function motivoEmPortugues(canal: 'zap' | 'email', reason: string | null | undefined): string {
  const mapa = canal === 'zap' ? MOTIVO_ZAP : MOTIVO_EMAIL;
  return mapa[reason ?? ''] ?? reason ?? 'erro desconhecido';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function linha(icone: string, canal: string, texto: string): string {
  return `<p style="font-size:17px;margin:10px 0">${icone} <strong>${canal}:</strong> ${texto}</p>`;
}

function linhaCanal(nome: string, tipo: 'zap' | 'email', r: ResultadoCanal): string {
  if (r.ok) {
    const ok = linha('✅', nome, `enviado${r.para ? ` para ${esc(r.para)}` : ''}.`);
    return r.aviso ? `${ok}<p style="font-size:15px;margin:-6px 0 12px 26px;color:#92400e">⚠️ ${esc(r.aviso)}</p>` : ok;
  }
  const detalhe = r.detalhe ? ` (${esc(r.detalhe)})` : '';
  return linha('❌', nome, `não saiu — ${esc(motivoEmPortugues(tipo, r.reason))}${detalhe}.`);
}

export function renderResultadoEnvio(r: TelaResultadoEnvio): string {
  const zap = linhaCanal('WhatsApp', 'zap', r.zap);
  const email = r.email === null
    ? linha('⚠️', 'E-mail', 'o e-mail não está configurado neste ambiente — só o WhatsApp foi tentado.')
    : linhaCanal('E-mail', 'email', r.email);
  const tudoOk = r.zap.ok && (r.email?.ok ?? false);
  const titulo = tudoOk ? r.tituloOk : r.tituloConfira;
  const link = r.linkPublico
    ? `<p style="font-size:15px;margin:14px 0">🔗 Link do cliente: <a class="link" href="${esc(r.linkPublico)}" target="_blank" rel="noopener">${esc(r.linkPublico)}</a></p>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1c2430}
a.voltar{display:inline-block;margin-top:18px;padding:10px 18px;background:#0f1b2d;color:#fff;border-radius:8px;text-decoration:none}
a.link{color:#0e7490;word-break:break-all}</style>
</head><body><h2>${esc(titulo)}</h2>${zap}${email}${link}
<a class="voltar" href="${esc(r.voltarHref)}">${esc(r.voltarTexto)}</a></body></html>`;
}

export function renderResultadoEnvioPasta(r: ResultadoEnvioPasta): string {
  return renderResultadoEnvio({
    tituloOk: 'Pasta enviada',
    tituloConfira: 'Envio da pasta — confira',
    voltarHref: `/dashboard/pastas/${r.pastaId}`,
    voltarTexto: '← voltar para a pasta',
    zap: r.zap,
    email: r.email,
  });
}
