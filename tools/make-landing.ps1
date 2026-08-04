# Кино бүрд зориулсан "зарын хуудас" үүсгэнэ (Facebook/Messenger-т зөв карт харагдуулах).
#
# Facebook линкийг уншихдаа хаягийн # (hash) хэсгийг ХАРДАГГҮЙ тул кино бүрд
# жинхэнэ тусдаа хуудас хэрэгтэй. Энэ скрипт catalog.json-оос уншаад:
#   public/k/<id>.html  — киноны нэр/үнэ/постертой, нээгдмэгц player руу шилжүүлнэ
#   public/og/<id>.jpg  — 1200x630 хуваалцах зураг (бүдгэрсэн дэвсгэр + постер)
# гаргана. deploy.ps1 build хийхээс өмнө автоматаар дуудна.
param(
    [string]$SiteUrl = "https://kinomandal.com"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

$ff = Join-Path $root "..\tale2film\tools\ffmpeg\ffmpeg.exe"
if (-not (Test-Path $ff)) { $ff = "ffmpeg" }

$catalog = [System.IO.File]::ReadAllText((Join-Path $root "src\data\catalog.json")) | ConvertFrom-Json

$kDir = Join-Path $root "public\k"
$ogDir = Join-Path $root "public\og"
New-Item -ItemType Directory -Force $kDir | Out-Null
New-Item -ItemType Directory -Force $ogDir | Out-Null

function Esc([string]$s) {
    if ($null -eq $s) { return "" }
    $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

foreach ($s in $catalog.series) {
    $id = $s.id

    # 1200x630 хуваалцах зураг: бүдгэрсэн өргөн дэвсгэр дээр босоо постер
    $posterPath = Join-Path $root "public\$($s.poster -replace '/', '\')"
    $ogPath = Join-Path $ogDir "$id.jpg"
    # Эх бичлэгийн шатсан хадмал ихэвчлэн доод талд байдаг тул урд талын
    # постерын доод 36%-ийг таслана (зарын карт цэвэрхэн харагдана)
    if (Test-Path $posterPath) {
        & $ff -v error -y -i $posterPath -filter_complex `
            "[0:v]scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630,boxblur=20:2[bg];[0:v]crop=iw:ih*0.64:0:0,scale=-2:630[fg];[bg][fg]overlay=(W-w)/2:0" `
            -frames:v 1 -q:v 3 $ogPath
    }

    $priceText = if ([int]$s.price -le 0) { "Үнэгүй" } else { "Бүтэн кино {0:N0}₮" -f [int]$s.price }
    $desc = "Эхний $([int]$s.freeMinutes) минут үнэгүй · $priceText · $($s.episodes.Count) анги · Утсандаа шууд үз"
    if ($s.tagline) { $desc = "$($s.tagline) — $desc" }

    $title = Esc $s.title
    $descE = Esc $desc

    $html = @"
<!doctype html>
<html lang="mn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$title — Кино Мандал</title>
    <meta name="description" content="$descE" />
    <meta property="og:type" content="video.other" />
    <meta property="og:site_name" content="Кино Мандал" />
    <meta property="og:title" content="$title — Кино Мандал" />
    <meta property="og:description" content="$descE" />
    <meta property="og:url" content="$SiteUrl/k/$id" />
    <meta property="og:image" content="$SiteUrl/og/$id.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="canonical" href="$SiteUrl/k/$id" />
    <style>
      body { margin:0; background:#0b0b12; color:#f4f4f8;
             font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
             display:flex; align-items:center; justify-content:center; height:100vh; }
      a { color:#ff2d6f; }
    </style>
    <script>
      // Зар дээр дарсан хүнийг шууд киноны хуудас руу оруулна.
      // ?src=fb гэх мэт тэмдэглэгээг дамжуулна — аль сувгаас ирснийг хэмжинэ.
      location.replace("../#/series/$id" + location.search);
    </script>
  </head>
  <body>
    <p>Ачаалж байна… <a href="../#/series/$id">$title</a></p>
  </body>
</html>
"@

    [System.IO.File]::WriteAllText((Join-Path $kDir "$id.html"), $html, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  зарын хуудас: /k/$id.html"
}

Write-Host "Зарын хуудсууд бэлэн ($($catalog.series.Count) кино)."
