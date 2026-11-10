$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot 'outputs\desktop-app'))
$localBase = [IO.Path]::GetFullPath([Environment]::GetFolderPath('MyDocuments'))
$installRoot = [IO.Path]::GetFullPath((Join-Path $localBase 'QingyanStudy'))
if (-not $installRoot.StartsWith($localBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid installation folder' }
$appDirectory = Join-Path $installRoot 'app'
$runtimeDirectory = Join-Path $installRoot 'runtime'
$backupDirectory = Join-Path $installRoot 'backups'
if (-not (Test-Path -LiteralPath (Join-Path $packageDirectory 'server.mjs'))) { throw 'Build the local package first' }
New-Item -ItemType Directory -Path $appDirectory,$runtimeDirectory,$backupDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $packageDirectory | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $appDirectory -Recurse -Force }
$systemNode = (Get-Command node.exe -ErrorAction Stop).Source
$nodePath = Join-Path $runtimeDirectory 'node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { Copy-Item -LiteralPath $systemNode -Destination $nodePath }
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '清研考研复习.lnk'
$oldShortcut = Join-Path $desktop '清研考研复习.url'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcher = Join-Path $appDirectory 'launcher.mjs'
$nodeQuoted = $nodePath.Replace("'", "''")
$launcherQuoted = $launcher.Replace("'", "''")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShell
$shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"& '$nodeQuoted' '$launcherQuoted'`""
$shortcut.WorkingDirectory = $appDirectory
$shortcut.Description = '清研本地版：自动启动，免登录，无需联网'
$icon = Join-Path $installRoot 'qingyan.ico'
if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = $icon + ',0' }
$shortcut.WindowStyle = 7
$shortcut.Save()
$taskAction = New-ScheduledTaskAction -Execute $nodePath -Argument ('--disable-warning=ExperimentalWarning "' + (Join-Path $appDirectory 'service.mjs') + '"')
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName 'QingyanStudyLocal' -Action $taskAction -Principal $taskPrincipal -Trigger $taskTrigger -Settings $taskSettings -Description '清研本地复习服务，仅供本机使用，无需联网' -Force | Out-Null
'{"taskName":"QingyanStudyLocal"}' | Set-Content -LiteralPath (Join-Path $installRoot 'managed-service.json') -Encoding utf8
Start-ScheduledTask -TaskName 'QingyanStudyLocal'
if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'Shortcut was not saved' }
if (Test-Path -LiteralPath $oldShortcut) {
    $archive = Join-Path $backupDirectory ('旧云端入口-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.url')
    Copy-Item -LiteralPath $oldShortcut -Destination $archive
    # Replace the exact old URL shortcut only after the working local link exists.
    Remove-Item -LiteralPath $oldShortcut
}
[PSCustomObject]@{ Installed=$true; Shortcut=$shortcutPath; Program=$appDirectory; Data=(Join-Path $installRoot 'data'); Runtime=$nodePath } | ConvertTo-Json -Compress
