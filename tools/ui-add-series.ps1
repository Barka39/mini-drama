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
# «Нэг ангийн урт» гэсэн асуулт хасагдсан: кино одоо нэг бүтэн бичлэг. (Тэр асуултад
# бичих ёстой 210-ыг «үнэгүй минут»-д бичсэнээс нэг кино 5 долоо хоног бүхэлдээ үнэгүй явсан.)
$price = Read-Host "4) Киноны үнэ төгрөгөөр (хоосон = 3800, 0 = бүрэн үнэгүй)"
if ($price -eq "") { $price = 3800 }
$freeMin = Read-Host "5) Эхний хэдэн МИНУТ үнэгүй үзүүлэх вэ? (хоосон = 15)"
if (-not $freeMin) { $freeMin = 15 }
# Хамгаалалт: үнэтэй кинонд үнэгүй хэсэг 60 минутаас их бол бараг бүхэлдээ үнэгүй гэсэн үг
if ([int]$price -gt 0 -and [double]$freeMin -gt 60) {
    Write-Host ""
    Write-Host "АНХААР: $freeMin минут үнэгүй гэвэл кино бараг бүхэлдээ үнэгүй болно." -ForegroundColor Yellow
    $ok = Read-Host "   Үнэхээр $freeMin минут уу? (y = тийм / хоосон = 15 болгоно)"
    if ($ok -ne "y") { $freeMin = 15 }
}
Write-Host ""
Write-Host "   Анхдагчаар бичлэгийн хэлбэрийг хэвээр нь хадгална (16:9 бол 16:9-ээр гарна)."
$crop = Read-Host "6) Хэвтээ бичлэгийг босоо (9:16) болгож тайрах уу? (y / хоосон = үгүй)"

Write-Host ""
$argsExtra = @{}
if ($crop -eq "y") { $argsExtra["Crop9x16"] = $true }
& (Join-Path $PSScriptRoot "add-series.ps1") -Video $video -Title $title -Tagline $tagline -Price ([int]$price) -FreeMinutes ([double]$freeMin) @argsExtra
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
