# Installs what Asset Prompter needs (Bun, ffmpeg), prepares the app, makes the icon and starts it.
# Run it through setup.bat. Safe to run again: it skips whatever is already there.
$ErrorActionPreference = 'Stop'
# This file lives in scripts/, next to the launcher and icon; the app itself is one level up.
$here = $PSScriptRoot
$app = Split-Path -Parent $here

function Step($text) { Write-Host "`n== $text" -ForegroundColor Yellow }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
# Installers change PATH for new windows only; read it again so this one sees them.
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $bunHome = Join-Path $env:USERPROFILE '.bun\bin'
  if (Test-Path $bunHome) { $env:Path = "$bunHome;$env:Path" }
}
function Winget-Install($id) {
  winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}

Refresh-Path

Step 'Bun (runs the app)'
if (Has bun) {
  Write-Host "Already installed: bun $(bun --version)"
} elseif (Has winget) {
  Winget-Install 'Oven-sh.Bun'
} else {
  powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm bun.sh/install.ps1 | iex'
  Refresh-Path
}
if (-not (Has bun)) { throw 'Bun could not be installed. Install it from https://bun.sh and run setup again.' }

Step 'ffmpeg (frame sheets and motion checks for videos)'
if (Has ffmpeg) {
  Write-Host 'Already installed.'
} elseif (Has winget) {
  Winget-Install 'Gyan.FFmpeg'
  if (-not (Has ffmpeg)) { Write-Host 'Installed; it becomes available after you sign out and back in, or restart.' }
} else {
  Write-Host 'winget is missing, so ffmpeg was skipped. The app works without it, but videos get no frame sheets.'
  Write-Host 'To add it later: https://www.gyan.dev/ffmpeg/builds/'
}

Step 'App packages'
Push-Location $app
try { bun install } finally { Pop-Location }

Step 'Icon on the Desktop and in the Start menu'
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Asset Prompter.lnk'))
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + (Join-Path $here 'start-hidden.vbs') + '"'
  $lnk.WorkingDirectory = $app
  $lnk.IconLocation = (Join-Path $here 'asset-prompter.ico') + ',0'
  $lnk.Description = 'Start Asset Prompter'
  $lnk.Save()
  Write-Host "Created $($lnk.FullName)"
}

Step 'Starting Asset Prompter'
Start-Process (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $here 'start-hidden.vbs') + '"')
Write-Host "`nAll set. From now on, start it with the Asset Prompter icon." -ForegroundColor Green
