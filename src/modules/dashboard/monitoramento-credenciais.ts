// src/modules/dashboard/monitoramento-credenciais.ts
// "Atualizar senha da integração" na tela da usina (29/09/2026).
//
//  POST /dashboard/monitoramento/:id/credenciais   { login?, senha, aplicar_todas? }
//
// Regras:
//  - papel usinas:editar (igual às outras edições do monitoramento);
//  - só a empresa DONA da usina (company_id da SESSÃO, nunca do corpo);
//  - senha nunca volta pra tela (campo password vazio, sem value) nem pro log;
//  - "aplicar a todas": usinas da MESMA marca, MESMA empresa e MESMO login;
//  - depois de gravar: limpa ultimo_erro e dispara o sync das usinas afetadas.
// Fora do router.ts pra ser testada com req/res falsos (molde do mapa-usinas-rotas).

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can, usinaPertenceAoOperador, type DashUser } from './permissions.js';
import { bancoDoOperador } from '../tenant-client.js';
import { escapeHtml } from './views.js';
import { aviso, cartaoSecao } from './ui/componentes.js';
import {
  aplicarNovaSenha, camposSenhaDaMarca, loginAtual, mesmoLogin, validarNovaSenha,
} from '../monitoring/credenciais-integracao.js';

type Handler = (req: Request, res: Response) => Promise<void>;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SistemaCredenciais {
  id: string;
  marca_inversor: string;
  api_credentials: unknown;
}

/**
 * Cartão "Senha da integração" da tela da usina. Vazio pra quem não edita
 * usinas ou pra marca sem login/senha. `atualizadas` = volta do POST (?senha=ok&n=N).
 */
export function blocoAtualizarSenha(
  s: SistemaCredenciais,
  o: { podeEditar: boolean; atualizadas?: number | null },
): string {
  const campos = camposSenhaDaMarca(s.marca_inversor);
  if (!o.podeEditar || !campos) return '';
  const login = loginAtual(s.marca_inversor, s.api_credentials);
  const id = encodeURIComponent(s.id);
  const ok = o.atualizadas && o.atualizadas > 0
    ? aviso({ tom: 'ok', texto: `Senha atualizada em ${o.atualizadas} usina(s). A sincronização já foi pedida — o resultado aparece aqui em alguns minutos.` })
    : '';
  const corpo = `${ok}
<details id="cred-integ" class="cc-cred">
  <summary>Atualizar senha da integração</summary>
  <form method="POST" action="/dashboard/monitoramento/${id}/credenciais" class="cc-cred-form" autocomplete="off">
    <label>${escapeHtml(campos.rotuloLogin)}
      <input name="login" type="${campos.tipoLogin}" value="${escapeHtml(login)}" maxlength="200" autocomplete="username">
    </label>
    <label>${escapeHtml(campos.rotuloSenha)} (nova)
      <input name="senha" type="password" required maxlength="200" autocomplete="new-password" placeholder="digite a senha nova">
    </label>
    <label class="cc-cred-todas">
      <input type="checkbox" name="aplicar_todas" value="1">
      Aplicar a todas as usinas com o mesmo login (e-mail) desta empresa
    </label>
    <p class="cc-us-nota">A senha fica guardada e não aparece de novo nesta tela. Depois de salvar, o aviso de erro
      some e a usina sincroniza de novo em seguida. Usina pausada continua pausada — reative em "Editar dados".${campos.dica ? ` ${escapeHtml(campos.dica)}` : ''}</p>
    <button type="submit" class="cc-btn cc-btn-sm">Salvar senha</button>
  </form>
</details>
<style>
  .cc-cred summary { cursor: pointer; font-weight: 600; }
  .cc-cred-form { display: grid; gap: 10px; margin-top: 10px; max-width: 420px; }
  .cc-cred-form label { display: grid; gap: 4px; font-size: 13px; }
  .cc-cred-form .cc-cred-todas { display: flex; gap: 8px; align-items: flex-start; }
  .cc-cred-form input[type="email"], .cc-cred-form input[type="text"], .cc-cred-form input[type="password"] { padding: 6px 8px; }
</style>
<script>
  // A tela recarrega a cada 30 s — não recarregar com o formulário aberto.
  (function () {
    var d = document.getElementById('cred-integ');
    if (!d) return;
    d.addEventListener('toggle', function () { window.ccSegurarRecarga = d.open; });
  })();
</script>`;
  return cartaoSecao({ titulo: 'Senha da integração', dica: 'login no portal do fabricante', corpoHtml: corpo });
}

