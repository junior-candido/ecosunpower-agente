// src/modules/dashboard/os-views.ts
// Tela do form da OS (checklist 3-em-1 + upload de fotos) + laudo HTML imprimível.
// Renovação do miolo — R13 (28/09/2026): a TELA da OS no padrão cc- (tema
// escuro, sem Tailwind), checklist em painel com toque grande no celular; os
// mesmos formulários (salvar, concluir por formaction, foto multipart) e os
// mesmos campos ligados por form="osForm". O LAUDO (documento com doctype
// próprio, que vai pro cliente) NÃO mudou.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { OSRow, FotoOS } from './os-queries.js';
import { progressoOS, type ItemPreenchido, type ResumoOS } from './os-checklist.js';
import { empresa } from '../empresa-config.js';
import { cabecalhoPagina, cartaoSecao, pilulaStatus, botao, barra, icone } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { TIPO_TEXTO } from './manutencao-views.js';

const CSS_OS = `
.cc-os{max-width:860px}
.cc-os .cc-panel+.cc-panel{margin-top:16px}
.cc-os-prog{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cc-os-prog .cc-bar{flex:1}
.cc-os-prog span{font-size:13px;color:var(--cc-text-2);white-space:nowrap}
.cc-os-lista{display:flex;flex-direction:column}
.cc-os-item{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 4px;border-bottom:1px solid var(--cc-line);font-size:14px;color:var(--cc-text)}
.cc-os-item:last-child{border-bottom:0}
label.cc-os-item{cursor:pointer}
.cc-os-item input[type=checkbox]{width:22px;height:22px;flex:none;accent-color:var(--cc-gold)}
.cc-os-med{justify-content:space-between;flex-wrap:wrap}
.cc-os-med input{width:200px;max-width:100%}
.cc-os-foto{flex-direction:column;align-items:stretch}
.cc-os-foto small{font-size:12px;color:var(--cc-faint);margin-left:6px}
.cc-os-minis{display:flex;flex-wrap:wrap;gap:6px}
.cc-os-minis img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--cc-line-2)}
.cc-os-up{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cc-os-up input[type=file]{flex:1 1 180px;min-width:0}
.cc-os-obs{display:flex;flex-direction:column;gap:6px;margin-top:14px}
.cc-os-obs textarea{width:100%}
.cc-os-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.cc-os-acoes .cc-btn{min-height:40px}
@media (max-width:760px){
  .cc-os-item{min-height:52px;font-size:15px}
  .cc-os-item input[type=checkbox]{width:26px;height:26px}
  .cc-os-med input{width:100%}
  .cc-os-up .cc-btn{flex:1 1 auto;justify-content:center;min-height:44px}
  .cc-os-acoes .cc-btn{flex:1 1 100%;justify-content:center;min-height:48px}
}
`;

// Os campos de check/medição/observações usam o atributo HTML5 form="osForm"
// pra pertencer ao form de salvar SEM ficarem aninhados — assim o form de upload
// de cada foto fica como IRMÃO (não <form> dentro de <form>, que é inválido).
function renderItem(osId: string, i: ItemPreenchido, fotos: FotoOS[], travado: boolean): string {
  const dis = travado ? 'disabled' : '';
  if (i.kind === 'check') {
    return `<label class="cc-os-item"><input type="checkbox" form="osForm" name="${escapeHtml(i.chave)}" ${i.valor === true ? 'checked' : ''} ${dis}><span>${escapeHtml(i.label)}</span></label>`;
  }
  if (i.kind === 'medicao') {
    return `<label class="cc-os-item cc-os-med"><span>${escapeHtml(i.label)}</span>
      <input type="text" form="osForm" name="${escapeHtml(i.chave)}" value="${escapeHtml(String(i.valor ?? ''))}" placeholder="${escapeHtml(i.unidade ?? '')}" ${dis}></label>`;
  }
  // foto: form próprio (irmão do osForm, não aninhado)
  const minis = fotos.filter((f) => f.item_chave === i.chave)
    .map((f) => `<img src="${escapeHtml(f.url ?? '#')}" alt="">`).join('');
  const upload = travado ? '' : `
    <form method="post" action="/dashboard/os/${escapeHtml(osId)}/foto" enctype="multipart/form-data" class="cc-form cc-os-up">
      <input type="hidden" name="itemChave" value="${escapeHtml(i.chave)}">
      <input type="file" name="foto" accept="image/*" id="os_foto_${escapeHtml(i.chave)}" aria-label="Foto: ${escapeHtml(i.label)}">
      <button type="button" onclick="var i=document.getElementById('os_foto_${escapeHtml(i.chave)}');i.setAttribute('capture','environment');i.click();i.removeAttribute('capture')" class="cc-btn cc-btn-sm">📷 Tirar foto</button>
      <button type="submit" class="cc-btn cc-btn-sm">${icone('send', 'sm')}Enviar</button>
    </form>`;
  return `<div class="cc-os-item cc-os-foto"><div>${escapeHtml(i.label)}<small>(${i.fotos} foto${i.fotos === 1 ? '' : 's'})</small></div>
    ${minis ? `<div class="cc-os-minis">${minis}</div>` : ''}${upload}</div>`;
}

