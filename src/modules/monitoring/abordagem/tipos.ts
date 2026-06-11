// src/modules/monitoring/abordagem/tipos.ts
export type AbordagemTipo = 'parabens' | 'depoimento' | 'queda' | 'offline';
export type AbordagemStatus =
  | 'proposta' | 'aguardando_aprovacao' | 'enviada'
  | 'em_conversa' | 'lembrete_enviado' | 'encerrada';
export type AbordagemDesfecho =
  | 'resolvido_sozinho' | 'limpeza_fechada' | 'visita_agendada'
  | 'transferido_junior' | 'sem_resposta' | 'descartada_junior';

export interface AbordagemRow {
  id: string;
  sistema_id: string;
  lead_id: string;
  alerta_id: string | null;
  tipo: AbordagemTipo;
  etapa: number;
  status: AbordagemStatus;
  desfecho: AbordagemDesfecho | null;
  causa_raiz: string | null;
  mensagem_proposta: string | null;
  mensagem_enviada: string | null;
  resposta_resumo: string | null;
  nota_junior: 'boa' | 'errou' | null;
  nota_observacao: string | null;
  reagendada_para: string | null;
  enviada_em: string | null;
  lembrete_em: string | null;
  ultima_resposta_cliente_em: string | null;
  encerrada_em: string | null;
  created_at: string;
  updated_at: string;   // coluna da migration; repo Task 6 seta em todo UPDATE
}

// Resumo do diário de UMA usina que as regras puras consomem
export interface DiarioUsina {
  abordagemAbertaId: string | null;          // status <> encerrada
  ultimoParabensEnviadoEm: string | null;    // tipo parabens|depoimento, enviada_em
  ultimaOfertaLimpezaEm: string | null;      // última queda ENVIADA (qualquer etapa) — não re-abordar queda do mesmo lead <30d
  // preencher já filtrado pelo MESMO tipo da abordagem candidata (repo Task 6)
  descartadaMesmoTipoEm: string | null;      // desfecho descartada_junior (mesmo tipo)
  causaRaizAnterior: string | null;          // última causa_raiz de offline resolvido
  jaTeveDepoimento: boolean;                  // alguma abordagem tipo depoimento encerrada com envio
  ultimaMsgProativaAoLeadEm: string | null;  // qualquer usina do MESMO lead (1 msg/dia)
}

export interface ConfigAutonomia {
  parabens_auto: boolean;
  queda_auto: boolean;
  offline_auto: boolean;
  template_nome: string;
  template_bloqueio_avisado: boolean;
}
