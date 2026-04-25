# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

---

**Última actualización:** 2026-04-25 (segunda iteración del día)

## EN CURSO — bug crítico de bundle

App en producción muestra pantalla "Problemas de Carga / Reparar y Recargar"
en lugar de los módulos. Causa raíz **distinta** del bug de NULs que Code
arregló esta mañana — esto es un problema de bundling Vite.

## CAUSA RAÍZ DEL BUG ACTUAL

`vite.config.ts` tenía estos paquetes en `build.rollupOptions.external`:

```js
external: [
  '@capacitor/core',
  '@capacitor/haptics',
  '@capacitor/status-bar',
  '@capacitor/local-notifications',
  '@capacitor-community/keep-awake',
],
```

Eso le decía a Rollup *"no bundlees estos paquetes"*. En el bundle web, Rollup
dejaba `import "@capacitor/core"` literal. El browser no resuelve bare
specifiers ESM → `TypeError: Failed to resolve module specifier
"@capacitor/core"` → `React failed to mount` → Service Worker fallback muestra
"Problemas de Carga".

`DashboardLayout.tsx` línea 9 importa **eager** `DriverAlertOverlay`, que
importa `useNativeDriverAlerts`, que importa `@capacitor/core`. Como
DashboardLayout envuelve todas las rutas /dashboard/*, el módulo se evalúa
inmediatamente al cargar cualquier vista del sistema.

El externalize tenía sentido conceptual para una APK Capacitor (los plugins
nativos los provee Java/Swift), pero **`@capacitor/core` es JS puro** que
detecta el entorno (`Capacitor.isNativePlatform()`) y hace fallback gracioso
en web. Siempre tiene que ir bundleado. El externalize aplica solo a plugins
nativos, no al core JS.

## CAMBIO YA APLICADO POR COWORK

Editado `frontend/vite.config.ts` líneas 214-221: removidas las 5 entradas
del array `external`, reemplazadas por un comentario explicando el bug.

Verificado:
- Archivo `vite.config.ts` sin NULs (chequeado desde el sandbox).
- Cambio en zona segura para Cowork (archivo de 255 líneas, edit de <10
  líneas — dentro de la regla §10 de CLAUDE.md).

## PRÓXIMO PASO INMEDIATO (Claude Code)

```powershell
# 1. Verificar que el cambio quedó OK
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot
git diff frontend/vite.config.ts
# Debe mostrar: -external: [ '@capacitor/core', ... ]
#               +// No externalizamos los paquetes Capacitor...

# 2. Verificar NULs (este chequeo SÍ es válido desde Code/Windows)
cd frontend\src
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
# Debe imprimir 'Total NULs: 0'. Si imprime mas, restaurar afectados
# desde HEAD antes de seguir.

# 3. Typecheck limpio
cd ..
npx tsc --noEmit --skipLibCheck

# 4. Build limpio
npm run build

# 5. Deploy
cd ..
firebase deploy --only hosting

# 6. Verificación visual
# Abrir https://ucot-gestor-cloud.web.app/dashboard en incognito
# - El sidebar carga normal
# - Click en cualquier modulo del sidebar
# - El modulo renderiza datos reales (no "Error en Modulo", no "Problemas de Carga")
# Probar al menos: CEO Dashboard V7, Cartones, Personal, ShadowRadar.

# 7. Commit
git add frontend/vite.config.ts CLAUDE.md docs/SESION_ACTUAL.md docs/DIAGNOSTICO_NUL_2026_04_25.md
git commit -m "fix(build): bundle capacitor packages in web build instead of externalizing

Root cause of 'Problemas de Carga' affecting all routes: vite.config.ts had
@capacitor/core (and 4 other capacitor packages) in rollupOptions.external,
which left bare specifier 'import @capacitor/core' in the web bundle.
Browser cannot resolve bare specifiers in ESM, threw TypeError, React failed
to mount, Service Worker showed offline fallback.

DashboardLayout eagerly imports DriverAlertOverlay -> useNativeDriverAlerts
-> @capacitor/core, so every /dashboard/* route triggered the failure.

@capacitor/core is JS-only and detects environment at runtime; always
bundle in web builds. Externalize only applies to native Java/Swift plugins
inside an actual APK, not to the JS layer.

Also documents in CLAUDE.md section 10 that NUL-byte profilactic check
produces false positives when run from Cowork sandbox (mount layer
corruption); must be run from Claude Code/Windows native only."

git push

# 8. Confirmar en produccion
# Esperar 1-2 min al cache-bust y refrescar incognito.
# Reportar a Jonathan si todo OK o que fallo.
```

## SI ALGO FALLA

- Si `tsc --noEmit` tira errores, NO commitear, escribir "## NOTA DE
  JONATHAN" arriba de SESION_ACTUAL.md describiendo el error.
- Si el build falla, mismo protocolo.
- Si después del deploy la app sigue mostrando "Problemas de Carga", limpiar
  caché del browser (Ctrl+Shift+R en incógnito) y verificar que el bundle
  servido tenga timestamp nuevo (`document.scripts[0].src` debe traer un
  número distinto al `1777096526852` actual).

## DECISIÓN OPERATIVA TOMADA EN ESTA ITERACIÓN

CLAUDE.md §10 actualizado: el chequeo de NULs se corre **exclusivamente
desde Claude Code (Windows nativo)**, no desde Cowork. La capa de mount entre
sandbox y Windows inyecta NULs al leer archivos grandes, generando falsos
positivos sistemáticos. Confirmado contrastando: Code reporta "0 NULs en src"
después de deploy exitoso; Cowork sobre los mismos archivos reporta >6000
NULs minutos después. Los archivos en Windows real están sanos.

## BACKLOG

- **Auditoría funcional para pitch CUTCSA** (PDF + Excel + carpeta
  evidencias). Bloqueada hasta que la app vuelva a renderizar módulos.
  Plan armado en las tasks #62-73 del TodoList.
- #24 Rotar service account key comprometida (acción humana en GCP Console)
- #26 Borrar archivos zombie + limpieza sidebar

## NOTA PARA JONATHAN

Cuando Code termine los 8 pasos y la app vuelva a andar, retomamos
inmediatamente con la auditoría funcional para CUTCSA. El plan completo
está en TodoList.
