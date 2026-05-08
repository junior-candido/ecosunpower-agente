// Registry de adapters por marca. Pra adicionar nova marca:
//   1. Criar src/modules/monitoring/adapters/<nova-marca>.ts implementando MonitoringAdapter
//   2. Importar e adicionar ao registry abaixo
//   3. Atualizar enum CHECK constraint da migration sistemas_clientes (se nao listada)
//
// Resto do codigo (cron, dashboard) ja funciona.

import type { MarcaInversor, MonitoringAdapter } from './types.js';
import { solarEdgeAdapter } from './adapters/solaredge.js';

const adapters: Partial<Record<MarcaInversor, MonitoringAdapter>> = {
  solaredge: solarEdgeAdapter,
  // sungrow: sungrowAdapter,    // futuro
  // deye: deyeAdapter,          // futuro
  // hoymiles: hoymilesAdapter,  // futuro
  // goodwe: goodweAdapter,      // futuro
  // huawei: huaweiAdapter,      // futuro
  // foxess: foxessAdapter,      // futuro
  // nep: nepAdapter,            // futuro (limitada)
};

export function getAdapter(marca: MarcaInversor): MonitoringAdapter | null {
  return adapters[marca] ?? null;
}

export function marcasSuportadas(): MarcaInversor[] {
  return Object.keys(adapters) as MarcaInversor[];
}
