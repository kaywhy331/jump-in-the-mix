param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fail([string]$Message) {
  Write-Host "`nError: $Message" -ForegroundColor Red
  exit 1
}

function New-HexSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Invoke-NativeQuiet {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )

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
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )

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

function Test-DockerEngine {
  return (Invoke-NativeQuiet -FilePath "docker" -Arguments @("info")) -eq 0
}

function Find-DockerDesktopExecutable {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe"),
    (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe"),
    (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Start-DockerEngine {
  Write-Host "`nDocker is installed, but its Linux engine is not running." -ForegroundColor Yellow
  Write-Host "Starting Docker Desktop automatically..."

  $desktopCliAvailable = (Invoke-NativeQuiet -FilePath "docker" -Arguments @("desktop", "version")) -eq 0
  if ($desktopCliAvailable) {
    $null = Invoke-NativeQuiet -FilePath "docker" -Arguments @("desktop", "start", "--detach")
  } else {
    $dockerDesktopPath = Find-DockerDesktopExecutable
    if ($dockerDesktopPath) {
      try {
        Start-Process -FilePath $dockerDesktopPath | Out-Null
      } catch {
        Write-Host "Docker Desktop could not be launched automatically." -ForegroundColor Yellow
      }
    }
  }

  Write-Host "Waiting for the Docker Linux engine" -NoNewline
  for ($i = 0; $i -lt 90; $i++) {
    if (Test-DockerEngine) {
      Write-Host ""
      Write-Host "Docker Desktop is ready." -ForegroundColor Green
      return $true
    }
    Start-Sleep -Seconds 2
    Write-Host "." -NoNewline
  }
  Write-Host ""
  return $false
}

function Show-DockerRecovery {
  Write-Host "`nDocker Desktop did not start its Linux engine." -ForegroundColor Red
  Write-Host "`nTry these steps:" -ForegroundColor Yellow
  Write-Host "  1. Open Docker Desktop from the Windows Start menu."
  Write-Host "  2. Wait until Docker Desktop says the engine is running."
  Write-Host "  3. In Docker Desktop, open Settings > General and enable"
  Write-Host "     'Use the WSL 2 based engine', then select Apply & restart."
  Write-Host "  4. Make sure Docker is using Linux containers, not Windows containers."
  Write-Host "  5. Run start-local.cmd again."
  Write-Host "`nIf Docker Desktop reports a WSL problem, open PowerShell as Administrator and run:"
  Write-Host "  wsl --update"
  Write-Host "  wsl --shutdown"
  Write-Host "`nRestart Windows if WSL or virtualization was just enabled."
  Write-Host "Run doctor.cmd from this folder for a focused diagnostic."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker is not installed. Install Docker Desktop for Windows, then run start-local.cmd again."
}

if (-not (Test-DockerEngine)) {
  if (-not (Start-DockerEngine)) {
    Show-DockerRecovery
    exit 1
  }
}

$dockerInfo = Invoke-NativeCapture -FilePath "docker" -Arguments @("info", "--format", "{{.OSType}}")
if ($dockerInfo.ExitCode -eq 0 -and $dockerInfo.Output -and $dockerInfo.Output.ToLowerInvariant() -ne "linux") {
  Write-Host "`nDocker is currently using Windows containers." -ForegroundColor Yellow
  Write-Host "Switching Docker Desktop to Linux containers..."
  $switchCode = Invoke-NativeQuiet -FilePath "docker" -Arguments @("desktop", "engine", "use", "linux")
  if ($switchCode -eq 0) {
    Write-Host "Waiting for the Linux engine" -NoNewline
    $linuxReady = $false
    for ($i = 0; $i -lt 90; $i++) {
      if (Test-DockerEngine) {
        $check = Invoke-NativeCapture -FilePath "docker" -Arguments @("info", "--format", "{{.OSType}}")
        if ($check.ExitCode -eq 0 -and $check.Output.ToLowerInvariant() -eq "linux") {
          $linuxReady = $true
          break
        }
      }
      Start-Sleep -Seconds 2
      Write-Host "." -NoNewline
    }
    Write-Host ""
    if (-not $linuxReady) {
      Fail "Docker could not switch to Linux containers. Use the Docker Desktop tray menu and select 'Switch to Linux containers', then run this launcher again."
    }
  } else {
    Fail "This app requires Linux containers. Use the Docker Desktop tray menu and select 'Switch to Linux containers', then run this launcher again."
  }
}

if ((Invoke-NativeQuiet -FilePath "docker" -Arguments @("compose", "version")) -ne 0) {
  Fail "Docker Compose is unavailable. Update Docker Desktop and try again."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  $key = New-HexSecret 32
  $dbPassword = New-HexSecret 12
  $content = Get-Content ".env" -Raw
  $content = $content.Replace("DATA_ENCRYPTION_KEY=GENERATE_ME", "DATA_ENCRYPTION_KEY=$key")
  $content = $content.Replace("POSTGRES_PASSWORD=jitm", "POSTGRES_PASSWORD=$dbPassword")
  $content = $content.Replace("postgresql://jitm:jitm@localhost", "postgresql://jitm:$dbPassword@localhost")
  Set-Content ".env" $content -NoNewline
  Write-Host "Created .env with secure local secrets." -ForegroundColor Green
}

$envContent = Get-Content ".env" -Raw
if ($envContent.Contains("DATA_ENCRYPTION_KEY=GENERATE_ME")) {
  $key = New-HexSecret 32
  $envContent = $envContent.Replace("DATA_ENCRYPTION_KEY=GENERATE_ME", "DATA_ENCRYPTION_KEY=$key")
  Set-Content ".env" $envContent -NoNewline
  Write-Host "Generated the missing local encryption key." -ForegroundColor Green
}

$appPort = 3000
Get-Content ".env" | ForEach-Object {
  if ($_ -match '^APP_PORT=(\d+)$') { $appPort = [int]$Matches[1] }
}

$needsBuild = $Rebuild.IsPresent
foreach ($image in @("jump-in-the-mix-tools:local", "jump-in-the-mix-web:local", "jump-in-the-mix-worker:local")) {
  if ((Invoke-NativeQuiet -FilePath "docker" -Arguments @("image", "inspect", $image)) -ne 0) {
    $needsBuild = $true
  }
}

if ($needsBuild) {
  Write-Host "`nInstalling and starting Jump in the Mix..." -ForegroundColor Magenta
  Write-Host "The first build downloads the required containers and may take several minutes."
  & docker compose up -d --build
} else {
  Write-Host "`nStarting Jump in the Mix..." -ForegroundColor Magenta
  Write-Host "The local images are already installed, so this start should be much faster."
  & docker compose up -d
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "`nCommon causes:" -ForegroundColor Yellow
  Write-Host "  - Docker Desktop is still starting"
  Write-Host "  - Port $appPort is already in use (change APP_PORT in .env)"
  Write-Host "  - Internet access was interrupted during the first build"
  & docker compose ps
  Fail "Docker Compose could not start the application. Run doctor.cmd for diagnostics."
}

Write-Host "`nWaiting for the application and database to become ready..." -ForegroundColor Magenta
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  if ((Invoke-NativeQuiet -FilePath "docker" -Arguments @("compose", "exec", "-T", "web", "curl", "-fsS", "http://localhost:3000/api/health/ready")) -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
  Write-Host -NoNewline "."
}
Write-Host ""

if (-not $ready) {
  & docker compose ps
  Write-Host "`nRecent web logs:" -ForegroundColor Yellow
  & docker compose logs --tail=80 web
  Fail "The app did not become ready. Run doctor.cmd for a focused diagnostic."
}

Write-Host "`nJump in the Mix is ready" -ForegroundColor Green
Write-Host "App:      http://localhost:$appPort"
Write-Host "Demo:     demo@jumpinthemix.local"
Write-Host "Password: JumpInTheMix123!"
Write-Host "`nStop:     stop-local.cmd"
Write-Host "Reset:    reset-local.cmd"
Write-Host "Doctor:   doctor.cmd"

Start-Process "http://localhost:$appPort/login?firstRun=1"
