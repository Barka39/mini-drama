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

# Сайтад гаргахад Supabase-ийн токен хэрэгтэй. Хугацаа нь дууссан бол 10 минутын кодлолтын
# ДАРАА биш, ОДОО хэлнэ (2026-10-21: токен дууссанаас кинонууд сайтад гараагүй).
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$tok = ""; $ref = ""
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"]*)"?\s*$') { $tok = $Matches[1] }
        if ($line -match '^\s*SUPABASE_PROJECT_REF\s*=\s*"?([^"]*)"?\s*$') { $ref = $Matches[1] }
    }
}
$tokOk = $false
if ($tok -and $ref) {
    try {
        Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Headers @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json' } -Body '{"query":"select 1"}' -TimeoutSec 20 | Out-Null
        $tokOk = $true
    } catch { }
}
if (-not $tokOk) {
    Write-Host ""
    Write-Host "АНХААР: Supabase-ийн токен хүчингүй байна — кино нэмэгдсэн ч сайтад ГАРАХГҮЙ." -ForegroundColor Red
    Write-Host "  1) supabase.com/dashboard/account/tokens -> Generate new token"
    Write-Host "  2) drama-web\.env файлын SUPABASE_ACCESS_TOKEN= мөрийг шинэ токеноор солино"
    Write-Host "  3) Энэ цонхыг дахин нээнэ"
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
# Энэ асуулт өмнө нь ХАМГИЙН СҮҮЛД (кодлолт, хуулалт дууссаны дараа) асуугддаг байсан тул
# компьютерийн өмнө хүлээх шаардлагатай байв. Одоо эхэнд асууна — дараа нь бүгд өөрөө дуусна.
# 2026-10-21 (эзэн): хоосон орхиход сайтад ГАРАХГҮЙ байсан тул 4 кино харагдахгүй үлдсэн — одоо анхдагч нь «тийм».
$ans = Read-Host "7) Дууссаны дараа сайтад шууд гаргах уу? (хоосон = тийм / n = үгүй)"
if ($ans -ne "n") { $ans = "y" }

Write-Host ""
Write-Host "Бүх асуулт дууслаа — цааш өөрөө явна, компьютерийн өмнө хүлээх шаардлагагүй."
Write-Host ""
$argsExtra = @{}
if ($crop -eq "y") { $argsExtra["Crop9x16"] = $true }
& (Join-Path $PSScriptRoot "add-series.ps1") -Video $video -Title $title -Tagline $tagline -Price ([int]$price) -FreeMinutes ([double]$freeMin) @argsExtra
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Read-Host "Алдаа гарлаа. Enter дарж хаана уу"
    exit 1
}

Write-Host ""
if ($ans -eq "y") {
    & (Join-Path $PSScriptRoot "deploy.ps1") -Message "Шинэ цуврал: $title"
}

Write-Host ""
Read-Host "Дууслаа! Enter дарж хаана уу"
