// tests/pasta-email.test.ts
//
// A PASTA DIGITAL SÓ SABIA IR PELO WHATSAPP (09/09/2026).
//
// Junior, entregando a usina da Tatiane: "quero enviar pelo zap e por email
// agora" e "no email, poderá mandar somente o link de abrir a pasta camuflado,
// tenha acesso ao ebook pós instalação".
//
// O zap já fazia isso — o template `pasta_digital_v1` leva um botão apontando
// pra /pasta/<slug>. O e-mail simplesmente não existia: `enviarPorWhatsApp` era
// o único caminho de saída da pasta.
//
// Aqui nasce o par que faltava. O e-mail carrega UM botão e nenhum anexo: o
// material inteiro (projeto, TRT, parecer, fotos, manuais) mora no link, que é
// o mesmo do WhatsApp. Anexo de 20 MB volta como bounce e ninguém fica sabendo.
import { describe, it, expect } from 'vitest';
import {
  assuntoDaPasta,
  corpoDaPasta,
  jornadaHtml,
  guardarHtml,
  contatosHtml,
  JORNADA,
} from '../src/modules/relatorios/pasta/email.js';

const LINK = 'https://propostas.ecosunpower.eng.br/pasta/k3f9zq';

describe('assuntoDaPasta — o cliente reconhece pelo assunto', () => {
  it('chama a pessoa pelo primeiro nome e diz o que é', () => {
    const s = assuntoDaPasta('Tatiane de Souza Bonfim', 'EcoSunPower');
    expect(s).toContain('Tatiane');
    expect(s).not.toContain('Souza');
    expect(s.toLowerCase()).toContain('usina');
  });

  it('sem nome, não escreve "undefined" nem fica esquisito', () => {
    const s = assuntoDaPasta('', 'EcoSunPower');
    expect(s).not.toMatch(/undefined|null/i);
    expect(s.length).toBeGreaterThan(10);
  });
});

describe('corpoDaPasta — um botão, nenhum anexo', () => {
  it('o link aparece no corpo pra ser usado como botão', () => {
    const html = corpoDaPasta({ primeiroNome: 'Tatiane', link: LINK, empresa: 'EcoSunPower' });
    expect(html).toContain(LINK);
  });

  it('fala do material sem prometer anexo', () => {
    const html = corpoDaPasta({ primeiroNome: 'Tatiane', link: LINK, empresa: 'EcoSunPower' });
    expect(html.toLowerCase()).not.toContain('em anexo');
    expect(html.toLowerCase()).not.toContain('anexado');
  });

  it('lista o que a pessoa vai encontrar lá dentro', () => {
    const html = corpoDaPasta({ primeiroNome: 'Tatiane', link: LINK, empresa: 'EcoSunPower' }).toLowerCase();
    for (const item of ['projeto', 'fotos', 'garantia']) {
      expect(html).toContain(item);
    }
  });

  it('escapa o nome — nome de cliente não pode virar HTML', () => {
    const html = corpoDaPasta({
      primeiroNome: '<script>alert(1)</script>',
      link: LINK,
      empresa: 'EcoSunPower',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('trata o cliente por você, sem nome quando ele não existe', () => {
    const html = corpoDaPasta({ primeiroNome: '', link: LINK, empresa: 'EcoSunPower' });
    expect(html).not.toMatch(/undefined|null|,\s*!/);
    expect(html).toContain(LINK);
  });
});

describe('jornadaHtml — o caminho que o cliente percorreu, desenhado', () => {
  it('mostra todas as etapas, da proposta até a usina gerando', () => {
    const html = jornadaHtml();
    for (const etapa of JORNADA) expect(html).toContain(etapa.titulo);
  });

  it('termina na usina gerando — é o motivo do e-mail', () => {
    expect(JORNADA[JORNADA.length - 1].titulo.toLowerCase()).toContain('gerando');
  });

  it('desenha com tabela, nunca com SVG ou flex — Gmail descarta os dois', () => {
    const html = jornadaHtml();
    expect(html).toContain('<table');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
  });
});

describe('guardarHtml — diz POR QUE guardar, não só "guarde"', () => {
  it('dá motivos concretos, não um pedido solto', () => {
    const html = guardarHtml().toLowerCase();
    for (const motivo of ['garantia', 'vender', 'ampliar', 'seguro', 'titularidade']) {
      expect(html).toContain(motivo);
    }
  });

  it('avisa que o link não vence', () => {
    expect(guardarHtml().toLowerCase()).toContain('não vence');
  });
});

describe('contatosHtml — o quadro de quem chamar', () => {
  const base = { primeiroNome: 'Tatiane', link: LINK, empresa: 'EcoSunPower' };

  it('formata o telefone e monta o link do WhatsApp', () => {
    const html = contatosHtml({ ...base, telefoneAssistente: '5561996978781' });
    expect(html).toContain('(61) 99697-8781');
    expect(html).toContain('https://wa.me/5561996978781');
  });

  it('trata o responsável como Responsável Técnico, nunca engenheiro', () => {
    const html = contatosHtml({ ...base, telefoneResponsavel: '5561998805002', nomeResponsavel: 'Junior' });
    expect(html).toContain('Responsável Técnico');
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });

  it('vira arroba a partir da URL do Instagram', () => {
    const html = contatosHtml({ ...base, instagramUrl: 'https://www.instagram.com/ecosunpowerenergia.solarjr/' });
    expect(html).toContain('@ecosunpowerenergia.solarjr');
  });

  it('sem contato nenhum, não deixa quadro vazio na carta', () => {
    expect(contatosHtml(base)).toBe('');
  });
});

describe('corpoDaPasta — a carta inteira', () => {
  const cheio = {
    primeiroNome: 'Tatiane',
    link: LINK,
    empresa: 'EcoSunPower',
    telefoneAssistente: '5561996978781',
    telefoneResponsavel: '5561998805002',
    nomeResponsavel: 'Junior',
    instagramUrl: 'https://www.instagram.com/ecosunpowerenergia.solarjr/',
    avaliacaoUrl: 'https://ecosunpower.eng.br/avaliar',
  };

  it('abre com parabéns pela escolha da empresa', () => {
    const html = corpoDaPasta(cheio);
    expect(html).toContain('Parabéns, Tatiane!');
    expect(html).toContain('escolhido a EcoSunPower');
  });

  it('junta jornada, motivo de guardar, contatos e avaliação', () => {
    const html = corpoDaPasta(cheio);
    expect(html).toContain('O caminho que percorremos juntos');
    expect(html).toContain('Guarde este link');
    expect(html).toContain('Quando precisar da gente');
    expect(html).toContain('https://ecosunpower.eng.br/avaliar');
  });

  it('sem avaliação configurada, não deixa botão quebrado', () => {
    const html = corpoDaPasta({ primeiroNome: 'Tatiane', link: LINK, empresa: 'EcoSunPower' });
    expect(html).not.toContain('Deixar minha avaliação');
  });
});
