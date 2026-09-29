// Telas da COBRANÇA RECORRENTE (28/09/2026) — Financeiro › Assinaturas (casa:
// lista + detalhe) e "Minha assinatura" com as faturas (tenant). Padrão
// Command Center, sem Tailwind, tema escuro. Aqui: o que o Junior vê e o
// CONTRATO (formulários/ações/confirmações) das telas novas, escape de dado,
// e o isolamento (tenant só as faturas dele; rotas da casa com soDaCasa).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela } from './helpers/contrato-tela.js';
import { bancoFalso } from './helpers/banco-falso.js';
import {
  telaAssinaturasCasa, telaAssinaturaDetalhe, telaMinhaAssinaturaComFaturas, fatura, HISTORICO_AURORA,
} from './fixtures/telas-cobranca.js';
import { renderMinhaAssinaturaPage } from '../src/modules/dashboard/minha-assinatura-views.js';
import { faturasDoTenant, faturasDaDona, getFaturaDaDona } from '../src/modules/cobranca-recorrente/faturas-repo.js';
import { getAssinaturaDaDona, listarAssinaturas } from '../src/modules/dashboard/assinaturas-store.js';
import { USER_TENANT } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('cc-asr'));

describe('Assinaturas (casa) — lista', () => {
  const h = telaAssinaturasCasa();

  it('números do topo: recorrente do mês, recebido, em aberto, atrasadas', () => {
    expect(h).toContain('Recorrente por mês');
    // ativas (297 + 450 + 197; a pausada não conta) = 944,00
    expect(h).toContain('944,00');
    expect(h).toContain('Recebido em outubro');
    expect(h).toContain('Atrasadas');
  });

  it('situação em pílula: atrasada N dias / vence em X dias / em dia / pausada — atrasada primeiro', () => {
    const m = miolo(h);
    expect(m).toContain('atrasada 4 dias');
    expect(m).toContain('vence em 6 dias');
    expect(m).toContain('em dia');
    expect(m).toContain('pausada');
    expect(m.indexOf('Solar Aurora Teste')).toBeLessThan(m.indexOf('Condomínio Exemplo Norte'));
    expect(m.indexOf('Condomínio Exemplo Norte')).toBeLessThan(m.indexOf('Pousada Fictícia do Lago'));
  });

  it('próximo vencimento e "todo dia X"', () => {
    expect(h).toContain('10/10/2026');
    expect(h).toContain('todo dia 10');
    expect(h).toContain('20/10/2026');
  });

  it('modelo da Meta pendente → aviso claro (e-mail + texto pronto pro Junior)', () => {
    expect(h).toContain('cobranca_mensalidade_v1');
    expect(h).toContain('ainda não foi aprovado');
    expect(telaAssinaturasCasa({ modeloAprovado: true })).not.toContain('ainda não foi aprovado');
  });

  it('link gerado vem com botão Copiar', () => {
    const c = telaAssinaturasCasa({ aviso: { tipo: 'ok', texto: 'Fatura gerada.', link: 'https://checkout.exemplo.invalid/x' } });
    expect(c).toContain('data-copiar="https://checkout.exemplo.invalid/x"');
  });

  it('contrato: formulário Nova assinatura + ações do menu de cada linha', () => {
    const k = contratoDaTela(h);
    const nova = k.formularios.find((f) => f.action === '/dashboard/assinaturas/nova')!;
    expect(nova.method).toBe('POST');
    expect(nova.campos.map((c) => c.name).sort()).toEqual(
      ['company_id', 'descricao', 'dia_vencimento', 'documento', 'email', 'forma', 'inicio', 'limite', 'nome', 'observacao', 'produto', 'telefone', 'valor'].sort(),
    );
    const acoes = k.formularios.map((f) => f.action);
    expect(acoes).toContain('/dashboard/assinaturas/11111111-1111-4111-8111-000000000001/cobrar');
    expect(acoes.some((a) => /\/dashboard\/assinaturas\/faturas\/[0-9a-f-]+\/reenviar$/.test(a))).toBe(true);
    expect(acoes).toContain('/dashboard/assinaturas/11111111-1111-4111-8111-000000000004/status'); // Reativar a pausada
    expect(k.links).toContain('/dashboard/assinaturas/11111111-1111-4111-8111-000000000001');
    expect(k.idsAusentes).toEqual([]);
  });

  it('sem Tailwind do CDN, tema escuro', () => {
    expect(h).not.toContain('cdn.tailwindcss.com');
    expect(h).toMatch(/ecosun-body-dark|data-tema="escuro"|cc-dark/);
  });
});

