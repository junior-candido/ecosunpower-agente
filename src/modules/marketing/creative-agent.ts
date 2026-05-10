// src/modules/marketing/creative-agent.ts
// Orquestrador do Agente Criativo: combina personas + copy + imagens +
// filtros + storage para gerar um pacote criativo completo a partir de
// um briefing curto. Re-uploada as imagens do Replicate (URLs expiram em
// 24h) pro Supabase Storage antes de devolver.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PersonasService } from './personas.js';
import { generateCopies } from './copy-generator.js';
import { generate3StyledImages } from './image-generator.js';
import { CreativeStorage } from './creative-storage.js';
import { applyAllFilters } from './creative-filters.js';
import type { CreativePackage, Persona } from './types.js';

export interface GenerateResult {
  creative_id: number;
  pkg: CreativePackage;
  persona: Persona;
}

export class CreativeAgent {
  private personas: PersonasService;
  private storage: CreativeStorage;
  private replicateToken: string;

  constructor(supabase: SupabaseClient, replicateToken: string) {
    this.personas = new PersonasService(supabase);
    this.storage = new CreativeStorage(supabase);
    this.replicateToken = replicateToken;
  }

  async generatePackage(params: {
    briefing: string;
    persona_codigo: string;
  }): Promise<GenerateResult> {
    const persona = await this.personas.getByCodigo(params.persona_codigo);
    if (!persona) throw new Error(`Persona ${params.persona_codigo} nao encontrada`);

    // Step 1: Copy + Image em paralelo (independentes)
    const [copies, imagensReplicate] = await Promise.all([
      generateCopies({ briefing: params.briefing, persona }),
      generate3StyledImages({
        briefing: params.briefing,
        categoria: persona.categoria_portfolio,
        replicateToken: this.replicateToken,
      }),
    ]);

    // Step 2: Monta pacote provisório (URLs ainda Replicate, expiram em 24h)
    const pkgInicial: CreativePackage = {
      briefing: params.briefing,
      persona_id: persona.id,
      imagens: imagensReplicate,
      copies,
      cta_primario: copies[0].cta,
      justificativa: `3 estilos cobrindo persona ${persona.nome}. Filtros aplicados.`,
    };

    // Step 3: Aplica filtros (blocklist + marca + criterio R$ 700)
    const filterResults = applyAllFilters(pkgInicial, persona);

    // Step 4: Persist draft no Supabase (mesmo que filtro reprove — fica registro)
    const creative_id = await this.storage.persistDraft(pkgInicial, 'claude-opus-4-7');

    // Step 5: Log da geração
    await this.storage.logGeneration({
      creative_id,
      prompt: `briefing="${params.briefing}" persona=${persona.codigo}`,
      raw_output: pkgInicial,
      filter_results: filterResults,
      decision: filterResults.overall_passed ? 'sent_to_junior' : 'rejected_filter',
      reason: filterResults.overall_passed ? undefined : JSON.stringify(filterResults),
    });

    // Step 6: Se filtro reprovou, throw com detalhes
    if (!filterResults.overall_passed) {
      throw new Error(`Filtro rejeitou: ${JSON.stringify(filterResults)}`);
    }

    // Step 7: Re-upload imagens pro Supabase Storage (URLs Replicate expiram em 24h)
    const persistedImages = await Promise.all(
      pkgInicial.imagens.map(async (img, i) => {
        const url = await this.storage.uploadImage(img.url, creative_id, i);
        return { ...img, url };
      }),
    );

    const pkgFinal: CreativePackage = { ...pkgInicial, imagens: persistedImages };

    return { creative_id, pkg: pkgFinal, persona };
  }
}
