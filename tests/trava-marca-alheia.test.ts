// tests/trava-marca-alheia.test.ts
//
// Junior, 01/09/2026: "por que toda vez que entrar um cliente vou ter esse
// problema de um jeito ou de outro... não tem nenhum jeito de resolvermos esse
// problema de vez".
//
// Tem: travar na SAÍDA. Não adianta caçar cada lugar onde o nome da casa
// aparece (código, prompt, base de conhecimento, arquivo escrito amanhã). O que
// resolve é conferir a mensagem ANTES de enviar: se a assistente de uma empresa
// citou outra, a mensagem não sai.
//
// Mesma mecânica que já protege preço (eva-trava-numero) e envio pro zap do
// dono (tenant-admin-guard): falha fechada no ponto de saída.
import { describe, it, expect } from 'vitest';
import { citaEmpresaAlheia, travarMarcaAlheia, MENSAGEM_MARCA_BARRADA } from '../src/modules/trava-marca-alheia.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: '99fd46d7-60fc-49fe-918f-66587ffa3829',
  nome_fantasia: 'Conquista Solar', nome_atendente: 'Clara',
  rt_nome: 'Conquista Solar', rt_apelido: 'nossa equipe', rt_genero: 'f',
});

const ecosun = normalizarEmpresaRow({
  company_id: '00000000-0000-0000-0000-000000000001',
  nome_fantasia: 'EcoSunPower', nome_atendente: 'Eva',
  rt_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR', rt_apelido: 'Junior', rt_genero: 'm',
});

describe('trava de marca alheia (o cano, não o buraco)', () => {
  it('barra a marca da casa saindo pela assistente de outro cliente', () => {
    expect(citaEmpresaAlheia('A EcoSunPower trabalha com Solis desde 2019', conquista)).toBe(true);
    expect(citaEmpresaAlheia('A Ecosunpower instala carregador', conquista)).toBe(true);
    expect(citaEmpresaAlheia('LIMITE ECOSUNPOWER: 50% de oversize', conquista)).toBe(true);
  });

  it('barra o nome do dono da casa', () => {
    expect(citaEmpresaAlheia('O Junior avalia na visita técnica', conquista)).toBe(true);
    expect(citaEmpresaAlheia('escalona pro Junior', conquista)).toBe(true);
  });

  it('barra o nome da assistente da casa', () => {
    expect(citaEmpresaAlheia('A Eva nunca passa preço', conquista)).toBe(true);
  });

  it('deixa passar o que é da PRÓPRIA empresa', () => {
    expect(citaEmpresaAlheia('A Conquista Solar atende Vitória da Conquista', conquista)).toBe(false);
    expect(citaEmpresaAlheia('Sou a Clara, da Conquista Solar', conquista)).toBe(false);
    expect(citaEmpresaAlheia('nossa equipe te atende hoje mesmo', conquista)).toBe(false);
  });

  it('a EcoSunPower fala o próprio nome à vontade — a casa é dela', () => {
    expect(citaEmpresaAlheia('A EcoSunPower trabalha com Solis', ecosun)).toBe(false);
    expect(citaEmpresaAlheia('O Junior avalia na visita', ecosun)).toBe(false);
    expect(citaEmpresaAlheia('Sou a Eva, consultora', ecosun)).toBe(false);
  });

  it('não confunde palavra que só CONTÉM o nome', () => {
    expect(citaEmpresaAlheia('A avaliação dos juniores ficou boa', conquista)).toBe(false);
  });

  it('mensagem barrada vira resposta neutra, nunca o texto vazado', () => {
    const vazado = 'A EcoSunPower trabalha com Solis e o Junior fecha o preço';
    const saida = travarMarcaAlheia(vazado, conquista);
    expect(saida).toBe(MENSAGEM_MARCA_BARRADA);
    expect(saida).not.toMatch(/ecosun|junior/i);
  });

  it('texto limpo passa intacto', () => {
    const ok = 'O inversor Solis SUN-5K é trifásico e tem 2 MPPT.';
    expect(travarMarcaAlheia(ok, conquista)).toBe(ok);
  });

  it('a resposta neutra não promete nada e não cita ninguém', () => {
    expect(MENSAGEM_MARCA_BARRADA).not.toMatch(/ecosun|junior|eva/i);
    expect(MENSAGEM_MARCA_BARRADA.length).toBeLessThan(200);
  });
});

