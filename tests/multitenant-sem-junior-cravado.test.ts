// tests/multitenant-sem-junior-cravado.test.ts
//
// Reclamação real da equipe da Conquista Solar (01/09/2026): "a Clara continua
// escrevendo Junior". O cadastro é só metade da história — havia "Junior"
// CRAVADO em mensagens que vão pro cliente de QUALQUER empresa.
//
// A regra: nenhum texto que sai pro cliente pode citar o dono de outra empresa.
// Quem responde por isso é a config da empresa em contexto (rtApelido/rtTitulo),
// nunca uma string fixa.
import { describe, it, expect } from 'vitest';
import { comEmpresaDe, normalizarEmpresaRow, interpolarEmpresa } from '../src/modules/empresa-config.js';
import { mensagemHandoffNumero, travarTexto } from '../src/modules/eva-trava-numero.js';

// Empresa de outro dono, do jeito que a Conquista está cadastrada.
const conquista = normalizarEmpresaRow({
  company_id: '99fd46d7-60fc-49fe-918f-66587ffa3829',
  nome_fantasia: 'Conquista Solar',
  nome_atendente: 'Clara',
  rt_nome: 'JIMENA ALVES',
  rt_apelido: 'Jimena',
  rt_genero: 'f',
  rt_titulo: 'Responsável Técnica',
});

describe('nenhum "Junior" cravado nas mensagens do cliente', () => {
  it('handoff de preço fala do dono DA EMPRESA, com o artigo certo', () => {
    const texto = comEmpresaDe(null, () => mensagemHandoffNumero(conquista));
    expect(texto).not.toMatch(/junior/i);
    expect(texto).toContain('Jimena');
    expect(texto).toContain('a Jimena');          // feminino: "a", não "o"
    expect(texto).toMatch(/respons[áa]vel t[ée]cnica/i);
  });

  it('EcoSunPower continua falando como sempre falou', () => {
    const ecosun = normalizarEmpresaRow({
      company_id: '00000000-0000-0000-0000-000000000001',
      nome_fantasia: 'EcoSunPower', nome_atendente: 'Eva',
      rt_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR', rt_apelido: 'Junior', rt_genero: 'm',
      rt_titulo: 'Responsável Técnico CREA/CFT',
    });
    const texto = mensagemHandoffNumero(ecosun);
    expect(texto).toContain('o Junior');
    expect(texto).toMatch(/respons[áa]vel t[ée]cnico/i);
  });

  it('a trava de número usa a mensagem da empresa em contexto', () => {
    const vazou = 'O sistema sai por R$ 28.000,00';
    const barrado = travarTexto(vazou, 'teste', conquista);
    expect(barrado).not.toBe(vazou);              // barrou mesmo
    expect(barrado).not.toMatch(/junior/i);
    expect(barrado).toContain('Jimena');
  });

  it('texto liberado passa intacto', () => {
    const ok = 'Sua conta deu 850 kWh no mês passado.';
    expect(travarTexto(ok, 'teste', conquista)).toBe(ok);
  });

  it('os moldes de mensagem usam placeholder, nao nome fixo', () => {
    // {{rt_o}} já resolve artigo + apelido conforme o gênero da empresa.
    expect(interpolarEmpresa('Falo com {{rt_o}} agora', conquista)).toBe('Falo com a Jimena agora');
    expect(interpolarEmpresa('{{rt_nosso_titulo}}', conquista)).toBe('nossa Responsável Técnica');
  });
});
