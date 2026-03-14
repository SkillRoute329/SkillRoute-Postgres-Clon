#!/bin/bash

# TransformaFacil 2.0 - Iniciar BACKEND

echo "╔════════════════════════════════════════════════════╗"
echo "║   TransformaFacil 2.0 - BACKEND                    ║"
echo "║   Puerto: 3000                                     ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

cd backend

echo "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias..."
  npm install
fi

echo ""
echo "▶️  Iniciando servidor..."
echo ""

npm start
