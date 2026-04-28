#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# check_integrity.sh — Guardrail anti-truncamiento pre-deploy
# ═════════════════════════════════════════════════════════════════════════════
#
# Uso:  bash scripts/check_integrity.sh
# Exit 0 = OK para deploy. Exit 1 = hay que arreglar algo primero.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo "═════════════════════════════════════════════════════════"
echo " Integridad del código — pre-deploy check"
echo "═════════════════════════════════════════════════════════"
echo

# ─── 1. Bytes null en archivos activos ──────────────────────────────────────
echo -e "${BLUE}▶ Bytes null en archivos TS activos...${NC}"
NULL_HITS=$(python3 - "$ROOT" <<'PYEOF'
import os, sys
root = sys.argv[1]
# Solo los src/ activos — no walk de todo el repo (tarda mucho por node_modules)
ACTIVE_DIRS = [
    os.path.join(root, 'frontend', 'src'),
    os.path.join(root, 'functions', 'src'),
    os.path.join(root, 'backend', 'src'),
]
IGNORE = ('/node_modules/', '/dist/', '/lib/', '/build/', '/.git/')
hits = []
for base in ACTIVE_DIRS:
    if not os.path.isdir(base):
        continue
    for dp, dn, fn in os.walk(base):
        # Remover dirs ignorados del walk para no recorrerlos
        dn[:] = [d for d in dn if not any(i in os.path.join(dp, d) + '/' for i in IGNORE)]
        for f in fn:
            if not (f.endswith('.ts') or f.endswith('.tsx')):
                continue
            p = os.path.join(dp, f)
            try:
                with open(p, 'rb') as fd:
                    if b'\x00' in fd.read():
                        hits.append(p)
            except Exception:
                pass
for h in hits:
    print(h)
PYEOF
)
if [ -n "$NULL_HITS" ]; then
  echo -e "${RED}  ✘ Con bytes null:${NC}"
  echo "$NULL_HITS" | sed 's|^|    |'
  FAIL=1
else
  echo -e "${GREEN}  ✓ Sin bytes null${NC}"
fi
echo

# ─── 2. Exports críticos en functions/src/index.ts ──────────────────────────
echo -e "${BLUE}▶ Exports críticos en functions/src/index.ts...${NC}"
INDEX="$ROOT/functions/src/index.ts"
MISSING=""
if [ -f "$INDEX" ]; then
  for exp in intelligenceApi gtfsRealtime gtfsStatic siriRealtime systemHealth netexEndpoint refreshCompetidoresTick ingestaIMMTick; do
    if ! grep -q "$exp" "$INDEX"; then
      MISSING="$MISSING  • $exp"$'\n'
    fi
  done
fi
if [ -n "$MISSING" ]; then
  echo -e "${RED}  ✘ FALTANTES:${NC}"
  echo "$MISSING"
  FAIL=1
else
  echo -e "${GREEN}  ✓ Todos presentes${NC}"
fi
echo

# ─── 3. tsc --noEmit — frontend ─────────────────────────────────────────────
if [ -d "$ROOT/frontend/node_modules" ]; then
  echo -e "${BLUE}▶ TypeScript check — frontend...${NC}"
  cd "$ROOT/frontend"
  TSC_OUT=$(timeout 90 npx tsc --noEmit 2>&1 || true)
  ERR_COUNT=$(echo "$TSC_OUT" | grep -cE "^src/.*error TS" || true)
  if [ "$ERR_COUNT" -gt 0 ]; then
    echo -e "${RED}  ✘ $ERR_COUNT error(es):${NC}"
    echo "$TSC_OUT" | grep -E "^src/.*error TS" | head -8 | sed 's|^|    |'
    FAIL=1
  else
    echo -e "${GREEN}  ✓ 0 errores${NC}"
  fi
  cd "$ROOT"
else
  echo -e "${YELLOW}  ⚠ frontend/node_modules no existe — saltando${NC}"
fi
echo

# ─── 4. tsc --noEmit — functions ────────────────────────────────────────────
if [ -d "$ROOT/functions/node_modules" ]; then
  echo -e "${BLUE}▶ TypeScript check — functions...${NC}"
  cd "$ROOT/functions"
  TSC_OUT=$(timeout 90 npx tsc --noEmit 2>&1 || true)
  ERR_COUNT=$(echo "$TSC_OUT" | grep -E "^src/.*error TS" | grep -cv "node_modules" || true)
  if [ "$ERR_COUNT" -gt 0 ]; then
    echo -e "${RED}  ✘ $ERR_COUNT error(es):${NC}"
    echo "$TSC_OUT" | grep -E "^src/.*error TS" | grep -v "node_modules" | head -8 | sed 's|^|    |'
    FAIL=1
  else
    echo -e "${GREEN}  ✓ 0 errores${NC}"
  fi
  cd "$ROOT"
else
  echo -e "${YELLOW}  ⚠ functions/node_modules no existe — saltando${NC}"
fi
echo

# ─── RESULTADO ──────────────────────────────────────────────────────────────
echo "═════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN} ✓ INTEGRIDAD OK — listo para deploy${NC}"
  exit 0
else
  echo -e "${RED} ✘ PROBLEMAS DETECTADOS — NO desplegar sin arreglar${NC}"
  exit 1
fi
