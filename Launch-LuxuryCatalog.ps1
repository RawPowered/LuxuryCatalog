$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$preferredPort = 3000
$candidatePorts = 3000..3010

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-AppHealthy {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 600
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            return $true
        }
        return $false
    }
}

function Get-HealthyUrl {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        $url = "http://localhost:$port/"
        if (Test-AppHealthy -Url $url) {
            return $url
        }
    }
    return $null
}

Set-Location $projectRoot

Write-Host "============================================"
Write-Host "  LuxuryCatalog - One-Click Launcher"
Write-Host "============================================"
Write-Host ""

if (-not (Test-CommandExists "node")) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH."
    Write-Host "Install Node.js from: https://nodejs.org/"
    exit 1
}

if (-not (Test-CommandExists "npm")) {
    Write-Host "[ERROR] npm is not installed or not in PATH."
    exit 1
}

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "[SETUP] Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies."
        exit 1
    }
}

if (-not (Test-Path (Join-Path $projectRoot ".env.local"))) {
    Write-Host "[WARN] .env.local not found. Add GEMINI_API_KEY if required."
    Write-Host ""
}

Write-Host "[START] Launching development server..."
$cmdArgs = "/k", "cd /d `"$projectRoot`" && npm run dev"
$devProcess = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -PassThru

Write-Host "[WAIT] Waiting for app to respond (prefers http://localhost:$preferredPort/) ..."
$browserOpened = $false
$deadline = (Get-Date).AddSeconds(90)
$activeUrl = $null

while ((Get-Date) -lt $deadline) {
    $activeUrl = Get-HealthyUrl -Ports $candidatePorts
    if ($activeUrl) {
        Write-Host "[READY] App is running at $activeUrl"
        if (-not $browserOpened) {
            Start-Process $activeUrl
            $browserOpened = $true
            Write-Host "[OPEN] Browser launched: $activeUrl"
        }
        break
    }

    $remaining = [int]([Math]::Max(0, ($deadline - (Get-Date)).TotalSeconds))
    Write-Host "[WAIT] App not ready yet. Retrying... ($remaining sec left)"
    Start-Sleep -Seconds 2
}

if (-not $activeUrl) {
    Write-Host "[ERROR] App did not become healthy within timeout."
    Write-Host "[INFO] Dev server window may still be starting or failed to compile."
    exit 1
}

Write-Host ""
Write-Host "[MONITOR] Monitoring app health every 5 seconds."
Write-Host "[MONITOR] Close this launcher window to stop monitoring."
Write-Host ""

while ($true) {
    if ($devProcess.HasExited) {
        Write-Host "[DOWN] Dev server window was closed."
        exit 1
    }

    if (Test-AppHealthy -Url $activeUrl) {
        Write-Host "$(Get-Date -Format HH:mm:ss) [OK] App responding at $activeUrl"
    }
    else {
        Write-Host "$(Get-Date -Format HH:mm:ss) [WARN] App not responding at $activeUrl"
    }

    Start-Sleep -Seconds 5
}
