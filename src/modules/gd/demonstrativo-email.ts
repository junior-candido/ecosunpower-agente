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
  const para = enderecos(d.to);
  const emailId = typeof d.email_id === 'string' ? d.email_id : typeof d.id === 'string' ? d.id : null;
  const paraFaturas = para.some((e) => e.startsWith('faturas@'));

  if (de === 'forwarding-noreply@google.com') {
    const cod = /\(#(\d+)\)/.exec(assunto);
    return { tipo: 'confirmacao_gmail', emailId, codigo: cod ? cod[1] : null };
  }

  if (RE_DEMONSTRATIVO.test(assunto) && (de.endsWith('@neoenergia.com') || paraFaturas)) {
    return { tipo: 'demonstrativo', emailId, assunto: dadosDoAssunto(assunto) };
  }
  return null;
}
