# Bridgette Link setup. Run in PowerShell:  irm https://bridgette.pages.dev/laptop/setup.ps1 | iex
# No door is opened into this computer. The helper reaches OUT to Bridgette and asks for work.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$site = 'https://bridgette.pages.dev'
$dir  = Join-Path $env:USERPROFILE 'BridgetteLink'

function Say($m, $c = 'Cyan') { Write-Host ''; Write-Host $m -ForegroundColor $c }

Say 'Setting up Bridgette Link on this computer...'
New-Item -ItemType Directory -Path $dir -Force | Out-Null

# 1. Get the helper
Invoke-WebRequest -UseBasicParsing "$site/laptop/bridgette-link.ps1" -OutFile (Join-Path $dir 'bridgette-link.ps1')

# 2. Secret key (kept if it already exists) — used on every check-in with Bridgette
$keyFile = Join-Path $dir 'key.txt'
if (-not (Test-Path $keyFile)) {
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $b = New-Object byte[] 40; $rng.GetBytes($b)
  (-join ($b | ForEach-Object { $chars[$_ % $chars.Length] })) | Set-Content $keyFile -NoNewline
}
$key = (Get-Content $keyFile -Raw).Trim()

# 3. Laptop code — Freedom types this once on each device in Bridgette (the Laptop button). Kept if it exists.
$codeFile = Join-Path $dir 'code.txt'
if (-not (Test-Path $codeFile)) {
  $cc = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $rng2 = [Security.Cryptography.RandomNumberGenerator]::Create(); $b2 = New-Object byte[] 12; $rng2.GetBytes($b2)
  $raw = -join ($b2 | ForEach-Object { $cc[$_ % $cc.Length] })
  ($raw.Substring(0,4) + '-' + $raw.Substring(4,4) + '-' + $raw.Substring(8,4)) | Set-Content $codeFile -NoNewline
}
$code = (Get-Content $codeFile -Raw).Trim()

# 4. Start with Windows (hidden)
$linkArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dir\bridgette-link.ps1`""
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Bridgette Link.lnk'))
$lnk.TargetPath = 'powershell.exe'; $lnk.Arguments = $linkArgs; $lnk.WindowStyle = 7; $lnk.Save()

# 5. Restart it now
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*bridgette-link.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process powershell.exe -ArgumentList $linkArgs -WindowStyle Hidden

# 6. Tell Bridgette this computer is hers to use
try {
  $body = @{ key = $key; code = $code; computer = $env:COMPUTERNAME } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$site/api/laptop/register" -ContentType 'application/json' -Body $body
  if ($r.ok) {
    Say "DONE. Bridgette is linked to $env:COMPUTERNAME." 'Green'
    Say 'YOUR LAPTOP CODE (write it down, then type it into Bridgette with the Laptop button):' 'Yellow'
    Write-Host ''
    Write-Host "      $code" -ForegroundColor Black -BackgroundColor Yellow
    Write-Host ''
    Write-Host "(It is also saved in $codeFile)"
  }
  else { Say "Bridgette answered: $($r.error)" 'Red' }
} catch {
  Say "Could not finish linking: $($_.Exception.Message)" 'Red'
}
