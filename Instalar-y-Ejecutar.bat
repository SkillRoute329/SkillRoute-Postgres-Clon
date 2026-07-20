@echo off
title SkillRoute 2.0 - Instalador y Lanzador Maestro
cd /d "%~dp0"
color 0B

echo.
echo  ==============================================================
echo   SKILLROUTE 2.0 - SISTEMA GLOBAL (INSTALACION AUTOMATICA)
echo  ==============================================================
echo.
echo  Este script configurara tu entorno completo en cualquier PC:
echo   1. Instala todas las librerias necesarias.
echo   2. Levanta la Base de Datos con todos tus datos (Docker).
echo   3. Inicia el servidor Backend y Frontend.
echo.
echo  [1/4] Instalando dependencias del proyecto (Puede demorar)...
call npm run install:all

echo.
echo  [2/4] Iniciando Servidor de Base de Datos (Docker)...
docker-compose up -d

echo.
echo  [3/4] Esperando que la base de datos se inicie y cargue...
timeout /t 10 /nobreak >nul

echo.
echo  [4/4] Levantando SkillRoute 2.0...
echo.
echo  ==============================================================
echo   El programa estara disponible en unos segundos en:
echo   http://localhost:3006
echo.
echo   Manten esta ventana abierta. Para cerrar el programa, 
echo   presiona CTRL+C o cierra la ventana.
echo  ==============================================================
echo.

call npm run dev
