$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
docker compose down
Write-Host "Jump in the Mix has stopped. Your local data is preserved."
