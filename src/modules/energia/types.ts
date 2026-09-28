// src/modules/energia/types.ts
//
// Tipos comuns da Gestão de Energia. MedidorAdapter é IRMÃO de
// MonitoringAdapter (monitoring/types.ts): lê o QUADRO (o que entra e sai da
// rede), não o inversor. Registro separado de propósito (spec §2.1): se o
// Shelly entrasse como "mais uma marca de inversor", a exportação dele viraria
// "geração" em geracao_diaria e estragaria PR, classificação e o detector de
// troca de medidor da concessionária.

import type { CredShelly } from './credenciais.js';

export type FabricanteMedidor = 'shelly';
export type PerfilMedidor = 'triphase' | 'monophase';
export type ModoColeta = 'push' | 'nuvem' | 'push_nuvem';
export type StatusMedidor = 'aguardando' | 'ok' | 'mudo' | 'erro' | 'credencial_invalida';

export interface LeituraMedidor {
  tensao: number | null;
  corrente: number | null;
  potenciaW: number;
  potenciaVa: number | null;
  fatorPotencia: number | null;
  energiaWh: number | null;
  energiaDevolvidaWh: number | null;
}

export interface DeviceNuvem {
  id: string;
  online: boolean;
  modelo: string | null;
  status: Record<string, unknown> | null;
}

export type StatusResult =
  | { ok: true; devices: DeviceNuvem[] }
  | { ok: false; reason: string; invalidCredentials?: boolean };

export interface MedidorAdapter {
  fabricante: FabricanteMedidor;
  buscarStatus(cred: CredShelly, ids: string[]): Promise<StatusResult>;
  lerCanal(status: Record<string, unknown>, perfil: PerfilMedidor, canal: number): LeituraMedidor | null;
  // G4: comutar?(cred, id, canal, ligar, toggleAfterS?): Promise<{ ok: boolean; reason?: string }>;
}
