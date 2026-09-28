// Atendimento Parte 2: com a Eva pausada (eva_active=false — "Assumir"), ela
// fica calada, mas a mensagem do cliente TEM que ficar na conversa: quem
// assumiu responde pela tela e precisa ler. Antes o gate fazia `return` seco
// e a mensagem sumia do painel. Varre o index.ts: todo "Skipping … eva_active=false"
// (texto, áudio, imagem, vídeo, documento) registra antes de sair.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fonte = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');

describe('Eva pausada: registra sempre, responde nunca', () => {
  const linhas = fonte.split('\n');
  const gates = linhas.map((l, i) => ({ l, i })).filter(({ l }) => /\[eva-active\] Skipping .* eva_active=false/.test(l));

  it('existem os 5 gates (texto, áudio, imagem, vídeo, documento)', () => {
    expect(gates).toHaveLength(5);
  });

  for (const g of gates) {
    it(`linha ${g.i + 1}: registra a mensagem antes do return`, () => {
      const depois = linhas.slice(g.i + 1, g.i + 5).join('\n');
      expect(depois).toMatch(/await registrarPausado\(db, from, companyId, '(texto|audio|imagem|video|documento)'/);
      expect(depois.indexOf('registrarPausado')).toBeLessThan(depois.indexOf('return'));
    });
  }
});
