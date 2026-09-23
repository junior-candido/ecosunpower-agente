// src/modules/relatorios/pasta/resultado-envio.ts
// A tela que aparece depois do botão "Enviar" da Pasta Digital no dashboard.
//
// 23/09/2026: o botão disparava zap + e-mail, mas só olhava o zap — se o
// e-mail não saía (cliente sem e-mail, provedor recusou), a tela redirecionava
// como se tudo tivesse ido. Agora cada canal mostra o que aconteceu de verdade.

export interface ResultadoCanal {
  ok: boolean;
  reason?: string;
  para?: string | null;
}

export interface ResultadoEnvioPasta {
  pastaId: string;
  zap: ResultadoCanal;
  /** null = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  email: ResultadoCanal | null;
}

const MOTIVO_ZAP: Record<string, string> = {
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
  opt_out: 'cliente pediu pra não receber mensagens',
  sem_phone: 'cliente sem telefone cadastrado',
  ja_enviada: 'essa pasta já tinha sido enviada',
};

const MOTIVO_EMAIL: Record<string, string> = {
  sem_email: 'o cliente não tem e-mail cadastrado',
  falha_envio: 'o provedor de e-mail recusou o envio',
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function linha(icone: string, canal: string, texto: string): string {
  return `<p style="font-size:17px;margin:10px 0">${icone} <strong>${canal}:</strong> ${texto}</p>`;
}

export function renderResultadoEnvioPasta(r: ResultadoEnvioPasta): string {
  const zap = r.zap.ok
    ? linha('✅', 'WhatsApp', `enviado${r.zap.para ? ` para ${esc(r.zap.para)}` : ''}.`)
    : linha('❌', 'WhatsApp', `não saiu — ${esc(MOTIVO_ZAP[r.zap.reason ?? ''] ?? r.zap.reason ?? 'erro desconhecido')}.`);

  let email: string;
  if (r.email === null) {
    email = linha('⚠️', 'E-mail', 'o e-mail não está configurado neste ambiente — só o WhatsApp foi tentado.');
  } else if (r.email.ok) {
    email = linha('✅', 'E-mail', `enviado${r.email.para ? ` para ${esc(r.email.para)}` : ''}.`);
  } else {
    email = linha('❌', 'E-mail', `não saiu — ${esc(MOTIVO_EMAIL[r.email.reason ?? ''] ?? r.email.reason ?? 'erro desconhecido')}.`);
  }

  const tudoOk = r.zap.ok && (r.email?.ok ?? false);
  const titulo = tudoOk ? 'Pasta enviada' : 'Envio da pasta — confira';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1c2430}
a{display:inline-block;margin-top:18px;padding:10px 18px;background:#0f1b2d;color:#fff;border-radius:8px;text-decoration:none}</style>
</head><body><h2>${titulo}</h2>${zap}${email}
<a href="/dashboard/pastas/${esc(r.pastaId)}">← voltar para a pasta</a></body></html>`;
}
