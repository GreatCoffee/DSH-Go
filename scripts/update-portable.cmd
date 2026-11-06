@echo off
rem DSH-Go updater launcher: keeps the window open and records every run.
setlocal
cd /d "%~dp0"

if not exist "%~dp0DeepSeek Harness.exe" (
  echo [error] This folder is not a DSH-Go installation.
  pause
  exit /b 1
)

echo DSH-Go updater
echo Close DSH-Go completely before updating.
echo Log file: %~dp0update-last.log
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-DSH-Go.ps1" -NoPause %*
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo [done] Update finished.
) else (
  echo [failed] Exit code %RESULT%. See update-last.log for details.
)
echo.
pause
exit /b %RESULT%
