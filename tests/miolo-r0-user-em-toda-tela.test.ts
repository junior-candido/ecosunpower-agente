// Renovação do miolo — R0 "Casca sem vazamento" (28/09/2026).
//
// B1: telas montadas SEM `user` mostravam ao tenant a casca da EcoSun (menu da
// casa + rodapé com CNPJ 33.020). Nenhum dado vazava, mas a marca sim.
// Este arquivo tem 2 partes:
//  1. TETO ESTÁTICO (mesmo espírito do tenant-rota-guard): toda chamada de
//     renderLayout({ … }) em src/modules/dashboard/*.ts precisa passar `user`.
//  2. Cada tela da lista, renderizada com um usuário TENANT, sai com a casca do
//     tenant (menu sem itens da casa, rodapé com o nome dele, sem CNPJ da casa).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DashUser } from '../src/modules/dashboard/permissions.js';
import { renderHomePage, renderImportarSitesPage } from '../src/modules/dashboard/views.js';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { renderListaPastas, renderEditorPasta, renderPreviewPasta } from '../src/modules/dashboard/pasta-views.js';
import { renderFormNovaProposta, renderPreviewProposta } from '../src/modules/dashboard/proposta-form-view.js';
import { renderCadenciaPage } from '../src/modules/dashboard/cadencia-views.js';
import { renderClientesListPage, renderClienteDetailPage, renderFormNovoCliente } from '../src/modules/dashboard/clientes-views.js';
import { renderFormNovoRelatorio, renderPreviewRelatorio } from '../src/modules/dashboard/relatorio-pi-views.js';

// ---------------------------------------------------------------------------
// 1. Teto estático
// ---------------------------------------------------------------------------

/** Acha cada objeto literal passado a renderLayout({ … }) e diz se tem a chave `user`. */
export function chamadasSemUser(fonte: string): number[] {
  const linhasSem: number[] = [];
  const re = /renderLayout\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    const inicioLinha = fonte.lastIndexOf('\n', m.index) + 1;
    const prefixo = fonte.slice(inicioLinha, m.index).trim();
    if (prefixo.startsWith('//') || prefixo.startsWith('*')) continue; // comentário
    // Casa as chaves do objeto (ignora `${…}` de template: conta { e } iguais).
    let prof = 0;
    let i = m.index + 'renderLayout('.length;
    for (; i < fonte.length; i++) {
      const c = fonte[i];
      if (c === '{') prof++;
      else if (c === '}') { prof--; if (prof === 0) break; }
    }
    const obj = fonte.slice(m.index, i + 1);
    // Chave `user` no nível do objeto: `user,` `user }` `user:` (abreviada ou não).
    if (!/[{,\s]user\s*(?:[,:}]|$)/m.test(obj)) {
      linhasSem.push(fonte.slice(0, m.index).split('\n').length);
    }
  }
  return linhasSem;
}

