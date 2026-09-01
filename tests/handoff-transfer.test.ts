// tests/handoff-transfer.test.ts
// O aviso de "assume esse atendimento" tinha "Eva" escrito na unha dentro do
// index.ts — fora do alcance do guard de prompts. A assistente da Conquista
// Solar chama Clara; o aviso pra Jimena dizia "A Eva fica em pausa nesse chat".
import { describe, it, expect } from 'vitest';
import { montarHandoff } from '../src/modules/handoff-transfer.js';

const base = {
  from: '557799793958',
  leadId: 'lead-1',
  leadName: 'Claudio Lacerda',
  reason: 'Lead qualificado — cliente quer proposta.',
  ehContatoComercial: false,
  estimativaMsg: '',
  avisoCargaFutura: '',
};

describe('handoff usa o nome da assistente DA EMPRESA', () => {
  it('Conquista Solar fala em Clara, nunca em Eva', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Clara' });
    expect(h.texto).toContain('A Clara fica em pausa');
    expect(h.texto).not.toContain('Eva');
    expect(h.botoes.map((b) => b.title).join(' ')).not.toContain('Eva');
  });

  it('o botão de reativar traz o nome da assistente da empresa', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Clara' });
    expect(h.botoes.some((b) => b.title.includes('Clara'))).toBe(true);
  });

  it('EcoSunPower continua exatamente como era (Eva)', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Eva' });
    expect(h.texto).toContain('A Eva fica em pausa nesse chat (se foi engano, é só Reativar).');
    expect(h.botoes.map((b) => b.title)).toEqual(['Assumir', 'Ver perfil', '↩️ Reativar Eva']);
  });

  it('contato comercial também usa o nome da empresa', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Clara', ehContatoComercial: true, contactType: 'fornecedor' });
    expect(h.texto).toContain('A Clara deu uma resposta curta');
    expect(h.texto).not.toContain('Eva');
  });

  it('WhatsApp só aceita 3 botões — nunca manda mais que isso', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Clara' });
    expect(h.botoes.length).toBeLessThanOrEqual(3);
  });
});

describe('handoff avisa quando o cliente falou em carga nova', () => {
  it('mostra o aviso de carga futura junto da estimativa', () => {
    const h = montarHandoff({
      ...base,
      nomeAtendente: 'Clara',
      estimativaMsg: '\n\n📐 Estimativa: ~3 painéis',
      avisoCargaFutura: '\n⚠️ O cliente falou em ar-condicionado e fogão de indução — a estimativa NÃO inclui isso.',
    });
    expect(h.texto).toContain('⚠️ O cliente falou em ar-condicionado');
    expect(h.texto).toContain('📐 Estimativa');
  });

  it('sem carga futura, nada de aviso sobrando', () => {
    const h = montarHandoff({ ...base, nomeAtendente: 'Clara' });
    expect(h.texto).not.toContain('⚠️');
  });
});
