import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(process.cwd(), 'src/prompts/system-prompt.md'), 'utf-8');

describe('system-prompt: regra de preço foi trocada por handoff', () => {
  it('não manda mais "dá um número"', () => {
    expect(prompt).not.toMatch(/dá um número/i);
  });
  it('não cita faixa de preço cravada tipo "R$15-25 mil"', () => {
    expect(prompt).not.toMatch(/R\$\s?15-25\s?mil/i);
  });
  it('não tem mais o exemplo "R$ 28.000"', () => {
    expect(prompt).not.toMatch(/R\$\s?28\.?000/i);
  });
  it('tem a regra absoluta de nunca falar número', () => {
    expect(prompt).toMatch(/NUNCA fala preço de sistema/i);
  });
  it('tem o script de handoff "pode te atender agora"', () => {
    expect(prompt).toMatch(/pode te atender agora/i);
  });
});
