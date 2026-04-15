$wd = 'C:\Users\venky\Desktop\ufs\New folder\ufs-newsletter'
$stdout = Join-Path $wd 'dev.out'
$stderr = Join-Path $wd 'dev.err'
if (Test-Path $stdout) { Remove-Item $stdout -Force }
if (Test-Path $stderr) { Remove-Item $stderr -Force }
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'C:\Program Files\nodejs\npm.cmd'
$psi.Arguments = '--prefix dashboard run dev'
$psi.WorkingDirectory = $wd
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.Environment['PATH'] = 'C:\Program Files\nodejs;' + [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')
$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
$null = $p.Start()
[System.IO.File]::WriteAllText($stdout, $p.StandardOutput.ReadToEnd())
[System.IO.File]::WriteAllText($stderr, $p.StandardError.ReadToEnd())
