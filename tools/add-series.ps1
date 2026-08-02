# Шинэ кино нэмэгч: нэг видеог ангиудад хэрчиж, poster гаргаж, R2 руу хуулж, каталогт бүртгэнэ.
#
# Хэрэглээ:
#   .\add-series.ps1 -Video "C:\...\kino.mp4" -Title "Киноны нэр"
#   .\add-series.ps1 -Video "..." -Title "..." -Price 5000 -FreeMinutes 15 -EpisodeSeconds 120
#
# Видео файлууд Cloudflare R2 (minidram сан) руу хуулагдана — сайтын хамт биш.
# Дараа нь .\deploy.ps1 ажиллуулбал сайт дээр гарна.
param(
    [Parameter(Mandatory = $true)][string]$Video,
    [Parameter(Mandatory = $true)][string]$Title,
    [string]$Id = "",
    [string]$Tagline = "",
    [string]$Genre = "Драм",
    [int]$EpisodeSeconds = 120,
    [int]$Price = 3500,
    [double]$FreeMinutes = 20,
    # Анхдагчаар бичлэгийн хэлбэрийг ХЭВЭЭР нь хадгална (16:9, 4:3, босоо бүгд болно).
    # Зөвхөн энэ сонголтыг өгвөл хэвтээ бичлэгийг голоос нь босоо болгож тайрна.
    [switch]$Crop9x16
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

# R2 түлхүүрүүд .env-ээс (commit хийгддэггүй)
foreach ($line in Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^\w+=' }) {
    $k, $v = $line -split '=', 2
    Set-Item -Path "env:$k" -Value $v.Trim()
}
if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) {
    Write-Error ".env дотор CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID алга — видео байршуулах боломжгүй"
    exit 1
}

# ffmpeg-ийг tale2film-ийн portable хувилбараас, эс бөгөөс PATH-аас хайна
$ff = Join-Path $root "..\tale2film\tools\ffmpeg\ffmpeg.exe"
$ffp = Join-Path $root "..\tale2film\tools\ffmpeg\ffprobe.exe"
if (-not (Test-Path $ff)) { $ff = "ffmpeg"; $ffp = "ffprobe" }

if (-not (Test-Path $Video)) { Write-Error "Видео олдсонгүй: $Video"; exit 1 }

if ($Id -eq "") {
    # Латин ID автоматаар: кирилл үсгийг орхиод цаг хугацааны тэмдэг ашиглана
    $Id = "series-" + (Get-Date -Format "yyMMdd-HHmm")
}

# Видеоны хэмжээ, үргэлжлэх хугацаа
$probe = & $ffp -v error -select_streams v:0 -show_entries "stream=width,height:format=duration" -of csv $Video
$dims = ($probe | Select-String "stream").ToString().Split(",")
$w = [int]$dims[1]; $h = [int]$dims[2]
$duration = [double](($probe | Select-String "format").ToString().Split(",")[1])
$epCount = [math]::Ceiling($duration / $EpisodeSeconds)

Write-Host "Видео: ${w}x${h}, $([math]::Round($duration,1)) сек -> $epCount анги ($EpisodeSeconds сек тутам)"
Write-Host "Үнэ: $Price₮ · Эхний $FreeMinutes минут үнэгүй"

# Ангиуд media\videos-д хадгалагдана (git-д ордоггүй локал нөөц) + R2 руу хуулагдана
$videosDir = Join-Path $root "media\videos"
$postersDir = Join-Path $root "public\posters"
New-Item -ItemType Directory -Force $videosDir | Out-Null
New-Item -ItemType Directory -Force $postersDir | Out-Null

$isVertical = $h -gt $w
$episodes = @()

