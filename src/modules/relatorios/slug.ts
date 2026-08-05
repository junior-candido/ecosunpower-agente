// src/modules/relatorios/slug.ts
// Slug curto não-enumerável (padrão do r-pi) — usado por relatórios públicos
// e pela Pasta Digital do Cliente. Alfabeto sem 0/o/1/l/i pra evitar confusão.
export function novoSlug(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
