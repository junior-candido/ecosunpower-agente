// src/modules/dashboard/proprietario.ts

export interface ClienteSearchFilter {
  valid: boolean;
  /** termo normalizado para name.ilike */
  termo: string;
  /** cláusula pronta pro .or() do supabase */
  or: string;
}

/**
 * Constrói o filtro de busca de clientes (leads) por nome OU telefone.
 * Sanitiza o termo e exige no mínimo 2 chars. Quando há >=3 dígitos,
 * adiciona busca por telefone com os dígitos normalizados.
 */
export function buildClienteSearchFilter(raw: string): ClienteSearchFilter {
  const termo = String(raw ?? '').trim();
  if (termo.length < 2) return { valid: false, termo, or: '' };
  const digits = termo.replace(/\D/g, '');
  const clauses = [`name.ilike.%${termo}%`];
  if (digits.length >= 3) clauses.push(`phone.ilike.%${digits}%`);
  return { valid: true, termo, or: clauses.join(',') };
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type ProprietarioAcao =
  | { acao: 'manter' }
  | { acao: 'desvincular' }
  | { acao: 'vincular'; lead_id: string }
  | { acao: 'erro'; motivo: string };

/**
 * Interpreta os campos do form de editar usina ligados ao proprietário.
 * - desvincular=1            -> { acao: 'desvincular' }   (prioridade máxima)
 * - lead_id = UUID válido    -> { acao: 'vincular', lead_id }
 * - lead_id vazio/ausente    -> { acao: 'manter' }
 * - lead_id presente inválido-> { acao: 'erro' }
 */
export function parseProprietarioInput(body: Record<string, unknown>): ProprietarioAcao {
  if (String(body?.desvincular ?? '') === '1') return { acao: 'desvincular' };
  const raw = String(body?.lead_id ?? '').trim();
  if (raw === '') return { acao: 'manter' };
  if (!UUID_RE.test(raw)) return { acao: 'erro', motivo: 'lead_id inválido' };
  return { acao: 'vincular', lead_id: raw };
}

export interface ClienteSelectorOpts {
  /** prefixo único pros ids/funções (permite 2 seletores na mesma página) */
  idPrefix: string;
  /** tema escuro (página Clientes) ou claro (editar usina) */
  dark: boolean;
  /** rótulo do botão de submit do form pai, se houver (apenas informativo) */
}

/**
 * Seletor de cliente reutilizável: autocomplete por nome/telefone +
 * bloco "criar novo" (nome + telefone). Não inclui <form> nem botão submit —
 * é embutido dentro do form do contexto (editar usina ou modal de órfã).
 *
 * Campos que envia ao backend:
 *   - lead_id   (hidden) preenchido ao escolher um cliente existente
 *   - novo_name / novo_phone (criar novo) — backend usa se lead_id vazio
 */
export function renderClienteSelector(opts: ClienteSelectorOpts): string {
  const p = opts.idPrefix;
  const inputCls = opts.dark
    ? 'w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm'
    : 'w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm';
  const dropCls = opts.dark
    ? 'absolute z-10 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg max-h-56 overflow-auto hidden'
    : 'absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg max-h-56 overflow-auto hidden';
  const itemCls = opts.dark
    ? 'px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 cursor-pointer'
    : 'px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 cursor-pointer';
  const mutedCls = opts.dark ? 'text-xs text-slate-400' : 'text-xs text-slate-500';

  return `
    <div class="space-y-2">
      <input type="hidden" name="lead_id" id="${p}-lead-id">
      <div class="relative">
        <input id="${p}-busca" type="text" autocomplete="off" placeholder="Buscar cliente por nome ou telefone…" class="${inputCls}">
        <div id="${p}-drop" class="${dropCls}"></div>
      </div>
      <div id="${p}-escolhido" class="hidden ${mutedCls}"></div>

      <details id="${p}-novo-wrap" class="mt-1">
        <summary class="${mutedCls} cursor-pointer select-none">+ Criar novo cliente</summary>
        <div class="mt-2 space-y-2">
          <input name="novo_name" placeholder="Nome completo" class="${inputCls}">
          <input name="novo_phone" placeholder="WhatsApp (ex: 5561999990000)" class="${inputCls}">
          <p class="${mutedCls}">Use só se o cliente ainda não existe. Telefone com DDI 55, sem +.</p>
        </div>
      </details>
    </div>

    <script>
    (function(){
      var busca = document.getElementById('${p}-busca');
      var drop = document.getElementById('${p}-drop');
      var hidden = document.getElementById('${p}-lead-id');
      var escolhido = document.getElementById('${p}-escolhido');
      var t = null;
      function limpaEscolha(){ hidden.value=''; escolhido.classList.add('hidden'); escolhido.textContent=''; }
      busca.addEventListener('input', function(){
        limpaEscolha();
        var q = busca.value.trim();
        if (t) clearTimeout(t);
        if (q.length < 2){ drop.classList.add('hidden'); drop.innerHTML=''; return; }
        t = setTimeout(function(){
          fetch('/dashboard/api/clientes/search?q='+encodeURIComponent(q))
            .then(function(r){ return r.json(); })
            .then(function(rows){
              if (!rows || !rows.length){ drop.innerHTML='<div class="${itemCls}">Nenhum cliente encontrado</div>'; drop.classList.remove('hidden'); return; }
              drop.innerHTML = rows.map(function(c){
                var sub = [c.phone, c.city].filter(Boolean).join(' · ');
                return '<div class="${itemCls}" data-id="'+c.id+'" data-label="'+(c.name||'')+'">'+
                  '<div class="font-semibold">'+(c.name||'(sem nome)')+'</div>'+
                  '<div class="opacity-70">'+sub+'</div></div>';
              }).join('');
              drop.classList.remove('hidden');
              Array.prototype.forEach.call(drop.querySelectorAll('[data-id]'), function(el){
                el.addEventListener('click', function(){
                  hidden.value = el.getAttribute('data-id');
                  busca.value = el.getAttribute('data-label');
                  escolhido.textContent = '✓ Vinculando a: '+el.getAttribute('data-label');
                  escolhido.classList.remove('hidden');
                  drop.classList.add('hidden');
                });
              });
            })
            .catch(function(){ drop.classList.add('hidden'); });
        }, 250);
      });
      document.addEventListener('click', function(e){
        if (!drop.contains(e.target) && e.target !== busca) drop.classList.add('hidden');
      });
    })();
    </script>`;
}
