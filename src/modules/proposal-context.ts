// Extrai os números-chave da proposta de um cliente (a partir do dados_input cru
// salvo em propostas_publicas) e monta um bloco de texto pra injetar no cérebro da
// Eva. Assim ela conversa SABENDO o que tem na proposta daquele cliente (potência,
// valor, equipamentos, garantias, geração, economia) — vira consultora de verdade.
//
// Tudo é defensivo: dados_input varia (single vs comparação, com/sem campos
// calculados). Campo ausente simplesmente não entra no bloco — nunca quebra.

function num(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) && v !== 0 ? v : null;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  // Formato BR: ponto=milhar, vírgula=decimal ("32.000,00" → "32000.00").
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) && n !== 0 ? n : null;
}

function fmtBr(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}

// Sanitiza texto livre que vai pro system prompt: tira quebras/crase e limita
// tamanho (defesa em profundidade — hoje a origem é admin, mas fecha a porta).
function txt(v: unknown, max = 60): string {
  return String(v ?? '').replace(/[\r\n`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

interface Equip {
  fabricante?: string;
  modelo?: string;
  potenciaW?: number;
  quantidade?: number;
  garantia?: number;
  garantiaDefeito?: number;
  garantiaEficiencia?: number;
}

function linhaModulo(m: Equip | undefined): string | null {
  if (!m || (!m.fabricante && !m.modelo)) return null;
  const partes = [
    m.quantidade ? `${m.quantidade}x` : null,
    [txt(m.fabricante, 30), txt(m.modelo, 40)].filter(Boolean).join(' '),
    m.potenciaW ? `${m.potenciaW}W` : null,
  ].filter(Boolean);
  const gar = [
    m.garantiaDefeito ? `${m.garantiaDefeito} anos contra defeito` : null,
    m.garantiaEficiencia ? `${m.garantiaEficiencia} anos de eficiência` : null,
  ].filter(Boolean).join(', ');
  return `- Módulos: ${partes.join(' ')}${gar ? ` (garantia ${gar})` : ''}`;
}

function linhaInversor(i: Equip | undefined): string | null {
  if (!i || (!i.fabricante && !i.modelo)) return null;
  const partes = [
    i.quantidade ? `${i.quantidade}x` : null,
    [txt(i.fabricante, 30), txt(i.modelo, 40)].filter(Boolean).join(' '),
    i.potenciaW ? `${(i.potenciaW / 1000)} kW` : null,
  ].filter(Boolean);
  const gar = i.garantia ? ` (garantia ${i.garantia} anos)` : '';
  return `- Inversor: ${partes.join(' ')}${gar}`;
}

// Recebe o dados_input cru + o nome do cliente. Devolve o bloco de texto, ou '' se
// não der pra montar nada útil (sem potência e sem valor → não é proposta solar).
export function montarBlocoProposta(dados: unknown, nomeCliente?: string | null): string {
  if (!dados || typeof dados !== 'object') return '';
  const d = dados as Record<string, any>;

  // Quando há comparação, a Opção A (principal) é comparacao[0]; senão usa o topo.
  const opcaoA: Record<string, any> =
    Array.isArray(d.comparacao) && d.comparacao.length > 0 ? d.comparacao[0] : d;

  const potencia = num(d.potenciaKwp) ?? num(opcaoA.potenciaKwp);
  const valor = num(d.valorTotalRs) ?? num(opcaoA.valorTotalRs);
  if (potencia === null && valor === null) return ''; // não é proposta solar usável

  const geracao = num(d.geracaoMensalKwh) ?? num(opcaoA.geracaoMensalKwh);
  const economiaMensal = num(opcaoA.economiaMensalRs) ?? num(d.economiaMensalRs);
  const consumoKwh = num(d.consumoMensalKwh) ?? num(opcaoA.consumoMensalKwh);
  const payback = txt(opcaoA.paybackTexto, 30) || null;

  const nome = txt(nomeCliente ?? d.nomeCliente, 60);

  const linhas: string[] = [];
  linhas.push('## Proposta deste cliente (use estes números reais na conversa)');
  if (nome) linhas.push(`Cliente: ${nome}`);
  if (potencia !== null) linhas.push(`- Sistema: ${fmtBr(potencia)} kWp`);
  if (geracao !== null) linhas.push(`- Geração estimada: ${fmtBr(geracao)} kWh/mês`);
  if (consumoKwh !== null) linhas.push(`- Consumo informado: ${fmtBr(consumoKwh)} kWh/mês`);
  if (valor !== null) linhas.push(`- Investimento total: R$ ${fmtBr(valor)}`);
  const consumoRemoto = num(d.consumoRemotoMensalKwh);
  if (economiaMensal !== null) linhas.push(`- Economia estimada: R$ ${fmtBr(economiaMensal)}/mês${(consumoRemoto !== null && consumoRemoto > 0) || d.consumoRemotoRestante ? ' (inclui a outra unidade do titular — parte abate a fatura de lá)' : ''}`);
  if (payback) linhas.push(`- Retorno (payback): ${payback}`);

  const lm = linhaModulo(d.modulo ?? opcaoA.modulo);
  if (lm) linhas.push(lm);
  const li = linhaInversor(d.inversor ?? opcaoA.inversor);
  if (li) linhas.push(li);

  // Observações do Junior na proposta — a Eva PRECISA saber delas na conversa
  // (ex: cliente pergunta "é preparado pra bateria?" e a resposta está na obs).
  const obs = Array.isArray(d.observacoes) ? d.observacoes.filter((o: unknown): o is string => typeof o === 'string' && o.trim().length > 0) : [];
  for (const o of obs.slice(0, 8)) linhas.push(`- Observação da proposta: ${txt(o, 200)}`);

  // Se houver mais de uma opção na comparação, sinaliza pra Eva poder comparar.
  if (Array.isArray(d.comparacao) && d.comparacao.length > 1) {
    const outras = d.comparacao
      .slice(1)
      .map((o: Record<string, any>, idx: number) => {
        const p = num(o.potenciaKwp);
        const v = num(o.valorTotalRs);
        const rot = txt(o.rotulo, 30) || `Opção ${String.fromCharCode(66 + idx)}`;
        return `  • ${rot}: ${p !== null ? `${fmtBr(p)} kWp` : ''}${v !== null ? ` — R$ ${fmtBr(v)}` : ''}`;
      })
      .filter((l: string) => l.trim().length > 4);
    if (outras.length > 0) {
      linhas.push('- Outras opções na proposta (pode comparar):');
      linhas.push(...outras);
    }
  }

  return linhas.join('\n');
}
