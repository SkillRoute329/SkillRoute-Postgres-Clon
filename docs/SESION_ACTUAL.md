# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

> **Para Claude (cualquier sesión nueva)**: este archivo es lo SEGUNDO que lees después de `CLAUDE.md`. Acá está dónde se quedó la sesión previa, qué decisiones se tomaron pendientes de implementar, y cuál es el próximo paso concreto. Antes de cerrar tu sesión, actualizalo con los nuevos pendientes.

> **Para Jonathan**: este archivo se actualiza automáticamente al final de cada sesión productiva. No lo borres ni lo edites manualmente — Claude lo gestiona.

**Última actualización:** 2026-04-24, sesión Claude/Cowork

---

## 🎯 EN CURSO

### Refactor cross-operador del CEO Dashboard
**Archivo:** `frontend/src/pages/traffic/CEODashboard.tsx` (1.467 líneas)

**Estado:** 0% — plan acordado, no se tocó código todavía.

**Por qué:** dashboard hoy es UCOT-only, viola la directriz "Alcance del producto" (CLAUDE.md líneas 189+). Mezcla KPIs estratégicos del sistema con integraciones operativas internas de UCOT. Se siente confuso para un directivo no-UCOT.

**Plan acordado con Jonathan (sesión 2026-04-24):**

Edits identificados con `grep` sobre el archivo:

1. **Constantes + state** (después de imports, alrededor de línea 80-100):
   - `EMPRESAS_OPCIONES = [{ codigo: 70, label: "UCOT" }, { codigo: 50, label: "CUTCSA" }, { codigo: 20, label: "COME" }, { codigo: 10, label: "COETC" }]`
   - `useState empresaPropia: number = 70`
   - `empresaLabel = EMPRESAS_OPCIONES.find(e => e.codigo === empresaPropia)?.label ?? "Propia"`

2. **Línea 261** (fetchData filter):
   - antes: `f.properties?.codigoEmpresa === 70`
   - después: `f.properties?.codigoEmpresa === empresaPropia`

3. **Líneas 263 y 268** — quitar el hardcode `185`:
   - `total = ucotEnVivoGPS > 0 ? ucotEnVivoGPS : Math.max(vehicles.length, 0)`
   - El comentario "// 185 = flota UCOT real" desaparece.

4. **Header del JSX** — agregar `<select>` de empresa propia, mismo estilo que el de `ShadowRadar.tsx` (`bg-slate-950 border-blue-500/60 rounded-lg px-3 py-2.5`).

5. **Línea 809** — texto:
   - antes: `"ventaja competitiva de UCOT"`
   - después: `` `ventaja competitiva de ${empresaLabel}` ``

6. **Línea 1303** — texto:
   - antes: `"Rendimiento por Línea UCOT"`
   - después: `` `Rendimiento por Línea ${empresaLabel}` ``

7. **Sección Portal UCOT** (líneas ~418 y 1047-1089):
   - Envolver en `{empresaPropia === 70 && (...)}` con un `<section>` wrapper
   - Título nuevo: "Integraciones UCOT (disponibles sólo para este operador)"
   - Las otras 3 empresas no tienen portal JSF equivalente todavía.

8. **CompetitorThreatWidget** (línea ~219):
   - Si acepta prop `empresaPropia`, pasársela.
   - Si no, leer su archivo `frontend/src/components/CompetitorThreatWidget.tsx` y agregar el prop.

**Reglas de ejecución:**
- Archivo grande (1.467 líneas) → **Python atomic write con `os.replace(tmp, path)` para todos los edits >50 líneas**. Edits chicos (<20 líneas) pueden ser `Edit` tool pero verificando con `bash scripts/check_integrity.sh` después de cada uno.
- Después de cada edit estructural: `cd frontend && npx tsc --noEmit 2>&1 | grep "ShadowRadar"` (cero errores).
- **Verificación final** (directriz 7 de CLAUDE.md): `bash scripts/check_integrity.sh` + Claude in Chrome navegando a `/dashboard/traffic/ceo`, cambiando entre las 4 empresas con el selector y confirmando:
  - Los KPIs cambian según empresa
  - El bloque "Portal UCOT" desaparece cuando empresaPropia ≠ 70
  - Los textos `${empresaLabel}` se sustituyen correctamente
- Cuando termines, dejar el archivo listo para commit pero **sin commitear** — Jonathan committea desde Claude Code (el sandbox no puede tocar `.git/index.lock`).

