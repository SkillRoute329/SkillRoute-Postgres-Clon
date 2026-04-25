# Diagnóstico Crítico — Bug ErrorBoundary global
> **Fecha:** 2026-04-25
> **Reportado por:** Jonathan (todos los módulos caen en RouteErrorBoundary)
> **Diagnosticado por:** Cowork Claude
> **Estado:** Pendiente de reparación por Claude Code

## Causa raíz confirmada

11 archivos `.tsx` del frontend contienen **bytes NUL (`\x00`)** dentro del
código fuente. Esto rompe el parser de Vite/esbuild, deja el bundle deployado
con `SyntaxError`, y al hacer lazy-import de cualquier módulo el chunk
compartido falla → `RouteErrorBoundary` captura el error y muestra el mensaje
genérico "Error en Módulo" para todas las rutas afectadas.

Sintoma reportado: cualquier módulo que el usuario abre muestra el error de
ErrorBoundary. Sidebar y header siguen vivos porque están afuera del boundary.

## Inventario de archivos a reparar

| Archivo | NUL bytes | Tamaño | Severidad |
|---|---:|---:|---|
| `frontend/src/pages/fleet/VehicleList.tsx` | **2725** | 33830 | 🔴 Masivamente roto |
| `frontend/src/pages/traffic/ListeroModule.tsx` | **2626** | 38902 | 🔴 Masivamente roto |
| `frontend/src/pages/admin/Employees.tsx` | 259 | 15536 | 🟠 Severo |
| `frontend/src/pages/traffic/IncidentCommandCenter.tsx` | 180 | 17204 | 🟠 Severo |
| `frontend/src/pages/admin/AdminShifts.tsx` | 169 | 17685 | 🟠 Severo |
| `frontend/src/pages/traffic/ContingencyManagementPage.tsx` | 163 | 19650 | 🟠 Severo |
| `frontend/src/pages/traffic/RotationMatrix.tsx` | 84 | 21495 | 🟡 Moderado |
| `frontend/src/pages/operations/InspectorDashboard.tsx` | 33 | 25038 | 🟡 Moderado |
| `frontend/src/pages/traffic/CEODashboardV7.tsx` | 32 | 65493 | 🟡 Moderado |
| `frontend/src/pages/traffic/InspectorCapture.tsx` | 24 | 29844 | 🟡 Moderado |
| `frontend/src/pages/admin/rrhh/FeriadosPage.tsx` | 2 | 8743 | 🟢 Leve |

**Total NUL bytes a remover:** 6297 bytes en 11 archivos.

## Plan de reparación recomendado para Claude Code

### Estrategia A — Restaurar desde git (preferida, si hay commit limpio)

Para cada archivo, intentar:

```bash
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot
# Verificar si la versión en HEAD está limpia
git show HEAD:frontend/src/pages/fleet/VehicleList.tsx | grep -c $'\0'
# Si devuelve 0 (sin NULs), restaurar:
git checkout HEAD -- frontend/src/pages/fleet/VehicleList.tsx
```

Aplicar a los 11. Si la versión committeada también tiene NULs, ir a estrategia B.

### Estrategia B — Limpieza programática + verificación TS

Para cada archivo con NULs:

```python
# Python atomic write — preferido para archivos grandes
import os
path = 'frontend/src/pages/fleet/VehicleList.tsx'
with open(path, 'rb') as f:
    data = f.read()
clean = data.replace(b'\x00', b'')
tmp = path + '.tmp'
with open(tmp, 'wb') as f:
    f.write(clean)
os.replace(tmp, path)
```

⚠️ **Riesgo:** quitar los NUL bytes puede dejar líneas truncadas si el NUL
estaba en medio de un identificador o expresión. Después de limpiar:

1. Correr `npx tsc --noEmit` desde `frontend/` y revisar errores.
2. Para cada archivo limpiado, hacer `git diff` contra HEAD para ver si la
   limpieza simplemente recuperó el archivo o si dejó código truncado.
3. Los archivos con MUCHOS NUL (VehicleList, ListeroModule) muy probablemente
   van a necesitar reconstrucción desde la versión committeada — no alcanza
   con quitar los NULs.

### Estrategia C — Hibrida (recomendada para los 2 archivos masivos)

Para `VehicleList.tsx` (2725 NULs) y `ListeroModule.tsx` (2626 NULs):
restaurar desde git. Si HEAD también está corrupto, mirar `git log -p` para
encontrar el último commit limpio y hacer `git checkout <sha> -- <archivo>`.

Para los otros 9 archivos: Estrategia B (limpieza programática + tsc).

## Verificación post-fix

```bash
# 1. Confirmar 0 NULs en src
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend\src
python -c "
import os
total = 0
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root: continue
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            p = os.path.join(root, f)
            n = open(p, 'rb').read().count(b'\x00')
            if n: print(p, n); total += n
print('Total NULs:', total)
"

# 2. Typecheck limpio
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend
npx tsc --noEmit --skipLibCheck

# 3. Build limpio
npm run build

# 4. Integrity script
cd ..
bash scripts/check_integrity.sh
```

Solo deployar si los 4 pasos retornan exit 0 y sin NULs.

## Mensaje de commit sugerido

```
fix(frontend): remove NUL bytes from 11 source files breaking lazy imports

Root cause of "Error en Módulo" affecting all routes: 11 .tsx files had
NUL bytes (\x00) embedded in source from interrupted writes. Vite emitted
a corrupt bundle, lazy chunks failed to evaluate at runtime, and
RouteErrorBoundary caught the SyntaxError on every module navigation.

Files repaired (NUL count → 0):
- VehicleList.tsx (2725 NULs)
- ListeroModule.tsx (2626 NULs)
- Employees.tsx (259), IncidentCommandCenter.tsx (180)
- AdminShifts.tsx (169), ContingencyManagementPage.tsx (163)
- RotationMatrix.tsx (84), InspectorDashboard.tsx (33)
- CEODashboardV7.tsx (32), InspectorCapture.tsx (24)
- FeriadosPage.tsx (2)

Verified: tsc --noEmit clean, integrity script clean, build OK.
```

## Causa probable del NUL

Patrón ya documentado en CLAUDE.md §Patrón de truncamiento:
escrituras concurrentes Cowork-sandbox ↔ Windows-mount, o `Edit` de strings
largos sobre archivos grandes. Mitigación a futuro: usar Python atomic write
con `os.replace(tmp, path)` para todos los archivos > 500 líneas.
