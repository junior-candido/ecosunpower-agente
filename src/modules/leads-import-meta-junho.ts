// src/modules/leads-import-meta-junho.ts
// Importação dos leads da campanha de FORMULÁRIO Meta "META_Leads_Solar_DF-Entorno_2026-06".
// Fonte única usada PELO SCRIPT (scripts/import-meta-form-junho-2026.ts) E pelo BOTÃO do
// dashboard (/dashboard/import-leads-junho). Upsert por phone com atribuição channel=meta.
import type { SupabaseService } from './supabase.js';
import { normalizeBrazilianPhone } from './meta-leadgen.js';

export const CAMPANHA = 'META_Leads_Solar_DF-Entorno_2026-06';
const AD_CAMPAIGN_ID = '120250142535910385';
const AD_ID = '120250142535900385';
const AD_FORM_ID = '1562822048886970';

type Faixa = 'ate_300' | '301_700' | '701_1500';
type Imovel = 'casa' | 'apartamento' | 'rural' | 'empresa';
type Especial = { status: string; evaActive: boolean; nota: string };

export interface LeadForm {
  nome: string;
  telefone: string;
  faixa: Faixa;
  imovel: Imovel;
  email: string;
  plataforma: 'ig' | 'fb';
  criadoEm: string;
  especial?: Especial;
  pularPorTelefone?: boolean;
}

