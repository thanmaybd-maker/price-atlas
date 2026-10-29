@echo off
title Price Atlas - history from the Internet Archive
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24 or newer is required: https://nodejs.org & pause & exit /b 1)
call npx -y pnpm@11.19.0 install
echo.
echo Step 1 of 2: checking how many days the Internet Archive holds (nothing is saved yet)...
call npx -y pnpm@11.19.0 backfill:wayback
echo.
set /p go=Save these archived prices to the database? Type yes to continue: 
if /i not "%go%"=="yes" (echo Nothing was saved. & pause & exit /b 0)
call npx -y pnpm@11.19.0 backfill:wayback --apply
pause
