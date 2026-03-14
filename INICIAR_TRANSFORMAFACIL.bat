@echo off
title TransformaFacil 2.0 - Iniciando...
cd /d "%~dp0"
color 0A

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   TransForma Facil 2.0 - UCOT                ║
echo  ║   Iniciando sistema completo...               ║
echo  ╚══════════════════════════════════════════════╝
echo.

echo  [1/3] Iniciando Backend (puerto 3002)...
start "TransformaFacil BACKEND" cmd /k "cd /d "%~dp0backend" && node dist/index.js"

timeout /t 8 /nobreak >nul

echo  [2/3] Iniciando Frontend (puerto 8080)...
start "TransformaFacil FRONTEND" cmd /k "cd /d "%~dp0frontend" && npx serve dist -s -l 8080"

timeout /t 5 /nobreak >nul

echo  [3/3] Abriendo en Brave...
start brave "http://localhost:8080"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   Sistema iniciado!                          ║
echo  ║   URL: http://localhost:8080                 ║
echo  ║   Usuario: 329  /  Password: admin123        ║
echo  ╚══════════════════════════════════════════════╝
echo.
pause
