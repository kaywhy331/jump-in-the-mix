$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$failed = $false

function OK($message)   { Write-Host "[OK]   $message" -ForegroundColor Green }
function Info($message) { Write-Host "[INFO] $message" -ForegroundColor Cyan }
function Warn($message) { Write-Host "[WARN] $message" -ForegroundColor Yellow }
function Fail($message) { Write-Host "[FAIL] $message" -ForegroundColor Red; $script:failed = $true }

function Invoke-NativeQuiet {
  param([string]$FilePath, [string[]]$Arguments = @())
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "SilentlyContinue"
    & $FilePath @Arguments 1>$null 2>$null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Invoke-NativeCapture {
  param([string]$FilePath, [string[]]$Arguments = @())
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "SilentlyContinue"
    $output = & $FilePath @Arguments 2>$null
    $exitCode = $LASTEXITCODE
    return [PSCustomObject]@{
      ExitCode = $exitCode
      Output = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
    }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

Write-Host "`nJump in the Mix diagnostic" -ForegroundColor Magenta
Write-Host "=========================="

if (Get-Command docker -ErrorAction SilentlyContinue) {
  OK "Docker command found"
} else {
  Fail "Docker is not installed. Install Docker Desktop for Windows."
}

if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  OK "WSL command found"
  $wslStatus = Invoke-NativeCapture -FilePath "wsl.exe" -Arguments @("--status")
  if ($wslStatus.ExitCode -eq 0) {
    OK "WSL responds successfully"
  } else {
    Warn "WSL is installed but did not respond successfully"
  }
} else {
  Warn "WSL is not available. Docker Desktop's recommended Windows backend uses WSL 2."
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  $desktopStatus = Invoke-NativeCapture -FilePath "docker" -Arguments @("desktop", "status", "--format", "json")
  if ($desktopStatus.ExitCode -eq 0) {
    Info "Docker Desktop status: $($desktopStatus.Output)"
  }

  if ((Invoke-NativeQuiet -FilePath "docker" -Arguments @("info")) -eq 0) {
    OK "Docker engine is running"
    $dockerType = Invoke-NativeCapture -FilePath "docker" -Arguments @("info", "--format", "{{.OSType}}")
    if ($dockerType.ExitCode -eq 0 -and $dockerType.Output.ToLowerInvariant() -eq "linux") {
      OK "Docker is using Linux containers"
    } else {
      Fail "Docker is not using Linux containers"
    }
  } else {
    Fail "Docker Desktop's Linux engine is not running"
    Write-Host "       Open Docker Desktop and wait for the engine to start." -ForegroundColor Yellow
    Write-Host "       If it reports a WSL issue, run 'wsl --update' and 'wsl --shutdown', then restart Docker Desktop." -ForegroundColor Yellow
  }
}

if (-not $failed -and (Invoke-NativeQuiet -FilePath "docker" -Arguments @("compose", "version")) -eq 0) {
  OK "Docker Compose is available"
} elseif (-not $failed) {
  Fail "Docker Compose is unavailable"
}

if (Test-Path ".env") {
  OK ".env exists"
  $content = Get-Content ".env" -Raw
  if ($content.Contains("DATA_ENCRYPTION_KEY=GENERATE_ME")) {
    Fail "DATA_ENCRYPTION_KEY still contains the placeholder"
  } else {
    OK "Local encryption key is configured"
  }
} else {
  Info ".env is missing; start-local.cmd will create it automatically"
}

if (-not $failed) {
  if ((Invoke-NativeQuiet -FilePath "docker" -Arguments @("compose", "config", "-q")) -eq 0) {
    OK "Docker Compose configuration is valid"
  } else {
    Fail "Docker Compose configuration is invalid"
  }
}

$appPort = 3000
if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^APP_PORT=(\d+)$') { $appPort = [int]$Matches[1] }
  }
}

if (-not $failed) {
  Write-Host "`nService status`n--------------"
  & docker compose ps 2>$null
}

Write-Host "`nHealth check`n------------"
try {
  $response = Invoke-WebRequest "http://localhost:$appPort/api/health/ready" -UseBasicParsing -TimeoutSec 3
  if ($response.StatusCode -eq 200) {
    OK "Application and database are ready at http://localhost:$appPort"
  }
} catch {
  Info "Application is not ready at http://localhost:$appPort"
  Info "Start it with start-local.cmd"
  Info "Detailed logs: docker compose logs --tail=100 setup web worker postgres"
}

if ($failed) {
  Write-Host "`nResolve the failed item(s), then run this diagnostic again." -ForegroundColor Yellow
  exit 1
}

Write-Host "`nNo blocking installation problems were detected." -ForegroundColor Green
