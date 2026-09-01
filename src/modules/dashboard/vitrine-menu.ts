// src/modules/dashboard/vitrine-menu.ts
// Os três estados de um item do menu — a vitrine do SaaS.
//
// Junior 01/09/2026: "quero que você deixe todos os menus no dashboard da
// Conquista Solar, mas todos desabilitados, e quando ela clicar aparecer uma
// demonstração caso ela adquirisse essa parte... como vitrine".
//
// Antes: item que o papel não permitia SUMIA. O cliente não fazia ideia do
// tamanho do que existe — e o que ele não vê, ele não compra.
//
// Agora: aparece apagado, com cadeado, e clicar leva à apresentação do módulo.
//
// ⚠️ A vitrine é só a porta bonita. A FECHADURA continua trancada no servidor:
// mesmo digitando o endereço na barra, o `exigir(...)` da rota barra. Nada aqui
// libera acesso a nada.
//
// O que NUNCA vira vitrine: o que é da casa e não se vende (gestão de tenants,
// cadastro de empresas) e as conveniências internas da EcoSun (itens sem área).

export type EstadoItem = 'visivel' | 'bloqueado' | 'escondido';

export interface ItemDeMenu {
  area?: string;
  nivel?: string;
  soEcosun?: boolean;
  soTenant?: boolean;
}

export interface UsuarioDoMenu {
  companyId: string;
}

/**
 * O que fazer com este item para este usuário.
 *
 * `podeNaArea` é injetado (o `can()` do dashboard) para esta função ficar pura
 * e testável sem montar permissão de verdade.
 */
export function estadoDoItem(
  item: ItemDeMenu,
  user: UsuarioDoMenu | undefined,
  ecosunCompanyId: string,
  podeNaArea: (u: never, area: string, nivel?: string) => boolean,
): EstadoItem {
  const ehTenant = Boolean(user && user.companyId !== ecosunCompanyId);

  // Gestão de tenants é da casa: some, e a rota também barra.
  if (item.soEcosun && ehTenant) return 'escondido';
  if (item.soTenant && (!user || !ehTenant)) return 'escondido';

  // Item sem área é conveniência interna da EcoSun (Cockpit, Fechou!,
  // Contratos...). Não é módulo vendável — não entra na vitrine.
  if (!item.area) return ehTenant ? 'escondido' : 'visivel';

  // Sem usuário (tela de login): comportamento de sempre.
  if (!user) return 'visivel';

  if (podeNaArea(user as never, item.area, item.nivel)) return 'visivel';

  // Aqui está a virada: o cliente vê que o módulo existe, em vez de nem saber.
  // Pra EcoSun continua sumindo — ela não é cliente de si mesma.
  return ehTenant ? 'bloqueado' : 'escondido';
}
