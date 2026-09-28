// src/modules/energia/medidor-registry.ts
//
// Registro plugável de medidores — mesmo formato de monitoring/adapter-registry.ts
// (Shelly hoje; Pro EM-50, IoTaWatt, Embrasul amanhã). Registro IRMÃO, não o
// mesmo: medidor de quadro não é inversor (ver types.ts).

import type { FabricanteMedidor, MedidorAdapter } from './types.js';
import { shellyCloudAdapter } from './adapters/shelly-cloud.js';

const REGISTRO: Record<FabricanteMedidor, MedidorAdapter> = {
  shelly: shellyCloudAdapter,
};

export function getMedidorAdapter(fabricante: string): MedidorAdapter | null {
  return (REGISTRO as Record<string, MedidorAdapter | undefined>)[fabricante] ?? null;
}

export function fabricantesSuportados(): FabricanteMedidor[] {
  return Object.keys(REGISTRO) as FabricanteMedidor[];
}
