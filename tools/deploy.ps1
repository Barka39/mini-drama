# Сайтыг шинэчилж GitHub Pages руу гаргана.
# Хэрэглээ: .\tools\deploy.ps1  (эсвэл -Message "юу өөрчилснөө бичих")
param(
    [string]$Message = "Сайт шинэчлэв"
)

# git нь энгийн мэдээллээ stderr-т бичдэг тул Stop горим ашиглахгүй —
# алдааг $LASTEXITCODE-оор шалгана
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "1/3 Build хийж байна..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build амжилтгүй — дээрх алдааг засна уу"; exit 1 }

Write-Host "2/3 Git commit..."
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "(өөрчлөлт байхгүй байж магадгүй)" }

Write-Host "3/3 GitHub руу илгээж байна..."
git push
if ($LASTEXITCODE -ne 0) { Write-Error "Push амжилтгүй"; exit 1 }

Write-Host ""
Write-Host "Болслоо! 1-2 минутын дараа сайт шинэчлэгдэнэ."
