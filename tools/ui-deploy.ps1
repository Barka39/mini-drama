# Desktop товчлуулаас дуудагддаг "Сайт шинэчлэх" цонх
chcp 65001 | Out-Null
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

Write-Host ""
Write-Host "======================================="
Write-Host "   МИНИ ДРАМ — Сайт шинэчлэх"
Write-Host "======================================="
Write-Host ""

& (Join-Path $PSScriptRoot "deploy.ps1")

Write-Host ""
Read-Host "Enter дарж хаана уу"
