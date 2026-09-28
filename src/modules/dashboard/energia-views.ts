// src/modules/dashboard/energia-views.ts
//
// Telas da Gestão de Energia (G1): lista de medidores, cadastro/edição com a
// chave da nuvem Shelly (cifrada, nunca reexibida), token do medidor mostrado
// UMA vez, e a tela "Energia da casa".
//
// Só componentes do Command Center (ui/componentes.ts). Todo texto de dado
// passa por escapeHtml. Sem dado → "—" (regra do Junior: nunca número inventado).
// Gráficos em SVG sem biblioteca (carrega em qualquer celular).

import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import {
  cabecalhoPagina, cartaoSecao, estadoVazio, faixaKpis, pilulaStatus, tabela, icone,
  type KpiInput, type Tom,
} from './ui/componentes.js';
import { escapeHtml, fmtNumero, temNumero, SEM_DADO } from './ui/html.js';
import type { ItemListaMedidor, MedidorTela, UsinaOpcao } from './energia-queries.js';
import type { PainelEnergia, PontoDia, PontoHora } from '../energia/energia-casa.js';
import type { ValoresForm } from '../energia/form-medidor.js';
import type { Veredito } from '../energia/conciliacao.js';

const TZ = 'America/Sao_Paulo';
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function quando(iso: string | null, agora: Date): string {
  if (!iso) return 'nunca';
  const min = Math.max(0, Math.round((agora.getTime() - Date.parse(iso)) / 60_000));
  const hora = new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (min < 2) return `agora há pouco (${hora})`;
  if (min < 120) return `há ${min} min (${hora})`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h (${hora})`;
  return `há ${Math.round(min / 1440)} dias (${hora})`;
}

export function tomDoStatus(status: string): { tom: Tom; texto: string } {
  switch (status) {
    case 'ok': return { tom: 'normal', texto: 'Recebendo dado' };
    case 'mudo': return { tom: 'critico', texto: 'Sem dado' };
    default: return { tom: 'info', texto: 'Aguardando o 1º dado' };
  }
}

/** A chave da nuvem Shelly, separada da chegada de dado (só pra quem usa a nuvem). */
function nuvemRecusada(m: Pick<MedidorTela, 'modo_coleta' | 'nuvem_ok'>): boolean {
  return m.modo_coleta !== 'push' && m.nuvem_ok === false;
}

function pilulasSituacao(m: Pick<MedidorTela, 'status' | 'modo_coleta' | 'nuvem_ok' | 'ativo'>): string {
  if (m.ativo === false) return pilulaStatus('sem_dado', 'Desligado');
  const s = tomDoStatus(m.status);
  return pilulaStatus(s.tom, s.texto) + (nuvemRecusada(m) ? ` ${pilulaStatus('atencao', 'Chave da nuvem recusada')}` : '');
}

const MODO_TEXTO: Record<string, string> = {
  push: 'O aparelho envia (script)', nuvem: 'Pela nuvem Shelly', push_nuvem: 'Script + nuvem de reserva',
};

function avisoMigration(): string {
  return estadoVazio({
    tipo: 'construcao', titulo: 'Falta ligar no banco',
    texto: 'As tabelas da Gestão de Energia (migrations 136 e 137) ainda não foram aplicadas. Assim que forem, esta tela passa a mostrar os medidores.',
  });
}

const CSS_ENERGIA = `
.en-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;margin-top:18px}
.en-full{grid-column:1/-1}
.en-aviso{margin-top:14px}
.en-leg{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--cc-text-2);margin-top:10px}
.en-leg span{display:inline-flex;align-items:center;gap:7px}
.en-sw{display:inline-block;width:12px;height:10px;border-radius:2px}
.en-c-ger{fill:var(--cc-gold);background:var(--cc-gold)}
.en-c-con{fill:var(--cc-info);background:var(--cc-info)}
.en-c-imp{fill:var(--cc-info);background:var(--cc-info)}
.en-c-exp{fill:var(--cc-ok);background:var(--cc-ok)}
.en-parcial{opacity:.38}
.en-semdado{fill:var(--cc-faint);opacity:.5}
.en-zero{stroke:var(--cc-line-2);stroke-width:1;vector-effect:non-scaling-stroke}
.en-nums{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.en-num{padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--cc-line)}
.en-num b{display:block;font-family:var(--cc-f-num);font-size:20px;font-weight:600;margin-top:4px}
.en-num span{font-size:12px;color:var(--cc-muted)}
.en-nota{font-size:12px;color:var(--cc-muted);margin-top:12px;line-height:1.45}
.en-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 18px}
.en-form label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--cc-muted);font-weight:500}
.en-form input,.en-form select{height:38px;padding:0 11px;border-radius:10px;border:1px solid var(--cc-line-2);background:var(--cc-surface);color:var(--cc-text);font-size:14px;font-family:inherit}
.en-form .en-full label,.en-form label.en-full{grid-column:1/-1}
.en-form small{font-weight:400;color:var(--cc-faint)}
.en-check{flex-direction:row!important;align-items:flex-start;gap:10px!important;color:var(--cc-text-2)!important}
.en-check input{height:auto;margin-top:3px}
.en-erros{padding:12px 14px;border-radius:12px;background:var(--cc-crit-soft);border:1px solid rgba(228,87,75,.35);color:var(--cc-text);font-size:13px;margin-bottom:16px}
.en-erros li{margin:3px 0 3px 16px}
.en-token{font-family:ui-monospace,Consolas,monospace;font-size:13px;padding:12px;border-radius:10px;background:var(--cc-surface-3);border:1px dashed var(--cc-gold-2);word-break:break-all;color:var(--cc-text)}
.en-passos{margin:8px 0 0 18px;padding:0;line-height:1.7;color:var(--cc-text-2);font-size:13.5px}
.en-teste{font-size:13px;margin-top:10px;color:var(--cc-text-2)}
.en-perigo{margin-top:18px;border-color:rgba(228,87,75,.35)}
@media (max-width:900px){.en-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.en-form{grid-template-columns:minmax(0,1fr)}.en-nums{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
`;

function pagina(user: DashUser | undefined, titulo: string, corpo: string): string {
  return renderLayout({
    active: 'energia', title: titulo, dark: true, largo: true, user,
    body: `<div class="cc-root cc-energia">${corpo}</div><style>${CSS_ENERGIA}</style>`,
  });
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export function renderListaMedidores(
  r: { ok: true; itens: ItemListaMedidor[] } | { ok: false; motivo: 'migration' | 'falha' },
  user: DashUser | undefined, agora: Date, podeEditar: boolean,
): string {
  const cab = cabecalhoPagina({
    titulo: 'Energia da casa',
    trilha: [{ rotulo: 'Usinas', href: '/dashboard/monitoramento' }, { rotulo: 'Energia' }],
    subtitulo: 'Medidores no quadro dos clientes: o que a casa compra, devolve e consome de verdade.',
    acoesHtml: podeEditar ? `<a class="cc-btn cc-btn-gold" href="/dashboard/energia/medidores/novo">${icone('plus', 'sm')}Cadastrar medidor</a>` : '',
  });
  let corpo: string;
  if (!r.ok) {
    corpo = r.motivo === 'migration' ? avisoMigration() : estadoVazio({ tipo: 'sem_dado', titulo: 'Não deu para carregar os medidores agora', texto: 'Tente de novo em alguns minutos.' });
  } else {
    corpo = tabela({
      colunas: [{ titulo: 'Medidor' }, { titulo: 'Cliente' }, { titulo: 'Usina' }, { titulo: 'Situação' }, { titulo: 'Último dado' }, { titulo: 'Como chega' }],
      linhas: r.itens.map((i) => {
        return [i.medidor.apelido, i.cliente, i.usina, { html: pilulasSituacao(i.medidor) }, quando(i.medidor.ultima_leitura_em, agora), MODO_TEXTO[i.medidor.modo_coleta] ?? i.medidor.modo_coleta];
      }),
      hrefs: r.itens.map((i) => `/dashboard/energia/${i.medidor.id}`),
      vazio: 'Nenhum medidor cadastrado ainda',
    });
  }
  return pagina(user, 'Energia da casa', `${cab}${cartaoSecao({ titulo: 'Medidores', corpoHtml: corpo })}`);
}

// ---------------------------------------------------------------------------
// Cadastro / edição
// ---------------------------------------------------------------------------

export interface FormMedidorInput {
  modo: 'novo' | 'editar';
  medidor?: MedidorTela | null;
  valores?: Partial<ValoresForm>;
  usinas: UsinaOpcao[];
  erros?: string[];
  /** Edição: a chave guardada, já mascarada ("••••1a2b"), ou null. Nunca a chave. */
  chaveMascarada?: string | null;
  serverUriGuardado?: string | null;
  cifraConfigurada: boolean;
  /** Erro da confirmação de "Apagar medidor e todos os dados". */
  errosApagar?: string[];
}

function opcoes(lista: Array<[string, string]>, atual: string): string {
  return lista.map(([v, t]) => `<option value="${escapeHtml(v)}"${v === atual ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

export function renderFormMedidor(f: FormMedidorInput, user: DashUser | undefined): string {
  const m = f.medidor ?? null;
  const v: Partial<ValoresForm> = f.valores ?? (m ? {
    apelido: m.apelido, device_id: m.device_id, sistema_id: m.sistema_id ?? '', perfil: m.perfil, canal: String(m.canais?.rede ?? 2),
    ligacao: m.ligacao ?? '', tensao_nominal_v: m.tensao_nominal_v ? String(m.tensao_nominal_v) : '', concessionaria: m.concessionaria ?? '',
    uc_instalacao: m.uc_instalacao ?? '', codigo_cliente: m.codigo_cliente ?? '', grupo_gd: m.grupo_gd ?? '', modo_coleta: m.modo_coleta,
    server_uri: f.serverUriGuardado ?? '', ativo: m.ativo !== false,
  } : { perfil: 'triphase', canal: '2', modo_coleta: 'push', tensao_nominal_v: '220', concessionaria: 'Neoenergia Brasília' });
  const novo = f.modo === 'novo';
  const acao = novo ? '/dashboard/energia/medidores' : `/dashboard/energia/medidores/${encodeURIComponent(m!.id)}`;
  const erros = f.erros?.length ? `<div class="en-erros" role="alert"><b>Confira:</b><ul>${f.erros.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : '';
  const usinas: Array<[string, string]> = [['', '— sem usina (só consumo) —'], ...f.usinas.map((u): [string, string] => [u.id, `${u.apelido}${u.potencia_kwp ? ` · ${fmtNumero(u.potencia_kwp, 2)} kWp` : ''}${u.marca ? ` · ${u.marca}` : ''}`])];
  const chaveAtual = f.chaveMascarada
    ? `<small>Chave guardada: ${escapeHtml(f.chaveMascarada)} (cifrada). Deixe em branco para manter.</small>`
    : '<small>Fica guardada cifrada e nunca volta para a tela.</small>';

  const form = `${erros}
<form method="post" action="${escapeHtml(acao)}" class="en-form" autocomplete="off" id="en-form-medidor">
  <label>Nome do medidor<input name="apelido" required maxlength="80" value="${escapeHtml(v.apelido ?? '')}" placeholder="Quadro da casa"></label>
  <label>Código do aparelho<input name="device_id" required maxlength="64" value="${escapeHtml(v.device_id ?? '')}" placeholder="007007422d90"><small>App Shelly → aparelho → Configurações → Informações do aparelho.</small></label>
  <label class="en-full">Usina do mesmo endereço<select name="sistema_id">${opcoes(usinas, v.sistema_id ?? '')}</select><small>Com a usina ligada, a tela calcula o consumo real (gerado + comprado − devolvido).</small></label>
  <label>Perfil do aparelho<select name="perfil">${opcoes([['triphase', 'Trifásico (Fase A/B/C + Total)'], ['monophase', 'Monofásico (3 medidores separados)']], v.perfil ?? 'triphase')}</select></label>
  <label>Sensor do cabo da rede na entrada<select name="canal">${opcoes([['0', 'A'], ['1', 'B'], ['2', 'C']], v.canal ?? '2')}</select></label>
  <label>Ligação da casa<select name="ligacao">${opcoes([['', '—'], ['mono', 'Monofásica'], ['bi', 'Bifásica'], ['tri', 'Trifásica']], v.ligacao ?? '')}</select></label>
  <label>Tensão<select name="tensao_nominal_v">${opcoes([['', '—'], ['127', '127 V'], ['220', '220 V'], ['380', '380 V']], v.tensao_nominal_v ?? '')}</select></label>
  <label>Concessionária<input name="concessionaria" maxlength="60" value="${escapeHtml(v.concessionaria ?? '')}"></label>
  <label>Nº da instalação (UC)<input name="uc_instalacao" inputmode="numeric" maxlength="20" value="${escapeHtml(v.uc_instalacao ?? '')}"><small>O mesmo do demonstrativo de GD — liga a conferência com a Neoenergia.</small></label>
  <label>Código do cliente<input name="codigo_cliente" maxlength="20" value="${escapeHtml(v.codigo_cliente ?? '')}"></label>
  <label>Regra de GD<select name="grupo_gd">${opcoes([['', '—'], ['gd1', 'GD I'], ['gd2', 'GD II'], ['gd1_gd2', 'GD I + ampliação GD II'], ['sem_gd', 'Sem geração']], v.grupo_gd ?? '')}</select></label>
  <label class="en-full">Como o dado chega<select name="modo_coleta" id="en-modo">${opcoes([['push', 'O aparelho envia (script) — recomendado'], ['push_nuvem', 'Script + nuvem Shelly de reserva'], ['nuvem', 'Só pela nuvem Shelly']], v.modo_coleta ?? 'push')}</select></label>
  <fieldset class="en-full" id="en-nuvem" style="border:1px solid var(--cc-line-2);border-radius:12px;padding:14px;display:grid;gap:14px">
    <legend style="padding:0 6px;font-size:12.5px;color:var(--cc-text-2)">Nuvem Shelly (app → Configurações do usuário → Authorization cloud key)</legend>
    <label>Servidor<input name="server_uri" maxlength="120" value="${escapeHtml(v.server_uri ?? '')}" placeholder="shelly-77-eu.shelly.cloud"></label>
    <label>Chave (Authorization cloud key)<input name="auth_key" type="password" autocomplete="new-password" maxlength="400" value="">${chaveAtual}</label>
    ${f.cifraConfigurada ? '' : '<small style="color:var(--cc-warn)">O servidor ainda não tem a ENERGIA_CRED_KEY: a chave da nuvem não pode ser guardada até configurar.</small>'}
    <div><button type="button" class="cc-btn cc-btn-sm" id="en-testar">${icone('plug', 'xs')}Testar conexão</button><div class="en-teste" id="en-teste-res" aria-live="polite"></div></div>
  </fieldset>
  ${novo ? `<label class="en-full en-check"><input type="checkbox" name="consentimento" value="on"${v.consentimento ? ' checked' : ''}> O cliente autorizou a medição do consumo da casa (consumo é dado pessoal — LGPD). Ele pode pedir para apagar tudo.</label>` : `<label class="en-full en-check"><input type="checkbox" name="ativo" value="on"${v.ativo ? ' checked' : ''}> <span><b>Medidor ligado</b><br><small>Desmarque para parar de receber e de guardar dado deste aparelho (o que já foi guardado fica). O aparelho recebe a resposta "desligado".</small></span></label>`}
  <div class="en-full cc-row"><button class="cc-btn cc-btn-gold" type="submit">${novo ? 'Cadastrar medidor' : 'Salvar'}</button><a class="cc-btn" href="${novo ? '/dashboard/energia' : `/dashboard/energia/${encodeURIComponent(m!.id)}`}">Cancelar</a></div>
</form>
<script>
(function(){
  var modo=document.getElementById('en-modo'), box=document.getElementById('en-nuvem');
  function mostra(){ box.style.display = modo.value==='push' ? 'none' : 'grid'; }
  modo.addEventListener('change', mostra); mostra();
  var bt=document.getElementById('en-testar'), res=document.getElementById('en-teste-res'), fm=document.getElementById('en-form-medidor');
  bt.addEventListener('click', function(){
    var d=new URLSearchParams();
    ['device_id','server_uri','auth_key','perfil','canal'].forEach(function(k){ var el=fm.elements[k]; if(el) d.append(k, el.value); });
    ${novo ? '' : `d.append('id', ${JSON.stringify(m?.id ?? '')});`}
    res.textContent='Testando…'; bt.disabled=true;
    fetch('/dashboard/energia/medidores/testar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:d.toString(),credentials:'same-origin'})
      .then(function(r){return r.json();}).then(function(j){ res.textContent=j.mensagem||'Sem resposta.'; res.style.color=j.ok?'var(--cc-ok)':'var(--cc-warn)'; })
      .catch(function(){ res.textContent='Não deu para testar agora.'; res.style.color='var(--cc-warn)'; })
      .then(function(){ bt.disabled=false; });
  });
})();
</script>`;

  const cab = cabecalhoPagina({
    titulo: novo ? 'Cadastrar medidor' : `Editar: ${m!.apelido}`,
    trilha: [{ rotulo: 'Usinas', href: '/dashboard/monitoramento' }, { rotulo: 'Energia', href: '/dashboard/energia' }, { rotulo: novo ? 'Novo medidor' : m!.apelido }],
    subtitulo: 'A chave da nuvem Shelly entra só aqui — nunca pelo WhatsApp nem por conversa.',
  });
  const apagar = novo ? '' : cartaoSecao({ titulo: 'Apagar medidor e todos os dados', classe: 'en-perigo', corpoHtml: formApagar(m!, f.errosApagar) });
  return pagina(user, novo ? 'Cadastrar medidor' : 'Editar medidor', `${cab}${cartaoSecao({ titulo: 'Dados do medidor', corpoHtml: form })}${apagar}`);
}

/** LGPD: apagar tudo do medidor, com o nome digitado como confirmação. */
function formApagar(m: MedidorTela, erros?: string[]): string {
  const err = erros?.length ? `<div class="en-erros" role="alert">${erros.map((e) => escapeHtml(e)).join('<br>')}</div>` : '';
  return `${err}<p class="en-nota" style="margin-top:0">Apaga o cadastro, as leituras de 1 minuto, as janelas de 15 minutos e os resumos por dia deste medidor. <b>Não tem volta.</b> Use quando o cliente pedir para apagar os dados dele (LGPD). Fica registrado quem apagou e quando.</p>
<form method="post" action="/dashboard/energia/medidores/${encodeURIComponent(m.id)}/apagar" class="en-form en-apagar" autocomplete="off">
  <label class="en-full">Para confirmar, digite o nome do medidor: <b>${escapeHtml(m.apelido)}</b><input name="confirmacao" required maxlength="80" autocomplete="off" placeholder="${escapeHtml(m.apelido)}"></label>
  <div class="en-full"><button class="cc-btn cc-btn-crit" type="submit">Apagar medidor e todos os dados</button></div>
</form>`;
}

// ---------------------------------------------------------------------------
// Token (mostrado UMA vez)
// ---------------------------------------------------------------------------

export function renderTokenGerado(t: { medidor: Pick<MedidorTela, 'id' | 'apelido'>; token: string; urlWebhook: string }, user: DashUser | undefined): string {
  const linha = `var TOKEN = "${t.token}";`;
  const corpo = `
<p class="cc-subt" style="margin:0 0 12px">Este código aparece <b>só agora</b>. Copie e cole no script do aparelho. Se perder, gere outro (o antigo para de valer).</p>
<div class="en-token" id="en-tok">${escapeHtml(linha)}</div>
<div class="cc-row" style="margin-top:10px"><button class="cc-btn cc-btn-sm" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('en-tok').textContent)">Copiar a linha</button></div>
<ol class="en-passos">
  <li>No navegador, na mesma rede do aparelho, abra o endereço dele (ou o app Shelly) → <b>Scripts</b>.</li>
  <li>Abra o script da EcoSun e troque só a linha <code>var TOKEN = "…";</code> pela linha acima.</li>
  <li>Confira a linha do endereço: <code>var URL = "${escapeHtml(t.urlWebhook)}";</code></li>
  <li>Salve, pare e inicie o script. Deixe ligado <b>“Executar na inicialização”</b>.</li>
  <li>Em até 2 minutos esta tela do medidor mostra “Recebendo dado”.</li>
</ol>`;
  const cab = cabecalhoPagina({
    titulo: 'Código do medidor',
    trilha: [{ rotulo: 'Usinas', href: '/dashboard/monitoramento' }, { rotulo: 'Energia', href: '/dashboard/energia' }, { rotulo: t.medidor.apelido, href: `/dashboard/energia/${t.medidor.id}` }, { rotulo: 'Código' }],
    acoesHtml: `<a class="cc-btn" href="/dashboard/energia/${encodeURIComponent(t.medidor.id)}">Ir para o medidor</a>`,
  });
  return pagina(user, 'Código do medidor', `${cab}${cartaoSecao({ titulo: `Código de envio — ${t.medidor.apelido}`, corpoHtml: corpo })}`);
}

// ---------------------------------------------------------------------------
// Gráficos (SVG sem biblioteca, eixos em HTML — mesmo molde do Command Center)
// ---------------------------------------------------------------------------

function eixoMax(v: number): number {
  if (v <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * pot >= v) return k * pot;
  return 10 * pot;
}

/** Barras por dia: com usina, gerado × consumido; sem usina, comprado × devolvido. */
export function graficoDiario(serie: PontoDia[], temUsina: boolean): string {
  const W = 600, H = 200, n = serie.length || 1, bw = W / n, gap = Math.min(3, bw * 0.2), meia = (bw - gap) / 2;
  const a = temUsina ? 'geradoKwh' : 'importadoKwh';
  const b = temUsina ? 'consumoKwh' : 'exportadoKwh';
  const ca = temUsina ? 'en-c-ger' : 'en-c-imp';
  const cb = temUsina ? 'en-c-con' : 'en-c-exp';
  const valores = serie.flatMap((p) => [p[a], p[b]]).filter(temNumero);
  const topo = eixoMax(Math.max(0, ...valores));
  const y = (v: number) => H - (v / topo) * H;
  const barras = serie.map((p, i) => {
    const x0 = i * bw + gap / 2;
    const tip = (rot: string, v: number | null) => `${rot}: ${v === null ? 'sem dado' : `${fmtNumero(v, 1)} kWh`}`;
    const parcial = p.coberturaPct !== null && !p.completo;
    const titulo = `${dm(p.dia)} · ${tip(temUsina ? 'gerado' : 'comprado', p[a])} · ${tip(temUsina ? 'consumido' : 'devolvido', p[b])}`
      + (p.coberturaPct === null ? ' · medidor sem dado' : parcial ? ` · dia incompleto (${fmtNumero(p.coberturaPct, 0)}% com dado)` : '');
    const rect = (v: number | null, x: number, cls: string) => (v === null ? '' : `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${meia.toFixed(1)}" height="${Math.max(1, H - y(v)).toFixed(1)}" class="${cls}${parcial ? ' en-parcial' : ''}"/>`);
    const semDado = p.coberturaPct === null ? `<rect x="${(x0 + meia / 2).toFixed(1)}" y="${H - 3}" width="${meia.toFixed(1)}" height="3" class="en-semdado"/>` : '';
    return `<g><title>${escapeHtml(titulo)}</title><rect x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"/>${rect(p[a], x0, ca)}${rect(p[b], x0 + meia, cb)}${semDado}</g>`;
  }).join('');
  const grade = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" class="cc-grade"/>`).join('');
  const rotY = [1, 0.5, 0].map((f) => `<span style="top:${(1 - f) * 100}%">${escapeHtml(fmtNumero(topo * f, topo * f < 10 && topo * f % 1 ? 1 : 0))}</span>`).join('');
  const marcas = [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1].filter((v, i, arr) => arr.indexOf(v) === i && serie[v])
    .map((i) => `<span style="left:${((i + 0.5) / n) * 100}%">${escapeHtml(dm(serie[i].dia))}</span>`).join('');
  const legenda = `<div class="en-leg"><span><i class="en-sw ${ca}"></i>${temUsina ? 'Gerado pela usina' : 'Comprado da rede'}</span><span><i class="en-sw ${cb}"></i>${temUsina ? 'Consumido pela casa' : 'Devolvido à rede'}</span><span class="cc-faint">Barra clara = dia com dado incompleto · traço cinza = sem dado</span></div>`;
  return `<div class="cc-chart" role="img" aria-label="Energia por dia nos últimos ${n} dias">
    <div class="cc-chart-un">kWh/dia</div>
    <div class="cc-chart-y">${rotY}</div>
    <div class="cc-chart-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grade}${barras}</svg></div>
    <div class="cc-chart-x">${marcas}</div>
  </div>${legenda}`;
}

/** Perfil médio por hora: compra da rede pra cima, devolução pra baixo (kW médios). */
export function graficoHorario(perfil: PontoHora[]): string {
  const W = 480, H = 180;
  const cima = Math.max(0, ...perfil.map((p) => p.importadoKw ?? 0));
  const baixo = Math.max(0, ...perfil.map((p) => p.exportadoKw ?? 0));
  // Zero no lugar certo: compra em cima, devolução embaixo (sem amplitude → zero na base).
  const yZero = cima + baixo === 0 ? H : (cima / (cima + baixo)) * H;
  const esc = H / (cima + baixo || 1);
  const bw = W / 24, gap = Math.min(3, bw * 0.2);
  const barras = perfil.map((p) => {
    const x = p.hora * bw + gap / 2, w = bw - gap;
    const tit = `${String(p.hora).padStart(2, '0')}h · comprado ${p.importadoKw === null ? 'sem dado' : `${fmtNumero(p.importadoKw, 2)} kW`} · devolvido ${p.exportadoKw === null ? 'sem dado' : `${fmtNumero(p.exportadoKw, 2)} kW`}`;
    const up = p.importadoKw ? `<rect x="${x.toFixed(1)}" y="${(yZero - p.importadoKw * esc).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, p.importadoKw * esc).toFixed(1)}" class="en-c-imp"/>` : '';
    const dn = p.exportadoKw ? `<rect x="${x.toFixed(1)}" y="${yZero.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, p.exportadoKw * esc).toFixed(1)}" class="en-c-exp"/>` : '';
    const sem = p.importadoKw === null ? `<rect x="${x.toFixed(1)}" y="${(yZero - 1.5).toFixed(1)}" width="${w.toFixed(1)}" height="3" class="en-semdado"/>` : '';
    return `<g><title>${escapeHtml(tit)}</title><rect x="${(p.hora * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"/>${up}${dn}${sem}</g>`;
  }).join('');
  const rotY = [
    `<span style="top:0%">${escapeHtml(fmtNumero(cima, cima < 10 ? 1 : 0))}</span>`,
    `<span style="top:${(yZero / H) * 100}%">0</span>`,
    baixo > 0 ? `<span style="top:100%">−${escapeHtml(fmtNumero(baixo, baixo < 10 ? 1 : 0))}</span>` : '',
  ].join('');
  const marcas = [0, 6, 12, 18, 23].map((h) => `<span style="left:${((h + 0.5) / 24) * 100}%">${h}h</span>`).join('');
  return `<div class="cc-chart" role="img" aria-label="Perfil médio por hora do dia: compra e devolução à rede">
    <div class="cc-chart-un">kW médios (hora de Brasília)</div>
    <div class="cc-chart-y">${rotY}</div>
    <div class="cc-chart-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${yZero.toFixed(1)}" y2="${yZero.toFixed(1)}" class="en-zero"/>${barras}</svg></div>
    <div class="cc-chart-x">${marcas}</div>
  </div><div class="en-leg"><span><i class="en-sw en-c-imp"></i>Comprado da rede</span><span><i class="en-sw en-c-exp"></i>Devolvido à rede</span></div>`;
}

// ---------------------------------------------------------------------------
// Energia da casa
// ---------------------------------------------------------------------------

export interface EnergiaCasaInput {
  medidor: MedidorTela;
  usinaNome: string | null;
  painel: PainelEnergia | null;          // null = falha ao carregar
  falha?: 'migration' | 'falha';
  agora: Date;
  podeEditar: boolean;
}

const TOM_VEREDITO: Record<Veredito, { tom: Tom; texto: string }> = {
  bate: { tom: 'normal', texto: 'Bate' },
  atencao: { tom: 'atencao', texto: 'Diferença moderada' },
  diverge: { tom: 'critico', texto: 'Diferença grande' },
  sem_dado: { tom: 'sem_dado', texto: 'Sem dado para comparar' },
};

function kpisPeriodo(p: PainelEnergia, temUsina: boolean): string {
  const b = p.periodo.balanco;
  const n = p.periodo.diasUsados;
  const det = (v: number | null | undefined) => (temNumero(v) && n > 0 ? `${fmtNumero(v / n, 1)} kWh/dia · ${n} dia${n === 1 ? '' : 's'}` : undefined);
  const semUsina = temUsina ? 'sem dado' : 'ligue a usina';
  const k: KpiInput[] = [
    { rotulo: 'Gerado', valor: b?.geradoKwh ?? null, unidade: 'kWh', detalhe: det(b?.geradoKwh), semDadoTexto: semUsina },
    { rotulo: 'Comprado da rede', valor: b?.importadoKwh ?? null, unidade: 'kWh', detalhe: det(b?.importadoKwh) },
    { rotulo: 'Devolvido à rede', valor: b?.exportadoKwh ?? null, unidade: 'kWh', detalhe: det(b?.exportadoKwh) },
    { rotulo: 'Consumido pela casa', valor: b?.consumoKwh ?? null, unidade: 'kWh', detalhe: det(b?.consumoKwh), destaque: true, semDadoTexto: b?.aviso === 'conferir_cadastro' ? 'conferir cadastro' : temUsina ? 'sem dado' : 'ligue a usina' },
    { rotulo: 'Autoconsumo', valor: b?.autoconsumoPct ?? null, unidade: '%', detalhe: 'do sol usado na hora', semDadoTexto: temUsina ? 'sem dado' : 'ligue a usina' },
    { rotulo: 'Autossuficiência', valor: b?.autossuficienciaPct ?? null, unidade: '%', detalhe: 'da casa atendida pelo sol', semDadoTexto: temUsina ? 'sem dado' : 'ligue a usina' },
  ];
  return faixaKpis(k);
}

function avisoBalanco(p: PainelEnergia, temUsina: boolean): string {
  const b = p.periodo.balanco;
  if (!b) {
    return `<div class="en-aviso">${estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Ainda sem um dia completo de medição',
      texto: temUsina
        ? 'Os cartões usam só dias com o medidor e a usina completos (95% do dia ou mais). Assim que o primeiro fechar, os números aparecem.'
        : 'Os cartões usam só dias com o medidor completo (95% do dia ou mais).' })}</div>`;
  }
  if (b.aviso === 'sem_geracao') {
    return `<div class="en-aviso">${estadoVazio({ tipo: 'vazio', compacto: true, titulo: 'Ligue a usina a este medidor para ver o consumo real', texto: 'Sem a geração da usina, só dá para mostrar o que foi comprado e devolvido à rede. Em "Editar medidor", escolha a usina do mesmo endereço.' })}</div>`;
  }
  if (b.aviso === 'conferir_cadastro') {
    return `<div class="en-aviso">${estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Conferir o cadastro', texto: 'A usina ligada gerou menos do que a casa devolveu à rede — não fecha. Pode ser a usina errada, o sensor no cabo trocado ou geração faltando. O consumo não foi calculado.' })}</div>`;
  }
  return '';
}

function cartaoConciliacao(p: PainelEnergia, m: MedidorTela): string {
  const dica = 'Mês do calendário · tolerância larga';
  if (!m.uc_instalacao) {
    return cartaoSecao({ titulo: 'Conferência com a Neoenergia', dica, corpoHtml: estadoVazio({ compacto: true, titulo: 'Informe o nº da instalação (UC)', texto: 'Com a UC no cadastro do medidor, o demonstrativo de GD do mês é comparado com o que o medidor mediu.' }) });
  }
  const c = p.conciliacao;
  if (!c) {
    return cartaoSecao({ titulo: 'Conferência com a Neoenergia', dica, corpoHtml: estadoVazio({ compacto: true, titulo: 'Ainda não chegou demonstrativo desta UC', texto: `Assim que o demonstrativo da instalação ${m.uc_instalacao} chegar, a comparação aparece aqui.` }) });
  }
  const [ano, mes] = c.referencia.split('-').map(Number);
  const linhas = c.linhas.map((l) => {
    const t = TOM_VEREDITO[l.veredito];
    const dif = l.difPct === null ? '' : ` <span class="cc-faint">${escapeHtml(`${l.difPct > 0 ? '+' : ''}${fmtNumero(l.difPct, 1)}%`)}</span>`;
    return [l.grandeza === 'injetado' ? 'Devolvido' : 'Comprado', l.medidoKwh, l.distribuidoraKwh, { html: `${pilulaStatus(t.tom, t.texto)}${dif}` }];
  });
  const corpo = `${tabela({
    colunas: [{ titulo: 'kWh' }, { titulo: 'Medidor', alinhar: 'dir', num: true, casas: 0 }, { titulo: 'Neoenergia', alinhar: 'dir', num: true, casas: 0 }, { titulo: 'Situação' }],
    linhas,
  })}
  <p class="en-nota">${escapeHtml(`${MESES[mes - 1]} de ${ano} · medidor com dado em ${fmtNumero(c.coberturaPct, 0)}% do mês.`)} ${escapeHtml(c.linhas.find((l) => l.veredito === 'sem_dado')?.texto ?? 'O ciclo de leitura da Neoenergia não é o mês do calendário: diferença de alguns dias de leitura é normal. Bate = diferença até 5% (ou 10 kWh); acima de 15% = diferença grande.')}</p>`;
  return cartaoSecao({ titulo: 'Conferência com a Neoenergia', dica, corpoHtml: corpo });
}

function cartaoSaude(i: EnergiaCasaInput): string {
  const m = i.medidor;
  const p = i.painel;
  const itens = [
    `<div class="en-num"><span>Situação</span><b style="font-size:15px">${pilulasSituacao(m)}</b></div>`,
    `<div class="en-num"><span>Último dado</span><b style="font-size:15px">${escapeHtml(quando(m.ultima_leitura_em, i.agora))}</b></div>`,
    `<div class="en-num"><span>Dias com dado (30)</span><b>${p ? escapeHtml(`${p.periodo.diasComDado} · ${p.periodo.diasCompletos} completos`) : SEM_DADO}</b></div>`,
    `<div class="en-num"><span>Como chega</span><b style="font-size:15px">${escapeHtml(MODO_TEXTO[m.modo_coleta] ?? m.modo_coleta)}</b></div>`,
    `<div class="en-num"><span>Carga ligada de madrugada</span><b>${p && temNumero(p.baseNoturnaW) ? `${escapeHtml(fmtNumero(p.baseNoturnaW / 1000, 2))} kW` : SEM_DADO}</b></div>`,
    `<div class="en-num"><span>Maior média de 15 min</span><b>${p && temNumero(p.demandaMaxW) ? `${escapeHtml(fmtNumero(p.demandaMaxW / 1000, 2))} kW` : SEM_DADO}</b></div>`,
  ].join('');
  const erro = nuvemRecusada(m)
    ? `<p class="en-nota">A nuvem Shelly não aceitou a chave guardada${m.ultimo_erro ? ` (${escapeHtml(m.ultimo_erro)})` : ''}. Em "Editar medidor", cole a chave nova.${m.modo_coleta === 'push_nuvem' ? ' O script continua sendo vigiado normalmente.' : ''}</p>`
    : m.ultimo_erro && m.status !== 'ok' ? `<p class="en-nota">Último erro: ${escapeHtml(m.ultimo_erro)}</p>` : '';
  const nota = '<p class="en-nota">Carga de madrugada = mediana da potência entre 0h e 5h nos dias completos. Medição indicativa (Shelly, ±1% de 2 a 120 A) — não é laudo de qualidade de energia.</p>';
  return cartaoSecao({ titulo: 'Saúde do medidor', corpoHtml: `<div class="en-nums">${itens}</div>${erro}${nota}` });
}

export function renderEnergiaDaCasa(i: EnergiaCasaInput, user: DashUser | undefined): string {
  const m = i.medidor;
  const temUsina = !!m.sistema_id;
  const acoes = i.podeEditar
    ? `<a class="cc-btn" href="/dashboard/energia/medidores/${encodeURIComponent(m.id)}/editar">${icone('cog', 'sm')}Editar medidor</a>`
      + (m.modo_coleta !== 'nuvem' ? `<form method="post" action="/dashboard/energia/medidores/${encodeURIComponent(m.id)}/token" style="display:inline" onsubmit="return confirm('Gerar um código novo? O código atual do aparelho para de valer na hora.')"><button class="cc-btn" type="submit">${m.tem_token ? 'Gerar código novo' : 'Gerar código de envio'}</button></form>` : '')
    : '';
  const cab = cabecalhoPagina({
    titulo: 'Energia da casa',
    trilha: [{ rotulo: 'Usinas', href: '/dashboard/monitoramento' }, { rotulo: 'Energia', href: '/dashboard/energia' }, { rotulo: m.apelido }],
    subtitulo: `${m.apelido} · ${temUsina ? `usina: ${i.usinaNome ?? 'ligada'}` : 'sem usina ligada'} · últimos 30 dias`,
    seloHtml: pilulasSituacao(m),
    acoesHtml: acoes,
  });

  if (!i.painel) {
    const corpo = i.falha === 'migration' ? avisoMigration() : estadoVazio({ tipo: 'sem_dado', titulo: 'Não deu para carregar os números agora', texto: 'Tente de novo em alguns minutos.' });
    return pagina(user, 'Energia da casa', `${cab}${corpo}`);
  }
  const p = i.painel;
  const diario = cartaoSecao({
    titulo: 'Dia a dia', dica: temUsina ? 'Gerado × consumido (kWh)' : 'Comprado × devolvido (kWh)', classe: 'en-full',
    corpoHtml: p.periodo.diasComDado === 0 && !temUsina ? estadoVazio({ tipo: 'sem_dado', titulo: 'Ainda sem dia medido' }) : graficoDiario(p.serie, temUsina),
  });
  const temPerfil = p.perfil.some((h) => h.importadoKw !== null);
  const horario = cartaoSecao({
    titulo: 'Perfil por hora', dica: 'Média dos últimos 30 dias',
    corpoHtml: temPerfil ? graficoHorario(p.perfil) : estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Ainda sem horas suficientes medidas' }),
  });
  const corpo = `${cab}
  ${kpisPeriodo(p, temUsina)}
  ${avisoBalanco(p, temUsina)}
  <div class="en-grid">
    ${diario}
    ${horario}
    ${cartaoConciliacao(p, m)}
    <div class="en-full">${cartaoSaude(i)}</div>
  </div>`;
  return pagina(user, 'Energia da casa', corpo);
}
