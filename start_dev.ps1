$env:PATH = 'C:\Program Files\nodejs;' + [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')
$wd = 'C:\Users\venky\Desktop\ufs\New folder\ufs-newsletter'
Start-Process -FilePath 'cmd.exe' -WindowStyle Hidden -ArgumentList '/c','dashboard\run_dashboard_dev.cmd ^> dev.out 2^> dev.err' -WorkingDirectory $wd
Write-Output 'started'
