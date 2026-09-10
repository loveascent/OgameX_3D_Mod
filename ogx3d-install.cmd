@echo off
REM OgameX 3D Mod - one-click install (Windows).
REM Run this from your OGameX folder by double-clicking it.
cd /d "%~dp0"
echo.
php ogx3d-install.php
if errorlevel 1 goto ende
php artisan migrate --force
php artisan ogx3d:doctor
:ende
echo.
pause