export const LEADS: LeadForm[] = [
  { nome: 'Edriane Dos Santos', telefone: '+5561984663161', faixa: '701_1500', imovel: 'casa', email: 'edri.jesusamado@gmail.com', plataforma: 'ig', criadoEm: '2026-06-08T23:28:32-03:00' },
  { nome: 'Luciana Santos', telefone: '+5561981211594', faixa: '301_700', imovel: 'casa', email: 'lucianasantosluluzinha157@gmail.com', plataforma: 'ig', criadoEm: '2026-06-08T20:43:01-03:00' },
  { nome: 'Samy Silva', telefone: '+5561994540399', faixa: 'ate_300', imovel: 'casa', email: 'ferreiramatos.samara@gmail.com', plataforma: 'ig', criadoEm: '2026-06-08T19:59:59-03:00' },
  { nome: 'Vanda Paiva', telefone: '+5561993336576', faixa: 'ate_300', imovel: 'casa', email: 'paivavanda@gmail.com', plataforma: 'ig', criadoEm: '2026-06-08T18:58:54-03:00' },
  { nome: 'Sam Matos', telefone: '+5561995992366', faixa: 'ate_300', imovel: 'casa', email: 'Samaraoliveira0807@gmail.com', plataforma: 'ig', criadoEm: '2026-06-08T12:57:01-03:00' },
  { nome: 'Ruth Tamires', telefone: '+5561998161333', faixa: 'ate_300', imovel: 'casa', email: 'ruthtamires424@gmail.com', plataforma: 'ig', criadoEm: '2026-06-07T23:30:31-03:00' },
  { nome: 'Rafael Barbosa de Carvalho', telefone: '+5561982654725', faixa: 'ate_300', imovel: 'casa', email: 'reifex_17@hotmail.com', plataforma: 'ig', criadoEm: '2026-06-07T22:52:58-03:00' },
  { nome: 'Edilene Soares', telefone: '+5561991166442', faixa: '301_700', imovel: 'casa', email: 'cleiton.batista@gmail.com', plataforma: 'ig', criadoEm: '2026-06-07T21:58:17-03:00' },
  { nome: 'Paulo Henrique', telefone: '+5561981835409', faixa: '701_1500', imovel: 'casa', email: 'ph1971_@hotmail.com', plataforma: 'ig', criadoEm: '2026-06-07T17:11:49-03:00' },
  { nome: 'Estéfane Cruz', telefone: '+5561981693216', faixa: '301_700', imovel: 'apartamento', email: 'contatoestefanecruz@gmail.com', plataforma: 'ig', criadoEm: '2026-06-07T10:58:39-03:00',
    especial: { status: 'qualificado', evaActive: false, nota: 'Proposta a enviar — Junior conduzindo (09/06)' } },
  { nome: 'Marislan Evangelista', telefone: '+5562992470767', faixa: '301_700', imovel: 'casa', email: 'marislan@hotmail.com', plataforma: 'ig', criadoEm: '2026-06-07T01:11:30-03:00' },
  { nome: 'Emanoel Augusto Silva de Sousa', telefone: '+5561982186244', faixa: '301_700', imovel: 'casa', email: 'emanoelasilva787@gmail.com', plataforma: 'ig', criadoEm: '2026-06-06T23:56:47-03:00' },
  { nome: 'Ana maria Silva dos reis', telefone: '+5561995779518', faixa: '301_700', imovel: 'rural', email: 'anamarisilvadosreis979@gmail.com', plataforma: 'ig', criadoEm: '2026-06-06T15:24:25-03:00' },
  { nome: 'Patricia Muniz', telefone: '+5561981314691', faixa: 'ate_300', imovel: 'casa', email: 'mpatricia@gmail.com', plataforma: 'ig', criadoEm: '2026-06-06T10:41:15-03:00' },
  { nome: 'Michael Xavier', telefone: '+5561981044065', faixa: 'ate_300', imovel: 'casa', email: 'michaelmrv10@gmail.com', plataforma: 'ig', criadoEm: '2026-06-05T11:44:21-03:00' },
  { nome: 'Laura Lorrany', telefone: '+5561999065737', faixa: 'ate_300', imovel: 'casa', email: 'lorranylaura815@gmail.com', plataforma: 'ig', criadoEm: '2026-06-04T08:51:11-03:00' },
  { nome: 'Jane Moura', telefone: '+5561991009756', faixa: 'ate_300', imovel: 'apartamento', email: 'janemoura74@gmail.com', plataforma: 'ig', criadoEm: '2026-06-03T23:13:00-03:00' },
  { nome: 'Gisely', telefone: '+5561991898616', faixa: '301_700', imovel: 'casa', email: 'nega_gysa@hotmail.com', plataforma: 'ig', criadoEm: '2026-06-03T23:07:48-03:00' },
  { nome: 'Adriana Ferreira', telefone: '556195761872', faixa: '701_1500', imovel: 'casa', email: 'lydiacristia600@gmail.com', plataforma: 'ig', criadoEm: '2026-06-03T22:10:06-03:00',
    pularPorTelefone: true },
  { nome: 'Wellington Silva', telefone: '+5561995783339', faixa: 'ate_300', imovel: 'casa', email: 'wellingtonsilva0314df@gmail.com', plataforma: 'ig', criadoEm: '2026-06-03T21:49:29-03:00' },
  { nome: 'Franciene Jesus Souza', telefone: '+5561985405838', faixa: 'ate_300', imovel: 'casa', email: 'francienej.souzaxx@icloud.com', plataforma: 'ig', criadoEm: '2026-06-03T21:31:26-03:00' },
  { nome: 'Nilton César', telefone: '+5561993777542', faixa: '701_1500', imovel: 'empresa', email: 'niltoncesae548@gmail.com', plataforma: 'fb', criadoEm: '2026-06-02T21:39:57-03:00',
    especial: { status: 'qualificando', evaActive: false, nota: 'Em contato, lento pra atender — Junior conduzindo (comércio, R$701-1.500)' } },
  { nome: 'Marcelo Ferraz', telefone: '+5531995780636', faixa: '301_700', imovel: 'casa', email: 'ferrazmarcelodf@gmail.com', plataforma: 'fb', criadoEm: '2026-06-02T17:06:29-03:00',
    especial: { status: 'transferido', evaActive: false, nota: 'GANHO — venda fechada R$33.000 (serviço R$7.000), lucro ~R$3.000, de boca 09/06' } },
  { nome: 'Marcio Luttembarck', telefone: '+5561999634166', faixa: '301_700', imovel: 'casa', email: 'marciolu@yahoo.com.br', plataforma: 'fb', criadoEm: '2026-06-01T20:48:42-03:00' },
];

const PROFILE: Record<Imovel, string> = { casa: 'residencial', apartamento: 'residencial', rural: 'rural', empresa: 'comercial' };
const CONTA_MEDIA: Record<Faixa, number> = { ate_300: 250, '301_700': 500, '701_1500': 1100 };
export const FAIXA_LABEL: Record<Faixa, string> = { ate_300: 'até R$300', '301_700': 'R$301 a R$700', '701_1500': 'R$701 a R$1.500' };

