// src/modules/energia/form-medidor.ts
//
// Validação do formulário de cadastro/edição do medidor. PURA: recebe o corpo
// do POST e o contexto (usinas DA EMPRESA, chave de cifra, credencial já
// guardada) e devolve os campos prontos pro banco ou a lista de erros em
// português. A chave da nuvem Shelly entra aqui e sai CIFRADA — nunca volta.

import { cifrarCred, chaveEnergiaValida, normalizarDeviceId, normalizarServerUri } from './credenciais.js';

export interface ContextoForm {
  usinas: Array<{ id: string; lead_id: string | null }>;
  keyHex: string | undefined;
  /** Edição: já existe chave guardada (campo em branco = mantém). */
  temCredencialGuardada: boolean;
  novo: boolean;
  /** A chave da nuvem é cifrada amarrada a ESTE medidor e ESTA empresa (AAD). */
  medidorId: string;
  companyId: string;
}

export interface ValoresForm {
  apelido: string; device_id: string; sistema_id: string; perfil: string; canal: string; ligacao: string;
  tensao_nominal_v: string; concessionaria: string; uc_instalacao: string; codigo_cliente: string; grupo_gd: string;
  modo_coleta: string; server_uri: string; consentimento: boolean;
  /** Edição: "Medidor ligado". Desligado = o webhook recusa e os crons pulam. */
  ativo: boolean;
}

export type ResultadoForm =
  | { ok: true; dados: Record<string, unknown>; valores: ValoresForm }
  | { ok: false; erros: string[]; valores: ValoresForm };

const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const umDe = <T extends string>(v: string, ops: readonly T[]): T | null => (ops as readonly string[]).includes(v) ? (v as T) : null;

export function validarFormMedidor(corpo: Record<string, unknown>, ctx: ContextoForm): ResultadoForm {
  const valores: ValoresForm = {
    apelido: txt(corpo.apelido, 80),
    device_id: txt(corpo.device_id, 64),
    sistema_id: txt(corpo.sistema_id, 40),
    perfil: txt(corpo.perfil, 12) || 'triphase',
    canal: txt(corpo.canal, 2) || '2',
    ligacao: txt(corpo.ligacao, 4),
    tensao_nominal_v: txt(corpo.tensao_nominal_v, 4),
    concessionaria: txt(corpo.concessionaria, 60),
    uc_instalacao: txt(corpo.uc_instalacao, 20),
    codigo_cliente: txt(corpo.codigo_cliente, 20),
    grupo_gd: txt(corpo.grupo_gd, 10),
    modo_coleta: txt(corpo.modo_coleta, 12) || 'push',
    server_uri: txt(corpo.server_uri, 120),
    consentimento: corpo.consentimento === 'on' || corpo.consentimento === '1' || corpo.consentimento === 'true',
    ativo: corpo.ativo === 'on' || corpo.ativo === '1' || corpo.ativo === 'true',
  };
  // A chave NÃO entra em `valores` (que volta pra tela em caso de erro).
  const authKey = String(corpo.auth_key ?? '').trim().slice(0, 400);
  const erros: string[] = [];

  if (!valores.apelido) erros.push('Dê um nome ao medidor (ex.: "Quadro da casa").');
  const device = normalizarDeviceId(valores.device_id);
  if (!/^[a-z0-9]{6,32}$/.test(device)) erros.push('O código do aparelho não parece certo. Ele fica no app Shelly, em Configurações do aparelho → Informações (ex.: 007007422d90).');

  let sistemaId: string | null = null;
  let leadId: string | null = null;
  if (valores.sistema_id) {
    const u = ctx.usinas.find((x) => x.id === valores.sistema_id);
    if (!u) erros.push('A usina escolhida não foi encontrada nesta empresa.');
    else { sistemaId = u.id; leadId = u.lead_id; }
  }

  const perfil = umDe(valores.perfil, ['triphase', 'monophase'] as const);
  if (!perfil) erros.push('Escolha o perfil do aparelho (trifásico ou monofásico).');
  const canal = Number(valores.canal);
  if (![0, 1, 2].includes(canal)) erros.push('Escolha em qual entrada (A, B ou C) está o sensor do cabo da rede.');
  const ligacao = valores.ligacao ? umDe(valores.ligacao, ['mono', 'bi', 'tri'] as const) : null;
  if (valores.ligacao && !ligacao) erros.push('Ligação inválida.');
  const tensao = valores.tensao_nominal_v ? Number(valores.tensao_nominal_v) : null;
  if (tensao !== null && ![127, 220, 380].includes(tensao)) erros.push('Tensão nominal inválida.');
  const grupo = valores.grupo_gd ? umDe(valores.grupo_gd, ['gd1', 'gd2', 'gd1_gd2', 'sem_gd'] as const) : null;
  if (valores.grupo_gd && !grupo) erros.push('Grupo de GD inválido.');
  if (valores.uc_instalacao && !/^[0-9]{3,20}$/.test(valores.uc_instalacao)) erros.push('O número da instalação (UC) deve ter só números, como está no demonstrativo.');
  const modo = umDe(valores.modo_coleta, ['push', 'nuvem', 'push_nuvem'] as const);
  if (!modo) erros.push('Escolha como o dado chega.');
  if (ctx.novo && !valores.consentimento) erros.push('Marque que o cliente autorizou a medição (consumo é dado pessoal — LGPD).');

  let credCifrada: string | undefined;
  const usaNuvem = modo === 'nuvem' || modo === 'push_nuvem';
  if (usaNuvem) {
    const precisaChave = authKey || !ctx.temCredencialGuardada;
    if (precisaChave) {
      const server = normalizarServerUri(valores.server_uri);
      if (!authKey) erros.push('Para ler pela nuvem, cole a "Authorization cloud key" do app Shelly.');
      if (!server) erros.push('O endereço do servidor da nuvem tem que terminar em ".shelly.cloud" (ex.: shelly-77-eu.shelly.cloud).');
      if (!chaveEnergiaValida(ctx.keyHex)) erros.push('O servidor ainda não tem a chave de cifra (ENERGIA_CRED_KEY) — peça para configurar antes de guardar a chave da nuvem.');
      if (authKey && server && chaveEnergiaValida(ctx.keyHex)) credCifrada = cifrarCred({ server_uri: server, auth_key: authKey }, ctx.keyHex, { medidorId: ctx.medidorId, companyId: ctx.companyId });
    }
  } else if (authKey) {
    erros.push('A chave da nuvem só é usada quando o dado chega pela nuvem. Escolha "pela nuvem" ou apague a chave.');
  }

  if (erros.length) return { ok: false, erros, valores };
  const dados: Record<string, unknown> = {
    apelido: valores.apelido, device_id: device, sistema_id: sistemaId, lead_id: leadId, perfil, canais: { rede: canal },
    ligacao, tensao_nominal_v: tensao, concessionaria: valores.concessionaria || null, uc_instalacao: valores.uc_instalacao || null,
    codigo_cliente: valores.codigo_cliente || null, grupo_gd: grupo, modo_coleta: modo,
  };
  if (credCifrada) dados.api_credentials_cifrado = credCifrada;
  if (ctx.novo) dados.consentimento_em = new Date().toISOString();
  else dados.ativo = valores.ativo; // checkbox: ausente no POST = desligado
  return { ok: true, dados, valores };
}
