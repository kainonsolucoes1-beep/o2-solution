$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $PSScriptRoot
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

$debounce = $null
$action = {
    $global:changed = $true
}

Register-ObjectEvent $watcher Changed -Action $action | Out-Null
Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Deleted -Action $action | Out-Null
Register-ObjectEvent $watcher Renamed -Action $action | Out-Null

Write-Host "Monitorando mudancas... (Ctrl+C para parar)" -ForegroundColor Cyan

while ($true) {
    if ($global:changed) {
        Start-Sleep -Seconds 3  # debounce: aguarda estabilizar

        $status = git -C $PSScriptRoot status --porcelain 2>$null
        if ($status) {
            $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            git -C $PSScriptRoot add .
            git -C $PSScriptRoot commit -m $msg
            git -C $PSScriptRoot push origin main
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Push feito: $msg" -ForegroundColor Green
        }

        $global:changed = $false
    }
    Start-Sleep -Seconds 2
}
