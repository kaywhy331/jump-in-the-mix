@echo off
setlocal
cd /d "%~dp0"
title Jump in the Mix - Rebuild Local App
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" -Rebuild
if errorlevel 1 (
  echo.
  pause
)
endlocal
