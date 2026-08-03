# Сайтыг шинэчилж үндсэн хаяг (minidram.pages.dev) + нөөц (GitHub Pages) руу гаргана.
# Хэрэглээ: .\tools\deploy.ps1  (эсвэл -Message "юу өөрчилснөө бичих")
param(
    [string]$Message = "Сайт шинэчлэв"
)

# git нь энгийн мэдээллээ stderr-т бичдэг тул Stop горим ашиглахгүй —
# алдааг $LASTEXITCODE-оор шалгана
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

# Түлхүүрүүд .env-д (commit хийгддэггүй)
foreach ($line in Get-Content ".env" | Where-Object { $_ -match '^\w+=' }) {
    $k, $v = $line -split '=', 2
    Set-Item -Path "env:$k" -Value $v.Trim()
}

Write-Host "1/5 Зарын хуудсууд + build хийж байна..."
& (Join-Path $PSScriptRoot "make-landing.ps1")
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build амжилтгүй — дээрх алдааг засна уу"; exit 1 }

Write-Host "2/5 Кинонуудын үнийг сервертэй тааруулж байна..."
if ($env:SUPABASE_ACCESS_TOKEN -and $env:SUPABASE_PROJECT_REF) {
    $cat = [System.IO.File]::ReadAllText("src\data\catalog.json") | ConvertFrom-Json
    $rows = @($cat.series | ForEach-Object { "('$($_.id)', $([int]$_.price), $([double]$_.freeMinutes))" })
    $sql = "insert into public.md_series (id, price, free_minutes) values " + ($rows -join ", ") +
    " on conflict (id) do update set price = excluded.price, free_minutes = excluded.free_minutes;"
    $body = @{ query = $sql } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Method Post `
            -Uri "https://api.supabase.com/v1/projects/$($env:SUPABASE_PROJECT_REF)/database/query" `
            -Headers @{ Authorization = "Bearer $($env:SUPABASE_ACCESS_TOKEN)"; 'Content-Type' = 'application/json' } `
            -Body $body | Out-Null
        Write-Host "   Үнэ сервер дээр шинэчлэгдлээ"
    }
    catch {
        Write-Host ""
        Write-Error @"
Үнэ тааруулж чадсангүй: $($_.Exception.Message)

САЙТ ГАРГАСАНГҮЙ. Учир нь энэ алхам амжилтгүй болвол шинэ кино сайт дээр
харагдах ч ХУДАЛДАГДАХГҮЙ (сервер үнийг нь мэдэхгүй тул худалдан авалт алдаа өгнө).

Ихэнхдээ Supabase-ийн токен хүчингүй болсон байдаг:
supabase.com/dashboard/account/tokens -> шинэ токен -> .env доторх
SUPABASE_ACCESS_TOKEN-ийг солино.
"@
        exit 1
    }
}
else { Write-Error ".env дотор SUPABASE түлхүүр алга — сайт гаргасангүй (шинэ кино худалдагдахгүй байх эрсдэлтэй)"; exit 1 }

Write-Host "3/5 Git commit..."
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "(өөрчлөлт байхгүй байж магадгүй)" }

Write-Host "4/5 GitHub руу илгээж байна (нөөц хаяг)..."
git push
if ($LASTEXITCODE -ne 0) { Write-Error "Push амжилтгүй"; exit 1 }

Write-Host "5/5 minidram.pages.dev руу гаргаж байна (үндсэн хаяг)..."
if (-not $env:CLOUDFLARE_API_TOKEN) { Write-Error ".env дотор CLOUDFLARE_API_TOKEN алга"; exit 1 }
npx -y wrangler pages deploy docs --project-name=minidram --branch=main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { Write-Error "Cloudflare deploy амжилтгүй"; exit 1 }

Write-Host ""
Write-Host "Болслоо! Үндсэн хаяг: https://minidram.pages.dev (шууд шинэчлэгдсэн)"
Write-Host "Нөөц хаяг: https://barka39.github.io/mini-drama/ (1-2 минутын дараа)"
