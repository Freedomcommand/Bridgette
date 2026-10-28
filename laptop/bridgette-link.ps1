# Bridgette Link — lets Bridgette work on this computer.
# It does NOT open any door into this computer. It reaches OUT to Bridgette, asks if she
# has a job, does it, and sends the answer back. Every call carries the secret key in key.txt.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$site = 'https://bridgette.pages.dev'
$key  = (Get-Content (Join-Path $dir 'key.txt') -Raw).Trim()
$logFile = Join-Path $dir 'log.txt'

function Log($m) {
  try {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 2MB) { Remove-Item $logFile -Force }
    Add-Content -Path $logFile -Value ("{0}  {1}" -f (Get-Date -Format 's'), $m)
  } catch {}
}

function Expand-PathText([string]$p) {
  if (-not $p) { return $env:USERPROFILE }
  $p = [Environment]::ExpandEnvironmentVariables($p.Trim().Trim('"'))
  if ($p -eq '~') { return $env:USERPROFILE }
  if ($p.StartsWith('~\') -or $p.StartsWith('~/')) { $p = Join-Path $env:USERPROFILE $p.Substring(2) }
  if (-not [IO.Path]::IsPathRooted($p)) { $p = Join-Path $env:USERPROFILE $p }
  return $p
}

function Tail([string]$s, [int]$max) {
  if ($null -eq $s) { return '' }
  if ($s.Length -le $max) { return $s }
  return '...(earlier output cut)...' + "`n" + $s.Substring($s.Length - $max)
}

function Run-Command([string]$cmd, [int]$sec) {
  if ($sec -le 0 -or $sec -gt 230) { $sec = 120 }
  $script = '$ProgressPreference="SilentlyContinue"; & { ' + $cmd + " `n} *>&1 | Out-String -Width 220"
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $psi = New-Object Diagnostics.ProcessStartInfo 'powershell.exe'
  $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $enc"
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true; $psi.WorkingDirectory = $env:USERPROFILE
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($sec * 1000)) {
    try { $p.Kill() } catch {}
    return @{ timedOut = $true; note = "Stopped after $sec seconds."; output = (Tail $out.Result 18000) }
  }
  $p.WaitForExit()
  return @{ exitCode = $p.ExitCode; output = (Tail $out.Result.TrimEnd() 18000); errors = (Tail $err.Result.Trim() 4000) }
}

function Read-PathItem([string]$path) {
  $p = Expand-PathText $path
  if (-not (Test-Path -LiteralPath $p)) { return @{ error = "Not found: $p" } }
  $item = Get-Item -LiteralPath $p -Force
  if ($item.PSIsContainer) {
    $list = Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | Select-Object -First 300 | ForEach-Object {
      if ($_.PSIsContainer) { "[folder] $($_.Name)" } else { "{0}  ({1:N0} KB)  {2:yyyy-MM-dd}" -f $_.Name, [math]::Ceiling($_.Length / 1KB), $_.LastWriteTime }
    }
    return @{ folder = $p; items = @($list) }
  }
  if ($item.Length -gt 2MB) { return @{ file = $p; error = "File is too big to read here ($([math]::Round($item.Length / 1MB, 1)) MB)." } }
  return @{ file = $p; size = $item.Length; content = (Tail ([IO.File]::ReadAllText($p)) 60000) }
}

function Write-PathItem([string]$path, [string]$content, [bool]$append) {
  $p = Expand-PathText $path
  $parent = Split-Path -Parent $p
  if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  if ($append) { [IO.File]::AppendAllText($p, $content) } else { [IO.File]::WriteAllText($p, $content) }
  return @{ saved = $p; size = (Get-Item -LiteralPath $p).Length }
}

function Do-Job($job) {
  switch ($job.kind) {
    'run'   { return Run-Command ([string]$job.payload.command) ([int]$job.payload.timeout) }
    'read'  { return Read-PathItem ([string]$job.payload.path) }
    'write' { return Write-PathItem ([string]$job.payload.path) ([string]$job.payload.content) ([bool]$job.payload.append) }
    default { return @{ error = "Unknown job $($job.kind)" } }
  }
}

$headers = @{ 'x-laptop-key' = $key; 'content-type' = 'application/json' }
Log "Bridgette Link started on $env:COMPUTERNAME (check-in mode)"

while ($true) {
  try {
    $resp = Invoke-RestMethod -Method Post -Uri "$site/api/laptop/poll" -Headers $headers -Body '{}' -TimeoutSec 35
    if ($resp.job) {
      $job = $resp.job
      Log "JOB $($job.kind): $(($job.payload | ConvertTo-Json -Compress))"
      $result = $null
      try { $result = Do-Job $job } catch { $result = @{ error = "$_" } }
      $body = @{ id = $job.id; result = $result } | ConvertTo-Json -Depth 8 -Compress
      Invoke-RestMethod -Method Post -Uri "$site/api/laptop/result" -Headers $headers -Body $body -TimeoutSec 35 | Out-Null
    }
    # when there was no job the poll already waited ~20s, so loop straight back
  } catch {
    Log "Check-in problem (will retry): $($_.Exception.Message)"
    Start-Sleep -Seconds 10
  }
}
