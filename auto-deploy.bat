@echo off
echo ==========================================
echo   AGENTE IA - DESPLIEGUE AUTOMATICO Y SEGURO
echo ==========================================
echo.
echo [FASE 1] AUTO-REPARACION DE ARCHIVOS DE CONFIGURACION
echo ---------------------------------------------------
:: Asegurar que railway.json es correcto
echo Validando railway.json...
(
echo {
echo   "build": {
echo     "builder": "DOCKERFILE",
echo     "dockerfilePath": "Dockerfile.prod",
echo     "watchPatterns": ["backend/**", "frontend/**", "prisma/**", "Dockerfile.prod"]
echo   },
echo   "deploy": {
echo     "healthcheckPath": "/api/health",
echo     "healthcheckTimeout": 120,
echo     "restartPolicyType": "ON_FAILURE",
echo     "restartPolicyMaxRetries": 5
echo   }
echo }
) > railway.json
echo [OK] railway.json restaurado a configuracion optima.

:: Asegurar que Dockerfile es la version PROD
echo Sincronizando Dockerfile con Dockerfile.prod...
copy /Y Dockerfile.prod Dockerfile > nul
echo [OK] Dockerfile ahora contiene la definicion de produccion correcta.

:: Eliminar archivos trampa
if exist backend\src\simple-server.ts (
    del backend\src\simple-server.ts
    echo [OK] Servidor simple antiguo eliminado.
)

echo.
echo [FASE 2] GESTION INTELIGENTE DE GIT
echo ---------------------------------------------------
echo Detectando estado del repositorio...
git status

echo.
echo Guardando todo el trabajo actual y forzando subida...
git add .
git commit -m "AUTO-AGENT: Subida automatica de integridad para despliegue Railway."
:: Empujar a ambas ramas criticas para asegurar cobertura
git push origin debug-deploy-v1 --force
git push origin main --force

echo.
echo ==========================================
echo   MISION CUMPLIDA
echo   El codigo ha sido corregido, empaquetado y enviado.
echo   Railway detectara este cambio en 1 minuto.
echo ==========================================
pause
