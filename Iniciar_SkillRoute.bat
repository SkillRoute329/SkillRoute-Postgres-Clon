@echo off
title SkillRoute - Auto Sincronizador
color 0B

echo =========================================================
echo       SISTEMA DE GESTION SKILLROUTE - INICIANDO...
echo =========================================================
echo.
echo [1/3] Sincronizando con el servidor de la nube (GitHub)...
git pull origin main

if %ERRORLEVEL% neq 0 (
    color 0E
    echo.
    echo [ADVERTENCIA] No se pudo verificar actualizaciones.
    echo Iniciando con la ultima version local disponible...
    timeout /t 3 /nobreak >nul
) else (
    echo.
    echo [OK] Sistema actualizado correctamente.
)

echo.
echo [2/3] Verificando dependencias...
call npm run install:all >nul 2>&1

echo.
echo [3/3] Levantando Servidores (Backend y Frontend)...
echo =========================================================
color 0A
call npm start

pause