function paginaErro(res: Response, status: number, msg: string, id?: string): void {
  const volta = id ? `/dashboard/monitoramento/${encodeURIComponent(id)}` : '/dashboard/monitoramento';
  res.status(status).type('text/html').send(`<h2>${escapeHtml(msg)}</h2><a href="${volta}">← voltar</a>`);
}

interface LinhaSistema { id: string; company_id: string | null; marca_inversor: string; api_credentials: unknown }

export function rotaAtualizarSenha(
  supabase: SupabaseClient,
  // Dispara o sync das usinas (sem esperar — a tela volta na hora).
  sincronizar: (ids: string[]) => void,
): Handler {
  return async (req, res) => {
    const user: DashUser | undefined = (req as AuthedRequest).dashUser;
    if (!user?.companyId) { paginaErro(res, 401, 'Sessão expirada — entre de novo.'); return; }
    if (!can(user, 'usinas', 'editar')) { paginaErro(res, 403, 'Sem permissão para editar usinas.'); return; }
    const id = String(req.params?.id ?? '');
    if (!RE_UUID.test(id)) { paginaErro(res, 400, 'Usina inválida.'); return; }

    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { data: sis, error } = await db
      .from('sistemas_clientes')
      .select('id, company_id, marca_inversor, api_credentials')
      .eq('id', id)
      .maybeSingle();
    if (error) { console.error('[monitoramento/senha] leitura falhou:', error.message); paginaErro(res, 500, 'Não consegui ler a usina agora.', id); return; }
    const usina = sis as LinhaSistema | null;
    if (!usina || !usinaPertenceAoOperador(usina.company_id ?? null, user.companyId)) {
      paginaErro(res, 404, 'Sistema não encontrado.');
      return;
    }
    if (!camposSenhaDaMarca(usina.marca_inversor)) {
      paginaErro(res, 400, 'Esta marca não usa login e senha — não há senha pra atualizar aqui.', id);
      return;
    }

    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const v = validarNovaSenha(usina.marca_inversor, usina.api_credentials, { login: corpo.login, senha: corpo.senha });
    if (!v.ok) { paginaErro(res, 400, v.erro, id); return; }

    // Alvos: esta usina e, se pedido, as da MESMA empresa + marca com o MESMO login.
    const alvos: LinhaSistema[] = [usina];
    const loginAntigo = loginAtual(usina.marca_inversor, usina.api_credentials);
    if (String(corpo.aplicar_todas ?? '') === '1' && loginAntigo) {
      const { data: irmas, error: e2 } = await db
        .from('sistemas_clientes')
        .select('id, company_id, marca_inversor, api_credentials')
        .eq('company_id', user.companyId)
        .eq('marca_inversor', usina.marca_inversor);
      if (e2) { console.error('[monitoramento/senha] busca do mesmo login falhou:', e2.message); paginaErro(res, 500, 'Não consegui buscar as outras usinas agora.', id); return; }
      for (const r of (irmas ?? []) as LinhaSistema[]) {
        if (r.id === usina.id) continue;
        if (r.company_id !== user.companyId) continue; // defesa extra: nunca outra empresa
        if (mesmoLogin(loginAtual(r.marca_inversor, r.api_credentials), loginAntigo)) alvos.push(r);
      }
    }

    const atualizados: string[] = [];
    for (const alvo of alvos) {
      const patch = {
        api_credentials: aplicarNovaSenha(alvo.marca_inversor, alvo.api_credentials, { login: v.login, senha: v.senha }),
        ultimo_erro: null,
        updated_at: new Date().toISOString(),
      };
      let q = db.from('sistemas_clientes').update(patch).eq('id', alvo.id);
      // A usina aberta já teve o dono conferido; as demais vão presas à empresa.
      if (alvo.id !== usina.id) q = q.eq('company_id', user.companyId);
      const { error: e3 } = await q;
      if (e3) { console.error(`[monitoramento/senha] update ${alvo.id} falhou:`, e3.message); continue; }
      atualizados.push(alvo.id);
    }
    if (atualizados.length === 0) { paginaErro(res, 500, 'Não consegui gravar a senha nova. Tente de novo.', id); return; }

    // Log SEM senha e sem login completo.
    console.log(`[monitoramento/senha] ${usina.marca_inversor} empresa=${user.companyId} por=${user.id} usinas=${atualizados.length}`);
    try { sincronizar(atualizados); } catch (err) { console.warn('[monitoramento/senha] sync não disparou:', (err as Error).message); }
    res.redirect(`/dashboard/monitoramento/${encodeURIComponent(id)}?senha=ok&n=${atualizados.length}#dados`);
  };
}
