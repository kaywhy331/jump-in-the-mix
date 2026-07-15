$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$answer = Read-Host "This permanently deletes the local database. Type RESET to continue"
if ($answer -ne "RESET") { Write-Host "Canceled."; exit 0 }
docker compose down -v --remove-orphans
Write-Host "Local data deleted. Rebuilding the guided demo now."
& "$PSScriptRoot\start-local.ps1"
