@echo off
TITLE TransformaFacil - Ngrok Setup
CLS
ECHO ===================================================
ECHO         TRANSFORMA FACIL - NGROK SETUP
ECHO ===================================================
ECHO.
ECHO This script verifies and configures your Ngrok account
ECHO so you can use a Persistent/Static Domain.
ECHO.
ECHO [1] Get your Authtoken
ECHO     Go to: https://dashboard.ngrok.com/get-started/your-authtoken
ECHO     (Sign up for free if you haven't already)
ECHO.
ECHO [2] Copy the Authtoken (it starts with "2...")
ECHO.
SET /P NGROK_TOKEN="Paste your Authtoken here: "

IF "%NGROK_TOKEN%"=="" (
    ECHO.
    ECHO [ERROR] Token cannot be empty.
    PAUSE
    EXIT /B
)

ECHO.
ECHO Configuring Ngrok...
ECHO.

WHERE ngrok >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [INFO] Using npx ngrok...
    call npx ngrok config add-authtoken %NGROK_TOKEN%
) ELSE (
    ECHO [INFO] Using system ngrok...
    call ngrok config add-authtoken %NGROK_TOKEN%
)

ECHO.
ECHO ===================================================
ECHO [PART 2] Static Domain (Optional)
ECHO ===================================================
ECHO.
ECHO If you have a Static Domain (e.g. "my-app.ngrok-free.app"),
ECHO enter it below. The system will remember it forever.
ECHO.
ECHO If you don't have one, just press ENTER to skip.
ECHO.
SET /P STATIC_DOMAIN="Static Domain: "

IF NOT "%STATIC_DOMAIN%"=="" (
    ECHO %STATIC_DOMAIN% > ngrok_config.txt
    ECHO.
    ECHO [SUCCESS] Domain saved to 'ngrok_config.txt'.
) ELSE (
    IF EXIST ngrok_config.txt DEL ngrok_config.txt
    ECHO.
    ECHO [INFO] No domain configured (using random URLs).
)

ECHO.
ECHO ===================================================
ECHO [DONE] Setup Complete!
ECHO ===================================================
ECHO.
ECHO Now you can simply run 'share-app.bat' and it will
ECHO automatically use your saved settings.
ECHO.
PAUSE
