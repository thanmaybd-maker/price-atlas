@echo off
setlocal
title Price Atlas - history from the Internet Archive
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 24 or newer is required: https://nodejs.org & pause & exit /b 1)
echo Installing the exact locked dependencies...
call npx -y pnpm@11.19.0 install --frozen-lockfile
if errorlevel 1 (echo Install failed. Nothing was checked or saved. & pause & exit /b 1)
echo.
echo Step 1 of 2: validated dry run. Archived retailer pages are fetched from web.archive.org,
echo their capture time is proven, the price is parsed and the exact variant is matched.
echo Nothing is written to the database in this step.
call npx -y pnpm@11.19.0 backfill:wayback --product=amazon-b09xs7jwhh --sample=books,calculators,phones,cosmetics --per=3
if errorlevel 1 (echo The dry run stopped. See data\wayback\latest-report.json. Nothing was saved. & pause & exit /b 1)
echo.
echo The report above counts VALIDATED PRICE DAYS (accepted price days), not just archive index entries.
echo Review data\wayback\latest-report.json before saving.
set /p go=Save exactly these validated archive prices as history only? Type yes to continue: 
if /i not "%go%"=="yes" (echo Nothing was saved. & pause & exit /b 0)
call npx -y pnpm@11.19.0 backfill:wayback --apply
if errorlevel 1 (echo Saving failed. & pause & exit /b 1)
pause
