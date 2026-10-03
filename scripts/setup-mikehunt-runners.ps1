# Setup Windows Services for MikeHunt GitHub Actions Runners 1 through 6
1..6 | ForEach-Object {
    $i = $_
    $svcName = "actions.runner.Lead-Agent-69-MikeHunt.mikehunt-runner-$i"
    $dispName = "GitHub Actions Runner (Lead-Agent-69-MikeHunt.mikehunt-runner-$i)"
    $dir = "C:\actions-runner\mikehunt-$i"
    $binPath = "$dir\bin\RunnerService.exe"

    Write-Host "`n=== Setting up MikeHunt Runner $i ($svcName) ===" -ForegroundColor Cyan

    # 1. Write .service file
    $svcName | Out-File -FilePath "$dir\.service" -Encoding ascii -NoNewline -Force
    Write-Host "1. Created $dir\.service"

    # 2. Grant permissions to Network Service
    icacls $dir /grant "NT AUTHORITY\NETWORK SERVICE:(OI)(CI)F" /T /Q | Out-Null
    Write-Host "2. Granted permissions to NETWORK SERVICE"

    # 3. Create service if not exists
    $existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if (-not $existing) {
        & sc.exe create $svcName binPath= "$binPath" start= auto DisplayName= "$dispName" obj= "NT AUTHORITY\NETWORK SERVICE"
        & sc.exe failure $svcName reset= 86400 actions= restart/5000/restart/5000/restart/5000
        & sc.exe config $svcName start= delayed-auto
        Write-Host "3. Service $svcName created"
    } else {
        Write-Host "3. Service $svcName already exists"
    }

    # 4. Start service
    Write-Host "4. Starting service..."
    Start-Service -Name $svcName -ErrorAction Continue
}

Write-Host "`n=== MikeHunt Runner Services Status ===" -ForegroundColor Green
Get-Service -Name "actions.runner.Lead-Agent-69-MikeHunt*" | Select-Object Name, Status, StartType | Format-Table -AutoSize