describe('R0 — teto: renderLayout sempre recebe `user`', () => {
  it('o detector acha a chamada sem user e aceita as com user', () => {
    expect(chamadasSemUser("return renderLayout({ active: 'x', title: 'y', body });")).toEqual([1]);
    expect(chamadasSemUser("return renderLayout({ active: 'x', body, user });")).toEqual([]);
    expect(chamadasSemUser("renderLayout({\n  active: 'x',\n  user: req.dashUser,\n})")).toEqual([]);
    expect(chamadasSemUser("renderLayout({ title: `a ${x ?? '?'}`, body, dark: true })")).toEqual([1]);
    expect(chamadasSemUser("// renderLayout({ active:'blog', ... }) fica no router")).toEqual([]);
  });

  it('nenhuma tela do dashboard chama renderLayout sem `user`', () => {
    const pasta = join(process.cwd(), 'src', 'modules', 'dashboard');
    const faltando: string[] = [];
    for (const arq of readdirSync(pasta).filter((f) => f.endsWith('.ts'))) {
      const fonte = readFileSync(join(pasta, arq), 'utf-8');
      for (const linha of chamadasSemUser(fonte)) faltando.push(`${arq}:${linha}`);
    }
    expect(faltando, `renderLayout sem user (a casca da casa vaza pro tenant):\n${faltando.join('\n')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Cada tela, como tenant
// ---------------------------------------------------------------------------

const TENANT: DashUser = {
  id: 'u-t', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Bia Teste', login: 'bia',
  isAdmin: true, roleNome: 'Administrador', permissoes: {}, companyNome: 'Solar Aurora Teste',
};

function menuDe(h: string): string {
  const i = h.indexOf('<aside class="cc-sb"');
  return h.slice(i, h.indexOf('</aside>', i));
}
function rodapeDe(h: string): string {
  const i = h.indexOf('<footer class="cc-rodape">');
  return h.slice(i, h.indexOf('</footer>', i));
}

function cascaDoTenant(h: string): void {
  expect(h).not.toContain('CNPJ 33.020');
  expect(h).not.toContain('EcoSunPower Energia Solar');
  const menu = menuDe(h);
  expect(menu).not.toContain('href="/dashboard/predio"');
  expect(menu).not.toContain('href="/dashboard/clientes"');
  expect(menu).not.toContain('alt="EcoSunPower"');
  expect(rodapeDe(h)).toContain('Solar Aurora Teste');
}

const agora = new Date().toISOString();
const LEAD = {
  id: '11111111-1111-1111-1111-111111111111', phone: '5561999990000', name: 'Carla Fictícia',
  status: 'qualificando', acquisition_source: null, eva_active: true, opt_out: false,
  maintenance_client: false, created_at: agora, updated_at: agora, has_cadence_pending: false,
  alerta: 'normal', archived_at: null, installation_status: null, loss_reason: null, loss_notes: null,
  lost_at: null, claimed_by: null, seloSla: 'verde', city: 'Cidade Teste', neighborhood: null,
  profile: null, email: null, energy_data: {}, opportunities: {}, conversation_messages: [],
  cadence_steps: [], anexos: [], timeline: [], tarefas: [],
} as any;

const PASTA = {
  id: 'p1', lead_id: 'l1', slug: 'abc', status: 'rascunho', capa_storage_path: null, data_entrega: null,
  mensagem_zap: null, arquivos: [], acessos: 0, ultimo_acesso_em: null, enviado_em: null,
  enviado_para_phone: null, created_at: agora, updated_at: agora, created_by: null,
} as any;

const KPIS = {
  totalPropostas: 0, propostasMesAtual: 0, propostasAnoAtual: 0, totalLeads: 0, leadsMesAtual: 0,
  leadsQualificando: 0, clientesInstalados: 0, manutencaoPendente: 0, ticketMedio: 0, vendasTotal: 0,
  vendasMesAtual: 0, vendasAnoAtual: 0, usinasMesAtual: 0,
};

const CLIENTE = {
  id: 'c1', name: 'Cliente Fictício', phone: '5561988887777', email: null, city: 'Cidade Teste', uf: 'DF',
  concessionaria: null, installation_status: 'instalado', installed_at: null, created_at: agora,
  archived_at: null, propostas: [], anexos: [], alertas_ativos: [], conversas_recentes: [],
  manutencoes_futuras: [], cadence_pendente: 0, sistema: null, consumo_mensal_json: null,
} as any;

const TELAS: Array<[string, (u: DashUser) => string]> = [
  ['Home', (u) => renderHomePage(KPIS, [], [], 'Este mês', '', u)],
  ['Importar sites', (u) => renderImportarSitesPage({ user: u })],
  ['Ficha do lead', (u) => renderLeadDetailPage(LEAD, [], '', '', [], u)],
  ['Lista de pastas', (u) => renderListaPastas({ pastas: [], clientes: [], publicBase: 'https://x', user: u })],
  ['Editor da pasta', (u) => renderEditorPasta({ pasta: PASTA, cliente_nome: 'Cliente', tem_rpi: false, tem_servicos: false, fotos_urls: {}, publicBase: 'https://x', user: u })],
  ['Prévia da pasta', (u) => renderPreviewPasta({ pasta_id: 'p1', cliente_nome: 'Cliente', html_preview: '<p>x</p>', user: u })],
  ['Nova proposta', (u) => renderFormNovaProposta({ lead_id: 'l1', lead: null, user: u })],
  ['Prévia da proposta', (u) => renderPreviewProposta({ slug: 's', htmlPreview: '<p>x</p>', publicUrl: 'https://x/p/s', clienteNome: 'C', clienteTelefone: '', lead_id: 'l1', jaEnviado: false, canEnviar: true, reasonNaoEnviar: null, user: u })],
  ['Cadência', (u) => renderCadenciaPage({ rows: [], kpis: { total_leads: 0, templates_disparados: 0, responderam: 0, qualificando: 0, proposta_enviada: 0, clientes: 0, taxa_resposta_pct: null, taxa_qualificacao_pct: null, taxa_proposta_pct: null }, user: u })],
  ['Clientes', (u) => renderClientesListPage([], {}, [], { total: 0, limit: 50, offset: 0 }, u)],
  ['Ficha do cliente', (u) => renderClienteDetailPage(CLIENTE, [], u)],
  ['Novo cliente', (u) => renderFormNovoCliente({ user: u })],
  ['Novo relatório pós-instalação', (u) => renderFormNovoRelatorio({ lead_id: 'l1', cliente_nome: 'C', data_instalacao_pre: null, user: u })],
  ['Prévia do relatório', (u) => renderPreviewRelatorio({ lead_id: 'l1', relatorio_id: 'r1', slug: 's', html_preview: '<p>x</p>', ja_enviado: false, enviado_em: null, user: u })],
];

describe('R0 — cada tela da lista, aberta por um tenant, mostra a casca do tenant', () => {
  for (const [nome, render] of TELAS) {
    it(nome, () => cascaDoTenant(render(TENANT)));
  }
});
