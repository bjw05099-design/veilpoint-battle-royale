@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0launch-latest-native.ps1" -PackageRoot "%~dp0."
if errorlevel 1 pause
