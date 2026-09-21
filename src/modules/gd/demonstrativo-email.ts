// Reconhece, no webhook `email.received` da Resend, os e-mails que NAO sao
// resposta de cliente e precisam de outro caminho:
//   - o demonstrativo de GD da Neoenergia (encaminhado pelo filtro do Gmail);
//   - a confirmacao de encaminhamento do proprio Gmail (traz o codigo).
// Tudo que nao casar aqui segue pro fluxo de resposta de cliente, sem mudanca.
//
// Funcao PURA — ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

export interface DadosAssunto {
  referencia: string; // YYYY-MM-01
  nome: string;
  codigoCliente: string;
  instalacao: string;
}

export type EmailGd =
  | { tipo: 'demonstrativo'; emailId: string | null; assunto: DadosAssunto | null }
  | { tipo: 'confirmacao_gmail'; emailId: string | null; codigo: string | null };

const RE_DEMONSTRATIVO = /Demonstrativo do Faturamento/i;

/**
 * "Mini e Microgeração - Demonstrativo do Faturamento2026-08- NOME  - 2282817 - 1279110 - Neoenergia BRASÍLIA"
 * → { referencia: '2026-08-01', nome, codigoCliente: '2282817', instalacao: '1279110' }
 */
export function dadosDoAssunto(assunto: string): DadosAssunto | null {
  const m = /Demonstrativo do Faturamento\s*(\d{4})-(\d{2})-\s*(.+?)\s+-\s+(\d+)\s+-\s+(\d+)\s+-\s+Neoenergia/i.exec(
    assunto ?? '',
  );
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return {
    referencia: `${m[1]}-${m[2]}-01`,
    nome: m[3].replace(/\s+/g, ' ').trim(),
    codigoCliente: m[4],
    instalacao: m[5],
  };
}

function enderecos(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : v ? [v] : [];
  return lista
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') {
        const o = x as { address?: string; email?: string };
        return o.address ?? o.email ?? '';
      }
      return '';
    })
    .map((s) => {
      const m = /<([^>]+)>/.exec(s);
      return (m ? m[1] : s).trim().toLowerCase();
    })
    .filter(Boolean);
}

export function classificarEmailGd(body: unknown): EmailGd | null {
  const b = body as { type?: string; data?: Record<string, unknown> } | null;
  if (b?.type !== 'email.received' || !b.data) return null;
  const d = b.data;
  const assunto = typeof d.subject === 'string' ? d.subject : '';
  const de = enderecos(d.from)[0] ?? '';
  const emailId = typeof d.email_id === 'string' ? d.email_id : typeof d.id === 'string' ? d.id : null;

  if (de === 'forwarding-noreply@google.com') {
    const cod = /\(#(\d+)\)/.exec(assunto);
    return { tipo: 'confirmacao_gmail', emailId, codigo: cod ? cod[1] : null };
  }

  // So o remetente da Neoenergia. (O encaminhamento automatico do Gmail
  // preserva From e To originais — o faturas@ nem aparece no To, entao aceitar
  // "To: faturas@" so abria porta pra e-mail forjado.) O From ainda pode ser
  // forjado: a prova de verdade e o DKIM no e-mail bruto, conferido na ingestao.
  if (RE_DEMONSTRATIVO.test(assunto) && de.endsWith('@neoenergia.com')) {
    return { tipo: 'demonstrativo', emailId, assunto: dadosDoAssunto(assunto) };
  }
  return null;
}

export type ResultadoDkim = 'pass' | 'fail' | 'desconhecido';

/** Resultado de UMA assinatura DKIM, no formato do mailauth (dkimVerify().results). */
export interface AssinaturaDkim {
  signingDomain: string;
  status: { result: string };
}

export function dominioNeoenergia(d: string): boolean {
  const x = (d ?? '').trim().toLowerCase().replace(/\.$/, '');
  return x === 'neoenergia.com' || x.endsWith('.neoenergia.com');
}

/**
 * Interpreta a conferencia DKIM feita no E-MAIL BRUTO (mailauth consulta a
 * chave publica no DNS — nao da pra forjar escrevendo cabecalho).
 * O encaminhamento automatico do Gmail preserva a assinatura original.
 *   pass         — uma assinatura de neoenergia.com conferiu
 *   fail         — havia assinatura de neoenergia.com e ela NAO conferiu (adulterado/forjado)
 *   desconhecido — sem assinatura da Neoenergia (ou erro temporario de DNS): nao prova nada
 */
export function interpretarDkim(resultados: AssinaturaDkim[] | null | undefined): ResultadoDkim {
  const neo = (resultados ?? []).filter((r) => dominioNeoenergia(r.signingDomain));
  if (neo.some((r) => r.status?.result === 'pass')) return 'pass';
  if (neo.some((r) => r.status?.result === 'fail')) return 'fail';
  return 'desconhecido';
}
