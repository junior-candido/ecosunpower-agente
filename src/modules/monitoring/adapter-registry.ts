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

const adapters: Partial<Record<MarcaInversor, MonitoringAdapter>> = {
  solaredge: solarEdgeAdapter,
  deye: deyeAdapter,
  nep: nepAdapter,
  // sungrow: sungrowAdapter,    // futuro
  // hoymiles: hoymilesAdapter,  // futuro
  // goodwe: goodweAdapter,      // futuro
  // huawei: huaweiAdapter,      // futuro
  // foxess: foxessAdapter,      // futuro
};

export function getAdapter(marca: MarcaInversor): MonitoringAdapter | null {
  return adapters[marca] ?? null;
}

export function marcasSuportadas(): MarcaInversor[] {
  return Object.keys(adapters) as MarcaInversor[];
}
