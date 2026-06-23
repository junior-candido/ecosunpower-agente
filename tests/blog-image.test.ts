import { describe, it, expect } from 'vitest';
import { pexelsIdFromUrl } from '../src/modules/blog-image.js';

describe('pexelsIdFromUrl — extrai id da URL do Pexels (anti-repetição)', () => {
  it('extrai o id de uma URL large2x típica', () => {
    expect(
      pexelsIdFromUrl('https://images.pexels.com/photos/356036/pexels-photo-356036.jpeg?auto=compress&w=1880'),
    ).toBe(356036);
  });

  it('extrai o id de uma URL original', () => {
    expect(pexelsIdFromUrl('https://images.pexels.com/photos/9875441/pexels-photo-9875441.jpeg')).toBe(9875441);
  });

  it('devolve null pra url vazia/nula/sem id', () => {
    expect(pexelsIdFromUrl(null)).toBeNull();
    expect(pexelsIdFromUrl(undefined)).toBeNull();
    expect(pexelsIdFromUrl('')).toBeNull();
    expect(pexelsIdFromUrl('https://exemplo.com/foto.jpg')).toBeNull();
  });
});
