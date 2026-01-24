@echo off
title TransformaFacil - Acceso Directo a Producción
cls
echo ========================================================
echo     TRANSFORMAFACIL 2.0 - ACCESO GLOBAL
echo ========================================================
echo.
echo La aplicacion esta DESPLEGADA Y FUNCIONANDO en Railway.
echo.
echo Accesible desde CUALQUIER UBICACION del mundo:
echo   - Oficina (Wi-Fi corporativo)
echo   - Casa (Wi-Fi personal)
echo   - Campo (Datos moviles 4G/5G)
echo   - Otro pais
echo.
echo ========================================================
echo   URL DE ACCESO:
echo   https://transformafacil-20-production.up.railway.app
echo ========================================================
echo.
echo CREDENCIALES DE SUPER ADMINISTRADOR:
echo   Usuario: 0000
echo   Contraseña: admin123
echo.
echo ========================================================
echo.
echo [1] Abrir aplicacion en el navegador
echo [2] Verificar estado del sistema
echo [3] Ver guia completa
echo [4] Salir
echo.
set /p opcion="Seleccione una opcion: "

if "%opcion%"=="1" (
    echo.
    echo Abriendo aplicacion en el navegador...
    start https://transformafacil-20-production.up.railway.app
    echo.
    echo ✅ Aplicacion abierta. Use las credenciales mostradas arriba.
    echo.
    pause
    exit
)

if "%opcion%"=="2" (
    echo.
    echo Verificando estado del sistema...
    echo.
    curl.exe -s https://transformafacil-20-production.up.railway.app/api/health
    echo.
    echo.
    echo Si ve "status": "ok", el sistema esta FUNCIONANDO.
    echo.
    pause
    exit
)

if "%opcion%"=="3" (
    echo.
    echo Abriendo guia completa...
    start GUIA_ACCESO_GLOBAL.md
    pause
    exit
)

if "%opcion%"=="4" (
    exit
)

echo.
echo Opcion no valida.
pause
