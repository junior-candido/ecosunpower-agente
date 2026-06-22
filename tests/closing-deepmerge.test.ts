// tests/closing-deepmerge.test.ts
import { describe, it, expect } from 'vitest';
import { deepMerge } from '../src/modules/closing/closing-assistant.js';

describe('deepMerge (coleta do /fechar)', () => {
  // BUG do loop: o LLM reenviava campos como null/'' e isso APAGAVA o que já tinha
  // sido coletado (ex: UC aceita e depois "sumindo"). deepMerge não pode apagar com vazio.
  it('null NÃO sobrescreve valor já coletado', () => {
    const out = deepMerge({ uc_numero: '16364331' } as any, { uc_numero: null } as any);
    expect(out.uc_numero).toBe('16364331');
  });

  it('string vazia NÃO apaga valor existente', () => {
    const out = deepMerge({ concessionaria: 'Neoenergia-DF' } as any, { concessionaria: '   ' } as any);
    expect(out.concessionaria).toBe('Neoenergia-DF');
  });

  it('valor real sobrescreve', () => {
    const out = deepMerge({ uc_numero: 'a confirmar' } as any, { uc_numero: '16364331' } as any);
    expect(out.uc_numero).toBe('16364331');
  });

  it('mescla nested sem apagar irmãos nem com null', () => {
    const out = deepMerge(
      { titular_uc: { tipo: 'PF', rg: '3017539', cpf: '177' } } as any,
      { titular_uc: { rg: null, orgao_emissor_rg: 'SSP/SP' } } as any,
    );
    expect(out.titular_uc.rg).toBe('3017539');        // não apagou
    expect(out.titular_uc.cpf).toBe('177');            // irmão preservado
    expect(out.titular_uc.orgao_emissor_rg).toBe('SSP/SP'); // novo campo entrou
  });

  it('campo novo é adicionado', () => {
    const out = deepMerge({ a: 1 } as any, { b: 2 } as any);
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it('0 e false são valores válidos (não são "vazio")', () => {
    const out = deepMerge({ ligacao_nova: true } as any, { ligacao_nova: false } as any);
    expect(out.ligacao_nova).toBe(false);
  });
});
