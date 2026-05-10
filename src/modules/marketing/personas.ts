// src/modules/marketing/personas.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Persona } from './types.js';

export class PersonasService {
  constructor(private supabase: SupabaseClient) {}

  async getByCodigo(codigo: string): Promise<Persona | null> {
    const { data, error } = await this.supabase
      .from('marketing_personas')
      .select('*')
      .eq('codigo', codigo)
      .single();
    if (error) return null;
    return data as Persona;
  }

  async listAll(): Promise<Persona[]> {
    const { data, error } = await this.supabase
      .from('marketing_personas')
      .select('*')
      .order('id');
    if (error) throw error;
    return (data ?? []) as Persona[];
  }
}
