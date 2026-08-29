// src/modules/financeiro/botoes-caixa.ts
// Botões finlan:<acao>:<id>[:<extra>] da Caixa de Entrada. Na Fatia 1 o lançamento
// já está confirmado: os botões corrigem/apagam/vinculam DEPOIS. Os de pendente
// (conf/desc/pf-pj em pendente) são LEGADO — remover quando não houver pendente no banco.
// Invariante "nunca conta 2×": todo vínculo de venda passa por um CAS; a compensação
// só desfaz o PRÓPRIO vínculo (desvincularConta filtra por conta_id).
import { validarParaConfirmar } from './lancamentos.js';
import {
  getLancamento, mudarStatus, atualizarPendente, definirPfPj, gravarContaNoLancamento,
  reverterParaPendente, vincularContaSeLivre, desvincularConta, getSaldoConta,
} from './lancamentos-repo.js';
import { montarPedidoPfPj, montarEscolhaAtividade } from './resumo-lancamento.js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { gravarComprasDaNota } from './materiais.js';
import { getAtividades, cancelarConta } from './repo.js';
import {
  FOOTER, brl, MSG_ENTRADA_LIGADA, agoraIso, entradaPrecisaImposto, pendenteAguardaTexto,
  proximoEraConfirmado, type CaixaDeps,
} from './caixa-entrada.js';
import { mandarResumo } from './caixa-legado.js';

const MSG_PERGUNTA_CORRIGIR = 'O que tá errado? Me fala (ex: "era 350" / "é PF" / "foi ontem").';

