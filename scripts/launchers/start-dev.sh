#!/bin/bash

# TransformaFacil 2.0 - Iniciar en desarrollo local

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  TransformaFacil 2.0 - INICIANDO EN MODO DESARROLLO     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Función para limpiar procesos al salir
cleanup() {
    echo ""
    echo "🛑 Deteniendo servidores..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servidores detenidos"
    exit 0
}

trap cleanup SIGINT

# Terminal 1: Backend
echo "📡 Iniciando BACKEND en puerto 3000..."
cd backend
npm run dev > ../logs-backend.txt 2>&1 &
BACKEND_PID=$!
echo "   PID: $BACKEND_PID"
cd ..
sleep 3

# Terminal 2: Frontend
echo "🎨 Iniciando FRONTEND en puerto 3001..."
cd frontend
npm start > ../logs-frontend.txt 2>&1 &
FRONTEND_PID=$!
echo "   PID: $FRONTEND_PID"
cd ..
sleep 5

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ SISTEMA INICIADO CORRECTAMENTE                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  🌐 FRONTEND:  http://localhost:3001                    ║"
echo "║  📡 BACKEND:   http://localhost:3000                    ║"
echo "║                                                          ║"
echo "║  📝 LOGS:                                               ║"
echo "║     - Backend:  tail -f logs-backend.txt                ║"
echo "║     - Frontend: tail -f logs-frontend.txt               ║"
echo "║                                                          ║"
echo "║  ⏹️  Para detener: Presiona CTRL+C                      ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Esperar a que terminen
wait $BACKEND_PID
wait $FRONTEND_PID