export function renderOSPage(os: OSRow, itens: ItemPreenchido[], fotos: FotoOS[], user?: DashUser): string {
  const travado = os.status !== 'aberta';
  const p = progressoOS(itens);
  const tipo = TIPO_TEXTO[os.tipo] ?? os.tipo;
  const laudo = botao({ rotulo: 'Gerar laudo (PDF)', href: `/dashboard/os/${os.id}/laudo`, tom: travado ? 'ouro' : 'normal', icone: 'file', attrs: { target: '_blank' } });

  const checklist = `
    <div class="cc-os-prog">${barra(p.pct, p.pct === 100 ? 'ok' : 'ouro')}<span>${travado ? 'OS concluída' : `Progresso: ${p.feitos}/${p.total} (${p.pct}%)`}</span></div>
    <div class="cc-form cc-os-lista">${itens.map((i) => renderItem(os.id, i, fotos, travado)).join('')}</div>
    <label class="cc-form cc-os-obs"><span class="cc-rot">Observações</span>
      <textarea form="osForm" name="observacoes" rows="3" ${travado ? 'disabled' : ''}>${escapeHtml(os.observacoes ?? '')}</textarea>
    </label>
    ${travado ? '' : `<div class="cc-os-acoes">
      <button form="osForm" class="cc-btn">${icone('check', 'sm')}Salvar</button>
      <button form="osForm" formaction="/dashboard/os/${escapeHtml(os.id)}/concluir" class="cc-btn cc-btn-gold">${icone('doc-check', 'sm')}Concluir OS</button>
    </div>`}`;

  const body = `<div class="cc-root cc-os">
${cabecalhoPagina({
    trilha: [{ rotulo: 'Manutenção', href: '/dashboard/manutencao' }, { rotulo: 'Ordem de Serviço' }],
    titulo: `OS — ${tipo}`,
    subtitulo: `${os.apelido ?? '—'} · ${os.clienteNome ?? '—'}`,
    seloHtml: travado ? pilulaStatus('normal', 'OS concluída') : pilulaStatus('info', 'aberta'),
    acoesHtml: laudo,
  })}

    <!-- form de salvar/concluir: vazio aqui; os campos se ligam por form="osForm" -->
    <form id="osForm" method="post" action="/dashboard/os/${escapeHtml(os.id)}/salvar"></form>

${cartaoSecao({ titulo: 'Checklist', dica: `${p.feitos} de ${p.total} feitos`, corpoHtml: checklist })}
</div>
<style>${CSS_OS}</style>`;
  return renderLayout({
    active: 'manutencao', title: 'Ordem de Serviço', body, user,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro',
  });
}

export function renderOSLaudoHtml(os: OSRow, resumo: ResumoOS, fotos: FotoOS[], responsavel: string): string {
  const e = empresa();
  const data = (os.concluida_em ?? os.aberta_em).slice(0, 10).split('-').reverse().join('/');
  const checks = resumo.checks.map((c) => `<li>✅ ${escapeHtml(c)}</li>`).join('') || '<li>—</li>';
  const medicoes = resumo.medicoes.map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.valor)} ${escapeHtml(m.unidade ?? '')}</td></tr>`).join('')
    || '<tr><td colspan="2">—</td></tr>';
  const galeria = fotos.map((f) => `<figure><img src="${escapeHtml(f.url ?? '#')}"><figcaption>${escapeHtml(f.legenda ?? f.item_chave ?? '')}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laudo de Serviço — ${escapeHtml(os.apelido ?? '')}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:24px}
  h1{font-size:20px} h2{font-size:15px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:24px}
  table{width:100%;border-collapse:collapse} td{border:1px solid #e2e8f0;padding:6px;font-size:13px}
  ul{list-style:none;padding:0} li{padding:2px 0}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  figure{margin:0} img{width:100%;border-radius:6px;border:1px solid #e2e8f0} figcaption{font-size:11px;color:#64748b}
  .ass{margin-top:48px;border-top:1px solid #0f172a;width:280px;padding-top:6px;font-size:13px}
  @media print{ a{display:none} }
</style></head>
<body>
  <h1>${escapeHtml(e.nomeFantasia)} — Laudo de Serviço</h1>
  <p>${escapeHtml(os.apelido ?? '')} · Cliente: ${escapeHtml(os.clienteNome ?? '')} · Data: ${data}</p>
  <h2>Itens verificados</h2><ul>${checks}</ul>
  <h2>Medições</h2><table><tr><td><b>Item</b></td><td><b>Valor</b></td></tr>${medicoes}</table>
  ${os.observacoes ? `<h2>Observações</h2><p>${escapeHtml(os.observacoes)}</p>` : ''}
  ${galeria ? `<h2>Registro fotográfico</h2><div class="grid">${galeria}</div>` : ''}
  <div class="ass">${escapeHtml(responsavel)}</div>
</body></html>`;
}
