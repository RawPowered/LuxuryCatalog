@echo off
setlocal EnableExtensions
title LuxuryCatalog Launcher

cd /d "%~dp0"

echo ============================================
echo   LuxuryCatalog - One-Click Launcher
echo ============================================
echo.

if not exist "Launch-LuxuryCatalog.ps1" (
  echo [ERROR] Launch-LuxuryCatalog.ps1 is missing.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-LuxuryCatalog.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Launcher exited with an error.
)

echo.
echo [INFO] Launcher stopped.
pause
