#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# DEPLOY LOCAL - TransformaFacil 2.0
# ═══════════════════════════════════════════════════════════════════════════
# Uso: bash scripts/deploy-local.sh

set -e  # Salir si hay error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 DEPLOY LOCAL - TransformaFacil 2.0${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# ───────────────────────────────────────────────────────────────────────────
# PASO 1: Preparar ambientes
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[1/5] Preparando archivos de configuración...${NC}"

# Backend
if [ ! -f backend/.env ]; then
  echo -e "${GREEN}  ✅ Copiando .env local al backend${NC}"
  cp backend/.env.local backend/.env
else
  echo -e "${YELLOW}  ⚠️  .env ya existe, saltando...${NC}"
fi

# Frontend
if [ ! -f frontend/.env ]; then
  echo -e "${GREEN}  ✅ Creando .env para frontend${NC}"
  cat > frontend/.env << EOF
VITE_API_URL=http://localhost:3099
VITE_BACKEND_URL=http://localhost:3002
EOF
else
  echo -e "${YELLOW}  ⚠️  .env frontend ya existe, saltando...${NC}"
fi

echo ""

# ───────────────────────────────────────────────────────────────────────────
# PASO 2: Instalar dependencias
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/5] Instalando dependencias...${NC}"

echo -e "${GREEN}  📦 Backend...${NC}"
cd backend
npm install --legacy-peer-deps
cd ..

echo -e "${GREEN}  📦 Frontend...${NC}"
cd frontend
npm install --legacy-peer-deps
cd ..

echo ""

# ───────────────────────────────────────────────────────────────────────────
# PASO 3: Compilar TypeScript
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/5] Compilando TypeScript...${NC}"

echo -e "${GREEN}  🔨 Backend...${NC}"
cd backend
npm run build
cd ..

echo ""

# ───────────────────────────────────────────────────────────────────────────
# PASO 4: Verificar puertos disponibles
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[4/5] Verificando puertos...${NC}"

PORTS=(3002 3099 5173)
for PORT in "${PORTS[@]}"; do
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}  ❌ Puerto ${PORT} ya está en uso${NC}"
    echo -e "${YELLOW}     Ejecución: lsof -i :${PORT} para ver proceso${NC}"
    echo -e "${YELLOW}     O mata el proceso: kill -9 \$(lsof -t -i:${PORT})${NC}"
  else
    echo -e "${GREEN}  ✅ Puerto ${PORT} disponible${NC}"
  fi
done

echo ""

# ───────────────────────────────────────────────────────────────────────────
# PASO 5: Crear scripts de ejecución
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[5/5] Preparando scripts de ejecución...${NC}"

# Script para ejecutar todo
cat > run-local.sh << 'RUNSCRIPT'
#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}▶️  Iniciando TransformaFacil 2.0 (Local)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Abre 3 terminales y ejecuta:${NC}"
echo ""
echo -e "${GREEN}Terminal 1 - Backend (3002):${NC}"
echo "  cd backend && npm run dev"
echo ""
echo -e "${GREEN}Terminal 2 - Bridge (3099):${NC}"
echo "  cd backend && npm run bridge"
echo ""
echo -e "${GREEN}Terminal 3 - Frontend (5173):${NC}"
echo "  cd frontend && npm run dev"
echo ""
echo -e "${YELLOW}URLs disponibles:${NC}"
echo "  🎨 Frontend:       http://localhost:5173"
echo "  🔌 Backend API:    http://localhost:3002"
echo "  🌉 Bridge Server:  http://localhost:3099"
echo ""
echo -e "${YELLOW}Tests:${NC}"
echo "  bash backend/test-analisis-competencia.sh"
echo ""
RUNSCRIPT

chmod +x run-local.sh

echo -e "${GREEN}  ✅ Script run-local.sh creado${NC}"

echo ""

# ───────────────────────────────────────────────────────────────────────────
# RESUMEN FINAL
# ───────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DEPLOY LOCAL COMPLETADO${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo ""
echo -e "${GREEN}Opción 1: Ejecutar con Node (Recomendado para desarrollo)${NC}"
echo "  1. bash run-local.sh   (Ver instrucciones)"
echo "  2. Abre 3 terminales y sigue las instrucciones"
echo ""
echo -e "${GREEN}Opción 2: Ejecutar con Docker (Recomendado para testing)${NC}"
echo "  docker-compose up -d"
echo "  docker-compose logs -f"
echo ""
echo -e "${YELLOW}Verificar que funciona:${NC}"
echo "  curl http://localhost:3099/health"
echo "  curl http://localhost:3099/api/lines/ucot"
echo ""
echo -e "${YELLOW}Ejecutar tests:${NC}"
echo "  bash backend/test-analisis-competencia.sh"
echo ""
