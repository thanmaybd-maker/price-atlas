@echo off
title Price Atlas
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24 or newer is required: https://nodejs.org & pause & exit /b 1)
echo Installing dependencies (first run takes a few minutes)...
call npx -y pnpm@11.19.0 install
if errorlevel 1 (echo Install failed. & pause & exit /b 1)
rem a stale dev cache breaks Turbopack junctions on Windows, so start clean
if exist ".next\dev" rmdir /s /q ".next\dev"
echo Starting Price Atlas on http://127.0.0.1:3000 ...
call npx -y pnpm@11.19.0 dev
pause
