import { describe, it, expect } from 'vitest';
import { toWhatsAppText } from '../src/modules/brain.js';

// Bug real (conversa Alessandro 15/05): toda resposta do brain saía com
// markdown que o WhatsApp NÃO renderiza — cliente lia "# Opa", "## Simulação",
// "**negrito**", "---" literais. WhatsApp só tem *negrito* (1 asterisco),
// _itálico_, ~tachado~. toWhatsAppText converte/limpa antes de enviar.
describe('toWhatsAppText', () => {
  it('header markdown vira *negrito* (linha)', () => {
    expect(toWhatsAppText('# Opa, claro! 🌞')).toBe('*Opa, claro! 🌞*');
    expect(toWhatsAppText('## Simulação rápida:')).toBe('*Simulação rápida:*');
    expect(toWhatsAppText('### Detalhe')).toBe('*Detalhe*');
  });

  it('**negrito** markdown vira *negrito* WhatsApp', () => {
    expect(toWhatsAppText('Investimento **R$ 28.000** à vista')).toBe('Investimento *R$ 28.000* à vista');
    expect(toWhatsAppText('**Economia mensal:** R$ 280')).toBe('*Economia mensal:* R$ 280');
  });

  it('remove régua horizontal (---, ***, ___)', () => {
    expect(toWhatsAppText('linha um\n\n---\n\nlinha dois')).toBe('linha um\n\nlinha dois');
    expect(toWhatsAppText('a\n***\nb')).toBe('a\nb');
  });

  it('remove blockquote "> " do começo da linha', () => {
    expect(toWhatsAppText('> "Quinta ou sexta?"')).toBe('"Quinta ou sexta?"');
  });

  it('não mexe em texto já WhatsApp-safe', () => {
    const ok = 'Opa! 😊 Seu sistema fica em *R$ 17.600*, parcelado uns _R$ 733/mês_.\n- payback 3 anos\n- 25 anos de economia';
    expect(toWhatsAppText(ok)).toBe(ok);
  });

  it('não confunde bullet "* item" nem multiplicação com negrito', () => {
    expect(toWhatsAppText('* primeiro item\n* segundo item')).toBe('* primeiro item\n* segundo item');
    expect(toWhatsAppText('cabe 2 * 3 paineis')).toBe('cabe 2 * 3 paineis');
  });

  it('caso real estilo Alessandro: sem # ## ** --- no resultado', () => {
    const inp = '# Show, Alessandro! 💡\n\n## Simulação rápida:\n- **Sistema ideal:** 3 a 4 kWp\n- **Investimento:** ~R$ 8.000\n\n---\n\n**Próximo passo?** Visita ou Meet?';
    const out = toWhatsAppText(inp);
    expect(out).not.toMatch(/(^|\n)#{1,6}\s/);
    expect(out).not.toContain('**');
    expect(out).not.toMatch(/(^|\n)\s*---\s*(\n|$)/);
    expect(out).toContain('*Show, Alessandro! 💡*');
    expect(out).toContain('*Sistema ideal:*');
    expect(out).toContain('*Próximo passo?*');
  });

  it('degrada com graça (vazio/string)', () => {
    expect(toWhatsAppText('')).toBe('');
    expect(typeof toWhatsAppText('# só header')).toBe('string');
  });

  // Regressão dos 2 achados Important do review:
  it('header com **negrito** dentro não vira * aninhado quebrado', () => {
    expect(toWhatsAppText('## Eco **R$ 8.000** total')).toBe('*Eco R$ 8.000 total*');
    expect(toWhatsAppText('### **Sistema ideal:**')).toBe('*Sistema ideal:*');
  });

  it('header só de asteriscos não vira "**" literal (some)', () => {
    expect(toWhatsAppText('# ***')).toBe('');
  });
});
