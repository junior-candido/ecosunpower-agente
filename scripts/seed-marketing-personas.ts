// scripts/seed-marketing-personas.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const PERSONAS = [
  {
    codigo: 'residencial_df_alto',
    nome: 'Residencial DF — Conta R$ 700-3000',
    categoria_portfolio: 'on_grid_residencial',
    descricao: 'Dono de casa em Brasília-DF, classe B/B+, conta R$ 700-3000/mês, perfil de quem busca economia + valor agregado ao imóvel',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'DF',
    contexto_marca: { tom: 'caloroso, técnico mas acessível', exemplos: ['Energia sua. Pra sempre.', 'Calcule sua economia em 1 minuto'] },
  },
  {
    codigo: 'residencial_go_alto',
    nome: 'Residencial Goiás Entorno — Conta R$ 700-3000',
    categoria_portfolio: 'on_grid_residencial',
    descricao: 'Dono de casa em Goiás (até 100km do DF), conta R$ 700-3000/mês, perfil similar ao DF mas tom mais coloquial',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'GO_entorno',
    contexto_marca: { tom: 'caloroso, prático, fala direto', exemplos: ['Acabou conta cara', 'Solar pra valer'] },
  },
  {
    codigo: 'comercial_loja',
    nome: 'Comercial — Loja/Escritório',
    categoria_portfolio: 'on_grid_comercial',
    descricao: 'Dono de comércio com conta R$ 1500-5000/mês, busca reduzir custo fixo da operação',
    conta_minima_brl: 1500,
    consumo_minimo_kwh: 1500,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'objetivo, ROI-focado', exemplos: ['Sua conta de luz é o maior custo fixo? Vamos resolver.', 'Payback em 4 anos, garantido'] },
  },
  {
    codigo: 'hibrido_baterias',
    nome: 'Híbrido com Baterias',
    categoria_portfolio: 'hibrido',
    descricao: 'Já tem solar OU quer fugir bandeira vermelha + ter backup. Conta R$ 1000+, valoriza autonomia',
    conta_minima_brl: 1000,
    consumo_minimo_kwh: 1000,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'técnico, focado em independência', exemplos: ['Sua casa funciona mesmo sem rede', 'Bandeira vermelha não te afeta mais'] },
  },
  {
    codigo: 'off_grid_rural',
    nome: 'Off-grid — Sítio/Fazenda',
    categoria_portfolio: 'off_grid',
    descricao: 'Imóvel rural sem rede ou com rede precária. Não tem conta de luz tradicional. Filtro: tem propriedade rural',
    conta_minima_brl: 0,
    consumo_minimo_kwh: 0,
    regiao_alvo: 'GO_entorno',
    palavras_proibidas: ['alugar terra','arrendar','fazenda solar','engenheiro'],
    contexto_marca: { tom: 'pratico, mostra independencia', exemplos: ['Energia 24h no seu sitio', 'Sem precisar puxar rede'] },
  },
  {
    codigo: 'ev_charger',
    nome: 'Carregador Veicular EV',
    categoria_portfolio: 'ev_charger',
    descricao: 'Dono de carro elétrico (BYD, Volvo, VW ID, GWM, Caoa Chery, Renault, BMW). Tesla é minoria no BR — não usar como referência principal',
    conta_minima_brl: 700,
    consumo_minimo_kwh: 700,
    regiao_alvo: 'todo_atendimento',
    contexto_marca: { tom: 'tech, mostra praticidade', exemplos: ['Carrega seu BYD em casa, na potência máxima', 'Wallbox profissional, instalada em 1 dia'] },
  },
];

async function main() {
  for (const p of PERSONAS) {
    const { error } = await supabase.from('marketing_personas').upsert(p, { onConflict: 'codigo' });
    if (error) { console.error(`❌ ${p.codigo}: ${error.message}`); continue; }
    console.log(`✅ ${p.codigo}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
