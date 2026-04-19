@echo off
title TransformaFacil 2.0 - Lanzador con Acceso Global
cls
echo ========================================================
echo     TRANSFORMAFACIL 2.0 - SISTEMA GLOBAL UCOT
echo ========================================================
echo.
echo Este lanzador inicia el sistema completo:
echo   1. Backend (Puerto 4000) - API y Base de Datos
echo   2. Frontend (Puerto 8082) - Interfaz de Usuario
echo   3. Tunel Ngrok (HTTPS) - Acceso Global
echo.
echo ========================================================
echo.

set "BASE_DIR=%~dp0"
cd /d "%BASE_DIR%"

echo [1/3] Verificando frontend compilado...
if not exist "frontend\dist\index.html" (
    echo [!] Frontend no compilado. Construyendo...
    cd frontend && npm install && npm run build && cd ..
)
echo ✅ Frontend listo.
echo.

echo [2/3] Iniciando Backend (Puerto 4000)...
start "TransformaFacil Backend" cmd /k "cd backend_legacy && npm run dev"
timeout /t 5 /nobreak >nul
echo ✅ Backend iniciado.
echo.

echo [3/3] Iniciando Frontend (Puerto 8082)...
start "TransformaFacil Frontend" cmd /k "cd frontend\dist && npx serve -s . -l 8082"
timeout /t 3 /nobreak >nul
echo ✅ Frontend iniciado.
echo.

echo ========================================================
echo   SISTEMA INICIADO CORRECTAMENTE
echo ========================================================
echo.
echo ACCESO LOCAL:
echo   http://localhost:8082
echo.
echo CREDENCIALES DE ADMINISTRADOR:
echo   Usuario: 0000
echo   Contraseña: admin123
echo.
echo ========================================================
echo.
echo ¿Desea habilitar ACCESO GLOBAL via Ngrok?
echo (Permite acceso desde celulares, internet, etc.)
echo.
set /p ENABLE_NGROK="Habilitar acceso global? (S/N): "

if /i "%ENABLE_NGROK%"=="S" (
    echo.
    echo Iniciando tunel Ngrok...
    echo.
    echo IMPORTANTE: La URL que aparecera abajo es la que debes
    echo compartir con los empleados para acceso remoto.
    echo.
    pause
    npx ngrok http 8082
) else (
    echo.
    echo Sistema funcionando solo en red local.
    echo Abre http://localhost:8082 en tu navegador.
    echo.
    start http://localhost:8082
    pause
)
