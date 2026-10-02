// 02/10/2026 — Editar usina: telhado com mais de uma água (multi-arranjo).
import { describe, it, expect } from 'vitest';
import { aguasDoFormulario } from '../src/modules/dashboard/views.js';

describe('águas do formulário', () => {
  it('2 águas completas viram arranjos (Diego: oeste + leste)', () => {
    expect(aguasDoFormulario({
      agua_nome_0: 'Bloco A oeste', agua_kwp_0: '2,86', agua_ori_0: 'O', agua_inc_0: '10',
      agua_nome_1: '', agua_kwp_1: '2.86', agua_ori_1: 'L', agua_inc_1: '4',
    })).toEqual([
      { nome: 'Bloco A oeste', kwp: 2.86, azimute: 270, inclinacao: 10 },
      { nome: 'Água 2', kwp: 2.86, azimute: 90, inclinacao: 4 },
    ]);
  });
  it('só 1 água completa ou linhas incompletas → null (usa o telhado único)', () => {
    expect(aguasDoFormulario({ agua_kwp_0: '3', agua_ori_0: 'N', agua_inc_0: '10' })).toBeNull();
    expect(aguasDoFormulario({ agua_kwp_0: '3', agua_ori_0: 'N', agua_inc_0: '', agua_kwp_1: '2', agua_ori_1: 'L', agua_inc_1: '5' })).toBeNull();
    expect(aguasDoFormulario({})).toBeNull();
  });
});
