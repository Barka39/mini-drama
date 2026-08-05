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
$video = $video.Trim().Trim('"').Trim("'")
# ЧУХАЛ: -LiteralPath. Энгийн Test-Path нь [ ] тэмдгийг «загвар» гэж ойлгодог тул
# yt-dlp-ийн «нэр [id].mp4» маягийн файлыг «олдсонгүй» гэж буруу хэлдэг байсан.
if (-not (Test-Path -LiteralPath $video)) {
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
$sec = Read-Host "4) Нэг ангийн урт секундээр (хоосон = 120)"
if (-not $sec) { $sec = 120 }
$price = Read-Host "5) Киноны үнэ төгрөгөөр (хоосон = 3500, 0 = бүрэн үнэгүй)"
if ($price -eq "") { $price = 3500 }
$freeMin = Read-Host "6) Эхний хэдэн минут үнэгүй үзүүлэх вэ? (хоосон = 20)"
if (-not $freeMin) { $freeMin = 20 }
Write-Host ""
Write-Host "   Анхдагчаар бичлэгийн хэлбэрийг хэвээр нь хадгална (16:9 бол 16:9-ээр гарна)."
$crop = Read-Host "7) Хэвтээ бичлэгийг босоо (9:16) болгож тайрах уу? (y / хоосон = үгүй)"

Write-Host ""
$argsExtra = @{}
if ($crop -eq "y") { $argsExtra["Crop9x16"] = $true }
& (Join-Path $PSScriptRoot "add-series.ps1") -Video $video -Title $title -Tagline $tagline -EpisodeSeconds ([int]$sec) -Price ([int]$price) -FreeMinutes ([double]$freeMin) @argsExtra
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
