@echo off
setlocal
cd /d "%~dp0"
title Jump in the Mix - Local Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 (
  echo.
  pause
)
endlocal