export async function handleFinlanButton(deps: CaixaDeps, from: string, buttonId: string): Promise<boolean> {
  const [prefixo, acao, id, extra] = buttonId.trim().split(':');
  if (prefixo !== 'finlan') return false;
  if (acao === 'noop') return true;
  try {
    switch (acao) {
      case 'pf': case 'pj': {
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado') { await deps.sendText(from, 'Esse lançamento já foi apagado.'); return true; }
        const pfPj = acao.toUpperCase() as 'PF' | 'PJ';
        if (row.status === 'confirmado') {
          // Já registrado: só troca o mundo (botão "É PF" do registro com confiança baixa).
          await definirPfPj(deps.supabase, id, pfPj);
          await deps.sendText(from, pfPj === 'PF' ? '👍 Marquei como PF (pessoal).' : '👍 Marquei como PJ (empresa).');
          return true;
        }
        // LEGADO — remover quando não houver pendente no banco.
        await atualizarPendente(deps.supabase, id, {
          pf_pj: pfPj, extracao: { ...row.extracao, aguardando: pendenteAguardaTexto(false, row.extracao?.itens), aguardando_desde: agoraIso() },
        });
        await mandarResumo(deps, from, id);
        return true;
      }
      case 'conf': {
        // LEGADO — remover quando não houver pendente no banco (pendentes antigos confirmam por clique).
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') {
          await deps.sendText(from, 'Esse lançamento não está mais pendente.');
          return true;
        }
        const v = validarParaConfirmar({ tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento, pf_pj: row.pf_pj });
        if (!v.ok) {
          if (v.faltando.includes('pf_pj')) {
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true, aguardando_desde: agoraIso() } });
            const msg = montarPedidoPfPj(id);
            await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
          } else {
            await deps.sendText(from, `Falta: ${v.faltando.join(', ')}. Me manda por texto que eu completo.`);
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true, aguardando_desde: agoraIso() } });
          }
          return true;
        }
        if (entradaPrecisaImposto(row)) {
          const atividades = await getAtividades(deps.supabase);
          const msg = montarEscolhaAtividade(id, atividades);
          await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) {
          const res = await gravarComprasDaNota(deps.supabase, id).catch(() => ({ gravados: 0, pulados: 0 }));
          const sufMat = res.gravados === 0 ? ''
            : res.pulados > 0
              ? `\n📦 Guardei ${res.gravados} de ${res.gravados + res.pulados} preços (${res.pulados} ficaram de fora — faltou preço/nome).`
              : `\n📦 Guardei ${res.gravados} preço(s) pra comparar (manda "preço do <material>").`;
          const msgEntrada = row.tem_nota === false
            ? `💰 Entrada lançada: ${brl(Number(row.valor))} (sem nota — fora do imposto).`
            : `💰 Entrada lançada: ${brl(Number(row.valor))}.`;
          await deps.sendText(from, (row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : msgEntrada) + sufMat);
        } else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
      }
      case 'corr': {
        // Corrigir um lançamento registrado: vira pendente "aguardando" (janela de 10 min a
        // partir de agora); o próximo texto mescla e re-registra. Sem resposta, volta pro
        // caixa (soltarAguardando / expirarPendentesAntigos) — nunca some.
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado') { await deps.sendText(from, 'Esse lançamento já foi apagado.'); return true; }
        if (row.tipo === 'entrada' && row.conta_id) { await deps.sendText(from, MSG_ENTRADA_LIGADA); return true; }
        const extracao = { ...row.extracao, aguardando: true, aguardando_desde: agoraIso(), era_confirmado: proximoEraConfirmado(row.status, row.extracao) };
        // CAS confirmado→pendente: duplo toque cai no ramo "já pendente" e só renova o carimbo
        // (era_confirmado nunca rebaixa de true pra false).
        const virou = row.status === 'confirmado' && await mudarStatus(deps.supabase, id, 'confirmado', 'pendente', { extracao });
        if (!virou) await atualizarPendente(deps.supabase, id, { extracao });
        await deps.sendText(from, MSG_PERGUNTA_CORRIGIR);
        return true;
      }
      case 'desc': {
        // LEGADO — remover quando não houver pendente no banco.
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'apagado');
        await deps.sendText(from, ok ? 'Descartado 👍' : 'Esse lançamento não está mais pendente.');
        return true;
      }
      case 'apg': {
        // Invariante Fatia 2: recebimento lançado não se desfaz por botão — estorno é manual (cancelarConta tem o mesmo guard).
        const row = await getLancamento(deps.supabase, id);
        if (row?.tipo === 'entrada' && row?.conta_id) {
          await deps.sendText(from, MSG_ENTRADA_LIGADA);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'confirmado', 'apagado');
        await deps.sendText(from, ok ? '🗑️ Apagado (fica no histórico, sai dos números).' : 'Esse já tinha sido apagado.');
        return true;
      }
      case 'vinc': {
        // finlan:vinc:<lancamentoId>:<contaId> — entrada casa com venda aberta.
        // Aceita pendente (legado) e confirmado sem conta (Fatia 1).
        if (!extra) { console.warn('[caixa-entrada] vinc sem contaId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado' || (row.status === 'confirmado' && row.conta_id)) {
          await deps.sendText(from, 'Esse lançamento já foi processado.'); return true;
        }
        // Saldo ANTES do CAS: valor maior que o saldo da venda não confirma nada.
        const saldo = await getSaldoConta(deps.supabase, extra);
        if (saldo === null) { await deps.sendText(from, '⚠️ Essa venda não está mais em aberto.'); return true; }
        if (Number(row.valor) > saldo + 0.01) {
          await deps.sendWithButtons(from,
            `⚠️ O valor (${brl(Number(row.valor))}) é MAIOR que o saldo da venda (${brl(saldo)}). Lança como entrada avulsa ou corrige o valor:`,
            [
              { id: `finlan:avul:${id}`, title: 'Entrada avulsa' },
              { id: `finlan:corr:${id}`, title: 'Corrigir valor' },
              row.status === 'pendente' ? { id: `finlan:desc:${id}`, title: 'Descartar' } : { id: `finlan:apg:${id}`, title: 'Apagar' },
            ], FOOTER);
          return true;
        }
        // CAS no lançamento ANTES do dinheiro: clique duplo para AQUI (1 recebimento só) —
        // e para antes de qualquer compensação, que só o clique vencedor pode fazer.
        const eraPendente = row.status === 'pendente';
        const ok = eraPendente
          ? await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: extra })
          : await vincularContaSeLivre(deps.supabase, id, extra);
        if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        // Só o passo de DINHEIRO reverte — falha de envio de mensagem não desfaz recebimento já entrado.
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          r = await registrarRecebimento(deps.supabase, extra, Number(row.valor));
        } catch (err) {
          // Compensação do PRÓPRIO vínculo (filtro por conta_id): nunca fica vínculo fantasma.
          if (eraPendente) await reverterParaPendente(deps.supabase, id);
          else await desvincularConta(deps.supabase, id, extra);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). ${eraPendente ? 'O lançamento voltou pra pendente.' : 'O lançamento ficou no caixa, sem vínculo.'}`);
          return true;
        }
        const aviso = r.total
          ? `💵 Recebimento total na venda: ${brl(r.acumulado)}.`
          : `💵 Parcela na venda: ${brl(r.parcela)} (falta ${brl(r.saldoRestante)}).`;
        await deps.sendText(from, `${aviso}\nImposto desta parcela (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      case 'avul': {
        const atividades = await getAtividades(deps.supabase);
        const msg = montarEscolhaAtividade(id, atividades);
        await deps.sendWithButtons(from, msg.body, msg.buttons, FOOTER);
        return true;
      }
      case 'atv': {
        // finlan:atv:<lancamentoId>:<atividadeId> — entrada avulsa PJ: cria conta
        // avulsa + recebimento total imediato (motor Fatia 2 → imposto/RBT12 certos).
        if (!extra) { console.warn('[caixa-entrada] atv sem atividadeId'); return true; }
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status === 'apagado' || (row.status === 'confirmado' && row.conta_id)) {
          await deps.sendText(from, 'Esse lançamento já foi processado.'); return true;
        }
        const eraPendente = row.status === 'pendente';
        // Pendente (legado): CAS porteiro ANTES de criar a conta — clique duplo não cria 2ª conta.
        if (eraPendente) {
          const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
          if (!ok) { await deps.sendText(from, 'Esse lançamento já tinha sido processado.'); return true; }
        }
        // Confirmado (Fatia 1): a conta nasce primeiro (o id só existe depois) e o CAS é o
        // vínculo (vincularContaSeLivre). Perdeu o CAS = clique duplo: cancela SÓ a conta
        // que este clique criou e sai — sem tocar no vínculo/dinheiro do clique vencedor.
        let contaId: string | undefined;
        let r: Awaited<ReturnType<typeof registrarRecebimento>>;
        try {
          ({ contaId } = await criarContaDeFechamento(deps.supabase, {
            fechamentoId: null, leadId: row.lead_id, atividadeId: extra,
            descricao: `Entrada avulsa — ${row.contraparte ?? row.descricao ?? 'sem descrição'}`,
            valor: Number(row.valor), createdBy: from,
          }));
          if (eraPendente) {
            await gravarContaNoLancamento(deps.supabase, id, contaId);
          } else if (!(await vincularContaSeLivre(deps.supabase, id, contaId))) {
            try { await cancelarConta(deps.supabase, contaId); } catch { /* manual */ }
            await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
            return true;
          }
          r = await registrarRecebimento(deps.supabase, contaId);
        } catch (err) {
          if (contaId) {
            // Conta avulsa órfã não pode ficar inflando o "A receber" — cancela
            // best-effort (o guard do cancelarConta protege se o dinheiro entrou).
            try { await cancelarConta(deps.supabase, contaId); } catch { /* manual */ }
          }
          // Compensação do PRÓPRIO vínculo: nunca fica vínculo fantasma, nunca desfaz o de outro clique.
          if (eraPendente) await reverterParaPendente(deps.supabase, id);
          else if (contaId) await desvincularConta(deps.supabase, id, contaId);
          await deps.sendText(from, `❌ Não consegui registrar na venda (${(err as Error).message}). ${eraPendente ? 'O lançamento voltou pra pendente.' : 'O lançamento ficou no caixa, sem vínculo.'}`);
          return true;
        }
        await deps.sendText(from, `💰 Entrada avulsa lançada: ${brl(Number(row.valor))}.\nImposto (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      default:
        console.warn(`[caixa-entrada] finlan ação desconhecida: ${acao}`);
        return true;
    }
  } catch (err) {
    console.error('[caixa-entrada] botão falhou:', (err as Error).message);
    try { await deps.sendText(from, `❌ ${(err as Error).message}`); } catch { /* melhor esforço */ }
    return true;
  }
}
