// Renovação do miolo — R19: Configurações (usuários, empresas, WhatsApp, minha
// assinatura) no padrão cc-, tema escuro (D4), sem Tailwind. Contrato em
// miolo-configuracoes-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_CONFIGURACOES as C } from './fixtures/casos-configuracoes.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const nav = (m: string) => (m.match(/<nav class="cc-cf-nav"[\s\S]*?<\/nav>/) ?? [''])[0];
const semMarcaDaCasa = (h: string) => {
  expect(h).toContain('<div class="cc-shell cc-escuro">');
  expect(h).not.toContain('EcoSunPower');
  expect(h).not.toContain('EcoSun');
  expect(h).not.toContain('33.020');
  expect(miolo(h)).not.toMatch(/\bEva\b/);
};

describe('Usuários — lista', () => {
  const h = C['usuarios-lista']();
  const m = miolo(h);
  it('cabeçalho Configurações › Usuários, título sem emoji, UMA ação dourada (Criar usuário)', () => {
    expect(h).toContain('<div class="cc-shell cc-escuro">');
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Usuários e permissões</h1>');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form method="POST" action="\/dashboard\/usuarios\/novo" class="cc-form/);
  });
  it('tabela com avatar, papel em pílula, "vê" e último acesso (sem dado → —)', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('cc-avatar');
    expect(m).toMatch(/cc-pill[^>]*>Administrador</);
    expect(m).toMatch(/cc-pill[^>]*>Comercial</);
    expect(m).toContain('>tudo<');
    expect(m).toContain('leads, propostas');
    expect(m).toContain('>sem papel<');
    const bruno = m.slice(m.indexOf('Bruno'), m.indexOf('/dashboard/usuarios/u-bru/excluir'));
    expect(bruno).toContain('>—<');
  });
  it('escapa nome/login/papel; ativos primeiro, inativo no fim', () => {
    expect(m).toContain('Bruno &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m).not.toContain('<script>alert(1)');
    expect(m).toContain('Campo &lt;b&gt;O&amp;M&lt;/b&gt;');
    expect(m.indexOf('Carla Fictícia')).toBeGreaterThan(m.indexOf('Bruno'));
    expect(m).toContain('cc-cf-inativo');
  });
  it('a própria pessoa não tem desativar/excluir', () => {
    expect(m).not.toContain('/dashboard/usuarios/u-casa/excluir');
    expect(m).not.toContain('/dashboard/usuarios/u-casa/ativo');
    expect(m).toContain('href="/dashboard/usuarios/u-casa"');
  });
  it('CONSERTO: confirm do Excluir compila com apóstrofo no nome (antes a exclusão ia sem perguntar)', () => {
    const ons = [...h.matchAll(/onsubmit="(return confirm\([^"]*)"/g)].map((x) => x[1]);
    expect(ons.length).toBe(3);
    for (const on of ons) {
      const js = on.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      expect(() => new Function(js)).not.toThrow();
    }
    expect(h).toContain('Excluir Ana D’Ávila?');
  });
  it('EcoSun: seções Usuários + Empresas (sem WhatsApp do tenant nem Minha assinatura)', () => {
    const n = nav(m);
    expect(n).toContain('href="/dashboard/usuarios" class="cc-cf-on"');
    expect(n).toContain('href="/dashboard/empresas"');
    expect(n).not.toContain('/dashboard/whatsapp');
    expect(n).not.toContain('/dashboard/minha-assinatura');
  });
});

describe('Usuários — tenant', () => {
  it('admin do tenant: seções sem Empresas; nada da casa', () => {
    const h = C['usuarios-lista-tenant']();
    const n = nav(miolo(h));
    expect(n).toContain('/dashboard/whatsapp');
    expect(n).toContain('/dashboard/minha-assinatura');
    expect(miolo(h)).not.toContain('/dashboard/empresas');
    semMarcaDaCasa(h);
  });
  it('tenant sem "administrar": não vê a seção WhatsApp', () => {
    const m = miolo(C['usuarios-lista-tenant-comum']());
    expect(nav(m)).not.toContain('/dashboard/whatsapp');
    expect(m).not.toContain('/dashboard/empresas');
  });
  it('lista vazia → estado vazio', () => {
    expect(miolo(C['usuarios-lista-vazia']())).toContain('cc-empty');
  });
});

