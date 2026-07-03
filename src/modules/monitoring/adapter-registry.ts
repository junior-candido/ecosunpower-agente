// Registry de adapters por marca. Pra adicionar nova marca:
//   1. Criar src/modules/monitoring/adapters/<nova-marca>.ts implementando MonitoringAdapter
//   2. Importar e adicionar ao registry abaixo
//   3. Atualizar enum CHECK constraint da migration sistemas_clientes (se nao listada)
//
// Resto do codigo (cron, dashboard) ja funciona.

import type { MarcaInversor, MonitoringAdapter } from './types.js';
import { solarEdgeAdapter } from './adapters/solaredge.js';
import { deyeAdapter } from './adapters/deye.js';
import { nepAdapter } from './adapters/nep.js';
import { abbAdapter } from './adapters/abb.js';
import { foxessAdapter } from './adapters/foxess.js';
import { goodweAdapter } from './adapters/goodwe.js';
import { solisAdapter } from './adapters/solis.js';
import { sungrowAdapter } from './adapters/sungrow.js';

const adapters: Partial<Record<MarcaInversor, MonitoringAdapter>> = {
  solaredge: solarEdgeAdapter,
  deye: deyeAdapter,
  nep: nepAdapter,
  abb: abbAdapter,
  foxess: foxessAdapter,         // LIVE 27/06 — validado em prod (30 inversores Q1-2500-E)
  goodwe: goodweAdapter,         // SEMS Portal (API interna, e-mail+senha) — validado ao vivo 01/07
  solis: solisAdapter,           // API oficial SolisCloud (KeyId+KeySecret, HMAC) — validado ao vivo 01/07
  sungrow: sungrowAdapter,       // OpenAPI OAuth2 texto plano (app só-Monitoring) — validado ao vivo 03/07
  // hoymiles: hoymilesAdapter,  // futuro
  // huawei: huaweiAdapter,      // futuro
};

export function getAdapter(marca: MarcaInversor): MonitoringAdapter | null {
  return adapters[marca] ?? null;
}

export function marcasSuportadas(): MarcaInversor[] {
  return Object.keys(adapters) as MarcaInversor[];
}
