// Casos do Monitoramento — frota (renovação do miolo, R8). Dados FICTÍCIOS:
// nomes inventados, nunca dado real de cliente.
import { renderMonitoramentoPage } from '../../src/modules/dashboard/views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const id = (i: number) => `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`;

/** Uma usina da frota (SistemaMonitorRow) com os campos que a tela lê. */
export function usina(i: number, over: Record<string, unknown> = {}): any {
  return {
    id: id(i), apelido: `Usina Fictícia ${i}`, cidade: 'Gama', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 5 + i, geracao_hoje_kwh: 10 + i, geracao_mes_kwh: 300 + i * 10, geracao_7d_kwh: 70 + i,
    ativo: true, ultimo_erro: null, ultima_sincronizacao: hora(0.3),
    nivel: 'ok', alertaTexto: null, garantiaIdade: `${i + 1} mes(es)`, garantiaEcosun: 'vigente', ...over,
  };
}

/** 13 usinas: todos os estados (falha, atenção, acima, OK, sem sinal, pausada), marcas variadas. */
export const FROTA = [
  usina(1, { apelido: 'Casa Exemplo <script>alert(1)</script>', nivel: 'urgente', geracao_hoje_kwh: 0, alertaTexto: 'Sem geração há 5 dias.', marca_inversor: 'goodwe' }),
  usina(2, { apelido: "Bar do Z'é Fictício", nivel: 'urgente', geracao_hoje_kwh: 0, alertaTexto: 'Inversor desligado.', marca_inversor: 'sungrow', cidade: 'Taguatinga' }),
  usina(3, { apelido: 'Chácara Modelo', nivel: 'aviso', geracao_hoje_kwh: 6.2, alertaTexto: 'Queda de 30% na semana.', marca_inversor: 'foxess' }),
  usina(4, { apelido: 'Mercado Amostra', nivel: 'aviso', alertaTexto: 'Geração abaixo do esperado.', marca_inversor: 'solaredge', cidade: 'Ceilândia' }),
  usina(5, { apelido: 'Oficina Teste', nivel: 'info', geracao_hoje_kwh: 44.1, marca_inversor: 'hoymiles' }),
  usina(6, { apelido: 'Padaria Exemplo', marca_inversor: 'nep' }),
  usina(7, { apelido: 'Escola Fictícia', marca_inversor: 'huawei', cidade: 'Sobradinho' }),
  usina(8, { apelido: 'Clínica Modelo', marca_inversor: 'solis' }),
  usina(9, { apelido: 'Galpão Amostra', marca_inversor: 'saj', cidade: 'Samambaia' }),
  usina(10, { apelido: 'Sítio Sem Sinal', ultima_sincronizacao: null, geracao_hoje_kwh: null, geracao_mes_kwh: 0 }),
  usina(11, { apelido: 'Loja Sem Sinal', ultima_sincronizacao: hora(60), geracao_hoje_kwh: null, marca_inversor: 'abb', cidade: null, uf: null }),
  usina(12, { apelido: 'Casa Pausada', ativo: false, geracao_hoje_kwh: null, geracao_mes_kwh: 0 }),
  usina(13, { apelido: 'Condomínio Teste', potencia_kwp: null, marca_inversor: 'marca-nova' }),
];

export const ALERTAS_RESUMO = { urgente: 3, aviso: 6, info: 2, total: 11 };
export const SPARK_7D = [
  { dia: '2026-09-22', enviados: 2 }, { dia: '2026-09-23', enviados: 0 }, { dia: '2026-09-24', enviados: 4 },
  { dia: '2026-09-25', enviados: 1 }, { dia: '2026-09-26', enviados: 3 }, { dia: '2026-09-27', enviados: 0 }, { dia: '2026-09-28', enviados: 5 },
];
export const KPIS_EVA = { enviadas: 14, resolvidoSozinhoCount: 5, limpezasFechadasCount: 2, semRespostaCount: 4, resolvidoSozinhoPct: 36 };

export const FILTRO_ATIVO = { q: 'casa', marca: 'deye', cidade: 'Gama', status: 'urgente', ord: 'nome', painel: 'falha' };

export const CASOS_FROTA = {
  cheio: () => renderMonitoramentoPage(FROTA, {}, ALERTAS_RESUMO, SPARK_7D, KPIS_EVA, USER_CASA),
  filtro: () => renderMonitoramentoPage(FROTA.slice(0, 2), FILTRO_ATIVO, ALERTAS_RESUMO, SPARK_7D, KPIS_EVA, USER_CASA),
  vazio: () => renderMonitoramentoPage([], {}, undefined, undefined, undefined, USER_CASA),
  tenant: () => renderMonitoramentoPage(FROTA, {}, undefined, undefined, undefined, USER_TENANT),
};
