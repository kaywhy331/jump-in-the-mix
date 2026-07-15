@echo off
setlocal
cd /d "%~dp0"
title Jump in the Mix - Reset Local Demo
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-local.ps1"
if errorlevel 1 pause
endlocal
