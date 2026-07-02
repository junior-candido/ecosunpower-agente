# Gráfico Dia/Mês/Ano da usina (navegação por calendário)

Data: 2026-07-01
Autor: Junior + Claude

## Problema

A tela de detalhe da usina (`/monitoramento/:id`) mostra a geração por **períodos
corridos** (`30d|90d|6m|1a|2a|5a|tudo`). "30 dias" pega pedaço de dois meses do
calendário — o Junior quer ver **por mês fechado**, e navegar por Dia/Mês/Ano com
setas, **igual aos portais nativos** (SolisCloud/SEMS).

## Objetivo

Trocar os períodos corridos por **navegação de calendário Dia/Mês/Ano** com setas
◀▶, na tela de detalhe. Os KPIs do topo (hoje/mês/ano/total), alertas, prontuário
e timeline continuam iguais — muda só o **gráfico do meio**.

## Escopo

Só a tela de detalhe da usina. Não mexe no cron de coleta, nos adapters (exceto
ADICIONAR a capacidade opcional de curva intradiária), nem no pós-venda.

## As 3 abas

Aba padrão ao abrir = **Mês** (mês corrente).

| Aba | Mostra | Fonte | ◀▶ |
|---|---|---|---|
| **Dia** | Curva de **potência (kW)** ao longo do dia | **Ao vivo** no inversor (`fetchIntraday`) | troca o dia |
| **Mês** | Barras de **geração diária (kWh/dia)** do mês do calendário | `geracao_diaria` (banco) | troca o mês |
| **Ano** | Barras de **geração mensal (kWh/mês)** do ano | `geracao_diaria` agregada por mês | troca o ano |

Regras de navegação: não deixa avançar pra futuro além de hoje; ◀ limita ao redor
da data de instalação (ou ao 1º dado). O rótulo mostra o período claro ("julho/2026",
"2026", "15/07/2026").

## Dados

- **Mês/Ano** vêm do banco (`geracao_diaria`, colunas `data`, `geracao_kwh`). Já
  existe agregação mensal em `relatorio/dados.ts` (`serieMensal`) e a service
  `getDetalheSistema` já lê a geração — reusar/estender, não recriar.
- **Dia (curva)** NÃO é guardada (só temos diário). É buscada **ao vivo** por
  request, via nova capacidade do adapter.

## Capacidade nova do adapter: `fetchIntraday`

Adicionar ao `MonitoringAdapter` (opcional):

```ts
// Curva intradiária de POTÊNCIA de um dia. Opcional: adapter sem suporte não
// implementa (a tela degrada com aviso). Ao vivo — não passa pelo banco.
fetchIntraday?(
  credenciais: Record<string, unknown>,
  dia: string, // YYYY-MM-DD
): Promise<IntradayResult>;
```

`IntradayResult = { ok: true; pontos: Array<{ hora: string; kw: number }> } | { ok: false; reason: string }`.

Implementar AGORA para:
- **GoodWe:** `POST /api/v2/Charts/GetPlantPowerChart` `{ id, date, full_script:false }` →
  `data.lines[].xy` (W a cada 5 min) → kW. (validado ao vivo 01/07)
- **Solis:** `POST /v1/api/stationDay` `{ id, time:dia, timeZone:-3, money:'BRL' }` →
  pontos do dia (respeitar o rate-limit 1/s via o throttle que o adapter já tem).

Demais marcas: **não implementam** → a aba Dia mostra, sem erro: *"curva minuto a
minuto não disponível para este inversor — geração do dia: X kWh"* (o X vem do
`geracao_diaria` daquele dia).

## Rota

`GET /monitoramento/:id?vista=dia|mes|ano&ref=YYYY-MM-DD`
- `vista` default `mes`; `ref` default hoje.
- `mes`/`ano`: monta a série do banco (sem chamar inversor).
- `dia`: chama `getAdapter(marca).fetchIntraday?(...)`; se ausente/`ok:false`,
  cai no fallback (total do dia). Timeout curto — não trava a página.
- Os presets antigos (`preset=...`, `inicio/fim`) **saem** (removidos da rota e da
  view). Custom range não é objetivo (YAGNI).

## Camadas (unidades)

1. **Séries de calendário (puro/testável)** — `monitoring/detalhe-series.ts` (novo):
   - `serieMesDiaria(geracoes, ano, mes)` → 1..N dias do mês com kWh (0 nos sem dado).
   - `serieAnoMensal(geracoes, ano)` → 12 meses com kWh somado.
   - `navegacao(vista, ref, hoje, dataInstalacao)` → `{ anterior, proximo, label }`
     (calcula as datas das setas e trava futuro/passado).
2. **`fetchIntraday`** nos adapters GoodWe e Solis + tipos no `monitoring/types.ts`.
3. **Rota + view** — `router.ts` (params + fetch ao vivo do Dia) e `views.ts`
   (`renderDetalheSistemaPage`: abas, setas, e os 3 gráficos). Reusar o mesmo jeito
   de desenhar gráfico que a tela já usa hoje (não introduzir lib nova).

## Tratamento de erro

- Dia ao vivo falhou/timeout/sem suporte → mostra "geração do dia: X kWh" + aviso
  leve. Nunca derruba a página.
- Mês/Ano sem dado → "sem geração registrada nesse período" (gráfico vazio, não erro).
- `ref` inválido → cai pra hoje. `vista` inválida → cai pra `mes`.

## O que NÃO muda

KPIs (hoje/mês/ano/total), alertas, prontuário, timeline de abordagens, auto-refresh,
o cron de coleta e o resto do monitoramento. É troca de UM componente (o gráfico) +
1 capacidade nova de adapter.

## Testes

- **Puro:** `serieMesDiaria` (mês cheio, mês parcial, dias sem dado = 0, fevereiro/
  bissexto), `serieAnoMensal` (soma por mês, meses vazios), `navegacao` (não passa
  de hoje, trava no início, rótulos pt-BR, virada de ano).
- **Ao vivo:** `fetchIntraday` GoodWe e Solis contra 1 usina real (pontos > 0 num
  dia com sol; dia sem dado → lista vazia/ok).
- **Fallback:** adapter sem `fetchIntraday` → view usa o total do dia sem quebrar.
- **Render:** a página renderiza as 3 abas + setas sem erro.