export interface LinhaResultado {
  nome: string;
  phone: string;
  faixa: string;
  destino: string;        // "cadência Eva" | "sem cadência (...)" | "pulado" | "erro"
  status: 'ok' | 'pulado' | 'erro';
  erro?: string;
}
export interface ResultadoImport {
  apply: boolean;
  gravados: number;
  pulados: number;
  erros: number;
  linhas: LinhaResultado[];
}

// Roda a importação. apply=false só monta o preview (não escreve). apply=true grava
// (upsert por phone). Idempotente — pode rodar de novo sem duplicar.
export async function importarLeadsMetaJunho(supabase: SupabaseService | null, apply: boolean): Promise<ResultadoImport> {
  if (apply && !supabase) throw new Error('importarLeadsMetaJunho: apply=true exige uma conexão Supabase.');
  const linhas: LinhaResultado[] = [];
  let gravados = 0, pulados = 0, erros = 0;

  for (const l of LEADS) {
    if (l.pularPorTelefone) {
      pulados++;
      linhas.push({ nome: l.nome, phone: l.telefone, faixa: FAIXA_LABEL[l.faixa], destino: 'pulado (telefone incompleto no Meta)', status: 'pulado' });
      continue;
    }

    const phone = normalizeBrazilianPhone(l.telefone);
    if (!phone || phone.length < 12) {
      erros++;
      linhas.push({ nome: l.nome, phone: l.telefone, faixa: FAIXA_LABEL[l.faixa], destino: 'erro', status: 'erro', erro: `telefone inválido: "${l.telefone}" -> "${phone}"` });
      continue;
    }

    const status = l.especial?.status ?? 'novo';
    const evaActive = l.especial?.evaActive ?? true;
    const destino = evaActive && status === 'novo' ? 'cadência Eva' : `sem cadência (${l.especial?.nota ?? status})`;

    const row = {
      phone,
      name: l.nome,
      email: l.email || null,
      profile: PROFILE[l.imovel],
      status,
      eva_active: evaActive,
      channel: 'meta',
      lead_source: l.plataforma === 'fb' ? 'ad_fb_leadform' : 'ad_ig_leadform',
      ad_campaign_id: AD_CAMPAIGN_ID,
      ad_id: AD_ID,
      ad_form_id: AD_FORM_ID,
      conta_media_brl: CONTA_MEDIA[l.faixa],
      consent_given: true,
      consent_date: l.criadoEm,
      energy_data: { conta_faixa: FAIXA_LABEL[l.faixa], tipo_imovel: l.imovel, fonte: 'meta_form', campanha: CAMPANHA, nota: l.especial?.nota },
      created_at: l.criadoEm,
      updated_at: new Date().toISOString(),
    };

    if (apply) {
      // Não regredir lead que já avançou no funil por outra fonte (ex: já virou
      // qualificado/transferido via WhatsApp): preserva status/eva_active/created_at
      // dele e só atualiza a atribuição. Os especiais já vêm com o status certo.
      let rowFinal: Record<string, unknown> = row;
      try {
        const existente = await supabase!.getLeadByPhone(phone);
        const statusExistente = (existente as Record<string, unknown> | null)?.status as string | undefined;
        if (statusExistente && statusExistente !== 'novo' && !l.especial) {
          const { status: _s, eva_active: _e, created_at: _c, ...semRegressao } = row;
          rowFinal = semRegressao;
        }
      } catch { /* lead não existe ainda — usa row completo */ }
      const { error } = await supabase!.getClient().from('leads').upsert(rowFinal, { onConflict: 'phone' });
      if (error) { erros++; linhas.push({ nome: l.nome, phone, faixa: FAIXA_LABEL[l.faixa], destino: 'erro', status: 'erro', erro: error.message }); continue; }
    }
    gravados++;
    linhas.push({ nome: l.nome, phone, faixa: FAIXA_LABEL[l.faixa], destino, status: 'ok' });
  }

  return { apply, gravados, pulados, erros, linhas };
}
