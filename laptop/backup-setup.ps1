# Bridgette Backup — copies everything in C:\Bridgette to a safe backup folder every day.
# The backup goes into OneDrive (so it is also saved in the cloud) when OneDrive is on this PC.
# It only ADDS and UPDATES files in the backup — it never deletes anything from the backup.
# Run with:  irm https://bridgette.pages.dev/laptop/backup-setup.ps1 | iex

$src = 'C:\Bridgette'
if ($env:OneDrive -and (Test-Path $env:OneDrive)) { $dst = Join-Path $env:OneDrive 'Bridgette Backup' } else { $dst = 'C:\BridgetteBackup' }
New-Item -ItemType Directory -Force -Path $src | Out-Null
New-Item -ItemType Directory -Force -Path $dst | Out-Null

# The backup job itself
$jobFolder = Join-Path $env:USERPROFILE 'BridgetteLink'
New-Item -ItemType Directory -Force -Path $jobFolder | Out-Null
$job = Join-Path $jobFolder 'backup.ps1'
@"
`$log = Join-Path '$dst' 'last-backup.txt'
robocopy '$src' '$dst' /E /XO /R:1 /W:1 /NP /NFL /NDL /XF last-backup.txt | Out-Null
"Last backup: `$(Get-Date)  (from $src)" | Set-Content `$log
"@ | Set-Content -Path $job -Encoding UTF8

# Run it every day at 8:47 PM, and as soon as the PC is on if it was off at that time
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$job`""
$trigger = New-ScheduledTaskTrigger -Daily -At '8:47PM'
$set     = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'Bridgette Backup' -Action $action -Trigger $trigger -Settings $set -Description 'Daily backup of C:\Bridgette' -Force | Out-Null

# First backup right now
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $job
Write-Host ''
Write-Host 'Bridgette Backup is set up.' -ForegroundColor Green
Write-Host "Backing up:  $src"
Write-Host "Saved to:    $dst"
Write-Host 'Runs every day at 8:47 PM (or as soon as the PC is on).'
Get-Content (Join-Path $dst 'last-backup.txt')
