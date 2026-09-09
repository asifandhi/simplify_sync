param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("check", "enable", "disable")]
    [string]$Action
)

function Check-Status {
    $tcp = Get-NetFirewallRule -DisplayName "SimplifySync TCP" -ErrorAction SilentlyContinue
    $udp = Get-NetFirewallRule -DisplayName "SimplifySync UDP" -ErrorAction SilentlyContinue
    $rulesActive = ($null -ne $tcp) -and ($tcp.Enabled -eq "True" -or $tcp.Enabled -eq 1 -or $tcp.Enabled -eq $true) -and ($null -ne $udp)

    $net = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -eq 'Internet' -or $_.InterfaceAlias -match 'Wi-Fi' -or $_.InterfaceAlias -match 'Ethernet' } | Select-Object -First 1
    $profile = if ($net) { $net.NetworkCategory.ToString() } else { "Unknown" }
    $netName = if ($net) { $net.Name } else { "Unknown" }

    [PSCustomObject]@{
        success = $true
        rulesActive = [bool]$rulesActive
        networkProfile = $profile
        networkName = $netName
        isPublic = ($profile -eq "Public")
    } | ConvertTo-Json -Compress
}

function Enable-Rules {
    # Check if already elevated
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        # Trigger UAC elevation
        $cmd = "New-NetFirewallRule -DisplayName 'SimplifySync TCP' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop; New-NetFirewallRule -DisplayName 'SimplifySync UDP' -Direction Inbound -LocalPort 41234 -Protocol UDP -Action Allow -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop"
        try {
            $proc = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -Command `"$cmd`""
            if ($proc.ExitCode -ne 0) {
                Write-Output '{"success":false,"error":"Administrator elevation was not completed or failed."}'
                exit 1
            }
        } catch {
            Write-Output '{"success":false,"error":"Administrator elevation was cancelled or denied by user."}'
            exit 1
        }
    } else {
        New-NetFirewallRule -DisplayName 'SimplifySync TCP' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
        New-NetFirewallRule -DisplayName 'SimplifySync UDP' -Direction Inbound -LocalPort 41234 -Protocol UDP -Action Allow -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
    }
    Check-Status
}

function Disable-Rules {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        $cmd = "Remove-NetFirewallRule -DisplayName 'SimplifySync TCP' -ErrorAction SilentlyContinue; Remove-NetFirewallRule -DisplayName 'SimplifySync UDP' -ErrorAction SilentlyContinue"
        try {
            $proc = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -Command `"$cmd`""
            if ($proc.ExitCode -ne 0) {
                Write-Output '{"success":false,"error":"Administrator elevation was not completed or failed."}'
                exit 1
            }
        } catch {
            Write-Output '{"success":false,"error":"Administrator elevation was cancelled or denied by user."}'
            exit 1
        }
    } else {
        Remove-NetFirewallRule -DisplayName 'SimplifySync TCP' -ErrorAction SilentlyContinue
        Remove-NetFirewallRule -DisplayName 'SimplifySync UDP' -ErrorAction SilentlyContinue
    }
    Check-Status
}

switch ($Action) {
    "check"   { Check-Status }
    "enable"  { Enable-Rules }
    "disable" { Disable-Rules }
}
