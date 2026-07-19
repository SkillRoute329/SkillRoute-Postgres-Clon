@echo off
title SkillRoute Master - Modo Presentacion CEO
color 0B

echo ==================================================================
echo         S K I L L R O U T E   M A S T E R   2 . 0
echo ==================================================================
echo.
echo [1/3] Verificando base de datos y preparando entorno...
cd C:\SkillRoute_Master\repo
echo [2/3] Levantando Inteligencia Artificial y Motores de Backend...
echo [3/3] Renderizando Frontend en puerto 3006...
echo.
echo ==================================================================
echo El sistema se esta iniciando. El navegador se abrira
echo automaticamente en el Panel de Control en unos segundos.
echo NO CIERRE ESTA VENTANA durante la presentacion.
echo ==================================================================
echo.

:: Ejecutar concurrently de forma limpia sin instalar paquetes y abrir chrome
call npx concurrently -k -n "BACKEND,FRONTEND" -c "bgBlue.bold,bgGreen.bold" "cd backend && npm run dev" "cd frontend && npm run dev" "timeout 8 > NUL && start chrome http://localhost:3006/dashboard"
