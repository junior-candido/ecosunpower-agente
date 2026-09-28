// Onda 3 — R19: Configurações. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderUsuariosListPage, renderUsuarioEditPage } from '../../src/modules/dashboard/usuarios-views.js';
import { renderEmpresasPage } from '../../src/modules/dashboard/empresas-views.js';
import { renderWhatsappPage } from '../../src/modules/dashboard/whatsapp-views.js';
import { renderMinhaAssinaturaPage } from '../../src/modules/dashboard/minha-assinatura-views.js';
import { PAPEIS } from './casos-configuracoes.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
// 'hidden' (QR/ok do WhatsApp, mexida pelo script) já é conhecida: o CSS "sem Tailwind" a define.
export const CLASSES_R19: string[] = [];

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export function telasR19(n: number, user: DashUser): Record<string, string> {
  const usuarios = Array.from({ length: n }, (_, i) => ({
    id: `u-${i}`, nome: `Pessoa Fictícia ${i}`, login: `pessoa${i}`, ativo: i % 7 !== 6,
    role_nome: PAPEIS[i % 3].nome, role_id: PAPEIS[i % 3].id, last_login_at: i % 4 ? hora(i * 5) : null,
  }));
  const telas: Record<string, string> = {
    'r19-usuarios': renderUsuariosListPage(usuarios, PAPEIS, user),
    'r19-usuario-editar': renderUsuarioEditPage({ id: 'u-1', nome: 'Pessoa Fictícia 1', login: 'pessoa1', ativo: true, role_id: 'r-com', telefone: '5561999990001', acesso_temporario: false, email: null }, PAPEIS, user),
  };
  if (user.companyId === ECOSUN) {
    telas['r19-empresas'] = renderEmpresasPage(Array.from({ length: n }, (_, i) => ({
      id: `e${i}000000-0000-4000-8000-000000000000`, nome: `Empresa Fictícia ${i}`, ativo: i % 5 !== 4, createdAt: '2026-07-22T10:00:00Z', usuarios: i % 6,
    })), user);
  } else {
    telas['r19-whatsapp'] = renderWhatsappPage({ user, instancia: 'empresa-ficticia', estado: 'connecting' });
    telas['r19-minha-assinatura'] = renderMinhaAssinaturaPage({
      id: 'as-1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Empresa Fictícia',
      email: null, telefone: null, zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-10-28', status: 'ativa', companyId: user.companyId,
    }, '2026-09-28', Math.min(n, 110), 'https://checkout.exemplo.invalid/x', user);
  }
  return telas;
}
