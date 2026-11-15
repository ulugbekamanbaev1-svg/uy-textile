$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".postgres\pgsql\bin"
$data = Join-Path $root ".postgres\data"
$log = Join-Path $root ".postgres\server.log"

if (-not (Test-Path (Join-Path $data "PG_VERSION"))) {
    throw "PostgreSQL data directory was not found. Run the initial setup first."
}

& (Join-Path $pgBin "pg_ctl.exe") -D $data status *> $null

if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL is already running on port 5432."
    exit 0
}

& (Join-Path $pgBin "pg_ctl.exe") -D $data -l $log -o "-p 5432" start

if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL failed to start. See $log"
}

Write-Host "PostgreSQL started on port 5432."