describe('Assinaturas (casa) — detalhe com histórico de faturas', () => {
  const h = telaAssinaturaDetalhe();

  it('faturas: outubro aberta (atrasada) com link/Reenviar/Marcar como paga; setembro paga por Pix direto', () => {
    const m = miolo(h);
    expect(m).toContain('outubro/2026');
    expect(m).toContain('setembro/2026');
    expect(m).toContain('Marcar como paga (Pix direto)');
    expect(m).toContain('data-copiar="https://checkout.exemplo.invalid/pagar/aurora-out"');
    expect(m).toContain('Pix direto');
    expect(m).toMatch(/fatura enviada 07\/10\/2026 · lembrete 09\/10\/2026 · aviso de atraso 11\/10\/2026 · último aviso 12\/10\/2026/);
    expect(m).toContain('texto enviado pra você encaminhar');
  });

  it('dados da cobrança: CPF/CNPJ formatado, WhatsApp, e-mail, painel com uso e observação', () => {
    expect(h).toContain('11.222.333/0001-81');
    expect(h).toContain('5561988887777');
    expect(h).toContain('financeiro@aurora.exemplo.invalid');
    expect(h).toContain('87/110 usinas');
    expect(h).toContain('Paga às vezes pelo CPF');
  });

  it('contrato: gerar, pausar, suspender (confirm), cancelar (confirm), reenviar, marcar paga (confirm), editar', () => {
    const k = contratoDaTela(h);
    const base = '/dashboard/assinaturas/11111111-1111-4111-8111-000000000001';
    const acoes = k.formularios.map((f) => f.action);
    for (const a of [`${base}/cobrar`, `${base}/status`, `${base}/editar`]) expect(acoes).toContain(a);
    expect(acoes.some((a) => a.endsWith('/marcar-paga'))).toBe(true);
    const editar = k.formularios.find((f) => f.action === `${base}/editar`)!;
    expect(editar.campos.map((c) => c.name).sort()).toEqual(['descricao', 'dia_vencimento', 'documento', 'email', 'limite', 'nome', 'observacao', 'telefone', 'valor'].sort());
    expect(k.confirms).toEqual(expect.arrayContaining([
      expect.stringContaining('PAGA por Pix direto'),
      expect.stringContaining('Cancelar esta assinatura'),
    ]));
    // Assistente virtual nunca bloqueia o painel (a alavanca é pausar a assistente);
    // "Suspender acesso" só existe pra monitoramento do tenant / calculadora.
    expect(h).not.toContain('Suspender acesso');
    expect(contratoDaTela(telaAssinaturaDetalhe({ a: { produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas' } })).confirms)
      .toEqual(expect.arrayContaining([expect.stringContaining('Suspender o acesso')]));
    expect(k.idsAusentes).toEqual([]);
  });

  it('valor novo vale da próxima fatura em diante — está escrito no formulário', () => {
    expect(h).toContain('vale da próxima fatura em diante');
  });

  it('sem fatura aberta: mostra quando a próxima sai sozinha', () => {
    const paga = telaAssinaturaDetalhe({ faturas: [fatura({ status: 'paga', pagoEm: '2026-10-09T12:00:00Z', metodo: 'pix' })] });
    expect(paga).toContain('Próxima: <b>novembro/2026</b>');
    expect(paga).toContain('07/11/2026');
  });

  it('pausada: sem "Gerar cobrança agora", com Reativar', () => {
    const p = telaAssinaturaDetalhe({ a: { status: 'pausada' } });
    expect(p).not.toContain('Gerar cobrança agora');
    expect(p).toContain('Reativar');
  });

  it('dado do cliente escapado (nome/observação com HTML)', () => {
    const x = telaAssinaturaDetalhe({ a: { nome: '<img src=x onerror=alert(1)>', observacao: '<script>roubo()</script>' } });
    expect(x).not.toContain('<img src=x');
    expect(x).not.toContain('<script>roubo');
    expect(x).toContain('&lt;script&gt;roubo()&lt;/script&gt;');
  });
});

describe('Minha assinatura (tenant) — faturas', () => {
  const h = telaMinhaAssinaturaComFaturas();

  it('fatura aberta com botão Pagar (link) + paga com a data; nada de ação da casa', () => {
    expect(h).toContain('Faturas');
    expect(h).toContain('href="https://checkout.exemplo.invalid/pagar/aurora-out"');
    expect(h).toContain('Pagar');
    expect(h).toContain('paga em 09/09/2026');
    expect(h).toContain('em atraso há 4 dias');
    expect(h).toContain('venceu em');
    expect(h).not.toContain('marcar-paga');
    expect(h).not.toContain('/dashboard/assinaturas/');
    expect(h).not.toContain('Dono Teste'); // quem marcou na casa não aparece pro tenant
  });

  it('sem fatura aberta: "Próxima" com a data e o aviso de que o link chega 3 dias antes', () => {
    const t = telaMinhaAssinaturaComFaturas(USER_TENANT, [HISTORICO_AURORA[1]!]);
    expect(t).toContain('Próxima: <b>outubro/2026</b>');
    expect(t).toContain('O link chega 3 dias antes');
  });

  it('sem faturas (tela antiga) continua igual — seção só aparece com a lista', () => {
    const a = { id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'X', email: null, telefone: null, zapConfirmado: false, valorCentavos: 29700, limite: null, venceEm: '2026-10-10', status: 'ativa' as const, companyId: 'c1' };
    expect(renderMinhaAssinaturaPage(a, '2026-10-01', null, null, USER_TENANT)).not.toContain('>Faturas<');
  });
});

describe('isolamento no banco (várias empresas no banco falso)', () => {
  const CASA = '00000000-0000-0000-0000-000000000001';
  const OUTRA_DONA = 'bbbb1111-2222-3333-4444-555566667777';
  const TENANT = USER_TENANT.companyId;
  const OUTRO_TENANT = 'cccc1111-2222-3333-4444-555566667777';
  const linha = (o: Record<string, unknown>) => ({
    assinatura_id: 'a1', company_id: TENANT, dona_company_id: CASA, competencia: '2026-10-01', vence_em: '2026-10-10',
    valor_centavos: 29700, descricao: 'X', status: 'aberta', criado_em: 'x', ...o,
  });
  const banco = () => bancoFalso({
    faturas_assinatura: [
      linha({ id: 'f-meu' }),
      linha({ id: 'f-outro-tenant', company_id: OUTRO_TENANT, assinatura_id: 'a2' }),
      linha({ id: 'f-outra-dona', dona_company_id: OUTRA_DONA, assinatura_id: 'a3', company_id: OUTRO_TENANT }),
    ],
    assinaturas: [
      { id: 'a1', dona_company_id: CASA, company_id: TENANT, nome: 'Meu', status: 'ativa', vence_em: '2026-10-10' },
      { id: 'a3', dona_company_id: OUTRA_DONA, company_id: OUTRO_TENANT, nome: 'De outra dona', status: 'ativa', vence_em: '2026-10-10' },
    ],
  });

  it('tenant: só as faturas em que ELE é o assinante', async () => {
    const fs = await faturasDoTenant(banco().client, TENANT);
    expect(fs.map((f) => f.id)).toEqual(['f-meu']);
  });
  it('casa: só o que ela cobra; id de fatura/assinatura de outra dona → não acha', async () => {
    const b = banco();
    expect((await faturasDaDona(b.client, CASA, '2026-07-01')).map((f) => f.id).sort()).toEqual(['f-meu', 'f-outro-tenant']);
    expect(await getFaturaDaDona(b.client, CASA, 'f-outra-dona')).toBeNull();
    expect(await getAssinaturaDaDona(b.client, CASA, 'a3')).toBeNull();
    expect((await listarAssinaturas(b.client, CASA)).map((a) => a.id)).toEqual(['a1']);
  });
});

describe('router — rotas da cobrança recorrente (teste estático)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (metodo: 'get' | 'post', caminho: string) => {
    const i = fonte.indexOf(`router.${metodo}('${caminho}'`);
    expect(i, `${metodo} ${caminho}`).toBeGreaterThan(-1);
    const fim = fonte.indexOf('\n  router.', i + 10);
    return fonte.slice(i, fim === -1 ? undefined : fim);
  };
  it('as guardas da casa têm soDaCasa + permissão de financeiro', () => {
    expect(fonte).toContain("const verCasa = [soDaCasa, exigir('financeiro', 'visualizar')];");
    expect(fonte).toContain("const editarCasa = [soDaCasa, exigir('financeiro', 'editar')];");
  });
  it('TODAS as rotas /assinaturas usam a guarda da casa', () => {
    for (const r of [rota('get', '/assinaturas'), rota('get', '/assinaturas/:id')]) expect(r).toContain('...verCasa');
    for (const c of ['/assinaturas/nova', '/assinaturas/:id/editar', '/assinaturas/:id/status', '/assinaturas/:id/cobrar', '/assinaturas/faturas/:faturaId/reenviar', '/assinaturas/faturas/:faturaId/marcar-paga']) {
      expect(rota('post', c), c).toContain('...editarCasa');
    }
    const todas = [...fonte.matchAll(/router\.(get|post)\('\/assinaturas[^']*'/g)].map((m) => m[0]);
    expect(todas).toHaveLength(12);
    for (const c of ['pausar', 'reativar', 'prazo', 'regra']) {
      expect(fonte).toContain(`router.post('/assinaturas/:id/assistente/${c}', ...editarCasa, acaoAssistente('${c}'));`);
    }
  });
  it('id da URL nunca vale sozinho: busca pela dona da sessão', () => {
    expect(rota('get', '/assinaturas/:id')).toContain('getAssinaturaDaDona(supabase, dona, id)');
    expect(rota('post', '/assinaturas/faturas/:faturaId/marcar-paga')).toContain('getFaturaDaDona(supabase, dona, fid)');
    expect(rota('post', '/assinaturas/:id/editar')).toContain('editarAssinatura(supabase, id, campos, dona)');
    expect(rota('post', '/assinaturas/:id/status')).toContain('setStatusAssinatura(supabase, id, status as');
  });
  it('Minha assinatura: faturas pela empresa da SESSÃO', () => {
    const r = rota('get', '/minha-assinatura');
    expect(r).toContain('const cid = req.dashUser!.companyId;');
    expect(r).toContain('faturasDoTenant(supabase, cid)');
  });
});

describe('"se não pagar, a assistente para" — telas', () => {
  it('detalhe: cartão da assistente com estado, Reativar agora (confirm), Dar mais prazo e a regra', () => {
    const h = telaAssinaturaDetalhe();
    expect(h).toContain('Assistente do cliente');
    expect(h).toContain('>1ª trava<');
    expect(h).toContain('name="dias_trava_disparos"');
    expect(h).toContain('param em <b>17/10/2026</b>');
    expect(h).toContain('/assistente/reativar');
    expect(h).toContain('/assistente/prazo');
    expect(h).toContain('/assistente/regra');
    expect(h).toContain('name="pausa_automatica"');
    expect(h).toContain('name="dias_pausa"');
    expect(contratoDaTela(h).confirms).toEqual(expect.arrayContaining([expect.stringContaining('Reativar a assistente')]));
  });
  it('detalhe atendendo: "Pausar agora" com confirm e a data em que pausa', () => {
    const h = telaAssinaturaDetalhe({ a: { assistentePausadaEm: null } });
    expect(h).toContain('/assistente/pausar');
    expect(h).toContain('para de responder em <b>13/10/2026</b>');
    expect(contratoDaTela(h).confirms).toEqual(expect.arrayContaining([expect.stringContaining('Pausar a assistente deste cliente')]));
  });
  it('cliente avulso: sem cartão de assistente', () => {
    expect(telaAssinaturaDetalhe({ a: { companyId: null } })).not.toContain('Assistente do cliente');
  });
  it('ação dourada: com fatura em aberto é "Reenviar link" (gerar outra fica no ⋯)', () => {
    const h = miolo(telaAssinaturaDetalhe());
    expect((h.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(h).toMatch(/cc-btn-gold[^>]*>[\s\S]{0,400}Reenviar link/);
    expect(h).toContain('Gerar a próxima cobrança agora');
  });
  it('lista: pílula "assistente pausada" na linha do cliente pausado', () => {
    expect(telaAssinaturasCasa()).toContain('assistente pausada');
  });
  it('faixa no painel do TENANT pausado: pagar agora (link) + ver faturas; painel continua', () => {
    const h = telaMinhaAssinaturaComFaturas();
    expect(h).toContain('Assistente pausada por fatura em aberto');
    expect(h).toContain('as mensagens continuam chegando aqui no painel');
    expect(h).toMatch(/href="https:\/\/checkout\.exemplo\.invalid\/pagar\/aurora-out"[^>]*>Pagar agora \(Pix ou cartão de crédito\)/);
  });
  it('a CASA nunca vê a faixa, mesmo com o campo preenchido; link inseguro não entra', async () => {
    const { faixaAssistentePausada } = await import('../src/modules/dashboard/views.js');
    const { USER_CASA } = await import('./fixtures/miolo-leads.js');
    expect(faixaAssistentePausada({ ...USER_CASA, assistentePausada: { linkPagar: 'https://x.invalid' } })).toBe('');
    expect(faixaAssistentePausada({ ...USER_TENANT, assistentePausada: { linkPagar: 'javascript:alert(1)' } })).not.toContain('javascript:');
  });
});

describe('router — revisão de segurança', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  it('link de pagamento NÃO vem da URL (só o id da fatura, lido do banco pela dona)', () => {
    expect(fonte).not.toMatch(/p\.set\('link'/);
    expect(fonte).toContain('getFaturaDaDona(supabase, req.dashUser!.companyId, q.fatura)');
  });
  it('trocar o WhatsApp da assinatura (tenant) só com admin', () => {
    expect(fonte).toContain("router.post('/minha-assinatura/zap/solicitar', exigir('usuarios', 'administrar')");
    expect(fonte).toContain("router.post('/minha-assinatura/zap/confirmar', exigir('usuarios', 'administrar')");
  });
  it('faixa da pausa: nunca pra casa, e não bloqueia a requisição', () => {
    const i = fonte.indexOf('faixa da pausa falhou');
    const trecho = fonte.slice(fonte.lastIndexOf('router.use(async', i), i + 80);
    expect(trecho).toContain('u.companyId === ECOSUN_CASA');
    expect(trecho).toContain('next();');
    expect(trecho).not.toContain('res.status(');
  });
});

describe('consumer da fila (index.ts) — pausa usa o caminho "guarda sem responder"', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
  it('antes do switch de tipos: empresa pausada → registrarPausado + registro no painel, e o switch (a assistente) NÃO roda; casa nunca', () => {
    const i = fonte.indexOf('empresaPausadaNoCache(cachePausaAssistente, msg.companyId, ECOSUN_COMPANY_ID)');
    expect(i).toBeGreaterThan(-1);
    const sw = fonte.indexOf('switch (msg.type)', i);
    expect(i).toBeLessThan(sw);
    const trecho = fonte.slice(i, sw);
    expect(trecho).toContain('registrarPausado(dbMsg, msg.from, companyId, tipo');
    expect(trecho).toContain('registrarTextoDaAssistente(');
    expect(trecho.trimEnd().endsWith('if (!pausadaPorFatura) {')).toBe(true);
    // a mídia continua sendo arquivada no painel (W1) depois do switch
    expect(fonte.indexOf('} // fim do if (!pausadaPorFatura)', sw)).toBeLessThan(fonte.indexOf('arquivarMidiaDaAssistente(supabase.getClient()', sw));
  });
});

describe('tenant pausado: uma ação dourada só (a do plano)', () => {
  it('a faixa não duplica o botão dourado', () => {
    const h = telaMinhaAssinaturaComFaturas();
    const corpo = h.slice(h.indexOf('<main'));
    expect((corpo.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(corpo).toContain('Pagar agora (Pix ou cartão de crédito)');
  });
});

describe('faixa no painel do tenant — estágio e quem vê o quê', () => {
  it('2ª trava: faixa fala da assistente E das mensagens automáticas', async () => {
    const { faixaAssistentePausada } = await import('../src/modules/dashboard/views.js');
    const h = faixaAssistentePausada({ ...USER_TENANT, assistentePausada: { linkPagar: 'https://checkout.exemplo.invalid/x', estagio: 2, admin: true } });
    expect(h).toContain('Assistente e mensagens automáticas pausadas');
    expect(h).toContain('Pagar agora');
  });
  it('usuário do tenant que NÃO é admin: só "fale com a administradora", sem valores nem Pagar', async () => {
    const { faixaAssistentePausada } = await import('../src/modules/dashboard/views.js');
    const h = faixaAssistentePausada({ ...USER_TENANT, isAdmin: false, assistentePausada: { linkPagar: 'https://checkout.exemplo.invalid/x', estagio: 2, admin: false } });
    expect(h).toContain('Assistente pausada.');
    expect(h).toContain('Fale com a administradora da conta');
    expect(h).not.toContain('Pagar');
    expect(h).not.toContain('checkout');
    expect(h).not.toContain('R$');
  });
  it('"Minha assinatura" de quem não é admin: sem faturas, valores nem Pagar', async () => {
    const { renderMinhaAssinaturaSoAdmin } = await import('../src/modules/dashboard/minha-assinatura-views.js');
    const h = renderMinhaAssinaturaSoAdmin({ ...USER_TENANT, isAdmin: false });
    expect(h).toContain('Só a administradora da conta vê as faturas');
    expect(h).not.toContain('R$');
    expect(h).not.toContain('Pagar');
  });
  it('router: faixa e "Minha assinatura" conferem admin do tenant', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
    expect(fonte).toContain("const admin = can(u, 'usuarios', 'administrar');");
    expect(fonte.replace(/\r\n/g, '\n')).toContain("if (!can(req.dashUser, 'usuarios', 'administrar')) {\n        res.type('html').send(renderMinhaAssinaturaSoAdmin(req.dashUser));");
  });
  it('detalhe com a 2ª trava ligada: pílula "2ª trava" e Reativar agora', () => {
    const h = telaAssinaturaDetalhe({ a: { disparosPausadosEm: '2026-10-17T12:00:00Z' } });
    expect(h).toContain('>2ª trava<');
    expect(h).toContain('/assistente/reativar');
  });
});
