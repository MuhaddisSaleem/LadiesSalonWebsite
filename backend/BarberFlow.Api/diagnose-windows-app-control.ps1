# Run in PowerShell from backend/BarberFlow.Api:
# powershell -ExecutionPolicy Bypass -File .\diagnose-windows-app-control.ps1
# Read-only diagnostics. Does not disable or change Windows protection.
$ErrorActionPreference = 'Continue'
$target = Join-Path $PSScriptRoot 'bin\Debug\net10.0\BarberFlow.Api.dll'
Write-Host '--- Build artifact ---'
Write-Host $target
if (Test-Path $target) {
  Get-Item $target | Select-Object FullName,Length,LastWriteTime | Format-List
  try { Get-FileHash $target -Algorithm SHA256 | Format-List } catch { Write-Warning $_ }
  try { Get-Item $target -Stream * | Select-Object Stream,Length | Format-Table } catch { Write-Warning $_ }
  try { Get-AuthenticodeSignature $target | Select-Object Status,StatusMessage,SignerCertificate | Format-List } catch { Write-Warning $_ }
} else { Write-Warning 'DLL not found; run dotnet build first.' }
Write-Host '--- Windows Code Integrity block events (last 60 minutes) ---'
try {
  Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-CodeIntegrity/Operational'
    StartTime = (Get-Date).AddHours(-1)
    Id = 3033,3077,3089
  } -ErrorAction Stop | Select-Object -First 30 TimeCreated,Id,Message | Format-List
} catch { Write-Warning "Event log unavailable or no matching events: $_" }
Write-Host '--- Active App Control policies (where supported) ---'
$ciTool = Join-Path $env:windir 'System32\CiTool.exe'
if (Test-Path $ciTool) { & $ciTool -lp } else { Write-Host 'CiTool.exe is not available on this Windows build.' }
Write-Host '--- Completed: share relevant policy and DLL block messages, not personal files. ---'
