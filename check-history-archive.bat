@echo off
setlocal
title Price Atlas - archive check (dry run only)
cd /d "%~dp0"
if not exist "data\wayback" mkdir "data\wayback"
where node >nul 2>nul || (echo Node.js 24 or newer is required. > "data\wayback\check-console.txt" & exit /b 1)
call npx -y pnpm@11.19.0 install --frozen-lockfile > "data\wayback\check-install.txt" 2>&1
if errorlevel 1 (echo Install failed; see data\wayback\check-install.txt > "data\wayback\check-console.txt" & exit /b 1)
rem Dry run only: reachability, the Sony listing, then a small category sample. Never writes to the database.
call npx -y pnpm@11.19.0 backfill:wayback --product=amazon-b09xs7jwhh --sample=books,calculators,phones,cosmetics --per=3 > "data\wayback\check-console.txt" 2>&1
echo exit %errorlevel% >> "data\wayback\check-console.txt"
