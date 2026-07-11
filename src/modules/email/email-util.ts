// Guard de formato de e-mail usado no intake de leads (Meta Lead Ads, formulario
// do site) ANTES de gravar em leads.email / matricular na sequencia. Nao precisa
// ser tao estrito quanto a constraint do banco (chk_leads_email_format,
// migration 026) — se passar aqui mas falhar la, setLeadEmail() so loga e
// retorna false (best-effort, nunca quebra o intake).
export function emailValido(s?: string | null): boolean {
  return !!s && /.+@.+\..+/.test(s.trim());
}
