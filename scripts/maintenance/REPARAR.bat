@echo off
REM ============================================
REM TransformaFacil 2.0 - Script de Reparación (Windows)
REM ============================================

setlocal enabledelayedexpansion

echo.
echo 🔧 TransformaFacil 2.0 - Reparación Automática (Windows)
echo ================================================
echo.

REM Verificar si estamos en el directorio correcto
if not exist "package.json" (
    echo ❌ Error: Ejecutar este script desde la raíz de TransformaFacil-2.0
    pause
    exit /b 1
)

REM PASO 1: Limpiar node_modules
echo 📦 PASO 1: Limpiando node_modules...
echo    Esto puede tomar un momento...
if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules" 2>nul
if exist "backend\node_modules" rmdir /s /q "backend\node_modules" 2>nul
if exist "frontend\package-lock.json" del /q "frontend\package-lock.json" 2>nul
if exist "backend\package-lock.json" del /q "backend\package-lock.json" 2>nul
echo    ✅ node_modules limpios
echo.

REM PASO 2: Instalar dependencias - Frontend
echo 📥 PASO 2: Instalando dependencias...
echo    Frontend...
cd frontend
call npm install --legacy-peer-deps
if !errorlevel! neq 0 (
    echo    ⚠️  Intento 2 con npm ci...
    call npm ci --legacy-peer-deps
)
cd ..

REM PASO 3: Instalar dependencias - Backend
echo    Backend...
cd backend
call npm install --legacy-peer-deps
if !errorlevel! neq 0 (
    echo    ⚠️  Intento 2 con npm ci...
    call npm ci --legacy-peer-deps
)
cd ..
echo    ✅ Dependencias instaladas
echo.

REM PASO 4: Verificar .env
echo 🔐 PASO 3: Verificando configuración...
if exist "backend\.env" (
    findstr /m "FIREBASE_PROJECT_ID" "backend\.env" >nul
    if !errorlevel! equ 0 (
        echo    ✅ Configuración .env presente
    ) else (
        echo    ⚠️  .env existe pero está incompleta
    )
) else (
    echo    ⚠️  No encontrado: backend\.env
    if exist "backend\.env.local" (
        echo    📋 Copiando desde .env.local...
        copy "backend\.env.local" "backend\.env" >nul
        echo    ✅ Configuración copiada
    )
)
echo.

REM PASO 5: Verificar Node.js
echo 📋 PASO 4: Verificando Node.js...
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo    Node.js: %NODE_VERSION%
echo    ✅ Versión detectada
echo.

REM PASO 6: Resumen
echo ================================================
echo ✅ REPARACIÓN COMPLETADA
echo ================================================
echo.
echo 🚀 Para iniciar el proyecto, ejecuta:
echo.
echo    npm run dev
echo.
echo Esto iniciará:
echo    • Backend en: http://localhost:3002
echo    • Frontend en: http://localhost:3005
echo.
echo 📖 Para más información: SOLUCION_RAPIDA.md
echo.
pause
