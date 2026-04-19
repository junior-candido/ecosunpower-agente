$url = "https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host"
$token = "ecosunpower-webhook-2026"

Write-Host "Gerando 3 posts e enviando pro seu WhatsApp... (~2 min)" -ForegroundColor Cyan

$r = Invoke-RestMethod `
    -Uri "$url/marketing/run-weekly?token=$token" `
    -Method Post `
    -TimeoutSec 300

Write-Host ""
Write-Host "==================== CONCLUIDO ====================" -ForegroundColor Green
$r | ConvertTo-Json -Depth 5
Write-Host ""
Write-Host "Vai no seu WhatsApp que os 3 rascunhos devem ter chegado." -ForegroundColor Yellow
