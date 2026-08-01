# Desktop товчлуулаас дуудагддаг интерактив "Код үүсгэх" цонх
chcp 65001 | Out-Null
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

Write-Host ""
Write-Host "======================================="
Write-Host "   МИНИ ДРАМ — Цэнэглэлтийн код үүсгэх"
Write-Host "======================================="

while ($true) {
    Write-Host ""
    $coins = Read-Host "Хэдэн coin-ий код вэ? (жишээ: 100, 300, 500 / хоосон = гарах)"
    if (-not $coins) { break }
    if ($coins -notmatch "^\d+$") {
        Write-Host "Зөвхөн тоо оруулна уу." -ForegroundColor Red
        continue
    }

    $code = & (Join-Path $PSScriptRoot "make-code.ps1") -Coins ([int]$coins)
    Write-Host ""
    Write-Host "  КОД:  $code" -ForegroundColor Green
    try {
        Set-Clipboard -Value $code
        Write-Host "  (хуулагдсан — Messenger дээр Ctrl+V хийхэд л болно)"
    } catch {
        Write-Host "  (гараар хуулна уу)"
    }
}
