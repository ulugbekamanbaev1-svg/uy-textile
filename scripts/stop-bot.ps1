$ErrorActionPreference = "Stop"

$processes = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match 'app\.bot\.bot' }

if (-not $processes) {
    Write-Host "Telegram bot is not running."
    exit 0
}

foreach ($process in $processes) {
    try {
        Stop-Process -Id $process.ProcessId -Force
        Write-Host "Stopped Telegram bot (PID $($process.ProcessId))."
    }
    catch {
        Write-Host "Could not stop bot process $($process.ProcessId)."
    }
}
