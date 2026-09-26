# Шинэ кино нэмэгч: нэг видеог НЭГ БҮТЭН КИНО болгож (шаардлагатай бол шахаж), poster гаргаж,
# R2 руу хуулж, каталогт бүртгэнэ. 2026-09-17-оос ангиудад ХЭРЧИХГҮЙ — хэрэглэгч нэг
# тасралтгүй бичлэг үзнэ (дотроо HLS хэсгүүдээр дамжина, tools\to-hls.mjs хийнэ).
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
Write-Host "Видео: ${w}x${h}, $([math]::Round($duration / 60)) минут -> нэг бүтэн кино"
Write-Host "Үнэ: $Price₮ · Эхний $FreeMinutes минут үнэгүй"

# --- Автомат шахалт (нотолгоонд суурилсан: хэрэгтэй үед НЬ Л шахна) ---
#
# Заримдаа эх бичлэг хэрэгцээнээс хамаагүй өндөр чанартай ирдэг. Тэгвэл:
# утсан дээр удаан нээгддэг, хэрэглэгчийн дата их иддэг, R2 сан хурдан дүүрдэг.
# Харин аль хэдийн сайн шахагдсан бичлэгийг дахин шахвал ЗӨВХӨН чанар алддаг.
# Тиймээс эхлээд bitrate-ийг хэмжээд, зөвхөн хэт өндөр байвал дахин кодлоно.
$srcKbps = [int]([double]((Get-Item -LiteralPath $Video).Length) * 8 / $duration / 1000)

# Хэмжээний тааз: гар утсанд 720p хангалттай. 1080x1920 бичлэг сайтын бусад
# кинонуудаас 6 дахин хүнд болдог (нэг кино R2 сангийн талыг идсэн туршлага),
# хэрэглэгчийн дата ч их зарцуулагдана. Тиймээс богино талыг 720-д барина.
$maxShort = 720
$shortSide = [math]::Min($w, $h)
$downscale = (-not $NoCompress) -and ($shortSide -gt $maxShort)
$scaleFilter = if ($w -le $h) { "scale=${maxShort}:-2:flags=lanczos" } else { "scale=-2:${maxShort}:flags=lanczos" }

# Зорилтот bitrate: 720p босоо бичлэгт 1400k хангалттай.
$targetK = 1400
# 1.3 дахин илүү байж байж шахна — 1600 kbps-ийг 1400 болгох нь ашиггүй чанарын алдагдал.
$needCompress = (-not $NoCompress) -and (($srcKbps -gt [int]($targetK * 1.3)) -or $downscale)
if ($needCompress) {
    if ($downscale) {
        Write-Host "Хэмжээ: ${w}x${h} — утсанд шаардлагагүй том тул богино талыг $maxShort болгож буулгана."
    }
    Write-Host "Чанар: $srcKbps kbps — хэрэгцээнээс өндөр тул $targetK kbps болгож шахна (хэмжээ ~2 дахин багасна, чанар мэдэгдэхүйц буурахгүй)."
    # Хэмжсэн хурд: бодит хугацаанаас ~1.9 дахин хурдан (720x1280, preset fast).
    # Богино дээж дээр 4x гардаг ч бүтэн кинон дээр хөдөлгөөнтэй хэсгүүд удаашруулдаг.
    Write-Host "  Ойролцоогоор $([math]::Ceiling($duration / 1.9 / 60)) минут үргэлжилнэ."
}
else {
    Write-Host "Чанар: $srcKbps kbps — аль хэдийн зохистой тул дахин кодлохгүй (чанар 100% хэвээр)."
}

# Бүтэн кино media\full-д хадгалагдана (git-д ордоггүй локал эх хувь) + HLS болж R2 руу хуулагдана
$fullDir = Join-Path $root "media\full"
$postersDir = Join-Path $root "public\posters"
New-Item -ItemType Directory -Force $fullDir | Out-Null
New-Item -ItemType Directory -Force $postersDir | Out-Null

$isVertical = $h -gt $w
$full = Join-Path $fullDir "$Id.mp4"

# Дахин кодлох үеийн стандарт тохиргоо: crf 24 = нүдэнд мэдэгдэхгүй алдагдал,
# maxrate = хамгийн хүнд хэсэгт ч тааз тавина (утсан дээр гацахгүй).
# 4 секунд тутам түлхүүр кадр: HLS хэсгүүд жигд ~8 секунд болж, гүйлгэлт хурдан,
# мөн хожим өөр чанарын хувилбар нэмэхэд хэсгүүд нь яг давхцана.
$encode = @(
    "-c:v", "libx264", "-crf", "24", "-preset", "fast",
    "-maxrate", "${targetK}k", "-bufsize", "$($targetK * 2)k",
    "-force_key_frames", "expr:gte(t,n_forced*4)",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"
)

