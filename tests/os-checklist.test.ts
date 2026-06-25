import { describe, it, expect } from 'vitest';
import {
  templateChecklist, hidratarChecklist, progressoOS, resumoOS,
} from '../src/modules/dashboard/os-checklist.js';

describe('templateChecklist', () => {
  it('revisao_inversor tem medição CA, CC e termografia', () => {
    const t = templateChecklist('revisao_inversor');
    const kinds = t.map((i) => i.kind);
    expect(kinds).toContain('medicao');
    expect(kinds).toContain('foto');
    expect(t.find((i) => i.chave === 'medicao_ca')?.kind).toBe('medicao');
    expect(t.find((i) => i.chave === 'termografia')?.kind).toBe('foto');
  });
  it('revisao_eletrica tem aperto de bornes (check) e foto do quadro', () => {
    const t = templateChecklist('revisao_eletrica');
    expect(t.find((i) => i.chave === 'aperto_bornes')?.kind).toBe('check');
    expect(t.find((i) => i.chave === 'foto_quadro')?.kind).toBe('foto');
  });
  it('limpeza tem fotos dos módulos', () => {
    expect(templateChecklist('limpeza').find((i) => i.chave === 'fotos_modulos')?.kind).toBe('foto');
  });
  it('todo item tem chave única e label não-vazio', () => {
    for (const tipo of ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'] as const) {
      const t = templateChecklist(tipo);
      const chaves = t.map((i) => i.chave);
      expect(new Set(chaves).size).toBe(chaves.length);
      expect(t.every((i) => i.label.length > 0)).toBe(true);
    }
  });
});

describe('hidratarChecklist', () => {
  it('sobrepõe valores salvos no template e conta fotos', () => {
    const itens = hidratarChecklist('limpeza', { limpeza_placas: true, geracao_antes_depois: '480' }, { fotos_modulos: 3 });
    expect(itens.find((i) => i.chave === 'limpeza_placas')?.valor).toBe(true);
    expect(itens.find((i) => i.chave === 'geracao_antes_depois')?.valor).toBe('480');
    expect(itens.find((i) => i.chave === 'fotos_modulos')?.fotos).toBe(3);
  });
  it('item sem valor salvo: check=false, outros=null, fotos 0', () => {
    const itens = hidratarChecklist('limpeza', {}, {});
    expect(itens.every((i) => i.fotos === 0)).toBe(true);
    expect(itens.find((i) => i.chave === 'limpeza_placas')?.valor).toBe(false);
    expect(itens.find((i) => i.chave === 'geracao_antes_depois')?.valor).toBeNull();
  });
});

describe('progressoOS', () => {
  it('conta check marcado, medição com valor e foto com ≥1', () => {
    const itens = hidratarChecklist('limpeza', { inspecao_visual: true, limpeza_placas: false, geracao_antes_depois: '480' }, { fotos_modulos: 2 });
    const p = progressoOS(itens);
    expect(p.total).toBe(5);
    expect(p.feitos).toBe(3); // inspecao_visual + geracao + fotos_modulos
    expect(p.pct).toBe(60);
  });
});

describe('resumoOS', () => {
  it('separa checks feitos e medições com valor', () => {
    const itens = hidratarChecklist('revisao_inversor', { erros_alarmes: true, medicao_ca: '220V/5A' }, {});
    const r = resumoOS(itens);
    expect(r.checks).toContain('Leitura de erros/alarmes');
    expect(r.medicoes.find((m) => m.chave === 'medicao_ca')?.valor).toBe('220V/5A');
  });
});
