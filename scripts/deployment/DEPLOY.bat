@echo off
REM ============================================
REM TransformaFacil 2.0 - Script de Deploy (Windows)
REM ============================================

setlocal enabledelayedexpansion

echo.
echo 🚀 TransformaFacil 2.0 - Deploy a Firebase
echo ==============================================
echo.

REM Verificar directorio correcto
if not exist "firebase.json" (
    echo ❌ Error: Ejecutar desde raíz de TransformaFacil-2.0
    pause
    exit /b 1
)

REM PASO 1: Build Frontend
echo 📦 PASO 1: Compilando Frontend...
cd frontend
if not exist "package.json" (
    echo ❌ Error: No encontrado frontend/package.json
    pause
    exit /b 1
)

call npm run build
if not exist "dist" (
    echo ❌ Error: No se generó frontend/dist/
    pause
    exit /b 1
)
cd ..
echo ✅ Frontend compilado
echo.

REM PASO 2: Build Cloud Functions (Backend)
echo 📦 PASO 2: Compilando Cloud Functions...
cd functions
if not exist "package.json" (
    echo ❌ Error: No encontrado functions/package.json
    pause
    exit /b 1
)

call npm run build
cd ..
echo ✅ Backend/Functions compilado
echo.

REM PASO 3: Verificar Firebase CLI
echo 🔐 PASO 3: Verificando Firebase CLI...
where firebase >nul 2>nul
if !errorlevel! neq 0 (
    echo ❌ Error: Firebase CLI no instalado
    echo    Ejecuta: npm install -g firebase-tools
    pause
    exit /b 1
)
echo ✅ Firebase CLI presente
echo.

REM PASO 4: Verificar autenticación
echo 🔑 PASO 4: Verificando autenticación Firebase...
firebase projects:list >nul 2>nul
if !errorlevel! neq 0 (
    echo ⚠️  No autenticado. Abriendo navegador...
    call firebase login
)
echo ✅ Autenticado
echo.

REM PASO 5: Seleccionar proyecto
echo 📋 PASO 5: Seleccionando proyecto...
call firebase use ucot-gestor-cloud
echo ✅ Proyecto: ucot-gestor-cloud
echo.

REM PASO 6: Deploy
echo 🌐 PASO 6: Desplegando a Firebase...
echo    Esto puede tomar 2-5 minutos...
echo.
call firebase deploy
echo.

REM PASO 7: Verificación
echo ✅ VERIFICACIÓN
echo ==============================================
echo.
echo ✅ DEPLOY COMPLETADO
echo.
echo 🌐 Tu app está disponible en:
echo    https://ucot-gestor-cloud.web.app
echo.
echo 📍 Módulo de Agentes:
echo    https://ucot-gestor-cloud.web.app/dashboard/traffic/agents
echo.
echo ⏱️  Espera 2-5 minutos para que se propague el CDN
echo 🔄 Si no ves cambios, limpia cache: Ctrl+Shift+Del
echo.
pause
