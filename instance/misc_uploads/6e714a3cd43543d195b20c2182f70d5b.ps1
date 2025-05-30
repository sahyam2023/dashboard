# Comprehensive Firewall and Antivirus Auto-Configuration Script

# Function to get Firewall Status
function Get-FirewallStatus {
    $firewallStatus = @{}
    $profiles = @("Domain", "Private", "Public")
    
    foreach ($profile in $profiles) {
        $status = (Get-NetFirewallProfile -Name $profile).Enabled
        $firewallStatus[$profile] = $status
    }
    
    return $firewallStatus
}

# Function to get Antivirus Status
function Get-AntivirusStatus {
    $antivirusStatus = @{}
    
    try {
        $defenderStatus = Get-MpComputerStatus
        
        $antivirusStatus["Real-Time Protection"] = if ($defenderStatus.RealTimeProtectionEnabled) { "On" } else { "Off" }
        $antivirusStatus["Antivirus Definition Status"] = $defenderStatus.AntivirusSignatureAge
    }
    catch {
        $antivirusStatus["Status"] = "Unable to retrieve"
    }
    
    return $antivirusStatus
}

# Function to enable Firewall
function Enable-Firewall {
    $profiles = @("Domain", "Private", "Public")
    $enabledProfiles = @()
    $failedProfiles = @()

    foreach ($profile in $profiles) {
        try {
            Set-NetFirewallProfile -Profile $profile -Enabled True -ErrorAction Stop
            $enabledProfiles += $profile
            Write-Host "Enabled $profile firewall profile." -ForegroundColor Green
        }
        catch {
            $failedProfiles += $profile
            Write-Host "Failed to enable $profile firewall profile. Error: $_" -ForegroundColor Red
        }
    }

    return @{
        EnabledProfiles = $enabledProfiles
        FailedProfiles = $failedProfiles
    }
}

# Start execution time tracking
$startTime = Get-Date

# Check for admin rights
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    exit 1
}

# Store the current execution policy
$currentPolicy = Get-ExecutionPolicy

# Set the execution policy to Unrestricted temporarily
Set-ExecutionPolicy Unrestricted -Scope Process -Force

# Backup existing firewall rules
$backupPath = "C:\Program Files\Analytics\firewall_rules_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').xml"
try {
    Get-NetFirewallRule | Export-Clixml -Path $backupPath -ErrorAction Stop
    Write-Host "Backed up current firewall rules to $backupPath" -ForegroundColor Green
} catch {
    Write-Host "Failed to backup firewall rules. Error: $_" -ForegroundColor Red
}

