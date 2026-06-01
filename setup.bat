@echo off
REM ============================================================
REM Desktop Pet Live2D - One-click resource setup (Windows)
REM
REM Usage: double-click this file in the project root.
REM   It downloads all third-party assets that are NOT in git:
REM     - lib/                    (PixiJS / pixi-live2d-display / Cubism Core)
REM     - models/Hiyori/          (Hiyori Live2D sample model)
REM     - assets/tarot/images/    (78 Rider-Waite tarot cards)
REM ============================================================

setlocal

echo.
echo === Desktop Pet Live2D - Resource Setup ===
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 18+ first: https://nodejs.org/
    pause
    exit /b 1
)

cd /d "%~dp0"

REM Run the setup script
node scripts\setup-resources.js
if errorlevel 1 (
    echo.
    echo [WARN] Some resources failed to download. Run this file again to retry.
    pause
    exit /b 1
)

echo.
echo === All resources ready ===
echo Next: npm install ^&^& npm start
echo.
pause
