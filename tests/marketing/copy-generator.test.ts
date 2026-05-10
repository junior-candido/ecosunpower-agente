import { describe, it, expect, vi } from 'vitest';
import { generateCopies } from '../../src/modules/marketing/copy-generator.js';
import type { Persona } from '../../src/modules/marketing/types.js';

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: '[{"length":"curto","headline":"H1","body":"B1","cta":"C1"},{"length":"medio","headline":"H2","body":"B2","cta":"C2"},{"length":"longo","headline":"H3","body":"B3","cta":"C3"}]',
        }],
      }),
    };
  }
  return { default: MockAnthropic };
});

const PERSONA_MOCK: Persona = {
  id: 1, codigo: 'residencial_df_alto', nome: 'Residencial DF',
  categoria_portfolio: 'on_grid_residencial', descricao: '',
  conta_minima_brl: 700, consumo_minimo_kwh: 700, regiao_alvo: 'DF',
  palavras_proibidas: ['alugar terra'],
  contexto_marca: { tom: 'caloroso' },
};

describe('generateCopies', () => {
  it('parse JSON array de resposta Claude e retorna 3 copies', async () => {
    const copies = await generateCopies({ briefing: 'casa DF', persona: PERSONA_MOCK });
    expect(copies).toHaveLength(3);
    expect(copies[0].length).toBe('curto');
    expect(copies[1].length).toBe('medio');
    expect(copies[2].length).toBe('longo');
    expect(copies[0].headline).toBe('H1');
  });
});
