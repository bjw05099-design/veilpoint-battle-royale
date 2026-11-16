@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0launch-latest-native.ps1"
if errorlevel 1 pause
