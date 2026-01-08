@echo off
TITLE TransformaFacil - Auto-Start Installer
CLS
ECHO ===================================================
ECHO      TRANSFORMA FACIL - AUTO-START INSTALLER
ECHO ===================================================
ECHO.
ECHO This script will configure TransformaFacil to start
ECHO automatically when you turn on your computer.
ECHO.
ECHO [INFO] Target: share-app.bat
ECHO [INFO] Destination: Windows Startup Folder
ECHO.

set "TARGET_SCRIPT=%~dp0share-app.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\TransformaFacil.lnk"

ECHO Installing shortcut...
ECHO.

powershell -Command "$s=(New-Object -COM 'WScript.Shell').CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%TARGET_SCRIPT%';$s.WorkingDirectory='%~dp0';$s.Save()"

IF EXIST "%SHORTCUT_PATH%" (
    ECHO.
    ECHO [SUCCESS] Installed successfully!
    ECHO The app will now open automatically on next boot.
    ECHO.
) ELSE (
    ECHO.
    ECHO [ERROR] Could not create shortcut.
    ECHO Please run this script as Administrator.
    ECHO.
)

PAUSE
