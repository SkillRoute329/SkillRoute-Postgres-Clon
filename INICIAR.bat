@echo off
title TransformaFacil 2.0 - Iniciando...
cd /d "%~dp0"

echo.
echo  TransformaFacil 2.0 - Entrada directa
echo  -------------------------------------
echo.

if not exist "frontend\node_modules" (
    echo  Instalando dependencias (solo la primera vez)...
    call npm run install:all
    echo.
)

echo  Arrancando aplicacion y abriendo navegador...
echo  El navegador se abrira en unos segundos.
echo.
start "" cmd /c "npm start"

exit /b 0
