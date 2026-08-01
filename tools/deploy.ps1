# Сайтыг шинэчилж үндсэн хаяг (minidram.pages.dev) + нөөц (GitHub Pages) руу гаргана.
# Хэрэглээ: .\tools\deploy.ps1  (эсвэл -Message "юу өөрчилснөө бичих")
param(
    [string]$Message = "Сайт шинэчлэв"
)

# git нь энгийн мэдээллээ stderr-т бичдэг тул Stop горим ашиглахгүй —
# алдааг $LASTEXITCODE-оор шалгана
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "1/4 Build хийж байна..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build амжилтгүй — дээрх алдааг засна уу"; exit 1 }

Write-Host "2/4 Git commit..."
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "(өөрчлөлт байхгүй байж магадгүй)" }

Write-Host "3/4 GitHub руу илгээж байна (нөөц хаяг)..."
git push
if ($LASTEXITCODE -ne 0) { Write-Error "Push амжилтгүй"; exit 1 }

Write-Host "4/4 minidram.pages.dev руу гаргаж байна (үндсэн хаяг)..."
# Түлхүүрүүд .env-д (commit хийгддэггүй)
foreach ($line in Get-Content ".env" | Where-Object { $_ -match '^\w+=' }) {
    $k, $v = $line -split '=', 2
    if ($k -in @('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID')) {
        Set-Item -Path "env:$k" -Value $v.Trim()
    }
}
if (-not $env:CLOUDFLARE_API_TOKEN) { Write-Error ".env дотор CLOUDFLARE_API_TOKEN алга"; exit 1 }
npx -y wrangler pages deploy docs --project-name=minidram --branch=main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { Write-Error "Cloudflare deploy амжилтгүй"; exit 1 }

Write-Host ""
Write-Host "Болслоо! Үндсэн хаяг: https://minidram.pages.dev (шууд шинэчлэгдсэн)"
Write-Host "Нөөц хаяг: https://barka39.github.io/mini-drama/ (1-2 минутын дараа)"
