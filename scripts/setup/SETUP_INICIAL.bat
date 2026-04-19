@echo off
title TransformaFacil 2.0 - Configuracion Inicial Firebase
cd /d "%~dp0"

echo.
echo  =====================================================
echo   TransformaFacil 2.0 - Configuracion Inicial
echo   Creando usuario SuperAdmin en Firebase...
echo  =====================================================
echo.
echo  Este proceso creara:
echo    - Usuario: 329 / Contrasena: admin123 (SuperAdmin)
echo    - Documentos en Firestore (vehiculos, alertas, etc.)
echo.

node backend_legacy\setup_firebase.js

echo.
if %errorlevel% equ 0 (
    echo  =====================================================
    echo   LISTO! Ahora ejecuta INICIAR.bat para abrir la app
    echo  =====================================================
) else (
    echo  ERROR: Revisa la conexion a internet e intenta de nuevo.
)
echo.
pause
