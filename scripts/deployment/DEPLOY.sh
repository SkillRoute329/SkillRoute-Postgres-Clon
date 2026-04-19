#!/bin/bash

# ============================================
# TransformaFacil 2.0 - Script de Deploy
# Compila y deploya a Firebase automáticamente
# ============================================

set -e  # Salir si hay error

echo "🚀 TransformaFacil 2.0 - Deploy a Firebase"
echo "=============================================="
echo ""

# Verificar si estamos en el directorio correcto
if [ ! -f "firebase.json" ]; then
    echo "❌ Error: Ejecutar desde raíz de TransformaFacil-2.0"
    exit 1
fi

# PASO 1: Build Frontend
echo "📦 PASO 1: Compilando Frontend..."
cd frontend
if [ ! -f "package.json" ]; then
    echo "❌ Error: No encontrado frontend/package.json"
    exit 1
fi

npm run build 2>&1 | tail -5
if [ ! -d "dist" ]; then
    echo "❌ Error: No se generó frontend/dist/"
    exit 1
fi
cd ..
echo "✅ Frontend compilado"
echo ""

# PASO 2: Build Backend
echo "📦 PASO 2: Compilando Backend..."
cd backend
if [ ! -f "package.json" ]; then
    echo "❌ Error: No encontrado backend/package.json"
    exit 1
fi

npm run build 2>&1 | tail -5
if [ ! -d "dist" ]; then
    echo "❌ Error: No se generó backend/dist/"
    exit 1
fi
cd ..
echo "✅ Backend compilado"
echo ""

# PASO 3: Verificar Firebase CLI
echo "🔐 PASO 3: Verificando Firebase CLI..."
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI no instalado"
    echo "   Ejecuta: npm install -g firebase-tools"
    exit 1
fi
echo "✅ Firebase CLI presente"
echo ""

# PASO 4: Verificar autenticación
echo "🔑 PASO 4: Verificando autenticación Firebase..."
if ! firebase projects:list &> /dev/null; then
    echo "⚠️  No autenticado. Abriendo navegador..."
    firebase login
fi
echo "✅ Autenticado"
echo ""

# PASO 5: Seleccionar proyecto
echo "📋 PASO 5: Seleccionando proyecto..."
firebase use ucot-gestor-cloud 2>&1 | grep -i project || true
echo "✅ Proyecto: ucot-gestor-cloud"
echo ""

# PASO 6: Deploy
echo "🌐 PASO 6: Desplegando a Firebase..."
echo "   Esto puede tomar 2-5 minutos..."
echo ""
firebase deploy --verbose 2>&1 | tee deploy.log
echo ""

# PASO 7: Verificación
echo "✅ VERIFICACIÓN"
echo "=============================================="
if grep -q "Deploy complete" deploy.log; then
    echo "✅ DEPLOY EXITOSO!"
    echo ""
    echo "🌐 Tu app está disponible en:"
    echo "   https://ucot-gestor-cloud.web.app"
    echo ""
    echo "📍 Módulo de Agentes:"
    echo "   https://ucot-gestor-cloud.web.app/dashboard/traffic/agents"
    echo ""
    echo "⏱️  Espera 2-5 minutos para que se propague el CDN"
    echo "🔄 Si no ves cambios, limpia cache: Ctrl+Shift+Del"
else
    echo "⚠️  Revisa el archivo deploy.log para detalles"
    grep -i error deploy.log || echo "   Sin errores críticos encontrados"
fi
echo ""

# Limpiar
rm -f deploy.log
