@echo off
rem One-time setup for Windows: installs Bun and ffmpeg if missing, prepares the app, makes the icon and starts it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
if errorlevel 1 echo. & echo Setup did not finish. Read the message above, fix it, and run setup.bat again.
pause
