# Шинэ цуврал нэмэгч: нэг видеог ангиудад хэрчиж, poster гаргаж, каталогт бүртгэнэ.
#
# Хэрэглээ:
#   .\add-series.ps1 -Video "C:\...\mini_kino.mp4" -Title "Цувралын нэр"
#   .\add-series.ps1 -Video "..." -Title "..." -Tagline "Товч танилцуулга" -EpisodeSeconds 30
#
# Дараа нь .\deploy.ps1 ажиллуулбал сайт дээр гарна.
param(
    [Parameter(Mandatory = $true)][string]$Video,
    [Parameter(Mandatory = $true)][string]$Title,
    [string]$Id = "",
    [string]$Tagline = "",
    [string]$Genre = "Драм",
    [int]$EpisodeSeconds = 20,
    [int]$FreeCount = 2,
    [int]$UnlockCost = 30
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

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

$videosDir = Join-Path $root "public\videos"
$postersDir = Join-Path $root "public\posters"
New-Item -ItemType Directory -Force $videosDir | Out-Null
New-Item -ItemType Directory -Force $postersDir | Out-Null

$isVertical = $h -gt $w
$episodes = @()

for ($i = 0; $i -lt $epCount; $i++) {
    $ss = $i * $EpisodeSeconds
    $outFile = Join-Path $videosDir "$($Id)_e$($i + 1).mp4"
    if ($isVertical) {
        # Босоо видео: кодлолгүй хурдан хэрчинэ
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -c copy $outFile
    }
    else {
        # Хэвтээ видео: голоос нь 9:16 болгож тайрна (дахин кодлоно)
        $cropW = [int]($h * 9 / 16); if ($cropW % 2 -ne 0) { $cropW-- }
        $cropX = [int](($w - $cropW) / 2)
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -vf "crop=${cropW}:${h}:${cropX}:0" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k -movflags +faststart $outFile
    }
    $episodes += [pscustomobject]@{
        index = $i + 1
        video = "videos/$($Id)_e$($i + 1).mp4"
        title = "$($i + 1)-р анги"
    }
    Write-Host "  анги $($i + 1)/$epCount бэлэн"
}

# Poster: 1-р ангийн 5 дахь секундын кадр
$posterTime = [math]::Min(5, [math]::Max(1, $EpisodeSeconds / 2))
& $ff -v error -y -ss $posterTime -i (Join-Path $videosDir "$($Id)_e1.mp4") -frames:v 1 -vf "scale=540:-2" (Join-Path $postersDir "$Id.jpg")

# Каталогт нэмэх
$catalogPath = Join-Path $root "src\data\catalog.json"
$catalog = Get-Content $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json

$lockedEps = [math]::Max(0, $epCount - $FreeCount)
$bundleCost = [math]::Ceiling($lockedEps * $UnlockCost * 0.6 / 10) * 10

$newSeries = [pscustomobject]@{
    id         = $Id
    title      = $Title
    tagline    = $Tagline
    genre      = $Genre
    poster     = "posters/$Id.jpg"
    freeCount  = $FreeCount
    unlockCost = $UnlockCost
    bundleCost = $bundleCost
    episodes   = $episodes
}

$catalog.series = @($catalog.series) + $newSeries
$json = $catalog | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($catalogPath, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "'$Title' ($epCount анги, ID: $Id) каталогт нэмэгдлээ."
Write-Host "Ангиудын нэрийг өөрчлөх бол: src\data\catalog.json"
Write-Host "Сайтад гаргахын тулд: .\tools\deploy.ps1"