for ($i = 0; $i -lt $epCount; $i++) {
    $ss = $i * $EpisodeSeconds
    $outFile = Join-Path $videosDir "$($Id)_e$($i + 1).mp4"
    if ($Crop9x16 -and -not $isVertical) {
        # Зөвхөн хүсэлтээр: хэвтээ бичлэгийг голоос нь 9:16 болгож тайрна (дахин кодлоно)
        $cropW = [int]($h * 9 / 16); if ($cropW % 2 -ne 0) { $cropW-- }
        $cropX = [int](($w - $cropW) / 2)
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -vf "crop=${cropW}:${h}:${cropX}:0" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k -movflags +faststart $outFile
    }
    else {
        # Хэлбэрийг хэвээр нь: кодлолгүй хурдан хэрчинэ (faststart = шууд тоглож эхэлнэ)
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -c copy -movflags +faststart $outFile
        if ($LASTEXITCODE -ne 0) {
            # mkv/avi зэрэг mp4-д шууд ордоггүй формат бол дахин кодлоно
            Write-Host "  (формат тохирохгүй тул дахин кодолж байна…)"
            & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k -movflags +faststart $outFile
        }
    }
    # Бодит урт (сүүлийн анги богино байдаг)
    $epDur = [math]::Round([double](& $ffp -v error -show_entries format=duration -of csv=p=0 $outFile), 1)
    $episodes += [pscustomobject]@{
        index    = $i + 1
        video    = "videos/$($Id)_e$($i + 1).mp4"
        title    = "$($i + 1)-р анги"
        duration = $epDur
    }
    Write-Host "  анги $($i + 1)/$epCount бэлэн ($epDur сек)"
}

# Poster: 1-р ангийн 5 дахь секундын кадр.
# Каталогийн карт босоо хэлбэртэй тул хэвтээ бичлэгээс постер хийхдээ
# бүдгэрсэн дэвсгэр дээр буулгана — эс бөгөөс карт дээр хоёр тал нь тасарна.
$posterTime = [math]::Min(5, [math]::Max(1, $EpisodeSeconds / 2))
$ep1 = Join-Path $videosDir "$($Id)_e1.mp4"
$posterOut = Join-Path $postersDir "$Id.jpg"
if ($isVertical -or $Crop9x16) {
    & $ff -v error -y -ss $posterTime -i $ep1 -frames:v 1 -vf "scale=540:-2" $posterOut
}
else {
    & $ff -v error -y -ss $posterTime -i $ep1 -frames:v 1 -filter_complex `
        "[0:v]scale=540:780:force_original_aspect_ratio=increase,crop=540:780,boxblur=20:2[bg];[0:v]scale=540:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" `
        $posterOut
}

# R2 руу хуулах
Write-Host ""
Write-Host "Видеонуудыг R2 сан руу хуулж байна ($epCount файл)..."
Set-Location $root
for ($i = 1; $i -le $epCount; $i++) {
    $f = Join-Path $videosDir "$($Id)_e$i.mp4"
    npx -y wrangler r2 object put "minidram/videos/$($Id)_e$i.mp4" --file $f --remote 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "R2 хуулалт амжилтгүй: анги $i"; exit 1 }
    Write-Host "  хуулагдлаа $i/$epCount"
}

# Каталогт нэмэх
$catalogPath = Join-Path $root "src\data\catalog.json"
$catalog = Get-Content $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json

$newSeries = [pscustomobject]@{
    id          = $Id
    title       = $Title
    tagline     = $Tagline
    genre       = $Genre
    poster      = "posters/$Id.jpg"
    price       = $Price
    freeMinutes = $FreeMinutes
    episodes    = $episodes
}

$catalog.series = @($catalog.series) + $newSeries
$json = $catalog | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($catalogPath, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "'$Title' ($epCount анги, $Price₮, ID: $Id) каталогт нэмэгдлээ."
Write-Host "Ангиудын нэр, үнийг өөрчлөх бол: src\data\catalog.json"
Write-Host "Сайтад гаргахын тулд: .\tools\deploy.ps1 (үнийг сервертэй автоматаар тааруулна)"
