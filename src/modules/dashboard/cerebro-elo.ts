// src/modules/dashboard/cerebro-elo.ts
// "Pergunte ao Elo" — o Elo responde perguntas do usuario com base no
// SnapshotElo real (cerebro-data.ts), NUNCA inventando numero. E tambem
// monta as falas de narracao ambiente da tela viva a partir do mesmo
// snapshot. Best-effort: falha na IA nunca quebra a tela.
import { aplicarTravaPrecoExplicito } from '../email/price-lock.js';
import { empresa, nomeTituloCase } from '../empresa-config.js';
import type { SnapshotElo } from './cerebro-data.js';

/**
 * Responde uma pergunta do usuario como o Elo, ancorado no snapshot real.
 * O snapshot inteiro vai pro system prompt como "DADOS REAIS" e a IA e
 * instruida a nunca inventar numero — se nao estiver nos dados, deve dizer
 * que ainda nao tem esse dado. A trava de preco (aplicarTravaPrecoExplicito)
 * e uma segunda guarda: se mesmo assim a IA cravar um valor em reais, a
 * resposta cai pro fallback seguro. Usamos a variante EXPLICITA (nao a
 * estrita do e-mail) porque o Elo responde contagens reais (leads, usinas,
 * eventos) que costumam passar de 100 — a heuristica de "numero solto de
 * 3+ digitos" da variante estrita bloquearia essas respostas corretas.
 */
export async function responderComoElo(
  anthropic: any,
  pergunta: string,
  snap: SnapshotElo,
  ctx?: { isCeo?: boolean; nome?: string },
): Promise<string> {
  const dados = JSON.stringify(snap);
  const e = empresa();
  const ceoNome = nomeTituloCase(e.rtNome);
  // Sem ctx explicito, assume acesso total (compatibilidade); a rota passa o
  // usuario logado do dashboard (isAdmin = direcao/CEO).
  const isCeo = ctx?.isCeo !== false;
  const quemFala = ctx?.nome && ctx.nome.trim() ? ctx.nome.trim() : isCeo ? ceoNome : 'alguem da equipe';

  const identidade =
    'Voce e o Elo, o cerebro do ' + e.nomeFantasia + ' — ' + e.descricaoCurta + '. ' +
    'Regiao de atuacao: ' + e.regiaoAtuacao + '. ' +
    'Voce liga todos os departamentos (casas) do ecossistema pra que nada se perca: Atendimento (a Eva no ' +
    'WhatsApp), Comercial (leads e propostas), Marketing (e-mail, blog e anuncios), Operacao (monitoramento ' +
    'das usinas), Relacionamento (pos-venda) e Financeiro. O fundador e CEO da empresa e ' + ceoNome + '. ';

  const acesso = isCeo
    ? 'Voce esta falando com ' + quemFala + ', o CEO. Pode contar tudo: numeros, tendencias, o que estiver nos dados. '
    : 'Voce esta falando com ' + quemFala + ', da equipe. Responda de forma geral e acolhedora, so o que for ' +
      'necessario. NAO entre em detalhes profundos nem sensiveis da operacao (estrategia, margens, planos ' +
      'internos, numeros que so a direcao deve ver). Se pedirem esse nivel de detalhe, diga com gentileza que ' +
      'isso e so com a direcao. ';

  const regras =
    'Responda a pergunta APENAS com base nos DADOS REAIS abaixo. NUNCA invente numeros nem fatos. Se a resposta ' +
    'nao estiver nos dados, diga que ainda nao tem esse dado. Nunca cite preco ou valor em reais. ' +
    'Fale como uma pessoa conversando, com naturalidade e fluencia: frases curtas, claras e bem pontuadas, ' +
    'em portugues do Brasil. Sua resposta e falada em voz alta por um sintetizador de voz, entao responda em ' +
    'texto corrido: SEM markdown, sem asteriscos, sem listas com marcadores ou numeradas, sem titulos/cabecalhos ' +
    'e sem emojis — so frases naturais.\n';

  const system = identidade + acesso + regras + 'DADOS REAIS: ' + dados;

  let resposta = 'Nao consegui pensar agora, tenta de novo daqui a pouco.';
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: String(pergunta).slice(0, 500) }],
    });
    const txt = resp.content.find((b: any) => b.type === 'text')?.text as string | undefined;
    if (txt && txt.trim()) resposta = txt.trim();
  } catch (err) {
    console.warn('[elo-pergunta] IA falhou:', (err as Error)?.message);
  }

  return aplicarTravaPrecoExplicito(
    resposta,
    'Sobre valores eu prefiro te conectar com o time — mas posso te contar como o negocio esta indo. 😊',
  );
}

/**
 * Monta as falas de narracao ambiente da tela viva do Elo, direto dos
 * numeros reais do snapshot (sem IA — determinístico e sempre exato).
 */
export function montarFalasElo(snap: SnapshotElo): string[] {
  const falas: string[] = [
    'Oi, eu sou o Elo. Ligo todos os departamentos do EcoSunPower pra que nada se perca.',
  ];
  if (snap.comercial?.leads) {
    falas.push(`Agora estou cuidando de ${snap.comercial.leads} leads, ${snap.comercial.negociacao} em negociacao.`);
  }
  if (snap.marketing?.emailsAbertos) {
    falas.push(`Ja tivemos ${snap.marketing.emailsAbertos} e-mails abertos.`);
  }
  if (snap.operacao?.usinas) {
    falas.push(`Monitoro ${snap.operacao.usinas} usinas gerando energia.`);
  }
  if (snap.financeiro?.vendas) {
    falas.push(`Ja comemoramos ${snap.financeiro.vendas} vendas fechadas.`);
  }
  falas.push('Cada conversa, clique e venda: eu guardo e conecto. Nada se perde comigo.');
  return falas;
}
