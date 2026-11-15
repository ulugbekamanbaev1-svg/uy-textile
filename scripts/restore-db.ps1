$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".postgres\pgsql\bin"
$data = Join-Path $root ".postgres\data"
$log = Join-Path $root ".postgres\server.log"
$outDir = Join-Path $root "backups"

$dump = Get-ChildItem -Path $outDir -Filter "uytextile_*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $dump) {
    throw "Backup file not found in backups/"
}

$target = Join-Path $data "backup.dump"

& (Join-Path $pgBin "pg_ctl.exe") -D $data status *> $null

if ($LASTEXITCODE -eq 0) {
    & (Join-Path $pgBin "pg_ctl.exe") -D $data stop -m fast
}

& (Join-Path $pgBin "pg_restore.exe") -h localhost -p 5432 -U uytextile_user -d uytextile -c -f $target $dump.FullName

& (Join-Path $pgBin "pg_ctl.exe") -D $data -l $log -o "-p 5432" start

Write-Host "Backup $($dump.Name) restored into the local database."
