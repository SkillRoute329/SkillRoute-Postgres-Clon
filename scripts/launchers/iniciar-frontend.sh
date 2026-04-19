#!/bin/bash

# TransformaFacil 2.0 - Iniciar FRONTEND

echo "╔════════════════════════════════════════════════════╗"
echo "║   TransformaFacil 2.0 - FRONTEND                   ║"
echo "║   Puerto: 3001                                     ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

cd frontend

echo "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias..."
  npm install
fi

echo ""
echo "▶️  Iniciando servidor..."
echo ""

npx serve dist -l 3001
