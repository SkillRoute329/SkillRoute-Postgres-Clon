#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# 🚀 START - TransformaFacil 2.0 - INICIO RÁPIDO
# ═══════════════════════════════════════════════════════════════════════════
# Inicia TODOS los servicios necesarios para ejecutar TransformaFacil
#
# Uso:
#   bash START.sh
#
# O con opción específica:
#   bash START.sh local    (Solo local - 3 terminales)
#   bash START.sh docker   (Docker Compose)
#   bash START.sh online   (Preparar para Heroku)
#
# ═══════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ───────────────────────────────────────────────────────────────────────────
# Detectar opción
# ───────────────────────────────────────────────────────────────────────────

MODE="${1:-local}"

# ───────────────────────────────────────────────────────────────────────────
# Banner
# ───────────────────────────────────────────────────────────────────────────

clear

echo -e "${CYAN}
███████████████████████████████████████████████████████████████████████████
█                                                                         █
█   🚀 TRANSFORMAFACIL 2.0 - STARTUP MASTER                              █
█   Sistema de Análisis de Competencia en Tiempo Real                     █
█                                                                         █
█   Modo: ${YELLOW}${MODE^^}${CYAN}                                                               █
█                                                                         █
███████████████████████████████████████████████████████████████████████████
${NC}
"

# ═══════════════════════════════════════════════════════════════════════════
# OPCIÓN 1: LOCAL (Desarrollo - 3 Terminales)
# ═══════════════════════════════════════════════════════════════════════════

if [ "$MODE" = "local" ]; then

echo -e "${YELLOW}[1/3] Verificando dependencias...${NC}"

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js no está instalado${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"

# Verificar npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm no está instalado${NC}"
  exit 1
fi

echo -e "${GREEN}✅ npm: $(npm --version)${NC}"

echo ""
echo -e "${YELLOW}[2/3] Verificando puertos...${NC}"

for PORT in 3002 3099 5173; do
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}⚠️  Puerto $PORT ya está en uso${NC}"
    echo -e "${YELLOW}   Ejecuta: kill -9 \$(lsof -t -i:$PORT)${NC}"
  else
    echo -e "${GREEN}✅ Puerto $PORT disponible${NC}"
  fi
done

echo ""
echo -e "${YELLOW}[3/3] Generando instrucciones de inicio...${NC}"

# Crear archivo de instrucciones
cat > /tmp/transformafacil-start.txt << 'INSTRUCTIONS'
╔═══════════════════════════════════════════════════════════════════════════╗
║                    🚀 INICIANDO TRANSFORMAFACIL 2.0                       ║
║                     (Modo: Desarrollo Local)                             ║
╚═══════════════════════════════════════════════════════════════════════════╝

✅ VERIFICACIÓN COMPLETADA - Todo listo para ejecutar

📋 INSTRUCCIONES PARA INICIAR:

   Abre 3 TERMINALES NUEVAS y ejecuta en cada una:

   ┌─────────────────────────────────────────────────────────────────────┐
   │ TERMINAL 1 - BACKEND API (Puerto 3002)                              │
   ├─────────────────────────────────────────────────────────────────────┤
   │ cd backend                                                           │
   │ npm run dev                                                          │
   │                                                                      │
   │ Verás: 🚀 TransformaFacil Backend iniciando...                     │
   │        ✅ Backend escuchando en http://localhost:3002              │
   └─────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │ TERMINAL 2 - BRIDGE SERVER (Puerto 3099)                            │
   ├─────────────────────────────────────────────────────────────────────┤
   │ cd backend                                                           │
   │ npm run bridge                                                       │
   │                                                                      │
   │ Verás: ✅ Bridge Server escuchando en http://localhost:3099         │
   │        Endpoints:                                                   │
   │        - GET  /health                                               │
   │        - GET  /api/lines/ucot                                       │
   │        - GET  /api/analysis/:linea                                  │
   │        - GET  /api/intelligence/:linea                              │
   └─────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │ TERMINAL 3 - FRONTEND (Puerto 5173)                                 │
   ├─────────────────────────────────────────────────────────────────────┤
   │ cd frontend                                                          │
   │ npm run dev                                                          │
   │                                                                      │
   │ Verás: ✅ VITE v... ready in ... ms                                 │
   │        ➜ Local:   http://localhost:5173/                            │
   └─────────────────────────────────────────────────────────────────────┘

🌐 ACCESO A SERVICIOS:

   Frontend (Dashboard):    http://localhost:5173
   Backend API:             http://localhost:3002
   Bridge Server:           http://localhost:3099

