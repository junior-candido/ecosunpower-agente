// Textos do zap do Diário de Serviços (botão 📤 Enviar pelo zap).
import { describe, it, expect } from 'vitest';
import { textoAvisoServico, textoInfoServico } from '../src/modules/dashboard/servicos-zap.js';
import type { ServicoRow } from '../src/modules/dashboard/servicos-store.js';

const S: ServicoRow = {
  id: 's1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'l1',
  clienteNome: 'Tatiane', sistemaId: null, observacoes: 'levar escada',
  dataServico: '2026-07-30', fotos: 0, videos: 0,
  status: 'atribuido', atribuidoA: 'u1', atribuidoNome: 'João',
};

describe('textoAvisoServico (mesmo texto do aviso automático #182)', () => {
  it('com link: tipo, cliente, data BR e o link do guia', () => {
    const t = textoAvisoServico(S, 'https://app/dashboard/servicos/s1');
    expect(t).toContain('🔧 Novo serviço pra você: Visita técnica — Tatiane, dia 30/07/2026');
    expect(t).toContain('https://app/dashboard/servicos/s1');
  });
  it('sem link: manda abrir a tela Serviços', () => {
    expect(textoAvisoServico(S, null)).toContain('Abra a tela Serviços no dashboard');
  });
});

describe('textoInfoServico (só as informações, sem acesso)', () => {
  it('tipo, cliente, data, endereço, observações e o guia NUMERADO do tipo', () => {
    const t = textoInfoServico(S, 'Cond. Ouro Vermelho I, Qd 28 Lt 11, Jardim Botânico');
    expect(t).toContain('Visita técnica');
    expect(t).toContain('Tatiane');
    expect(t).toContain('30/07/2026');
    expect(t).toContain('📍 Cond. Ouro Vermelho I');
    expect(t).toContain('levar escada');
    expect(t).toContain('1. Foto do padrão de entrada');   // lista do Junior
    expect(t).toContain('Capacidade da corrente do disjuntor');
  });
  it('sem endereço e tipo sem guia: não quebra', () => {
    const t = textoInfoServico({ ...S, tipoId: 'laudo', observacoes: null }, null);
    expect(t).toContain('Visita técnica');
    expect(t).not.toContain('📍');
    expect(t).not.toContain('Fotos pra tirar');
  });
});