describe('Usuários — editar', () => {
  it('form cc-form com os mesmos campos, Salvar dourado único, papel selecionado, nome escapado', () => {
    const m = miolo(C['usuarios-editar']());
    expect(m).toMatch(/<form method="POST" action="\/dashboard\/usuarios\/u-ana" class="cc-form/);
    expect(ouros(m)).toBe(1);
    expect(m).toContain('<option value="r-com" selected>Comercial</option>');
    expect(m).toContain('Ana D&#039;Ávila &lt;i&gt;');
    expect(m).toContain('href="/dashboard/usuarios"');
    expect(m).toMatch(/name="ativo" checked/);
    expect(m).toMatch(/name="acesso_temporario" checked/);
  });
  it('tenant: escuro, sem marca da casa', () => {
    semMarcaDaCasa(C['usuarios-editar-tenant']());
  });
  it('usuário sem papel: opção vazia marcada (antes a 1ª opção — Administrador — vinha marcada)', () => {
    const m = miolo(C['usuarios-editar-sem-papel']());
    expect(m).toContain('<option value="" selected>— sem papel —</option>');
    expect(m).not.toMatch(/<option value="r-adm" selected/);
  });
});

describe('Empresas (só EcoSun)', () => {
  const m = miolo(C.empresas());
  it('tabela com status em pílula, data dd/mm/aaaa ou —, nome escapado, Criar empresa dourado único', () => {
    expect(m).toContain('<h1>Empresas</h1>');
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toMatch(/cc-pill[^>]*>ativa</);
    expect(m).toMatch(/cc-pill[^>]*>inativa</);
    expect(m).toContain('22/07/2026');
    expect(m).toContain('Solar Aurora &lt;script&gt;x&lt;/script&gt;');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form method="post" action="\/dashboard\/empresas\/nova" class="cc-form/);
    expect(m).toContain('action="/dashboard/empresas/aaaa1111-2222-3333-4444-555566667777/convite"');
  });
  it('avisos em cc-aviso; vazia → estado vazio', () => {
    expect(miolo(C['empresas-ok']())).toContain('cc-aviso cc-aviso-ok');
    const e = miolo(C['empresas-erro']());
    expect(e).toContain('cc-aviso cc-aviso-erro');
    expect(e).toContain('Login &lt;b&gt;já&lt;/b&gt; existe');
    expect(e).toContain('cc-empty');
  });
});

describe('Conectar WhatsApp (tenant)', () => {
  it('sem instância: recado sem polling e sem marca da casa', () => {
    const h = C['whatsapp-sem-instancia']();
    expect(h).toContain('ainda não foi preparado');
    expect(h).not.toContain('/dashboard/whatsapp/qr.json');
    semMarcaDaCasa(h);
  });
  it('aguardando: pílula de atenção, QR em painel, polling qr.json/estado.json', () => {
    const h = C['whatsapp-aguardando']();
    const m = miolo(h);
    expect(m).toMatch(/id="estado"[^>]*class="cc-pill cc-s-warn/);
    expect(m).toContain('Aguardando conexão');
    expect(m).toContain('id="qr"');
    expect(h).toContain("fetch('/dashboard/whatsapp/qr.json'");
    expect(h).toContain("fetch('/dashboard/whatsapp/estado.json'");
    semMarcaDaCasa(h);
  });
  it('conectado: pílula verde + "WhatsApp conectado!"; "close" ao abrir = Aguardando (igual a hoje); Caiu vermelho só se cair com a tela aberta', () => {
    const ok = miolo(C['whatsapp-conectado']());
    expect(ok).toMatch(/id="estado"[^>]*class="cc-pill cc-s-ok/);
    expect(ok).toContain('WhatsApp conectado!');
    const h = C['whatsapp-caiu']();
    expect(miolo(h)).toMatch(/id="estado"[^>]*class="cc-pill cc-s-warn/);
    expect(miolo(h)).toContain('Aguardando conexão');
    expect(h).toContain("var caiu=jaConectou&&estado==='close'");
    expect(h).toContain('cc-pill cc-s-crit cc-cf-estado');
    expect(h).toContain('Caiu — leia o QR de novo');
  });
  it('o script compila e só troca classes cc- (nada de Tailwind no JS)', () => {
    const h = C['whatsapp-aguardando']();
    const js = (h.match(/<script>\s*\(function\(\)\{[\s\S]*?<\/script>/) ?? [''])[0].replace(/^<script>|<\/script>$/g, '');
    expect(js).toContain('pintar');
    expect(() => new Function(js)).not.toThrow();
    expect(js).not.toMatch(/bg-emerald|bg-amber|text-amber|animate-pulse/);
  });
});

describe('Minha assinatura (tenant)', () => {
  it('plano com pílula, uso em barra, sem ação dourada quando não há cobrança', () => {
    const h = C['assinatura-ativa']();
    const m = miolo(h);
    expect(m).toContain('<h1>Minha assinatura</h1>');
    expect(m).toContain('Monitoramento de Usinas');
    expect(m).toContain('R$ 297,00');
    expect(m).toContain('28/10/2026');
    expect(m).toMatch(/cc-pill[^>]*>ativa</);
    expect(m).toContain('role="progressbar"');
    expect(m).toContain('/dashboard/minha-assinatura/zap/solicitar');
    expect(ouros(m)).toBe(0);
    semMarcaDaCasa(h);
  });
  it('cobrança pendente: Pagar agora é a ação dourada única, link escapado', () => {
    const m = miolo(C['assinatura-vencendo-pagar']());
    expect(ouros(m)).toBe(1);
    expect(m).toContain('Pagar agora');
    expect(m).toContain('https://checkout.exemplo.invalid/x?a=1&amp;b=2');
    expect(m).toContain('rel="noopener noreferrer"');
    expect(m).toContain('cc-aviso cc-aviso-ok');
    expect(m).toMatch(/cc-pill[^>]*>vence em breve</);
  });
  it('travada: aviso de suspensão, zap confirmado, produto escapado', () => {
    const m = miolo(C['assinatura-travada']());
    expect(m.toLowerCase()).toContain('suspens');
    expect(m).toContain('WhatsApp confirmado');
    expect(m).toContain('Plano &lt;b&gt;Pro&lt;/b&gt;');
    expect(m).toContain('Limite do plano atingido');
  });
  it('sem limite: uso → —; sem assinatura: estado vazio sem marca da casa', () => {
    expect(miolo(C['assinatura-sem-limite']())).toContain('—');
    const v = C['assinatura-vazia']();
    expect(miolo(v)).toContain('Nenhuma assinatura');
    expect(miolo(v)).toContain('cc-empty');
    semMarcaDaCasa(v);
  });
});

describe('Configurações — sem Tailwind', () => {
  it('arquivos inteiros sem utilitário Tailwind; nenhuma tela carrega o CDN', () => {
    for (const arq of ['usuarios-views.ts', 'empresas-views.ts', 'whatsapp-views.ts', 'minha-assinatura-views.ts', 'configuracoes-casca.ts']) {
      const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', arq), 'utf-8');
      expect(linhasComTailwind(fonte), arq).toEqual([]);
    }
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});
