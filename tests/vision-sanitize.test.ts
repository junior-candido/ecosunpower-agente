import { describe, it, expect } from 'vitest';
import { stripVisionScaffolding } from '../src/modules/vision.js';

// Bug real em prod: o caminho de imagem mandava o LAUDO interno pro cliente
// ("# Análise da Imagem", "Ação necessária:", "Resposta para o cliente:").
// O sanitizer é defesa em profundidade — extrai só a mensagem natural.
describe('stripVisionScaffolding', () => {
  it('remove header "# Análise da Imagem" mantendo o corpo', () => {
    const inp = '# Análise da Imagem\n\nOi! 👋 A imagem é um cartão de apresentação. Pode me mandar a conta de luz? 📸';
    expect(stripVisionScaffolding(inp)).toBe('Oi! 👋 A imagem é um cartão de apresentação. Pode me mandar a conta de luz? 📸');
  });

  it('quando tem "Resposta para o cliente:" usa SÓ o que vem depois', () => {
    const inp = '# Análise da Imagem\n\nEsta é uma imagem de marketing da FM instalações.\n\n**Resposta para o cliente:**\nOi! Recebi a imagem, mas ela é do portfólio da FM. Você quer energia solar pra você mesmo? 🔋';
    expect(stripVisionScaffolding(inp)).toBe('Oi! Recebi a imagem, mas ela é do portfólio da FM. Você quer energia solar pra você mesmo? 🔋');
  });

  it('remove linha "**Ação necessária:** ..." (instrução interna)', () => {
    const inp = 'Esta é uma tabela de serviços de uma empresa elétrica.\n\n**Ação necessária:** Solicite ao cliente a foto da conta de luz atual. 📸';
    expect(stripVisionScaffolding(inp)).toBe('Esta é uma tabela de serviços de uma empresa elétrica.');
  });

  it('preserva o bloco ```json``` (parseAction precisa dele)', () => {
    const inp = '# Análise da Imagem\n\nConsumo de 850 kWh, conta R$ 720. Confere?\n\n```json\n{"action":"update_lead","data":{"energy_data":{"monthly_bill":720,"consumption_kwh":850}}}\n```';
    const out = stripVisionScaffolding(inp);
    expect(out).toContain('```json');
    expect(out).toContain('"monthly_bill":720');
    expect(out).toContain('Consumo de 850 kWh, conta R$ 720. Confere?');
    expect(out).not.toContain('# Análise da Imagem');
  });

  it('mensagem já natural passa intacta', () => {
    const inp = 'Opa! Que telhado bom pra solar — bastante área e boa inclinação. Qual o valor médio da sua conta de luz?';
    expect(stripVisionScaffolding(inp)).toBe(inp);
  });

  it('degrada com graça (vazio/só scaffolding nunca vira string vazia perigosa)', () => {
    expect(stripVisionScaffolding('')).toBe('');
    expect(typeof stripVisionScaffolding('# Análise da Imagem')).toBe('string');
  });

  // Regressão do achado #1 do review: rótulo AMBÍGUO não pode apagar a
  // linha inteira (mensagem legítima viraria vazia). Tira só o prefixo.
  it('rótulo ambíguo ("Análise:") mantém o conteúdo, não vira vazio', () => {
    expect(stripVisionScaffolding('Análise: ótimo telhado pra solar! ☀️')).toBe('ótimo telhado pra solar! ☀️');
  });

  it('rótulo puramente interno ("Ação necessária:") apaga a linha toda', () => {
    expect(stripVisionScaffolding('**Ação necessária:** pedir a conta de luz')).toBe('');
  });

  it('rótulo no MEIO da frase não é tocado (sem falso-positivo)', () => {
    const inp = 'Beleza! Ação: instalar 8 painéis já resolve sua conta.';
    expect(stripVisionScaffolding(inp)).toBe(inp);
  });
});
