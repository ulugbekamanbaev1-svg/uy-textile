$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".postgres\pgsql\bin"
$data = Join-Path $root ".postgres\data"

& (Join-Path $pgBin "pg_ctl.exe") -D $data stop

if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL failed to stop."
}

Write-Host "PostgreSQL stopped."