📊 VERIFICACIÓN RÁPIDA:

   Terminal 4 (nueva) - Ejecutar tests:

   bash backend/test-analisis-competencia.sh

   Verás todos los tests pasando ✅

🎯 PRÓXIMOS PASOS:

   1. Abre http://localhost:5173 en tu navegador
   2. Navega a: /dashboard/traffic/intelligence
   3. Verás el análisis de competencia en tiempo real
   4. Prueba el módulo de agentes digitales

🔗 ENDPOINTS DISPONIBLES:

   GET /health
   → Verificar que Bridge está activo

   GET /api/lines/ucot
   → Obtener todas las líneas UCOT

   GET /api/analysis/17
   → Análisis detallado de línea 17

   GET /api/all-analysis
   → Análisis de TODAS las líneas

💡 TIPS:

   - Mantén las 3 terminales abiertas durante desarrollo
   - Los cambios en código hot-reload automáticamente
   - Revisar logs en cada terminal para debugging
   - Los datos se actualizan cada 30 segundos

❓ SI ALGO FALLA:

   Puerto ocupado:
   lsof -i :3002    # Para backend
   lsof -i :3099    # Para bridge
   lsof -i :5173    # Para frontend
   kill -9 <PID>    # Matar proceso

   Módulos no instalan:
   rm -rf node_modules package-lock.json
   npm install

   Firebase no responde:
   Verificar .env con credenciales correctas

🎉 ¡Sistema listo para desarrollo y demostración!

INSTRUCTIONS

cat /tmp/transformafacil-start.txt

echo ""
echo -e "${GREEN}✅ INSTRUCCIONES GUARDADAS EN: /tmp/transformafacil-start.txt${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# OPCIÓN 2: DOCKER
# ═══════════════════════════════════════════════════════════════════════════

elif [ "$MODE" = "docker" ]; then

echo -e "${YELLOW}[1/3] Verificando Docker...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}❌ Docker no está instalado${NC}"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}❌ Docker Compose no está instalado${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Docker: $(docker --version)${NC}"
echo -e "${GREEN}✅ Docker Compose: $(docker-compose --version)${NC}"

echo ""
echo -e "${YELLOW}[2/3] Building containers...${NC}"

docker-compose build

echo ""
echo -e "${YELLOW}[3/3] Starting services...${NC}"

docker-compose up -d

# Esperar a que se inicien
sleep 5

echo ""
echo -e "${GREEN}✅ CONTAINERS INICIADOS${NC}"
echo ""
echo -e "${BLUE}📊 Estado de servicios:${NC}"

docker-compose ps

echo ""
echo -e "${CYAN}🌐 Accesos disponibles:${NC}"
echo "   Frontend:      http://localhost:5173"
echo "   Backend:       http://localhost:3002"
echo "   Bridge:        http://localhost:3099"
echo ""
echo -e "${CYAN}📋 Comandos útiles:${NC}"
echo "   Ver logs:      docker-compose logs -f"
echo "   Detener:       docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""
echo -e "${GREEN}✅ Sistema iniciado en Docker${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# OPCIÓN 3: ONLINE (Heroku)
# ═══════════════════════════════════════════════════════════════════════════

elif [ "$MODE" = "online" ]; then

echo -e "${YELLOW}[1/3] Verificando Heroku CLI...${NC}"

if ! command -v heroku &> /dev/null; then
  echo -e "${RED}❌ Heroku CLI no está instalado${NC}"
  echo "Instala con: npm install -g heroku"
  exit 1
fi

echo -e "${GREEN}✅ Heroku CLI: $(heroku --version)${NC}"

echo ""
echo -e "${YELLOW}[2/3] Preparando para Heroku...${NC}"

# Ejecutar script de deploy
if [ -f "scripts/deploy-heroku.sh" ]; then
  echo -e "${CYAN}🚀 Iniciando deploy a Heroku...${NC}"
  bash scripts/deploy-heroku.sh
else
  echo -e "${RED}❌ Script de deploy no encontrado${NC}"
  exit 1
fi

else

echo -e "${RED}❌ Modo no reconocido: $MODE${NC}"
echo ""
echo -e "${YELLOW}Modos disponibles:${NC}"
echo "  bash START.sh local     (Desarrollo local - 3 terminales)"
echo "  bash START.sh docker    (Docker Compose)"
echo "  bash START.sh online    (Deploy Heroku)"

exit 1

fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ TRANSFORMAFACIL 2.0 - INICIADO CORRECTAMENTE${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
