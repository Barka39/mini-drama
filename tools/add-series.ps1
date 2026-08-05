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
    [switch]$Crop9x16,
    # Шахалтыг бүрмөсөн болиулах (эх бичлэг аль хэдийн сайн шахагдсан гэдэгт итгэлтэй бол)
    [switch]$NoCompress
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

# -LiteralPath: файлын нэрэн дэх [ ] хаалт нь Test-Path-д «загвар» болж уншигддаг
# (yt-dlp «нэр [id].mp4» гэж хадгалдаг) — тэгэхээр байгаа файлыг «олдсонгүй» гэдэг.
if (-not (Test-Path -LiteralPath $Video)) { Write-Error "Видео олдсонгүй: $Video"; exit 1 }
# ffmpeg/ffprobe-д бүтэн зам өгнө (харьцангуй зам Set-Location-ийн дараа алдагдана)
$Video = (Resolve-Path -LiteralPath $Video).ProviderPath

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

# --- Автомат шахалт (нотолгоонд суурилсан: хэрэгтэй үед НЬ Л шахна) ---
#
# Заримдаа эх бичлэг хэрэгцээнээс хамаагүй өндөр чанартай ирдэг. Тэгвэл:
# утсан дээр удаан нээгддэг, хэрэглэгчийн дата их иддэг, R2 сан хурдан дүүрдэг.
# Харин аль хэдийн сайн шахагдсан бичлэгийг дахин шахвал ЗӨВХӨН чанар алддаг.
# Тиймээс эхлээд bitrate-ийг хэмжээд, зөвхөн хэт өндөр байвал дахин кодлоно.
$srcKbps = [int]([double]((Get-Item -LiteralPath $Video).Length) * 8 / $duration / 1000)
# Зорилтот bitrate дэлгэцийн хэмжээнээс: утасны босоо (~720p) бичлэгт 1400k хангалттай.
$targetK = if (($w * $h) -gt 1000000) { 2000 } else { 1400 }
# 1.3 дахин илүү байж байж шахна — 1600 kbps-ийг 1400 болгох нь ашиггүй чанарын алдагдал.
$needCompress = (-not $NoCompress) -and ($srcKbps -gt [int]($targetK * 1.3))
if ($needCompress) {
    Write-Host "Чанар: $srcKbps kbps — хэрэгцээнээс өндөр тул $targetK kbps болгож шахна (хэмжээ ~2 дахин багасна, чанар мэдэгдэхүйц буурахгүй)."
    Write-Host "  Ойролцоогоор $([math]::Ceiling($duration / 4 / 60)) минут үргэлжилнэ."
}
else {
    Write-Host "Чанар: $srcKbps kbps — аль хэдийн зохистой тул дахин кодлохгүй (хурдан хэрчинэ, чанар 100% хэвээр)."
}

# Ангиуд media\videos-д хадгалагдана (git-д ордоггүй локал нөөц) + R2 руу хуулагдана
$videosDir = Join-Path $root "media\videos"
$postersDir = Join-Path $root "public\posters"
$thumbsDir = Join-Path $root "public\thumbs"
New-Item -ItemType Directory -Force $videosDir | Out-Null
New-Item -ItemType Directory -Force $postersDir | Out-Null
New-Item -ItemType Directory -Force $thumbsDir | Out-Null

$isVertical = $h -gt $w
$episodes = @()

# Дахин кодлох үеийн стандарт тохиргоо: crf 24 = нүдэнд мэдэгдэхгүй алдагдал,
# maxrate = хамгийн хүнд хэсэгт ч тааз тавина (утсан дээр гацахгүй),
# +faststart = moov файлын эхэнд ороод шууд тоглож эхэлнэ.
$encode = @(
    "-c:v", "libx264", "-crf", "24", "-preset", "fast",
    "-maxrate", "${targetK}k", "-bufsize", "$($targetK * 2)k",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"
)

for ($i = 0; $i -lt $epCount; $i++) {
    $ss = $i * $EpisodeSeconds
    $outFile = Join-Path $videosDir "$($Id)_e$($i + 1).mp4"
    if ($Crop9x16 -and -not $isVertical) {
        # Зөвхөн хүсэлтээр: хэвтээ бичлэгийг голоос нь 9:16 болгож тайрна (дахин кодлоно)
        $cropW = [int]($h * 9 / 16); if ($cropW % 2 -ne 0) { $cropW-- }
        $cropX = [int](($w - $cropW) / 2)
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -vf "crop=${cropW}:${h}:${cropX}:0" @encode $outFile
    }
    elseif ($needCompress) {
        # Чанар хэрэгцээнээс өндөр байсан тул хэрчихийн зэрэгцээ шахна
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video @encode $outFile
    }
    else {
        # Хэлбэрийг хэвээр нь: кодлолгүй хурдан хэрчинэ (faststart = шууд тоглож эхэлнэ)
        & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video -c copy -movflags +faststart $outFile
        if ($LASTEXITCODE -ne 0) {
            # mkv/avi зэрэг mp4-д шууд ордоггүй формат бол дахин кодлоно
            Write-Host "  (формат тохирохгүй тул дахин кодолж байна…)"
            & $ff -v error -y -ss $ss -t $EpisodeSeconds -i $Video @encode $outFile
        }
    }
    if ($LASTEXITCODE -ne 0) { Write-Error "Анги $($i + 1) бэлтгэж чадсангүй"; exit 1 }
    # Ангийн бяцхан зураг (сайт дээр ангиудын сүлжээнд харагдана)
    & $ff -v error -y -ss 3 -i $outFile -frames:v 1 -vf "scale=280:-2" -q:v 4 `
        (Join-Path $thumbsDir "$($Id)_e$($i + 1).jpg")

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
$outSize = (Get-ChildItem $videosDir -Filter "$($Id)_e*.mp4" | Measure-Object Length -Sum).Sum
$srcSize = (Get-Item -LiteralPath $Video).Length
Write-Host ""
Write-Host ("Ангиудын нийт хэмжээ: {0:N0} MB (эх бичлэг {1:N0} MB)" -f ($outSize / 1MB), ($srcSize / 1MB))
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