# Function to add firewall rules for executables
function Add-FirewallRule {
    param (
        [string]$exePath
    )

    if (Test-Path $exePath) {
        $ruleName = "Allow " + [System.IO.Path]::GetFileNameWithoutExtension($exePath)

        # Check if the rule already exists
        if (-not (Get-NetFirewallApplicationFilter | Where-Object { $_.Program -eq $exePath })) {
            try {
                New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Program $exePath -Action Allow -Profile Private,Public -ErrorAction Stop
                Write-Host "Added firewall rule: $ruleName" -ForegroundColor Green
            } catch {
                Write-Host "Failed to add firewall rule for $exePath. Error: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Executable not found: $exePath" -ForegroundColor DarkYellow
    }
}

# Function to allow ports in the firewall
function Allow-FirewallPorts {
    param (
        [int[]]$ports
    )

    foreach ($port in $ports) {
        $ruleName = "Allow Port $port"

        # Check if the port is already in the firewall rules
        $existingRule = Get-NetFirewallRule | Where-Object { 
            $_.DisplayName -eq $ruleName -or 
            ($_.LocalPort -contains $port -and $_.Action -eq "Allow")
        }

        if (-not $existingRule) {
            try {
                New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $port -Protocol TCP -Action Allow -Profile Private,Public -ErrorAction Stop
                Write-Host "Allowed port $port in firewall." -ForegroundColor Green
            } catch {
                Write-Host "Failed to allow port $port in firewall. Error: $_" -ForegroundColor Red
            }
        } else {
            Write-Host "Port $port is already allowed in firewall rules." -ForegroundColor Yellow
        }
    }
}

# Define possible paths and exe combinations for the analytic server
$analyticServerPaths = @(
    "C:\Program Files\Analytics\analytic_server\analytic_server.exe",
    "C:\Program Files\Analytics\analytic_server1\analytic_server1.exe",
    "C:\Program Files\Analytics\analytic_server2\analytic_server2.exe",
    "C:\Program Files\Analytics\analytic_server1\analytic_server.exe",
    "C:\Program Files\Analytics\analytic_server2\analytic_server.exe",
    "C:\Program Files\Analytics\analytic_server1\analytic_server_1.exe",
    "C:\Program Files\Analytics\analytic_server2\analytic_server_1.exe"
)

# Define the other .exe paths that are static
$otherExePaths = @(
    "C:\Program Files\Analytics\nssm.exe",
    "C:\Program Files\Analytics\Client\WebApp.exe",
    "C:\Program Files\Analytics\i2v_player\streamer.exe",
    "C:\Program Files\Analytics\i2v_Player_Server\server\PlayerServer.exe",
    "C:\Program Files\Analytics\pgsql\bin\pg_ctl.exe"
)

# Combine all paths
$allExePaths = $analyticServerPaths + $otherExePaths

# Define the ports to allow
$portsToAllow = @(4777, 5001, 5000, 8080, 8890, 5003, 5002, 8081, 5005, 5004, 8082, 5020, 5018, 8093, 5008, 5007, 8083)

# Add firewall rules for all .exe paths
foreach ($exePath in $allExePaths) {
    Add-FirewallRule -exePath $exePath
}

# Allow the specified ports in the firewall
Allow-FirewallPorts -ports $portsToAllow

# Enable Windows Firewall for all profiles
$profiles = @("Domain", "Private", "Public")
foreach ($profile in $profiles) {
    try {
        Set-NetFirewallProfile -Profile $profile -Enabled True -ErrorAction Stop
        Write-Host "Windows Firewall enabled for $profile profile." -ForegroundColor Green
    } catch {
        Write-Host "Failed to enable Windows Firewall for $profile profile. Error: $_" -ForegroundColor Red
    }
}

# Function to enable Windows Defender
function Enable-WindowsDefender {
    $enabledProducts = @()
    $failedProducts = @()

    try {
        # Enable Windows Defender real-time protection
        Set-MpPreference -DisableRealtimeMonitoring $false
        
        # Verify if real-time protection is enabled
        $defenderStatus = Get-MpComputerStatus
        if (-not $defenderStatus.RealTimeProtectionEnabled) {
            Write-Host "Attempting to start Windows Defender service..."
            Start-Process "sc.exe" -ArgumentList "config WinDefend start= auto" -Verb RunAs -Wait
            Start-Process "sc.exe" -ArgumentList "start WinDefend" -Verb RunAs -Wait
        }

        # Double-check if Windows Defender is running
        $finalStatus = Get-MpComputerStatus
        if ($finalStatus.RealTimeProtectionEnabled) {
            Write-Host "Windows Defender Real-Time Protection successfully enabled." -ForegroundColor Green
            $enabledProducts += "Windows Defender"
        } else {
            Write-Host "Unable to fully enable Windows Defender Real-Time Protection." -ForegroundColor Red
            $failedProducts += "Windows Defender"
        }
    } catch {
        Write-Host "Failed to enable Windows Defender. Error: $($_.Exception.Message)" -ForegroundColor Red
        $failedProducts += "Windows Defender"
    }

    return @{
        EnabledProducts = $enabledProducts
        FailedProducts = $failedProducts
    }
}

# Main script execution
function Main {
    # Start execution time tracking
    $startTime = Get-Date

    # Check for admin rights
    if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
        Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
        exit 1
    }

    # System info summary
    Write-Host "System Information:" -ForegroundColor Cyan
    Write-Host "Computer Name: $env:COMPUTERNAME" -ForegroundColor Gray
    Write-Host "Username     : $env:USERNAME" -ForegroundColor Gray
    Write-Host "OS Version   : $((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').ProductName)" -ForegroundColor Gray
    $architecture = if ([Environment]::Is64BitOperatingSystem) { '64-bit' } else { '32-bit' }
    Write-Host "Architecture: $architecture" -ForegroundColor Gray
    Write-Host ""

    # Check Initial Firewall Status
    Write-Host "Initial Firewall Status:" -ForegroundColor Green
    $initialFirewallStatus = Get-FirewallStatus
    foreach ($profile in $initialFirewallStatus.Keys) {
        $status = $initialFirewallStatus[$profile]
        $color = if ($status -eq $true) { "Green" } else { "Red" }
        Write-Host "$profile Profile: " -NoNewline
        Write-Host "$status" -ForegroundColor $color
    }

    # Check Initial Antivirus Status
    Write-Host "`nInitial Antivirus Status:" -ForegroundColor Green
    $initialAntivirusStatus = Get-AntivirusStatus
    foreach ($key in $initialAntivirusStatus.Keys) {
        $status = $initialAntivirusStatus[$key]
        $color = if ($status -eq "On") { "Green" } elseif ($status -eq "Off" -or $status -eq "Disabled") { "Red" } else { "Yellow" }
        Write-Host "$key : " -NoNewline
        Write-Host "$status" -ForegroundColor $color
    }

    # Attempt to Enable Firewall
    Write-Host "`nConfiguring Firewall..." -ForegroundColor Cyan
    $firewallResult = Enable-Firewall

    # Attempt to Enable Windows Defender
    Write-Host "`nConfiguring Antivirus..." -ForegroundColor Cyan
    $antivirusResult = Enable-WindowsDefender

    # Check Final Firewall Status
    Write-Host "`nFinal Firewall Status:" -ForegroundColor Green
    $finalFirewallStatus = Get-FirewallStatus
    foreach ($profile in $finalFirewallStatus.Keys) {
        $status = $finalFirewallStatus[$profile]
        $color = if ($status -eq $true) { "Green" } else { "Red" }
        Write-Host "$profile Profile: " -NoNewline
        Write-Host "$status" -ForegroundColor $color
    }

    # Check Final Antivirus Status
    Write-Host "`nFinal Antivirus Status:" -ForegroundColor Green
    $finalAntivirusStatus = Get-AntivirusStatus
    foreach ($key in $finalAntivirusStatus.Keys) {
        $status = $finalAntivirusStatus[$key]
        $color = if ($status -eq "On") { "Green" } elseif ($status -eq "Off" -or $status -eq "Disabled") { "Red" } else { "Yellow" }
        Write-Host "$key : " -NoNewline
        Write-Host "$status" -ForegroundColor $color
    }

    # Report execution time
    $endTime = Get-Date
    $duration = $endTime - $startTime
    Write-Host "`nScript execution completed in $($duration.TotalSeconds) seconds." -ForegroundColor Cyan

    # Interactive Exit
    while ($true) {
        Write-Host "`nPress 'E' to exit, or 'R' to run the configuration again." -ForegroundColor Magenta
        $userChoice = Read-Host

        switch ($userChoice.ToUpper()) {
            "E" { 
                Write-Host "Exiting the script..." -ForegroundColor Yellow
                break
            }
            "R" { 
                Clear-Host
                Main 
            }
            default { 
                Write-Host "Invalid input. Please try again." -ForegroundColor Red
                continue
            }
        }

        break
    }
}

# Run the main function
Main

# Ensure script completely exits
exit 0