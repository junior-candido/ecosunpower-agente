param(
    [Parameter(Mandatory=$true)]
    [string]$DraftId
)

$url = "https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host"
$token = "ecosunpower-webhook-2026"

Write-Host "Publicando draft $DraftId no Instagram e Facebook..." -ForegroundColor Cyan

$r = Invoke-RestMethod `
    -Uri "$url/marketing/publish/$DraftId`?token=$token" `
    -Method Post `
    -ContentType "application/json" `
    -TimeoutSec 120

Write-Host ""
Write-Host "==================== PUBLICADO ====================" -ForegroundColor Green
$r | ConvertTo-Json -Depth 5
