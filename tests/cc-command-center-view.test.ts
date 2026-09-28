// Command Center (fase A): layout do protótipo aprovado, com número REAL só
// onde já existe hoje; todo o resto em "Em construção — próxima entrega".
import { describe, it, expect } from 'vitest';
import {
  renderCommandCenterPage, saudacao, carimboAoVivo, type CommandCenterDados,
} from '../src/modules/dashboard/command-center-views.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };

// 27/09/2026 14:42 UTC = 11:42 em Brasília (domingo)
const AGORA = new Date('2026-09-27T14:42:00Z');

const comDados: CommandCenterDados = {
  agora: AGORA,
  nomeUsuario: 'Junior',
  kpisMes: { leads: 212, propostas: 47, vendas: 9, usinasNovas: 3 },
};
const semDados: CommandCenterDados = { agora: AGORA, nomeUsuario: 'Thiago', kpisMes: null };

describe('saudacao / carimbo (horário de Brasília)', () => {
  it('bom dia / boa tarde / boa noite pelo relógio de Brasília, não do servidor', () => {
    expect(saudacao(new Date('2026-09-27T14:42:00Z'))).toBe('Bom dia');   // 11:42
    expect(saudacao(new Date('2026-09-27T15:00:00Z'))).toBe('Boa tarde'); // 12:00
    expect(saudacao(new Date('2026-09-27T21:00:00Z'))).toBe('Boa noite'); // 18:00
    expect(saudacao(new Date('2026-09-28T02:30:00Z'))).toBe('Boa noite'); // 23:30 do dia 27
    expect(saudacao(new Date('2026-09-28T08:00:00Z'))).toBe('Bom dia');   // 05:00
  });

  it('carimbo por extenso', () => {
    expect(carimboAoVivo(AGORA)).toBe('domingo, 27 de setembro · atualizado às 11:42');
  });
});

describe('renderCommandCenterPage', () => {
  it('estrutura do protótipo: cabeçalho, hero da Eva, KPIs, geração, mapa, Central de Atenção, áreas', () => {
    const h = renderCommandCenterPage(comDados, junior);
    expect(h).toContain('Command Center');
    expect(h).toContain('Como está a empresa agora');
    expect(h).toContain('Bom dia, Junior.');
    expect(h).toContain('cc-kstrip');
    expect(h).toContain('Geração do portfólio');
    expect(h).toContain('Usinas agora');
    expect(h).toContain('Central de Atenção');
    for (const area of ['Comercial', 'Marketing', 'Instalações', 'O&amp;M', 'Financeiro']) expect(h).toContain(area);
  });

  it('usa a casca nova, larga e escura, com o item Command Center aceso', () => {
    const h = renderCommandCenterPage(comDados, junior);
    expect(h).toContain('class="cc-main cc-largo"');
    expect(h).toContain('<div class="cc-shell cc-escuro">');
    expect(h).toMatch(/<a href="\/dashboard\/command-center" class="cc-on"/);
  });

  it('números reais onde já existem (leads, propostas, vendas, manutenções)', () => {
    const h = renderCommandCenterPage(comDados, junior);
    expect(h).toContain('212');
    expect(h).toContain('47');
    expect(h).toContain('>9<');
    expect(h).toContain('manutenções em até 30 dias');
  });

  it('bloco não ligado mostra "Em construção — próxima entrega", nunca número de exemplo', () => {
    const h = renderCommandCenterPage(comDados, junior);
    expect(h).toContain('Em construção — próxima entrega');
    // números do protótipo NÃO podem vazar pra produção
    for (const fake of ['912', '4,12', '186,4', '1,62', '284,8', '118 de 124', 'Atacadão', 'R$ 164', '98,2%']) {
      expect(h, fake).not.toContain(fake);
    }
  });

  it('sem dados (tenant ou consulta falhou): nenhum número, tudo em construção/sem dado', () => {
    const h = renderCommandCenterPage(semDados);
    expect(h).toContain('Bom dia, Thiago.');
    const kstrip = h.slice(h.indexOf('cc-kstrip'), h.indexOf('</section>', h.indexOf('cc-kstrip')));
    expect(kstrip).not.toMatch(/cc-val">\d/);
  });

  it('nome escapado', () => {
    const h = renderCommandCenterPage({ ...semDados, nomeUsuario: '<img onerror=x>' });
    expect(h).not.toContain('<img onerror=x>');
  });

  it('legenda das 5 severidades da Central de Atenção, sem contagem inventada', () => {
    const h = renderCommandCenterPage(comDados, junior);
    for (const s of ['Crítico', 'Atenção', 'Acompanhar', 'Oportunidade', 'Info']) expect(h).toContain(s);
    expect(h).toMatch(/Crítico <b>—<\/b>/);
  });

  it('cartões de área levam às telas que já existem', () => {
    const h = renderCommandCenterPage(comDados, junior);
    for (const href of ['/dashboard/leads/kanban', '/dashboard/marketing', '/dashboard/usinas/kanban', '/dashboard/manutencao', '/dashboard/financeiro']) {
      expect(h).toContain(`href="${href}"`);
    }
  });

  it('botão do Modo TV', () => {
    expect(renderCommandCenterPage(comDados, junior)).toContain('href="/dashboard/tv"');
  });
});