---

## 📋 PRÓXIMO PASO INMEDIATO

Arrancar el refactor del CEO Dashboard según el plan de arriba. El primer edit es agregar las constantes + state (paso 1) — es el más chico y prepara el terreno para los demás.

---

## 🔮 BACKLOG DE PRÓXIMAS SESIONES

En orden de prioridad acordado:

1. **CEO Dashboard cross-operador** ← (esta sesión)
2. **Driver app UI para ACK de FCM** — cuando llega push, mostrar modal con botón "RECIBIDO" → llama a `acknowledgeAlerta` endpoint (ya existe en backend desde 2026-04-24).
3. **ShadowRadar UI: mostrar estado ACK** — icono ✓ en alertas reconocidas + response_time_sec. Query simple sobre `ack_at`.
4. **ShadowAnalytics: tab "ACK Performance"** — `ack_rate` y `avg_response_time_sec` por línea/conductor. KPI de eficiencia operativa.
5. **Bug "Document already exists"** — el frontend ShadowRadar usa `addDoc` que a veces colisiona con el backend `shadowDispatcher`. Solución: migrar a `setDoc` con ID determinístico tipo `${empresaPropia}_${coche}_${rival}_${Math.floor(Date.now()/(5*60*1000))}` (una alerta cada 5 min máx por par).
6. **Verificar que los 3 archivos legacy se borraron de git** — `OperationsIntelligenceHub.tsx`, `LiveMapPage.tsx`, `ServiceStatistics.tsx`. El sandbox no pudo borrarlos por permisos del mount; Claude Code en Windows debe haberlo hecho en el último commit. Si no, ejecutar `git rm` desde Claude Code.

---

## 🐛 BUGS CONOCIDOS Y NO CRÍTICOS

- **Document already exists** en `alertas_regulacion`: aparece como warning en consola del browser, ~100 veces por sesión activa de ShadowRadar. No rompe nada (el throttle dispatchedRef previene la mayoría), pero ensucia los logs. Detalle en backlog item #5.
- **Sesión auth se pierde con reloads** en localhost: probablemente normal en dev (cookie de Firebase Auth puede caducar rápido), no se observa en producción. Si molesta, revisar `frontend/src/context/AuthContext.tsx` y `tf_user` localStorage handling.

---

## 📌 DECISIONES OPERATIVAS DE LA SESIÓN PREVIA

(2026-04-24, ordenadas cronológicamente)

- **Priorizamos** el aprolijamiento del módulo "Inteligencia Operativa" antes del refactor del CEO porque el sidebar abarrotado rompía la sensación "Optibus/Swiftly" del producto.
- **Dividimos** el sidebar en 3 bloques con identidad: INTELIGENCIA DE RED · OPERACIÓN TÁCTICA · ANÁLISIS FINANCIERO.
- **Borramos** 3 archivos legacy con redirects para no romper bookmarks: `OperationsIntelligenceHub`, `LiveMapPage`, `ServiceStatistics`.
- **Renombramos** "Estadísticas Automáticas" → "Cumplimiento Horario" (describe mejor: GPS+GTFS sin inspectores).
- **Movimos a Admin**: "Referencia BRT 2027" y "Monitor Ingesta STM" porque no son inteligencia operativa propiamente dicha.
- **Agregamos directriz nueva a CLAUDE.md**: "Nivel internacional por defecto" (pregunta canónica antes de cerrar feature: ¿cómo lo hace Optibus/Swiftly/Remix/TfL/RATP?).
- **No tocamos hoy** el CEO Dashboard porque el archivo es 1.467 líneas y la sesión ya tenía 4 truncamientos sufridos. Lo dejamos para sesión fresca.

---

## ⚙️ RECORDATORIOS DE PROCESO

- Nunca hacer `git commit` desde el sandbox — `.git/index.lock` está colgado del lado Windows. Jonathan committea desde Claude Code, donde sí funciona.
- Para edits sobre archivos >500 líneas: **Python atomic write** (`os.replace(tmp, path)`). Patrón documentado en CLAUDE.md líneas 96-100.
- Antes de decir "listo" o cerrar sesión: **siempre** correr `bash scripts/check_integrity.sh`. Exit 0 = OK.
- Verificación funcional (directriz 7) la hace Claude, no Jonathan. Browser via Claude in Chrome MCP.
