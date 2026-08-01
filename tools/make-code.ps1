# Цэнэглэлтийн код үүсгэгч.
# Хэрэглэгч данс руу шилжүүлснийг хараад энэ скриптээр код үүсгэж, Messenger-ээр илгээнэ.
#
# Хэрэглээ:
#   .\make-code.ps1 -Coins 100          # нэг код
#   .\make-code.ps1 -Coins 300 -Count 5 # 5 код
param(
    [Parameter(Mandatory = $true)][int]$Coins,
    [int]$Count = 1
)

# Нууц үгийг src/config.ts-ээс уншина (нэг л газар хадгалагдана)
$configPath = Join-Path $PSScriptRoot "..\src\config.ts"
$configText = Get-Content $configPath -Raw -Encoding UTF8
if ($configText -notmatch 'codeSecret:\s*"([^"]+)"') {
    Write-Error "src/config.ts дотроос codeSecret олдсонгүй"
    exit 1
}
$secret = $Matches[1]

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()
$rng = New-Object System.Random

for ($i = 0; $i -lt $Count; $i++) {
    $nonce = -join (1..4 | ForEach-Object { $chars[$rng.Next($chars.Length)] })
    $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$Coins`:$nonce"))
    $hex = -join ($hash | ForEach-Object { $_.ToString("x2") })
    $sig = $hex.Substring(0, 6).ToUpper()
    Write-Output "MD$Coins-$nonce-$sig"
}
