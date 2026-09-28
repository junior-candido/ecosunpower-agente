// Casos das Configurações (renovação do miolo, R19) — usuários (lista e editar),
// empresas (só EcoSun), Conectar WhatsApp (tenant) e Minha assinatura (tenant).
// Dados FICTÍCIOS: nomes inventados, nunca pessoa ou empresa real.
import { renderUsuariosListPage, renderUsuarioEditPage } from '../../src/modules/dashboard/usuarios-views.js';
import { renderEmpresasPage } from '../../src/modules/dashboard/empresas-views.js';
import { renderWhatsappPage } from '../../src/modules/dashboard/whatsapp-views.js';
import { renderMinhaAssinaturaPage } from '../../src/modules/dashboard/minha-assinatura-views.js';
import type { AssinaturaRow } from '../../src/modules/dashboard/assinaturas-store.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const hora = (h: number) => new Date(Date.UTC(2026, 8, 28, 12) - h * 3600_000).toISOString();

export const PAPEIS: any[] = [
  { id: 'r-adm', company_id: USER_CASA.companyId, nome: 'Administrador', permissoes: {}, is_admin: true },
  { id: 'r-com', company_id: USER_CASA.companyId, nome: 'Comercial', permissoes: { leads: ['visualizar', 'editar'], propostas: ['visualizar'] }, is_admin: false },
  { id: 'r-campo', company_id: USER_CASA.companyId, nome: 'Campo <b>O&M</b>', permissoes: { servicos: ['visualizar', 'criar'] }, is_admin: false },
];

// Campos role_id/last_login_at: a lista antiga ignora; a nova usa ("vê" e último acesso).
export const USUARIOS: any[] = [
  { id: 'u-casa', nome: 'Junior', login: 'junior', ativo: true, role_nome: 'Administrador', role_id: 'r-adm', last_login_at: hora(0.1) },
  { id: 'u-ana', nome: "Ana D'Ávila", login: 'ana', ativo: true, role_nome: 'Comercial', role_id: 'r-com', last_login_at: hora(26) },
  { id: 'u-bru', nome: 'Bruno <script>alert(1)</script>', login: 'bruno"x', ativo: true, role_nome: 'Campo <b>O&M</b>', role_id: 'r-campo', last_login_at: null },
  { id: 'u-car', nome: 'Carla Fictícia', login: 'carla', ativo: false, role_nome: null, role_id: null, last_login_at: hora(24 * 40) },
];

const EDITAR = {
  id: 'u-ana', nome: "Ana D'Ávila <i>", login: 'ana', ativo: true, role_id: 'r-com',
  telefone: '5561999990001', acesso_temporario: true, email: 'ana@exemplo.invalid',
};

const EMPRESAS = [
  { id: USER_CASA.companyId, nome: 'Casa Matriz Teste', ativo: true, createdAt: '2025-01-01T10:00:00Z', usuarios: 6 },
  { id: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Solar Aurora <script>x</script>', ativo: true, createdAt: '2026-07-22T10:00:00Z', usuarios: 2 },
  { id: 'bbbb1111-2222-3333-4444-555566667777', nome: 'Painel Norte Ltda', ativo: false, createdAt: '', usuarios: 0 },
];

const ASSINATURA: AssinaturaRow = {
  id: 'as-1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Solar Aurora Teste',
  email: 'contato@exemplo.invalid', telefone: '5561988887777', zapConfirmado: false,
  valorCentavos: 29700, limite: 110, venceEm: '2026-10-28', status: 'ativa', companyId: USER_TENANT.companyId,
};

const USER_TENANT_COMUM = { ...USER_TENANT, id: 'u-ten-2', isAdmin: false, roleNome: 'Comercial', permissoes: { usuarios: ['visualizar'] } };

export const CASOS_CONFIGURACOES = {
  // ── /usuarios ──
  'usuarios-lista': () => renderUsuariosListPage(USUARIOS, PAPEIS, USER_CASA),
  'usuarios-lista-tenant': () => renderUsuariosListPage(USUARIOS.map((u) => ({ ...u, id: u.id === 'u-casa' ? 'u-ten' : u.id })), PAPEIS, USER_TENANT),
  'usuarios-lista-tenant-comum': () => renderUsuariosListPage(USUARIOS, PAPEIS, USER_TENANT_COMUM as any),
  'usuarios-lista-vazia': () => renderUsuariosListPage([], [], USER_CASA),
  'usuarios-editar': () => renderUsuarioEditPage(EDITAR, PAPEIS, USER_CASA),
  'usuarios-editar-tenant': () => renderUsuarioEditPage({ ...EDITAR, acesso_temporario: false, ativo: false, telefone: null, email: null }, PAPEIS, USER_TENANT),
  'usuarios-editar-sem-papel': () => renderUsuarioEditPage({ ...EDITAR, role_id: null }, PAPEIS, USER_CASA),
  // ── /empresas (só admin da EcoSun) ──
  'empresas': () => renderEmpresasPage(EMPRESAS, USER_CASA),
  'empresas-ok': () => renderEmpresasPage(EMPRESAS, USER_CASA, { tipo: 'ok', texto: 'Empresa criada! O administrador recebeu um e-mail para criar a própria senha (link vale 72 h).' }),
  'empresas-erro': () => renderEmpresasPage([], USER_CASA, { tipo: 'erro', texto: 'Login <b>já</b> existe' }),
  // ── /whatsapp (tenant) ──
  'whatsapp-sem-instancia': () => renderWhatsappPage({ user: USER_TENANT, instancia: null, estado: 'desconhecido' }),
  'whatsapp-aguardando': () => renderWhatsappPage({ user: USER_TENANT, instancia: 'solar-aurora', estado: 'connecting' }),
  'whatsapp-conectado': () => renderWhatsappPage({ user: USER_TENANT, instancia: 'solar-aurora', estado: 'open' }),
  'whatsapp-caiu': () => renderWhatsappPage({ user: USER_TENANT, instancia: 'solar-aurora', estado: 'close' }),
  // ── /minha-assinatura (tenant) ──
  'assinatura-ativa': () => renderMinhaAssinaturaPage(ASSINATURA, '2026-09-28', 87, null, USER_TENANT),
  'assinatura-vencendo-pagar': () => renderMinhaAssinaturaPage(ASSINATURA, '2026-10-24', 104, 'https://checkout.exemplo.invalid/x?a=1&b=2', USER_TENANT, { tipo: 'ok', texto: 'Código enviado no seu WhatsApp — digite ele aqui embaixo.' }),
  'assinatura-travada': () => renderMinhaAssinaturaPage({ ...ASSINATURA, status: 'travada', zapConfirmado: true, produtoNome: 'Plano <b>Pro</b>' }, '2026-11-15', 110, 'https://checkout.exemplo.invalid/y', USER_TENANT, { tipo: 'erro', texto: 'Código errado ou vencido — peça um novo.' }),
  'assinatura-sem-limite': () => renderMinhaAssinaturaPage({ ...ASSINATURA, limite: null, telefone: null }, '2026-09-28', null, null, USER_TENANT),
  'assinatura-vazia': () => renderMinhaAssinaturaPage(null, '2026-09-28', null, null, USER_TENANT),
};
