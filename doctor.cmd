@echo off
setlocal
cd /d "%~dp0"
title Jump in the Mix - Installation Doctor
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0doctor.ps1"
echo.
pause
endlocal
