# Desktop товчлуулаас дуудагддаг интерактив "Цуврал нэмэх" цонх
chcp 65001 | Out-Null
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

Write-Host ""
Write-Host "======================================="
Write-Host "   МИНИ ДРАМ — Шинэ цуврал нэмэх"
Write-Host "======================================="
Write-Host ""
Write-Host "Зөвлөгөө: бичлэгийн файлаа энэ цонх руу ЧИРЖ ТАВИАД Enter дарахад зам нь автоматаар бичигдэнэ."
Write-Host ""

$video = Read-Host "1) Бичлэгийн файл"
$video = $video.Trim().Trim('"')
if (-not (Test-Path $video)) {
    Write-Host ""
    Write-Host "Файл олдсонгүй: $video" -ForegroundColor Red
    Read-Host "Enter дарж хаана уу"
    exit 1
}

$title = Read-Host "2) Цувралын нэр"
if (-not $title) {
    Write-Host "Нэр заавал хэрэгтэй." -ForegroundColor Red
    Read-Host "Enter дарж хаана уу"
    exit 1
}

$tagline = Read-Host "3) Товч танилцуулга (хоосон орхиж болно)"
$sec = Read-Host "4) Нэг ангийн урт секундээр (хоосон = 20)"
if (-not $sec) { $sec = 20 }

Write-Host ""
& (Join-Path $PSScriptRoot "add-series.ps1") -Video $video -Title $title -Tagline $tagline -EpisodeSeconds ([int]$sec)
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Read-Host "Алдаа гарлаа. Enter дарж хаана уу"
    exit 1
}

Write-Host ""
$ans = Read-Host "Сайтад шууд гаргах уу? (y = тийм / n = үгүй)"
if ($ans -eq "y") {
    & (Join-Path $PSScriptRoot "deploy.ps1") -Message "Шинэ цуврал: $title"
}

Write-Host ""
Read-Host "Дууслаа! Enter дарж хаана уу"
