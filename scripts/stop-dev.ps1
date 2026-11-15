$ErrorActionPreference = "Stop"

foreach ($port in 8000, 5173, 5174) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

    foreach ($listener in $listeners) {
        $procId = $listener.OwningProcess

        try {
            $name = (Get-Process -Id $procId).ProcessName
            Stop-Process -Id $procId -Force
            Write-Host "Stopped $name on port $port (PID $procId)."
        }
        catch {
            Write-Host "Could not stop process $procId on port $port."
        }
    }
}

$botProcesses = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match 'app\.bot\.bot' }

foreach ($botProcess in $botProcesses) {
    try {
        Stop-Process -Id $botProcess.ProcessId -Force
        Write-Host "Stopped Telegram bot (PID $($botProcess.ProcessId))."
    }
    catch {
        Write-Host "Could not stop bot process $($botProcess.ProcessId)."
    }
}

Write-Host "Dev servers and bot stopped. PostgreSQL is still running; use scripts/stop-db.ps1 to stop it."
