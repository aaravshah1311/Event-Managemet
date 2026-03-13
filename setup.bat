@echo off
title Install Dependencies
echo [INFO] Installing project libraries (Express, MySQL, etc.)...

REM Check if Node is installed
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed. Please install it first.
    pause
    exit /b
)

REM Run npm install
call npm install
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed.
) ELSE (
    echo [SUCCESS] All dependencies installed!
)

pause