if ($Crop9x16 -and -not $isVertical) {
    # Зөвхөн хүсэлтээр: хэвтээ бичлэгийг голоос нь 9:16 болгож тайрна (дахин кодлоно)
    $cropW = [int]($h * 9 / 16); if ($cropW % 2 -ne 0) { $cropW-- }
    $cropX = [int](($w - $cropW) / 2)
    & $ff -v error -stats -y -i $Video -vf "crop=${cropW}:${h}:${cropX}:0" @encode $full
}
elseif ($needCompress) {
    if ($downscale) { & $ff -v error -stats -y -i $Video -vf $scaleFilter @encode $full }
    else { & $ff -v error -stats -y -i $Video @encode $full }
}
else {
    # Чанар зохистой: кодлолгүйгээр mp4 болгож хуулна
    & $ff -v error -y -i $Video -c copy -movflags +faststart $full
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  (формат тохирохгүй тул дахин кодолж байна…)"
        & $ff -v error -stats -y -i $Video @encode $full
    }
}
if ($LASTEXITCODE -ne 0) { Write-Error "Киног бэлтгэж чадсангүй"; exit 1 }

# Poster: киноны ~10%-ийн цэгээс (эхний секундүүд ихэвчлэн гарчиг, хоосон кадр байдаг).
# Таалагдахгүй бол админ хуудаснаас утсаараа солино.
$posterTime = [int][math]::Min(90, [math]::Max(3, $duration * 0.1))
$posterOut = Join-Path $postersDir "$Id.jpg"
if ($isVertical -or $Crop9x16) {
    & $ff -v error -y -ss $posterTime -i $full -frames:v 1 -vf "scale=540:-2" $posterOut
}
else {
    # Хэвтээ кино: босоо 9:13 хүрээг ДҮҮРГЭСЭН poster (голоос нь тайрна). Бүдэг дэвсгэр дээр
    # жижиг хэвтээ зураг тавих нь муухай харагддаг (эзний санал, 2026-09-26).
    # Хар зурвас (letterbox) байвал эхлээд тайрна — эс бөгөөс poster-т хар зураас үлдэнэ.
    $det = & $ff -hide_banner -ss ([math]::Max(0, $posterTime - 2)) -i $full -t 4 -vf "cropdetect=24:2:0" -f null - 2>&1 | Out-String
    $crops = [regex]::Matches($det, 'crop=(\d+:\d+:\d+:\d+)')
    $pre = if ($crops.Count -gt 0) { "crop=$($crops[$crops.Count - 1].Groups[1].Value)," } else { "" }
    & $ff -v error -y -ss $posterTime -i $full -frames:v 1 -vf `
        "${pre}scale=540:780:force_original_aspect_ratio=increase:flags=lanczos,crop=540:780,unsharp=5:5:0.5" `
        $posterOut
    Write-Host "Poster: голоос нь тайрсан. Нүүр нь тасарсан бол админ хуудаснаас утсаараа солино уу."
}

$outSize = (Get-Item -LiteralPath $full).Length
$srcSize = (Get-Item -LiteralPath $Video).Length
Write-Host ""
Write-Host ("Киноны хэмжээ: {0:N0} MB (эх бичлэг {1:N0} MB)" -f ($outSize / 1MB), ($srcSize / 1MB))

# Каталогт нэмэх. HLS алхам бүтэхгүй бол каталогийг БУЦААНА — хагас бүртгэгдсэн
# (тоглохгүй) кино сайтад гарах ёсгүй.
$catalogPath = Join-Path $root "src\data\catalog.json"
$catalogBackup = [System.IO.File]::ReadAllText($catalogPath)
$catalog = $catalogBackup | ConvertFrom-Json

$newSeries = [pscustomobject]@{
    id          = $Id
    title       = $Title
    tagline     = $Tagline
    genre       = $Genre
    poster      = "posters/$Id.jpg"
    price       = $Price
    freeMinutes = $FreeMinutes
    episodes    = @()
}
$catalog.series = @($catalog.series) + $newSeries
$json = $catalog | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($catalogPath, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "Киног дамжуулахад бэлтгэж, R2 сан руу хуулж байна (хэдэн минут)..."
Set-Location $root
node (Join-Path $root "tools\to-hls.mjs") from-file $Id $full
if ($LASTEXITCODE -ne 0) {
    [System.IO.File]::WriteAllText($catalogPath, $catalogBackup, (New-Object System.Text.UTF8Encoding $false))
    Write-Error "R2 руу хуулж чадсангүй — каталогийг буцаалаа. Сүлжээгээ шалгаад дахин оролдоно уу."
    exit 1
}

Write-Host ""
Write-Host "'$Title' ($([math]::Round($duration / 60)) минут, $Price₮, ID: $Id) каталогт нэмэгдлээ."
Write-Host "Сайтад гаргахын тулд: .\tools\deploy.ps1"
