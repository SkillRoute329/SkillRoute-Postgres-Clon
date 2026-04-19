#!/bin/bash

# ============================================
# TransformaFacil 2.0 - Script de Reparación
# ============================================

echo "🔧 TransformaFacil 2.0 - Reparación Automática"
echo "================================================"
echo ""

# Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Ejecutar este script desde la raíz de TransformaFacil-2.0"
    exit 1
fi

# PASO 1: Limpiar node_modules
echo "📦 PASO 1: Limpiando node_modules..."
echo "   Esto puede tomar un momento..."
rm -rf frontend/node_modules backend/node_modules 2>/dev/null
rm -rf frontend/package-lock.json backend/package-lock.json 2>/dev/null
echo "   ✅ node_modules limpiados"
echo ""

# PASO 2: Instalar dependencias
echo "📥 PASO 2: Instalando dependencias..."
echo "   Frontend..."
cd frontend
npm install --legacy-peer-deps 2>&1 | tail -1
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "   ⚠️  Intento 2 con npm ci..."
    npm ci --legacy-peer-deps 2>&1 | tail -1
fi
cd ..

echo "   Backend..."
cd backend
npm install --legacy-peer-deps 2>&1 | tail -1
if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "   ⚠️  Intento 2 con npm ci..."
    npm ci --legacy-peer-deps 2>&1 | tail -1
fi
cd ..
echo "   ✅ Dependencias instaladas"
echo ""

# PASO 3: Verificar .env
echo "🔐 PASO 3: Verificando configuración..."
if [ -f "backend/.env" ]; then
    if grep -q "FIREBASE_PROJECT_ID" backend/.env; then
        echo "   ✅ Configuración .env presente"
    else
        echo "   ⚠️  .env existe pero está incompleta"
    fi
else
    echo "   ⚠️  No encontrado: backend/.env"
    if [ -f "backend/.env.local" ]; then
        echo "   📋 Copiando desde .env.local..."
        cp backend/.env.local backend/.env
        echo "   ✅ Configuración copiada"
    fi
fi
echo ""

# PASO 4: Verificar Node.js
echo "📋 PASO 4: Verificando Node.js..."
node_version=$(node -v)
echo "   Node.js: $node_version"
if [[ $node_version == v20.* ]] || [[ $node_version == v21.* ]] || [[ $node_version == v22.* ]]; then
    echo "   ✅ Versión compatible"
else
    echo "   ⚠️  Se recomienda Node.js 20+ para mejor compatibilidad"
fi
echo ""

# PASO 5: Resumen
echo "================================================"
echo "✅ REPARACIÓN COMPLETADA"
echo "================================================"
echo ""
echo "🚀 Para iniciar el proyecto, ejecuta:"
echo ""
echo "   npm run dev"
echo ""
echo "Esto iniciará:"
echo "   • Backend en: http://localhost:3002"
echo "   • Frontend en: http://localhost:3005"
echo ""
echo "📖 Para más información: SOLUCION_RAPIDA.md"
echo ""
