$url = "https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host"
$token = "ecosunpower-webhook-2026"

Write-Host "Tentando enviar texto de teste pro seu WhatsApp..." -ForegroundColor Cyan

$r = Invoke-RestMethod `
    -Uri "$url/marketing/test-whatsapp?token=$token" `
    -Method Post `
    -TimeoutSec 30

Write-Host ""
Write-Host "Resposta:" -ForegroundColor Green
$r | ConvertTo-Json -Depth 5
Write-Host ""
Write-Host "Olha o WhatsApp do numero abaixo. Se nao chegar, o numero ou a instancia do Evolution tem problema." -ForegroundColor Yellow
Write-Host "Numero configurado: $($r.to)" -ForegroundColor Yellow
