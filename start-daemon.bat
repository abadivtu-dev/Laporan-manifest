@echo off
title LAPORAN-WA Daemon
echo ============================================
echo   LAPORAN-WA — 24/7 Daemon
echo ============================================
echo.
echo Auto-restart nyala. Tutup window ini = bot mati.
echo.

set "APP_DIR=%~dp0"
set "RESTART_COUNT=0"
set "MAX_WAIT=5"

:loop
echo [%date% %time%] Starting LAPORAN-WA...

cd /d "%APP_DIR%"
node src/index.js

set /a RESTART_COUNT+=1
echo.
echo [%date% %time%] App stopped. Restart #%RESTART_COUNT% in %MAX_WAIT% detik...
echo ============================================
echo.

timeout /t %MAX_WAIT% /nobreak >nul
goto loop
