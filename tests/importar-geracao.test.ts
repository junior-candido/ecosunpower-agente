// 02/10/2026 — Importar geração (CSV do portal / print lido pela IA).
import { describe, it, expect } from 'vitest';
import { lerCsvGeracao, lerData, lerNumero } from '../src/modules/monitoring/importacao/csv.js';
import { interpretarRespostaImagem } from '../src/modules/monitoring/importacao/imagem.js';
import { renderImportarBody } from '../src/modules/dashboard/importar-views.js';

describe('números e datas', () => {
  it('decimal brasileiro e americano', () => {
    expect(lerNumero('1.234,5')).toBe(1234.5);
    expect(lerNumero('1,234.5')).toBe(1234.5);
    expect(lerNumero('12,3')).toBe(12.3);
    expect(lerNumero('12.3 kWh')).toBe(12.3);
    expect(lerNumero('')).toBeNull();
  });
  it('datas DD/MM/AAAA, AAAA-MM-DD, com hora; data impossível = null', () => {
    expect(lerData('26/09/2026')).toBe('2026-09-26');
    expect(lerData('2026-09-26 00:00:00')).toBe('2026-09-26');
    expect(lerData('2026/9/3')).toBe('2026-09-03');
    expect(lerData('31/02/2026')).toBeNull();
  });
});

describe('CSV do portal', () => {
  it('S-Miles/estilo brasileiro: ; e vírgula decimal', () => {
    const r = lerCsvGeracao('Data;Produção (kWh)\n01/09/2026;24,6\n02/09/2026;25,1\n03/09/2026;\n');
    expect(r.linhas).toEqual([{ data: '2026-09-01', kwh: 24.6 }, { data: '2026-09-02', kwh: 25.1 }]);
    expect(r.avisos.join(' ')).toContain('1 linha(s)');
  });
  it('inglês, vírgula, energia em Wh vira kWh', () => {
    const r = lerCsvGeracao('Date,Yield (Wh),Peak\n2026-09-01,24600,3.1\n2026-09-02,25100,3.2');
    expect(r.linhas).toEqual([{ data: '2026-09-01', kwh: 24.6 }, { data: '2026-09-02', kwh: 25.1 }]);
    expect(r.avisos.join(' ')).toContain('Wh');
  });
  it('linhas de título antes do cabeçalho e aspas', () => {
    const r = lerCsvGeracao('Relatório da usina X\nPeríodo: 09/2026\n"Time";"Energy(kWh)"\n"2026-09-05";"30.2"');
    expect(r.linhas).toEqual([{ data: '2026-09-05', kwh: 30.2 }]);
  });
  it('sem cabeçalho: 1ª coluna data, 1ª numérica energia, com aviso', () => {
    const r = lerCsvGeracao('05/09/2026;18,4\n06/09/2026;19');
    expect(r.linhas.length).toBe(2);
    expect(r.avisos[0]).toContain('Não achei o cabeçalho');
  });
});

describe('print lido pela IA', () => {
  it('aceita só datas e números válidos', () => {
    const r = interpretarRespostaImagem('ok {"tipo":"diario","itens":[{"data":"2026-09-01","kwh":24.6},{"data":"2026-13-01","kwh":5},{"data":"2026-09-02","kwh":"x"}],"observacao":"S-Miles"}');
    expect(r.tipo).toBe('diario');
    expect(r.linhas).toEqual([{ data: '2026-09-01', kwh: 24.6 }]);
    expect(r.avisos[0]).toContain('confira');
  });
  it('resposta sem JSON = nada', () => {
    expect(interpretarRespostaImagem('não consegui').linhas).toEqual([]);
  });
});

describe('tela', () => {
  it('prévia com campos editáveis e aviso de substituição', () => {
    const h = renderImportarBody({ sistemaId: 's', nome: 'Diego <x>', preview: { origem: 'arquivo a.csv', linhas: [{ data: '2026-09-01', kwh: 24.6 }], avisos: [], jaExistem: { '2026-09-01': 20 } } });
    expect(h).toContain('name="k_2026-09-01" value="24.6"');
    expect(h).toContain('será substituído');
    expect(h).toContain('Diego &lt;x&gt;');
  });
});