// 27/09/2026 (revisão final da fatia 3): o link PÚBLICO da plataforma
// (https://propostas.ecosunpower.eng.br/rg/… e /pasta/…) tem "ecosunpower" no
// domínio — os pontos são fronteira de palavra, então a trava engolia a
// mensagem do tenant e o cliente nunca recebia o link (e a tela mostrava ✅).
import { textoLivreRelatorio, linkPublicoRelatorio, basePublica } from '../src/modules/gd/relatorio-envio-textos.js';

describe('trava de marca — links públicos da própria plataforma passam', () => {
  it('relatório do tenant com o link /rg/ sai inteiro', () => {
    const texto = textoLivreRelatorio('Ana', 'setembro de 2026', linkPublicoRelatorio(basePublica(), 'A'.repeat(32)));
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });

  it('pasta do tenant com o link /pasta/<slug> sai inteira', () => {
    const link = `${basePublica()}/pasta/ana-silva-7f3k`;
    const texto = `📁 Ana, sua usina agora tem uma pasta digital!\n\nFotos da obra, projeto e todos os seus documentos guardados num lugar só:\n${link}\n\nSalve esse link — ele é seu.`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });

  it('link com pontuação colada no fim também passa', () => {
    const texto = `Veja aqui (${basePublica()}/rg/${'B'.repeat(32)}).`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });

  it('o link inteiro sai do teste, até o fim (caminho com letras e hífen)', () => {
    const texto = `Sua pasta: ${basePublica()}/pasta/sss-ecosunpower-x`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });

  it('citar a EcoSunPower em texto corrido continua barrado, mesmo com o link junto', () => {
    expect(travarMarcaAlheia('fale com a EcoSunPower', conquista, [ecosun, conquista])).toBe(MENSAGEM_MARCA_BARRADA);
    const comLink = `fale com a EcoSunPower: ${basePublica()}/pasta/x`;
    expect(travarMarcaAlheia(comLink, conquista, [ecosun, conquista])).toBe(MENSAGEM_MARCA_BARRADA);
  });
});

// 27/09/2026 (code review): `(?:[/?#]\S*)?` era guloso — qualquer coisa colada
// depois do host escapava a trava (marca grudada no fim do path, ou dentro da
// query). Corrigido pra só engolir rotas públicas REAIS desse domínio
// (/rg/<token>, /pasta/<slug>, /p/<slug>, /r/<slug>, /r-pi/<slug>) com o
// alfabeto que elas realmente usam ([A-Za-z0-9_-]+). Fora disso, o texto
// continua visível e cai na checagem normal.
describe('trava de marca — link não vira porta de escape pra marca colada', () => {
  it('marca colada no path com travessão (fora do alfabeto do token) → barrado', () => {
    const texto = `Segue o relatório: ${basePublica()}/rg/abc—EcoSunPower`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(MENSAGEM_MARCA_BARRADA);
  });

  it('marca na query string (?ref=OutraMarca) → barrado', () => {
    const outraMarca = normalizarEmpresaRow({
      company_id: '33333333-3333-3333-3333-333333333333', nome_fantasia: 'OutraMarca',
    });
    const texto = `Confere aqui: ${basePublica()}/?ref=OutraMarca`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista, outraMarca])).toBe(MENSAGEM_MARCA_BARRADA);
  });

  it('mensagem normal com /rg/<token> passa inteira', () => {
    const texto = `Segue o relatório: ${basePublica()}/rg/${'C'.repeat(32)}`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });

  it('mensagem normal com /pasta/<slug> passa inteira', () => {
    const texto = `Sua pasta: ${basePublica()}/pasta/a1b2c3d4e5`;
    expect(travarMarcaAlheia(texto, conquista, [ecosun, conquista])).toBe(texto);
  });
});
