// ===========================================================================
// KIT DE MEDIÇÃO ECOSUNPOWER — script do Shelly Pro 3EM
//
// COLE ESTE SCRIPT DENTRO DO APARELHO:
//   App Shelly → o aparelho → ícone { }  →  "Criar novo roteiro"
//   → cola → Salvar → Iniciar
//   → ⚠️ LIGUE "Executar na inicialização"
//
// Aquele último passo é o que mais esquecem: sem ele o script morre na
// primeira queda de energia e o cliente fica sem dado sem ninguém perceber.
// Num serviço com mensalidade, isso é falha grave.
//
// ---------------------------------------------------------------------------
// ANTES DE COLAR, TROQUE AS DUAS LINHAS MARCADAS COM  <<< TROCAR
// ---------------------------------------------------------------------------
//
// Por que o aparelho manda em vez de a gente buscar: o medidor fica na casa do
// cliente e a plataforma fica aqui. Não existe rede em comum — nem com IP fixo,
// porque a faixa 192.168.x.x se repete em toda casa. Então ele empurra.
//
// A linguagem aqui é mJS (subconjunto de JavaScript). Não tem template
// literal, não tem toISOString, não tem async/await. Por isso o código é
// propositalmente simples e em ES5.
// ===========================================================================

var URL   = "https://propostas.ecosunpower.eng.br/webhooks/shelly";
var TOKEN = "COLE_AQUI_O_SHELLY_INGEST_TOKEN";   // <<< TROCAR (o mesmo do EasyPanel)
var CANAL = 2;                                    // <<< TROCAR se o TC não estiver no C
                                                  //     A=0  ·  B=1  ·  C=2
var INTERVALO_MS = 60 * 1000;                     // uma leitura por minuto

// Nome que aparece no painel. Deixe em branco pra usar o nome do aparelho.
var APELIDO = "";

// ---------------------------------------------------------------------------

var deviceId = "";
var apelido = APELIDO;

function iniciar() {
  var info = Shelly.getDeviceInfo();
  if (info) {
    deviceId = info.id || "";
    if (!apelido) apelido = info.name || "";
  }
  if (!deviceId) {
    print("[ecosun] sem id do aparelho — script parado");
    return;
  }
  print("[ecosun] enviando leitura do canal " + JSON.stringify(CANAL) +
        " a cada " + JSON.stringify(INTERVALO_MS / 1000) + "s");
  enviar();                                   // manda uma na hora, pra testar
  Timer.set(INTERVALO_MS, true, enviar);
}

function enviar() {
  // em1 = medidas instantâneas · em1data = energia acumulada
  var m = Shelly.getComponentStatus("em1:" + JSON.stringify(CANAL));
  var e = Shelly.getComponentStatus("em1data:" + JSON.stringify(CANAL));

  if (!m || m.act_power === undefined || m.act_power === null) {
    print("[ecosun] sem leitura no canal " + JSON.stringify(CANAL) + " — pulando");
    return;
  }

  // Epoch em SEGUNDOS. O servidor aceita segundos ou milissegundos. Mandar a
  // hora daqui faz o aparelho carimbar a própria leitura — importa se ele
  // ficar sem rede e a mensagem sair atrasada.
  var agora = Math.floor(Date.now() / 1000);

  var corpo = {
    device_id: deviceId,
    apelido: apelido,
    canal: CANAL,
    medido_em: agora,
    tensao: m.voltage === undefined ? null : m.voltage,
    corrente: m.current === undefined ? null : m.current,
    potencia_w: m.act_power,
    potencia_va: m.aprt_power === undefined ? null : m.aprt_power,
    fator_potencia: m.pf === undefined ? null : m.pf,
    energia_wh: e && e.total_act_energy !== undefined ? e.total_act_energy : null,
    energia_devolvida_wh: e && e.total_act_ret_energy !== undefined ? e.total_act_ret_energy : null
  };

  Shelly.call(
    "HTTP.POST",
    {
      url: URL,
      headers: { "Content-Type": "application/json", "x-shelly-token": TOKEN },
      body: JSON.stringify(corpo),
      timeout: 15
    },
    function (resposta, erro) {
      if (erro !== 0) {
        // Sem rede ou servidor fora: só avisa. NÃO tenta de novo agora —
        // reenvio imediato em cima de servidor caído vira enxurrada, e a
        // próxima leitura sai em 1 minuto de qualquer jeito.
        print("[ecosun] falhou o envio (erro " + JSON.stringify(erro) + ")");
        return;
      }
      if (resposta && resposta.code === 401) {
        print("[ecosun] TOKEN RECUSADO — confira o SHELLY_INGEST_TOKEN");
        return;
      }
      if (resposta && resposta.code !== 200) {
        print("[ecosun] servidor respondeu " + JSON.stringify(resposta.code) +
              ": " + JSON.stringify(resposta.body));
      }
    }
  );
}

iniciar();
