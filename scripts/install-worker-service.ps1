param(
  [string]$ServiceName = "DesktopThermalPrinter",
  [string]$RepositoryPath = "C:\Services\DesktopThermalPrinter",
  [string]$EnvironmentFile = "C:\Services\DesktopThermalPrinter\config\worker.env"
)

$ErrorActionPreference = "Stop"

$nssm = (Get-Command nssm -ErrorAction Stop).Source
$node = (Get-Command node -ErrorAction Stop).Source
$entryPoint = Join-Path $RepositoryPath "apps\worker\dist\index.js"
$logDirectory = Join-Path $RepositoryPath "logs"
$stdoutLog = Join-Path $logDirectory "worker-out.log"
$stderrLog = Join-Path $logDirectory "worker-error.log"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  throw "Service '$ServiceName' already exists. This installer will not overwrite it."
}

if (-not (Test-Path $entryPoint)) {
  throw "Worker entry point not found at '$entryPoint'. Run npm ci and npm run build:worker first."
}

if (-not (Test-Path $EnvironmentFile)) {
  throw "Worker environment file not found at '$EnvironmentFile'."
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

& $nssm install $ServiceName $node | Out-Null
& $nssm set $ServiceName AppDirectory $RepositoryPath | Out-Null
& $nssm set $ServiceName AppParameters "--env-file=$EnvironmentFile apps\worker\dist\index.js" | Out-Null
& $nssm set $ServiceName AppStdout $stdoutLog | Out-Null
& $nssm set $ServiceName AppStderr $stderrLog | Out-Null
& $nssm set $ServiceName AppRotateFiles 1 | Out-Null
& $nssm set $ServiceName AppRotateOnline 1 | Out-Null
& $nssm set $ServiceName AppRotateBytes 10485760 | Out-Null
& $nssm set $ServiceName AppExit Default Restart | Out-Null
& $nssm set $ServiceName AppRestartDelay 5000 | Out-Null
& $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null

Start-Service -Name $ServiceName
Get-Service -Name $ServiceName
