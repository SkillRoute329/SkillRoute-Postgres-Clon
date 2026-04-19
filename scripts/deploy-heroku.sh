#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# DEPLOY HEROKU - TransformaFacil 2.0
# ═══════════════════════════════════════════════════════════════════════════
# Requisitos: heroku CLI instalado
# Uso: bash scripts/deploy-heroku.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 DEPLOY HEROKU - TransformaFacil 2.0${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# ───────────────────────────────────────────────────────────────────────────
# Verificar prerrequisitos
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[1/6] Verificando prerrequisitos...${NC}"

if ! command -v heroku &> /dev/null; then
  echo -e "${RED}❌ Heroku CLI no está instalado${NC}"
  echo "Instala con: npm install -g heroku"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo -e "${RED}❌ Git no está instalado${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Heroku CLI y Git disponibles${NC}"
echo ""

# ───────────────────────────────────────────────────────────────────────────
# Login a Heroku
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[2/6] Autenticando con Heroku...${NC}"
heroku login
echo ""

# ───────────────────────────────────────────────────────────────────────────
# Crear aplicaciones (una por servicio)
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[3/6] Creando aplicaciones en Heroku...${NC}"

# Backend API
echo -e "${GREEN}  Creando transformafacil-api...${NC}"
heroku create transformafacil-api --buildpack heroku/nodejs || true

# Bridge Server
echo -e "${GREEN}  Creando transformafacil-bridge...${NC}"
heroku create transformafacil-bridge --buildpack heroku/nodejs || true

# Frontend
echo -e "${GREEN}  Creando transformafacil-web...${NC}"
heroku create transformafacil-web --buildpack heroku/nodejs || true

echo ""

# ───────────────────────────────────────────────────────────────────────────
# Configurar variables de entorno
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[4/6] Configurando variables de entorno...${NC}"

read -p "Ingresa Firebase Private Key: " FIREBASE_KEY
read -p "Ingresa Firebase Client Email: " FIREBASE_EMAIL
read -p "Ingresa JWT Secret: " JWT_SECRET

# Backend
heroku config:set -a transformafacil-api \
  NODE_ENV=production \
  FIREBASE_PRIVATE_KEY="$FIREBASE_KEY" \
  FIREBASE_CLIENT_EMAIL="$FIREBASE_EMAIL" \
  JWT_SECRET="$JWT_SECRET" \
  BACKEND_URL=https://transformafacil-api.herokuapp.com \
  BRIDGE_URL=https://transformafacil-bridge.herokuapp.com \
  FRONTEND_URL=https://transformafacil-web.herokuapp.com

# Bridge
heroku config:set -a transformafacil-bridge \
  NODE_ENV=production \
  BRIDGE_PORT=3099 \
  BACKEND_URL=https://transformafacil-api.herokuapp.com

# Frontend
heroku config:set -a transformafacil-web \
  VITE_API_URL=https://transformafacil-bridge.herokuapp.com \
  VITE_BACKEND_URL=https://transformafacil-api.herokuapp.com

echo ""

# ───────────────────────────────────────────────────────────────────────────
# Agregar remotes de git
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[5/6] Configurando remotes de Git...${NC}"

git remote add heroku-api https://git.heroku.com/transformafacil-api.git || true
git remote add heroku-bridge https://git.heroku.com/transformafacil-bridge.git || true
git remote add heroku-web https://git.heroku.com/transformafacil-web.git || true

echo ""

# ───────────────────────────────────────────────────────────────────────────
# Deploy
# ───────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}[6/6] Deployando a Heroku...${NC}"

echo -e "${GREEN}  Deployando Backend API...${NC}"
git push heroku-api main:main

echo -e "${GREEN}  Deployando Bridge Server...${NC}"
git push heroku-bridge main:main

echo -e "${GREEN}  Deployando Frontend...${NC}"
git push heroku-web main:main

echo ""

# ───────────────────────────────────────────────────────────────────────────
# Resumen
# ───────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DEPLOY HEROKU COMPLETADO${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}URLs en producción:${NC}"
echo "  🎨 Frontend:      https://transformafacil-web.herokuapp.com"
echo "  🔌 Backend API:   https://transformafacil-api.herokuapp.com"
echo "  🌉 Bridge Server: https://transformafacil-bridge.herokuapp.com"
echo ""
echo -e "${YELLOW}Comandos útiles:${NC}"
echo "  Ver logs:    heroku logs -a transformafacil-api -f"
echo "  Ver config:  heroku config -a transformafacil-api"
echo "  Restart:     heroku restart -a transformafacil-api"
echo ""
