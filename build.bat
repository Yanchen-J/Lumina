@echo off
REM ============================================================
REM Desktop Pet Live2D - Release packaging
REM
REM Verifies all required resources exist BEFORE building,
REM then packs into win-unpacked/ + portable zip.
REM
REM Required resources (run `npm run setup` first if missing):
REM   lib/                       4 third-party JS files
REM   models/Hiyori/              full Hiyori model
REM   assets/tarot/cards.json    metadata
REM   assets/tarot/images/        78 tarot card images
REM
REM Optional bundled resources (included if present):
REM   models/<other>/             extra characters (e.g. Umaru)
REM ============================================================

setlocal enableextensions enabledelayedexpansion

cd /d "%~dp0"

echo.
echo === Desktop Pet Live2D - Release Build ===
echo.

REM ----- Step 0: Verify required resources -----
echo [0/3] Verifying resources...
set MISSING=0

call :checkFile "lib\pixi.min.js" 400000
call :checkFile "lib\index.min.js" 100000
call :checkFile "lib\live2dcubismcore.min.js" 150000
call :checkFile "lib\live2d.min.js" 100000
call :checkFile "models\Hiyori\Hiyori.model3.json" 100
call :checkFile "models\Hiyori\Hiyori.moc3" 100000
call :checkFile "assets\tarot\cards.json" 5000
call :checkTarotImages

if %MISSING% gtr 0 (
    echo.
    echo [ERROR] %MISSING% required resource(s) missing.
    echo Run: npm run setup
    pause
    exit /b 1
)

echo  All resources OK.
echo.

REM ----- Step 1: Disable code signing & kill running app -----
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set WIN_CSC_KEY_PASSWORD=
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM DesktopPetLive2D.exe >nul 2>&1

REM ----- Step 2: Install electron-builder if needed -----
if not exist "node_modules\electron-builder" (
    echo Installing electron-builder...
    call npm install --save-dev electron-builder
    if errorlevel 1 (
        echo [ERROR] electron-builder install failed
        pause
        exit /b 1
    )
)

REM ----- Step 3: electron-builder --dir -----
echo [1/3] Generating dist\win-unpacked\ ...
if exist "dist\win-unpacked" rmdir /s /q "dist\win-unpacked"
call npx electron-builder --dir --win --x64
if errorlevel 1 (
    echo [ERROR] electron-builder failed
    pause
    exit /b 1
)

REM ----- Step 4: Verify build artifacts have all resources -----
echo.
echo [2/3] Verifying build artifacts...
set ARTIFACT_MISSING=0
call :checkArtifact "dist\win-unpacked\DesktopPetLive2D.exe"
call :checkArtifact "dist\win-unpacked\resources\app.asar"
call :checkArtifactDir "dist\win-unpacked\resources\app.asar.unpacked\lib"
call :checkArtifactDir "dist\win-unpacked\resources\app.asar.unpacked\models\Hiyori"
call :checkArtifactDir "dist\win-unpacked\resources\app.asar.unpacked\assets\tarot\images"
call :checkArtifactCount "dist\win-unpacked\resources\app.asar.unpacked\assets\tarot\images" 78

if %ARTIFACT_MISSING% gtr 0 (
    echo.
    echo [ERROR] %ARTIFACT_MISSING% artifact check(s) failed.
    pause
    exit /b 1
)

REM ----- Step 5: Read version and zip -----
for /f "tokens=2 delims=:," %%a in ('findstr /c:"\"version\"" package.json') do set VER=%%a
set VER=%VER:"=%
set VER=%VER: =%
set ZIP_NAME=DesktopPetLive2D-%VER%-portable.zip

echo.
echo [3/3] Creating dist\%ZIP_NAME% ...
if exist "dist\%ZIP_NAME%" del "dist\%ZIP_NAME%"
node_modules\7zip-bin\win\x64\7za.exe a -mx5 -mmt=on "dist\%ZIP_NAME%" ".\dist\win-unpacked\*" >nul
if errorlevel 1 (
    echo [ERROR] zip failed
    pause
    exit /b 1
)

REM ----- Done -----
echo.
echo === BUILD SUCCESS ===
echo.
echo  Unpacked dir : dist\win-unpacked\DesktopPetLive2D.exe
echo  Portable zip : dist\%ZIP_NAME%
echo.
for %%I in ("dist\%ZIP_NAME%") do echo  Zip size     : %%~zI bytes
echo.
echo End user: extract zip anywhere, double-click DesktopPetLive2D.exe.
echo.
pause
exit /b 0


REM ============================================================
REM Helper functions
REM ============================================================

:checkFile
REM args: %1 = path, %2 = min size
if not exist "%~1" (
    echo  [missing] %~1
    set /a MISSING+=1
    goto :eof
)
for %%A in ("%~1") do set FSIZE=%%~zA
if !FSIZE! lss %~2 (
    echo  [too small] %~1 ^(%FSIZE% bytes^)
    set /a MISSING+=1
    goto :eof
)
echo  [ok] %~1 ^(%FSIZE% bytes^)
goto :eof

:checkTarotImages
if not exist "assets\tarot\images" (
    echo  [missing] assets\tarot\images\
    set /a MISSING+=1
    goto :eof
)
set TAROT_COUNT=0
for %%F in (assets\tarot\images\*.jpg) do set /a TAROT_COUNT+=1
if !TAROT_COUNT! lss 78 (
    echo  [incomplete] assets\tarot\images\ has only !TAROT_COUNT!/78 images
    set /a MISSING+=1
    goto :eof
)
echo  [ok] assets\tarot\images\ ^(!TAROT_COUNT! images^)
goto :eof

:checkArtifact
if not exist "%~1" (
    echo  [missing] %~1
    set /a ARTIFACT_MISSING+=1
    goto :eof
)
for %%A in ("%~1") do set FSIZE=%%~zA
echo  [ok] %~1 ^(%FSIZE% bytes^)
goto :eof

:checkArtifactDir
if not exist "%~1" (
    echo  [missing] %~1\
    set /a ARTIFACT_MISSING+=1
    goto :eof
)
echo  [ok] %~1\
goto :eof

:checkArtifactCount
REM args: %1 = dir, %2 = expected count
set ARTIFACT_FILE_COUNT=0
for %%F in ("%~1\*.*") do set /a ARTIFACT_FILE_COUNT+=1
if !ARTIFACT_FILE_COUNT! lss %~2 (
    echo  [incomplete] %~1 has only !ARTIFACT_FILE_COUNT!/%~2 files
    set /a ARTIFACT_MISSING+=1
    goto :eof
)
echo  [ok] %~1 ^(!ARTIFACT_FILE_COUNT! files^)
goto :eof
