// src/modules/admin-canal.ts
//
// O "MODO DONO" VALE SÓ NO CANAL DA PRÓPRIA CASA.
//
// `isAdminPhone` responde "esse telefone é do dono da EcoSunPower?". A pergunta
// está certa, mas faltava a segunda metade: *dono onde*. O número da assistente
// de um cliente (ex.: Clara, da Conquista Solar) é outra casa — ali o Junior não
// é dono de nada.
//
// O que acontecia sem isso (09/09/2026): o Junior escreveu no número da Clara
// pra testar e ela respondeu técnico, em tom de colega, terminando com
// "quer que eu monte uma mensagem pronta pra você enviar pro cliente?".
// A assistente do cliente saiu do papel na frente da marca do cliente.
//
// Aqui a regra fica explícita e num lugar só, em vez de espalhada pelos 56
// pontos que perguntam se quem escreveu é o dono.
//
// FORA DE CONTEXTO = COMO ERA. Cron, boot e script não têm canal; nesses casos
// o modo dono continua valendo, que é o comportamento de hoje.

/**
 * O modo dono vale nesta mensagem?
 *
 * @param companyIdDoCanal empresa dona do canal em que a mensagem chegou.
 *        `undefined` = fora de contexto de canal (cron, boot, script).
 * @param ecosunCompanyId a empresa da casa.
 */
export function donoValeNesteCanal(
  companyIdDoCanal: string | undefined,
  ecosunCompanyId: string,
): boolean {
  if (!companyIdDoCanal) return true; // sem canal = como sempre foi
  return companyIdDoCanal === ecosunCompanyId;
}
