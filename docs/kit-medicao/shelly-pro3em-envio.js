// ===========================================================================
// KIT DE MEDIÇÃO ECOSUNPOWER — script do Shelly Pro 3EM
// Versão que FUNCIONA (validada em campo em 07/09/2026).
//
// COLE DENTRO DO APARELHO:
//   App Shelly → o aparelho → ícone { } → "Criar novo roteiro"
//   → cola → Salvar → Iniciar → LIGUE "Executar na inicialização"
//
// TROQUE A LINHA DO TOKEN pelo mesmo valor do SHELLY_INGEST_TOKEN do servidor.
// A linha tem que ficar exatamente:   var TOKEN = "o-valor";
// (com aspas e ponto-e-vírgula — colar a linha do EasyPanel inteira não funciona)
//
// ---------------------------------------------------------------------------
// TRÊS ARMADILHAS QUE CUSTARAM UMA NOITE. Leia antes de mexer:
//
// 1. HTTPS. `Shelly.call("HTTP.POST", ...)` para servidor HTTPS fica PENDURADO:
//    não retorna sucesso nem erro, e o console só mostra a linha de início.
//    Parece que travou tudo. A solução é `HTTP.Request` com `ssl_ca: "*"`,
//    como está abaixo. ISSO VALE PRA TODA INSTALAÇÃO DO KIT.
//
// 2. O COMPONENTE depende do perfil do aparelho:
//      trifásico  →  "em:0"    e  "emdata:0"   (campos c_voltage, c_act_power…)
//      monofásico →  "em1:N"   e  "em1data:N"  (N = 0 fase A, 1 fase B, 2 fase C)
//    Pedir um componente que não existe faz o script MORRER CALADO.
//    Confira o perfil no app antes: se a tela mostra "Fase A/B/C + Total",
//    é trifásico. Este script está no trifásico, lendo a FASE C.
//
// 3. mJS não é JavaScript completo: sem template literal, sem toISOString,
//    sem async. Por isso a hora vai como epoch em segundos (o servidor aceita).
// ===========================================================================

var URL   = "https://propostas.ecosunpower.eng.br/webhooks/shelly";
var TOKEN = "COLE_AQUI_O_SHELLY_INGEST_TOKEN";   // <<< TROCAR

// Trifásico lendo a fase C. Para monofásico, troque para "em1:2"/"em1data:2"
// e os campos c_* por voltage/current/act_power/aprt_power/pf.
var COMPONENTE = "em:0";
var COMPONENTE_ENERGIA = "emdata:0";
var CANAL = 2;

var INTERVALO_MS = 60 * 1000;

var deviceId = "";
var apelido = "";

function enviar() {
  var m = Shelly.getComponentStatus(COMPONENTE);
  var e = Shelly.getComponentStatus(COMPONENTE_ENERGIA);
  if (!m) {
    print("[ecosun] sem leitura em " + COMPONENTE);
    return;
  }

  var corpo = {
    device_id: deviceId,
    apelido: apelido,
    canal: CANAL,
    medido_em: Math.floor(Date.now() / 1000),
    tensao: m.c_voltage,
    corrente: m.c_current,
    potencia_w: m.c_act_power,
    potencia_va: m.c_aprt_power,
    fator_potencia: m.c_pf,
    energia_wh: e ? e.c_total_act_energy : null,
    energia_devolvida_wh: e ? e.c_total_act_ret_energy : null
  };

  Shelly.call(
    "HTTP.Request",
    {
      method: "POST",
      url: URL,
      headers: { "Content-Type": "application/json", "x-shelly-token": TOKEN },
      body: JSON.stringify(corpo),
      timeout: 20,
      ssl_ca: "*"          // <<< sem isto o envio fica pendurado em HTTPS
    },
    function (resposta, erro, msg) {
      if (erro !== 0) {
        // Sem rede ou servidor fora: avisa e espera o próximo minuto. NÃO
        // tenta de novo agora — reenvio imediato em cima de servidor caído
        // vira enxurrada, e a próxima leitura sai em 1 minuto de qualquer jeito.
        print("[ecosun] falhou " + JSON.stringify(erro) + " " + JSON.stringify(msg));
        return;
      }
      if (resposta && resposta.code === 401) {
        print("[ecosun] TOKEN RECUSADO — confira o SHELLY_INGEST_TOKEN");
        return;
      }
      if (resposta && resposta.code !== 200) {
        print("[ecosun] servidor respondeu " + JSON.stringify(resposta.code));
        return;
      }
      print("[ecosun] OK");
    }
  );
}

var info = Shelly.getDeviceInfo();
if (info) {
  deviceId = info.id;
  apelido = info.name;
}
print("[ecosun] iniciado — " + COMPONENTE);
enviar();
Timer.set(INTERVALO_MS, true, enviar);
