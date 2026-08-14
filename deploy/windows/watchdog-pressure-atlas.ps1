[CmdletBinding()]
param(
    [string]$ConfigPath = "C:\ProgramData\OpenFrontIdle\config\runtime.json"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$taskPath = "\OpenFrontIdle\"
$failures = @{ Authority = 0; Gateway = 0 }

function Test-Endpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec 5 `
            -MaximumRedirection 0
        return $response.StatusCode -eq 200
    }
    catch { return $false }
}

function Restart-Component([string]$Name) {
    Stop-ScheduledTask -TaskPath $taskPath -TaskName $Name -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskPath $taskPath -TaskName $Name
}

function Publish-TunnelUrl($config) {
    $logPath = Join-Path $config.LogsPath "tunnel.log"
    if (-not (Test-Path -LiteralPath $logPath)) { return }
    $text = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
    $matches = [regex]::Matches(
        $text,
        "https://[a-z0-9-]+\.trycloudflare\.com",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if ($matches.Count -gt 0) {
        $latest = $matches[$matches.Count - 1].Value
        $urlPath = Join-Path $config.RunPath "public-url.txt"
        $current = if (Test-Path -LiteralPath $urlPath) {
            (Get-Content -LiteralPath $urlPath -Raw).Trim()
        }
        else { "" }
        if ($current -ne $latest) {
            [IO.File]::WriteAllText($urlPath, $latest + [Environment]::NewLine)
        }
    }

    if ((Get-Item -LiteralPath $logPath).Length -gt 20971520) {
        Stop-ScheduledTask -TaskPath $taskPath -TaskName Tunnel -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $archive = Join-Path $config.LogsPath (
            "tunnel-{0}.log" -f [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
        )
        Move-Item -LiteralPath $logPath -Destination $archive
        Start-ScheduledTask -TaskPath $taskPath -TaskName Tunnel
    }
    Get-ChildItem -LiteralPath $config.LogsPath -Filter "tunnel-*.log" -File |
        Where-Object { $_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-14) } |
        Remove-Item -Force
}

while ($true) {
    try {
        $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
        $authorityPort = if ($config.AuthorityPort) {
            [int]$config.AuthorityPort
        }
        else { 3000 }
        $gatewayPort = if ($config.GatewayPort) {
            [int]$config.GatewayPort
        }
        else { 3100 }
        $checks = @{
            Authority = Test-Endpoint "http://127.0.0.1:$authorityPort/api/idle/health"
            Gateway = Test-Endpoint "http://127.0.0.1:$gatewayPort/__preview/login"
        }
        foreach ($name in @("Authority", "Gateway")) {
            if ($checks[$name]) {
                $failures[$name] = 0
            }
            else {
                $failures[$name] += 1
                if ($failures[$name] -ge 2) {
                    Restart-Component $name
                    $failures[$name] = 0
                }
            }
        }

        $quickTunnelEnabled = if ($null -ne $config.QuickTunnelEnabled) {
            [bool]$config.QuickTunnelEnabled
        }
        else { $true }
        if ($quickTunnelEnabled) {
            $tunnel = Get-ScheduledTask -TaskPath $taskPath -TaskName Tunnel
            if ($tunnel.State -ne "Running") {
                Start-ScheduledTask -TaskPath $taskPath -TaskName Tunnel
            }
            Publish-TunnelUrl $config
        }
    }
    catch {
        # Task Scheduler restarts this watchdog if PowerShell itself exits. A
        # transient command failure should not take monitoring offline.
    }
    Start-Sleep -Seconds 10
}
