param(
    [int]$Limit = 10
)

$url = "https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host"
$token = "ecosunpower-webhook-2026"

Write-Host "Buscando contatos pendentes de reengajamento..." -ForegroundColor Cyan

$r = Invoke-RestMethod `
    -Uri "$url/reengagement/daily?token=$token&limit=$Limit" `
    -Method Get `
    -TimeoutSec 30

if ($r.count -eq 0) {
    Write-Host ""
    Write-Host "Nenhum contato pendente. Todos ja foram contatados!" -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "==================== $($r.count) CONTATOS PENDENTES ====================" -ForegroundColor Green
Write-Host ""

$sent = 0
$skipped = 0
foreach ($item in $r.items) {
    Write-Host "-------------------------------------------------------"
    Write-Host "Nome     : $($item.name)" -ForegroundColor White
    Write-Host "Telefone : $($item.phone)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "MENSAGEM PRONTA:" -ForegroundColor Yellow
    Write-Host $item.message -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Abra este link no navegador pra abrir o WhatsApp com a mensagem pronta:" -ForegroundColor Cyan
    Write-Host $item.wa_link -ForegroundColor White
    Write-Host ""
    Write-Host "[Enter] = ja enviei, marcar como enviado" -ForegroundColor Green
    Write-Host "[s] = pular este por hora (fica pendente)" -ForegroundColor Yellow
    Write-Host "[q] = sair" -ForegroundColor Red
    $key = Read-Host "Acao"

    if ($key -eq 'q') {
        Write-Host "Encerrando." -ForegroundColor Red
        break
    }
    if ($key -eq 's') {
        Write-Host "Pulado." -ForegroundColor Yellow
        $skipped++
        continue
    }

    # Default (Enter) = mark as sent
    try {
        Invoke-RestMethod `
            -Uri "$url/reengagement/mark-sent/$($item.id)?token=$token" `
            -Method Post `
            -TimeoutSec 15 | Out-Null
        Write-Host "Marcado como enviado." -ForegroundColor Green
        $sent++
    } catch {
        Write-Host "Falhou ao marcar: $_" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "-------------------------------------------------------"
Write-Host "Resumo: $sent enviados, $skipped pulados" -ForegroundColor Cyan
