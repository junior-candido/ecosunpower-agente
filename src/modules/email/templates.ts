export type TemplateVars = {
  nome?: string; cidade?: string; o_que_pediu?: string; link_descadastro?: string;
};

export function renderTemplate(html: string, vars: TemplateVars): string {
  return html.replace(/\{(\w+)\}/g, (_m, chave: string) => {
    const v = (vars as Record<string, unknown>)[chave];
    return v == null ? '' : String(v);
  });
}

// Metadados da jornada v1 (o corpo real fica em email_modelos no banco;
// aqui ficam os dias e o tema/guidance p/ a IA gerar assunto+abertura).
export const STEPS_JORNADA: Array<{ step: number; dia: number; tema: string }> = [
  { step: 1, dia: 0,  tema: 'Boas-vindas + o valor de gerar a propria energia' },
  { step: 2, dia: 2,  tema: 'Prova social: um caso de sucesso real de cliente' },
  { step: 3, dia: 5,  tema: 'Educacao: quanto economiza / derrubando mitos' },
  { step: 4, dia: 10, tema: 'Condicao / leve urgencia (sem citar valor)' },
  { step: 5, dia: 18, tema: 'Historia de um cliente parecido com ele' },
  { step: 6, dia: 30, tema: 'Ainda pensando? convite pra conversar' },
];
