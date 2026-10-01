@echo off
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is not installed. Install it with:  winget install Oven-sh.Bun
  echo or see https://bun.sh, then open a new window and run this again.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 echo ffmpeg was not found: videos get no frame sheets or motion checks. Install it with:  winget install Gyan.FFmpeg
if not exist node_modules call bun install
bun start
pause
