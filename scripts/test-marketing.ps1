$url = "https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host"
$token = "ecosunpower-webhook-2026"

Write-Host "Gerando rascunho de post... (30-60s)" -ForegroundColor Cyan

$r = Invoke-RestMethod `
    -Uri "$url/marketing/generate?token=$token" `
    -Method Post `
    -ContentType "application/json" `
    -Body "{}" `
    -TimeoutSec 180

Write-Host ""
Write-Host "==================== RASCUNHO GERADO ====================" -ForegroundColor Green
Write-Host "ID do draft   : $($r.draft.id)"
Write-Host "Tema          : $($r.draft.topic)"
Write-Host "Tipo          : $($r.draft.topic_type)"
Write-Host ""
Write-Host "CAPTION:" -ForegroundColor Yellow
Write-Host $r.draft.caption
Write-Host ""
Write-Host "IMAGEM: $($r.draft.image_url)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Abra a imagem no navegador. Se gostar, pra publicar rode:" -ForegroundColor Cyan
Write-Host ".\scripts\publish-marketing.ps1 $($r.draft.id)" -ForegroundColor White
