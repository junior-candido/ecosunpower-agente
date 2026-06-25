// src/modules/phone.ts
// Utilitário de telefone focado em DEDUPLICAÇÃO de lead.
//
// O problema: o mesmo celular brasileiro pode chegar em formatos diferentes —
// com o 9º dígito (55 + DDD + 9 + 8 díg = 13) ou sem (55 + DDD + 8 díg = 12),
// e às vezes sem o país (55). O formulário do Meta salva de um jeito; a resposta
// do cliente no WhatsApp (JID) chega de outro. Match exato falha → cria lead
// duplicado. `variantesTelefone` gera as formas equivalentes pra busca casar.

/**
 * Gera as variantes plausíveis do MESMO número (com/sem 9º dígito, com país 55),
 * pra usar num `.in('phone', variantes)` e achar o lead independente do formato.
 * Sempre inclui o número original (só dígitos). Não inventa nada além do 9º
 * dígito de celular BR reconhecível — entrada não reconhecida volta como está.
 */
export function variantesTelefone(raw: string): string[] {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return [];

  const set = new Set<string>([d]);

  // Leva pra forma com país (55) quando vier sem (10 ou 11 dígitos = DDD + local).
  const com55 = d.length === 10 || d.length === 11 ? '55' + d : d;

  if (com55.startsWith('55') && (com55.length === 12 || com55.length === 13)) {
    const ddd = com55.slice(2, 4);
    const local = com55.slice(4);
    if (local.length === 9 && local.startsWith('9')) {
      set.add('55' + ddd + local); // com 9 (canônico)
      set.add('55' + ddd + local.slice(1)); // sem 9
    } else if (local.length === 8) {
      set.add('55' + ddd + local); // sem 9
      set.add('55' + ddd + '9' + local); // com 9
    }
  }

  return [...set];
}
