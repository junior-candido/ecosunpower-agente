// Onda 3 da renovação do miolo (R13–R19): junta as telas de cada fatia.
// Cada fatia mexe SÓ no seu tests/fixtures/telas-rNN.ts.
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { telasR13, CLASSES_R13 } from './telas-r13.js';
import { telasR14, CLASSES_R14 } from './telas-r14.js';
import { telasR15, CLASSES_R15 } from './telas-r15.js';
import { telasR16, CLASSES_R16 } from './telas-r16.js';
import { telasR17, CLASSES_R17 } from './telas-r17.js';
import { telasR18, CLASSES_R18 } from './telas-r18.js';
import { telasR19, CLASSES_R19 } from './telas-r19.js';

export function telasOnda3(n: number, user: DashUser): Record<string, string> {
  return { ...telasR13(n, user), ...telasR14(n, user), ...telasR15(n, user), ...telasR16(n, user), ...telasR17(n, user), ...telasR18(n, user), ...telasR19(n, user) };
}

export const CLASSES_ONDA3: string[] = [...CLASSES_R13, ...CLASSES_R14, ...CLASSES_R15, ...CLASSES_R16, ...CLASSES_R17, ...CLASSES_R18, ...CLASSES_R19];
