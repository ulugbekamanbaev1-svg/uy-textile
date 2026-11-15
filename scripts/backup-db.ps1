$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $root ".postgres\pgsql\bin"
$outDir = Join-Path $root "backups"
$data = Join-Path $root ".postgres\data"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$file = Join-Path $outDir ("uytextile_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".dump")

& (Join-Path $pgBin "pg_dump.exe") -h localhost -p 5432 -U uytextile_user -d uytextile -Fc -f $file

Write-Host "Backup created: $file"
Write-Host "Size: $((Get-Item $file).Length) bytes"
