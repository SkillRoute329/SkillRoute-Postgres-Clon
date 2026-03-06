@echo off
title Verificando Despliegue...
color 0E
cls
echo Iniciando verificador...
node scripts/check_deploy.js
if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ============================================
    echo      ¡SISTEMA ACTUALIZADO Y PRONTO!
    echo ============================================
    echo.
    echo Ya puedes usar la aplicacion.
    
    REM Beep sound sequence to alert user
    rundll32 user32.dll,MessageBeep
    timeout /t 1 >nul
    rundll32 user32.dll,MessageBeep
)
pause
