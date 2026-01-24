@echo off
title Lanzador App Transforma UCOT 2.0
echo ====================================================
echo   LANZANDO APLICACIÓN UCOT - VERSIÓN LOCAL DIRECTA
echo ====================================================
echo.
set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

echo 1. Verificando folder de distribucion...
if not exist "frontend\dist\index.html" (
    echo [!] Error: No se encuentra index.html. Reconstruyendo...
    cd frontend && npm install && npm run build && cd ..
)

echo.
echo 2. Iniciando servidor local...
echo La aplicacion estara disponible en: http://localhost:8082
echo [INFO] Se ha cambiado el puerto para evitar conflictos de cache.
echo.

start http://localhost:8082
cd frontend\dist
npx serve -s . -l 8082
pause
