#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# hotspots.sh — lista archivos que superan el umbral de tamaño (CONVENCIONES §5)
# ═════════════════════════════════════════════════════════════════════════════
#
# Uso: bash scripts/hotspots.sh
# Exit 0 siempre (informativo).
#
# Pensado para que un agente de IA lo corra al empezar la sesión si va a
# refactorizar o tocar múltiples archivos. La salida le dice qué archivos
# DEBE dividir antes de editar repetidamente.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

echo "═════════════════════════════════════════════════════════"
echo " Hotspots — archivos que exceden límites (CONVENCIONES §5)"
echo "═════════════════════════════════════════════════════════"
echo

check_dir() {
  local base="$1"
  local glob="$2"
  local limit="$3"
  local label="$4"
  local found=0

  while IFS= read -r file; do
    [ -f "$file" ] || continue
    lines=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$limit" ]; then
      if [ "$found" -eq 0 ]; then
        echo -e "${BLUE}▶ $label (límite: $limit líneas)${NC}"
        found=1
      fi
      color="$YELLOW"
      [ "$lines" -gt $((limit * 2)) ] && color="$RED"
      rel=${file#$ROOT/}
      printf "  ${color}%-8s${NC}  %s\n" "$lines" "$rel"
    fi
  done < <(find "$base" -type f -name "$glob" 2>/dev/null | grep -v node_modules | grep -v /dist/ | grep -v /lib/ | grep -v /archive/ | sort)

  if [ "$found" -eq 1 ]; then echo; fi
}

# Páginas React (límite 250)
check_dir "$ROOT/frontend/src/pages" "*.tsx" 250 "Páginas React"
check_dir "$ROOT/frontend/src/features" "*.tsx" 250 "Páginas de features"

# Componentes React (límite 150)
check_dir "$ROOT/frontend/src/components" "*.tsx" 150 "Componentes React"

# Servicios (límite 300)
check_dir "$ROOT/frontend/src/services" "*.ts" 300 "Servicios frontend"

# Cloud Function handlers (límite 400)
check_dir "$ROOT/functions/src/api" "*.ts" 400 "Cloud Function handlers"
check_dir "$ROOT/functions/src/publishers" "*.ts" 400 "Publishers (GTFS-RT/SIRI)"
check_dir "$ROOT/functions/src" "*.ts" 400 "Cloud Functions top-level"

echo "═════════════════════════════════════════════════════════"
echo -e "${GREEN}Acción recomendada${NC}: si vas a editar un archivo >400 líneas más"
echo "de una vez en esta sesión, dividilo ANTES (ADR 002, ADR 003)."
echo "Ejemplo de patrón: extraer handlers por dominio a api/<dominio>.ts"
echo "y registrarlos desde el archivo original con registerXxxRoutes(app)."
