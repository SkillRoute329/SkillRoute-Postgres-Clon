#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  TransformaFacil 2.0 — Script de Inicio
#  Ejecutar: bash INICIAR.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e

# ── Colores ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'; BOLD='\033[1m'

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_header() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║     TransformaFacil 2.0 — Iniciando Sistema           ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

check_node() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado.${NC}"
    echo "   Descargalo en: https://nodejs.org"
    exit 1
  fi
  echo -e "${GREEN}✅ Node.js $(node --version) detectado${NC}"
}

install_deps() {
  echo -e "${YELLOW}📦 Verificando dependencias...${NC}"
  if [ ! -d "$DIR/backend/node_modules" ]; then
    echo "   Instalando dependencias backend..."
    cd "$DIR/backend" && npm install --silent
  fi
  if [ ! -d "$DIR/frontend/node_modules" ]; then
    echo "   Instalando dependencias frontend..."
    cd "$DIR/frontend" && npm install --silent
  fi
  echo -e "${GREEN}✅ Dependencias OK${NC}"
}

build_backend() {
  echo -e "${YELLOW}🔨 Compilando backend...${NC}"
  cd "$DIR/backend"
  if [ ! -f "dist/bridge-server.js" ]; then
    npm run build --silent
    echo -e "${GREEN}✅ Backend compilado${NC}"
  else
    echo -e "${GREEN}✅ Backend ya compilado${NC}"
  fi
}

build_frontend() {
  echo -e "${YELLOW}🔨 Compilando frontend...${NC}"
  cd "$DIR/frontend"
  if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    npm run build --silent
    echo -e "${GREEN}✅ Frontend compilado${NC}"
  else
    echo -e "${GREEN}✅ Frontend ya compilado${NC}"
  fi
}

wait_for_port() {
  local PORT=$1
  local NAME=$2
  local MAX=20
  local i=0
  while [ $i -lt $MAX ]; do
    if curl -s --max-time 1 http://localhost:$PORT/health > /dev/null 2>&1 ||
       curl -s --max-time 1 http://localhost:$PORT/ > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i+1))
  done
  return 1
}

start_bridge() {
  echo -e "${YELLOW}🌉 Iniciando Bridge Server (puerto 3099)...${NC}"
  cd "$DIR/backend"
  BRIDGE_PORT=3099 node dist/bridge-server.js > /tmp/tf_bridge.log 2>&1 &
  echo $! > /tmp/tf_bridge.pid

  if wait_for_port 3099 "Bridge"; then
    echo -e "${GREEN}✅ Bridge Server activo en http://localhost:3099${NC}"
  else
    echo -e "${RED}❌ Bridge Server no respondió. Ver /tmp/tf_bridge.log${NC}"
    exit 1
  fi
}

start_backend() {
  echo -e "${YELLOW}🚀 Iniciando Backend API (puerto 3002)...${NC}"
  echo -e "   ${YELLOW}(Firebase puede tardar ~15s en inicializar)${NC}"
  cd "$DIR/backend"
  node dist/index.js > /tmp/tf_backend.log 2>&1 &
  echo $! > /tmp/tf_backend.pid

  local MAX=30
  local i=0
  while [ $i -lt $MAX ]; do
    if curl -s --max-time 1 http://localhost:3002/api/health > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Backend API activo en http://localhost:3002${NC}"
      return 0
    fi
    sleep 2
    i=$((i+2))
    echo -ne "   Esperando... ${i}s/${MAX}s\r"
  done
  echo -e "${YELLOW}⚠️  Backend tardó más de ${MAX}s (requiere Firebase real)${NC}"
  echo -e "   El análisis de competencia funciona igual via Bridge Server"
}

serve_frontend() {
  echo -e "${YELLOW}🎨 Iniciando Frontend (puerto 5173)...${NC}"
  # Crear servidor estático simple
  cat > /tmp/tf_serve.js << 'JSEOF'
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = process.env.DIST_DIR || path.join(__dirname, 'frontend/dist');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let file = path.join(DIST, req.url.split('?')[0]);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(5173, '0.0.0.0', () => console.log('Frontend en http://localhost:5173'));
JSEOF

  DIST_DIR="$DIR/frontend/dist" node /tmp/tf_serve.js > /tmp/tf_frontend.log 2>&1 &
  echo $! > /tmp/tf_frontend.pid

  sleep 2
  if curl -s --max-time 2 http://localhost:5173/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend activo en http://localhost:5173${NC}"
  else
    echo -e "${RED}❌ Frontend no respondió. Ver /tmp/tf_frontend.log${NC}"
  fi
}

run_tests() {
  echo ""
  echo -e "${YELLOW}🧪 Verificando análisis de competencia...${NC}"
  UCOT=$(curl -s --max-time 5 http://localhost:3099/api/lines/ucot 2>/dev/null)
  if [ -n "$UCOT" ]; then
    echo -e "${GREEN}✅ Datos UCOT obtenidos correctamente${NC}"
  else
    echo -e "${RED}❌ Error obteniendo datos UCOT${NC}"
  fi
}

print_summary() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  🚀 SISTEMA EN MARCHA${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  🌐 ${BOLD}Frontend:${NC}     http://localhost:5173"
  echo -e "  🌉 ${BOLD}Bridge API:${NC}   http://localhost:3099"
  echo -e "  🚀 ${BOLD}Backend API:${NC}  http://localhost:3002"
  echo ""
  echo -e "  📊 ${BOLD}Análisis:${NC}     http://localhost:3099/api/lines/ucot"
  echo -e "  ❤️  ${BOLD}Health:${NC}       http://localhost:3099/health"
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Para detener: ${YELLOW}bash INICIAR.sh stop${NC}"
  echo ""
}

stop_all() {
  echo -e "${YELLOW}Deteniendo servicios...${NC}"
  for pid_file in /tmp/tf_backend.pid /tmp/tf_bridge.pid /tmp/tf_frontend.pid; do
    [ -f "$pid_file" ] && kill "$(cat $pid_file)" 2>/dev/null && rm -f "$pid_file"
  done
  echo -e "${GREEN}✅ Todos los servicios detenidos${NC}"
  exit 0
}

# ── Main ───────────────────────────────────────────────────────────────────
case "${1:-start}" in
  stop)   stop_all ;;
  start|*)
    print_header
    check_node
    install_deps
    build_backend
    build_frontend
    start_bridge
    start_backend
    serve_frontend
    run_tests
    print_summary
    ;;
esac
