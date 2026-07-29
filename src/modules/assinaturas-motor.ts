// src/modules/assinaturas-motor.ts
// Motor automático das mensalidades (fatia 2). Régua do Junior:
// 8d antes: link + aviso · 2d antes: lembrete · venceu: 3d de tolerância com
// último aviso · depois trava (e o Junior fica sabendo no zap).
// Tudo por janela (não data exata): se o cron perder um dia, sai no seguinte.
import type { StatusAssinatura } from './dashboard/assinaturas-store.js';

export type Acao = 'aviso8' | 'aviso2' | 'ultimo' | 'travar';

const DIA_MS = 86_400_000;

export function acaoDoDia(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
  jaEnviados: ReadonlySet<string>,
): Acao | null {
  if (a.status !== 'ativa') return null;
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / DIA_MS);
  if (dias < -3) return 'travar';
  if (dias < 0) return jaEnviados.has('ultimo') ? null : 'ultimo';
  if (dias <= 2) return jaEnviados.has('aviso2') ? null : 'aviso2';
  if (dias <= 8) return jaEnviados.has('aviso8') ? null : 'aviso8';
  return null;
}

// ============================================================================
// ORQUESTRADOR — dependências injetadas (testável sem rede/banco)
// ============================================================================

export interface AssinaturaMotor {
  id: string; nome: string; email: string | null; telefone: string | null;
  zapConfirmado: boolean; valorCentavos: number; venceEm: string;
  status: StatusAssinatura; produtoNome: string; produtoId: string; limite: number | null;
}

export interface MotorDeps {
  listarAtivas(): Promise<AssinaturaMotor[]>;
  avisosDoCiclo(assinaturaId: string, ciclo: string): Promise<ReadonlySet<string>>;
  registrarAviso(assinaturaId: string, tipo: Acao | 'travou', ciclo: string): Promise<void>;
  /** Link de pagamento do ciclo (reusa cobrança pendente ou cria uma nova). */
  linkDaCobranca(a: AssinaturaMotor): Promise<string | null>;
  travar(assinaturaId: string): Promise<void>;
  enviarEmail(to: string, assunto: string, corpoHtml: string, ctaUrl: string | null): Promise<void>;
  enviarZap(telefone: string, texto: string): Promise<void>;
  avisarJunior(texto: string): Promise<void>;
}

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** Textos em português claro — o cliente lê isso. */
export function textosDoAviso(acao: Acao, a: AssinaturaMotor, link: string | null): { assunto: string; corpoHtml: string; zap: string } {
  const valor = `R$ ${reais(a.valorCentavos)}`;
  const vence = dataBr(a.venceEm);
  const pagar = link ? `\n\nPra pagar (Pix ou cartão): ${link}` : '';
  if (acao === 'aviso8') return {
    assunto: `Sua mensalidade do ${a.produtoNome} vence dia ${vence}`,
    corpoHtml: `<p>Olá, ${a.nome}!</p><p>Sua mensalidade do <b>${a.produtoNome}</b> (${valor}) vence no dia <b>${vence}</b>.</p><p>O link de pagamento já está pronto — Pix ou cartão, como preferir.</p>`,
    zap: `Olá, ${a.nome}! 😊 Sua mensalidade do ${a.produtoNome} (${valor}) vence dia ${vence}.${pagar}`,
  };
  if (acao === 'aviso2') return {
    assunto: `Faltam 2 dias: mensalidade do ${a.produtoNome} (${vence})`,
    corpoHtml: `<p>Olá, ${a.nome}!</p><p>Passando pra lembrar: sua mensalidade do <b>${a.produtoNome}</b> (${valor}) vence <b>dia ${vence}</b>.</p>`,
    zap: `Oi, ${a.nome}! Lembrete rapidinho: a mensalidade do ${a.produtoNome} (${valor}) vence dia ${vence}.${pagar}`,
  };
  return {
    assunto: `Sua mensalidade do ${a.produtoNome} venceu — evite a suspensão`,
    corpoHtml: `<p>Olá, ${a.nome}.</p><p>Sua mensalidade do <b>${a.produtoNome}</b> (${valor}) venceu no dia ${vence}. Pra não suspender o seu acesso, o pagamento pode ser feito em até 3 dias.</p><p>Se já pagou, desconsidere este aviso.</p>`,
    zap: `${a.nome}, sua mensalidade do ${a.produtoNome} (${valor}) venceu dia ${vence}. Pra não suspender o acesso, é só pagar em até 3 dias, tá?${pagar} Se já pagou, ignora esse aviso. 🙏`,
  };
}

export async function processarAssinaturas(deps: MotorDeps, hoje: string): Promise<{ avisos: number; travadas: number }> {
  const resultado = { avisos: 0, travadas: 0 };
  const ativas = await deps.listarAtivas();
  for (const a of ativas) {
    try {
      const ciclo = a.venceEm;
      const enviados = await deps.avisosDoCiclo(a.id, ciclo);
      const acao = acaoDoDia({ status: a.status, venceEm: a.venceEm }, hoje, enviados);
      if (!acao) continue;
      if (acao === 'travar') {
        await deps.travar(a.id);
        await deps.registrarAviso(a.id, 'travou', ciclo);
        await deps.avisarJunior(`⛔ Assinatura TRAVADA por falta de pagamento: ${a.nome} — ${a.produtoNome} (R$ ${reais(a.valorCentavos)}, venceu ${dataBr(a.venceEm)}). Destrava sozinha se pagar; pra liberar na mão use a tela Assinaturas.`);
        resultado.travadas++;
        continue;
      }
      const link = await deps.linkDaCobranca(a);
      const t = textosDoAviso(acao, a, link);
      if (a.email) await deps.enviarEmail(a.email, t.assunto, t.corpoHtml, link);
      if (a.telefone && a.zapConfirmado) await deps.enviarZap(a.telefone, t.zap);
      await deps.registrarAviso(a.id, acao, ciclo);
      resultado.avisos++;
    } catch (err) {
      console.error(`[assinaturas-motor] assinatura ${a.id} falhou:`, (err as Error).message);
    }
  }
  return resultado;
}
