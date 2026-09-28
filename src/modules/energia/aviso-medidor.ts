// src/modules/energia/aviso-medidor.ts
//
// Pra quem vai o aviso do vigia do medidor ("parou", "voltou", "chave da nuvem
// recusada"). Regra (dono, 28/09): o Command Center abre pra tenants com
// isolamento estrito; na G1 o portão é SÓ o módulo contratado "medicao".
//
//  - empresa sem o módulo "medicao" → ninguém recebe (ela vê a vitrine);
//  - EcoSun                          → o zap do Junior (engineerPhone);
//  - tenant com o módulo             → SÓ o telefone_admin DELE
//    (destinoAdminDaEmpresa — trava LGPD entre controladores). Sem admin
//    cadastrado → ninguém. Nunca o zap do dono da EcoSun.
//
// O envio roda dentro de comEmpresaDe(empresa do medidor): a trava de saída do
// sendText (envioProibido) também enxerga a empresa certa.

import { comEmpresaDe, empresaDe } from '../empresa-config.js';
import { destinoAdminDaEmpresa } from '../tenant-admin-guard.js';
import type { AvisarAdmin, ResultadoAviso } from './energia-service.js';

export interface DepsAvisoMedidor {
  modulosAtivos: (companyId: string) => Promise<ReadonlySet<string>>;
  engineerPhone: string;
  enviar: (to: string, texto: string) => Promise<void>;
  /** PROACTIVE_ALERTS_DRY_RUN=1: não envia (e o vigia não grava a transição). */
  dryRun?: () => boolean;
}

export function criarAvisoMedidor(d: DepsAvisoMedidor): AvisarAdmin {
  return async (m, texto): Promise<ResultadoAviso> => {
    const ativos = await d.modulosAtivos(m.company_id);
    if (!ativos.has('medicao')) return 'sem_destino';
    return comEmpresaDe(m.company_id, async (): Promise<ResultadoAviso> => {
      const to = destinoAdminDaEmpresa(d.engineerPhone, empresaDe(m.company_id));
      if (!to) return 'sem_destino';
      if (d.dryRun?.()) {
        console.log(`[energia] vigia (dry-run): aviso não enviado medidor=${m.id}`);
        return 'dry_run';
      }
      await d.enviar(to, texto);
      return 'enviado';
    });
  };
}
