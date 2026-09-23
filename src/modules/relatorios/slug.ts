// src/modules/relatorios/slug.ts
// Slug curto não-enumerável (padrão do r-pi) — usado por relatórios públicos
// e pela Pasta Digital do Cliente. Alfabeto sem 0/o/1/l/i pra evitar confusão.
export function novoSlug(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Normaliza o slug que chega na rota PÚBLICA (/pasta, /r-pi) antes de validar.
 *
 * 18/09/2026, caso Hudson: o link abriu "Slug inválido" porque o teclado do
 * celular capitaliza e o WhatsApp leva junto o ponto final da frase. O slug é
 * sempre gerado minúsculo (novoSlug), então minúscula + tirar pontuação do fim
 * não abre porta nenhuma — só deixa de recusar quem clicou certo.
 * Devolve null quando, mesmo limpo, não é um slug válido.
 */
export function normalizarSlugPublico(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]+$/, '');
  return /^[a-z0-9]{6,20}$/.test(s) ? s : null;
}
