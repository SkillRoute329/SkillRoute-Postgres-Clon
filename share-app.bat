@echo off
TITLE TransformaFacil - Remote Access
CLS
ECHO ===================================================
ECHO         TRANSFORMA FACIL - REMOTE ACCESS
ECHO ===================================================
ECHO.
ECHO This script will:
ECHO 1. Start the application (Frontend + Backend)
ECHO 2. Start a secure tunnel to share it with the world
ECHO.
ECHO Requirements:
ECHO - Node.js installed
ECHO - Ngrok installed (or we will use npx)
ECHO.

:CHECK_NGROK
WHERE ngrok >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [INFO] Ngrok not found in PATH. We will use 'npx ngrok'.
    SET NGROK_CMD=npx ngrok
) ELSE (
    ECHO [INFO] Ngrok found.
    SET NGROK_CMD=ngrok
)

ECHO.
ECHO [1/2] Starting Application...
ECHO Please wait while the app starts in the background...
start "TransformaFacil App" cmd /c "call start-app.bat"

ECHO.
ECHO [INFO] Checking for saved configuration...
SET NGROK_ARGS=http 5173

IF EXIST ngrok_config.txt (
    SET /p STATIC_DOMAIN=<ngrok_config.txt
    ECHO [SUCCESS] Found saved domain: %STATIC_DOMAIN%
    SET NGROK_ARGS=http --domain=%STATIC_DOMAIN% 5173
) ELSE (
    ECHO [INFO] No saved domain found. Using random URL.
)

ECHO.
ECHO [2/2] Starting Tunnel...
ECHO.
ECHO.
ECHO ***************************************************
ECHO *      IMPORTANT: WHICH LINK SHOULD I USE?        *
ECHO ***************************************************
ECHO.
ECHO [1] For Wi-Fi (Same House):
ECHO     You can use the numbers shown in the OTHER window.
ECHO.
ECHO [2] For Mobile Data (4G/5G) or Remote Access:
ECHO     You MUST use the link below (starts with https://...)
ECHO.
IF DEFINED STATIC_DOMAIN (
    ECHO     >>> https://%STATIC_DOMAIN% <<<
    ECHO.
)
ECHO Connect your phone to THAT link.
ECHO.
ECHO Press any key to launch the tunnel...
PAUSE >nul

%NGROK_CMD% %NGROK_ARGS%
