@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\setup-game-dev.ps1" -Install
if errorlevel 1 echo Setup did not finish. Keep the error text and resume after correcting it.
pause
