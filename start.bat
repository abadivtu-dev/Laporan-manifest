@echo off
title LAPORAN-WA
echo ============================================
echo   LAPORAN-WA - Sistem Laporan Manifest Umroh
echo ============================================
echo.
echo [1] Mulai server + Web Config  (buka browser)
echo [2] Kirim laporan sekarang
echo [3] Preview laporan (dry-run)
echo [4] Lihat status
echo.
set /p choice="Pilih (1-4): "

if "%choice%"=="1" goto webconfig
if "%choice%"=="2" goto runnow
if "%choice%"=="3" goto preview
if "%choice%"=="4" goto status
goto end

:webconfig
echo.
echo Memulai server dan membuka web config...
start http://127.0.0.1:3456
node src/admin-cli.js
goto end

:runnow
echo.
echo Mengirim laporan...
node src/index.js --run-now
goto end

:preview
echo.
echo Preview laporan...
node src/cli.js preview
goto end

:status
echo.
node src/cli.js status
goto end

:end
pause
