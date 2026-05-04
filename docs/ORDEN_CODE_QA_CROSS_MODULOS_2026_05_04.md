# ORDEN CODE — QA cross-módulos: bug auth sistémico + hardcodes operador

**Fecha:** 2026-05-04 — post-demo CUTCSA
**Modelo recomendado:** Opus (decisión arquitectónica de auth + cambios cross-archivo)
**Severidad:** ALTA — sin estos fixes, el producto NO se puede mostrar a CUTCSA, COME ni COETC: las pantallas más importantes (Centro de Mando, Inteligencia Cross-Op, Radar de Competencia) muestran 0 datos por bug de auth, y el resto hardcodea "UCOT" en títulos y queries.

---

## Contexto

Cowork hizo QA visual de los 10 módulos del sidebar y mapeo del código (Explore agent). Se detectaron 2 problemas sistémicos:

1. **Bug auth raíz** que ya documentamos en sesiones previas pero quedó sin resolver: el login custom de SkillRoute (`localStorage.tf_user`) NO genera `Firebase Auth` real (`firebaseLocalStorageDb` está vacío). Por eso TODA query con `where('agencyId', ...)` o regla `if isAuthenticated()` devuelve `permission-denied` silencioso.
2. **Hardcodes "UCOT" / "70"** en títulos visuales y en queries, lo que hace imposible mostrar el producto correctamente a otro operador aunque cambien `empresaPropia`.

---

## Estado por módulo (verificación visual en producción 2026-05-04 ~13:00 UY)

| # | Módulo | Ruta | Estado |
|---|---|---|---|
| 1 | Vista General | `/dashboard` | ✅ Funciona — 1264 buses metropolitanos coherentes |
| 2 | Planificación | `/dashboard/traffic/planificacion` | 🟡 KPIs OK pero "Sin datos GTFS para UCOT" — investigar import |
| 3 | Listero y Distribución | `/dashboard/traffic/listero` | 🟠 Funciona vacío. Hardcode "UCOT — Terminal Listero" |
| 4 | Navegador | `/dashboard/traffic/navigation` | 🟠 Funciona. Hardcode "Navegador — UCOT" |
| 5 | Turno en Vivo | `/dashboard/traffic/centro-turno` | 🔴 COCHES ACTIVOS=0 (bug auth), DESVÍOS SIN RESOLVER=12 ✓ |
| 6 | Posición de Flota | `/dashboard/traffic/fleet-monitor` | ✅ EXCELENTE — 112 UCOT + 1016 rivales + mapa cargado. Hardcode menor: título "— UCOT" |
| 7 | Cumplimiento | `/dashboard/traffic/diagnostico-cumplimiento` | ✅ OK (cerrado en BRIDGE-027/028/029) |
| 8 | Incidencias | `/dashboard/traffic/incidents` | 🟡 No verificado en este QA — pendiente |
| 9 | Centro de Mando | `/dashboard/super-admin/centro-mando` | 🔴 BUG GRAVE — 0 buses, 0 alertas, "Sin datos" en TODOS los operadores. 144 errores `permission-denied` en consola |
| 10 | Radar de Competencia | `/dashboard/traffic/shadow-radar` | 🔴 UCOT EN CALLE=0 con 64 buses en cabecera. Hardcodes UCOT múltiples |
| 11 | Inteligencia Cross-Op | `/dashboard/traffic/corridor-intelligence` | 🔴 "No se pudo cargar la colección corridor_overlap" — bug auth |

---

## Fix 1 — Bug auth raíz (RECOMENDADO, resuelve 4-5 módulos de un solo cambio)

### Diagnóstico

`localStorage.tf_user` se llena al login custom de la app pero `getAuth().currentUser` es `null`. Toda regla Firestore con `request.auth != null` falla.

### Solución profesional: `signInWithCustomToken`

Backend: cuando el usuario hace login custom (POST `/api/auth/login` o donde sea), devolver además un **Firebase Custom Token** generado con Admin SDK:

```ts
// functions/src/api/auth.ts (o donde se haga el login custom)
import * as admin from 'firebase-admin';

// Después de validar credenciales y obtener uid del usuario:
const customToken = await admin.auth().createCustomToken(uid, {
  role: user.role,             // 'superadmin', 'admin', 'traffic', etc.
  agencyId: user.agencyId,     // '70', '50', etc.
});
res.json({
  ok: true,
  user: { uid, role, agencyId, ... },
  firebaseCustomToken: customToken,
});
```

Frontend: cuando recibís la respuesta del login, hacer `signInWithCustomToken`:

```ts
// frontend/src/services/authService.ts (o donde se procese login)
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../config/firebase';

// Después de POST /api/auth/login:
const { user, firebaseCustomToken } = response.data;
localStorage.setItem('tf_user', JSON.stringify(user));
if (firebaseCustomToken) {
  await signInWithCustomToken(auth, firebaseCustomToken);
}
// Ahora getAuth().currentUser tiene el user real → todas las rules pasan.
```

### Reglas Firestore — revertir las "lectura pública" temporales

Una vez que el auth esté corregido, revertir:
- `vehicle_events` → de `allow read: if true` a `allow read: if isAuthenticated()` (datos sensibles operacionales)
- `corridor_overlap` → mantener `if isAuthenticated()` (datos de competencia)
- `gtfs_timetable`, `gtfs_stops`, `horarios_stm` → mantener `if true` (son públicos del IMM oficial, no requieren proteger)

### Test

1. Login con SuperAdmin → `getAuth().currentUser?.uid` debe ser distinto de null.
2. Centro de Mando: BUSES ACTIVOS > 0, OPERADORES con datos.
3. Inteligencia Cross-Op: `corridor_overlap` carga.
4. Radar de Competencia: UCOT EN CALLE > 0.

---

## Fix 2 — Hardcodes "UCOT" / "70"

### Lista exacta a corregir

| Archivo | Línea | Cambio |
|---|---|---|
| `frontend/src/pages/traffic/ShadowRadar.tsx` | 351 | `where('agencyId','==','70')` → `where('agencyId','==',String(empresaPropia))` |
| `frontend/src/pages/traffic/ShadowRadar.tsx` | header subtítulo | `"Detecta coches UCOT en la calle..."` → `"Detecta coches de {operador} en la calle..."` (operador derivado de `useEmpresaPropia`) |
| `frontend/src/pages/traffic/ShadowRadar.tsx` | sección "Emparejamiento UCOT vs Competencia" | reemplazar UCOT por nombre dinámico |
| `frontend/src/pages/traffic/MapaFlotaHub.tsx` (o FleetMonitorModule) | título "Radar de Flota en Vivo — UCOT" | dinámico desde `empresaPropia` |
| `frontend/src/pages/traffic/ListeroHub.tsx` o `TerminalListero.tsx` | "UCOT — Terminal Listero" | dinámico |
| `frontend/src/pages/traffic/NavigationModule.tsx` | "Navegador — UCOT" | dinámico |
| `frontend/src/pages/traffic/PlanificacionHub.tsx` | L72-79 EmpresaGuard hardcode `empresaId === '70'` | acepta cualquier operador |
| `frontend/src/pages/traffic/CentroMandoUnificado.tsx` | L94-135 array EMPRESAS hardcoded | OK que esté hardcoded (los 4 operadores son fijos), pero verificar que las queries filtran por agencyId actual |

### Patrón sugerido

```tsx
// Hook ya existente (verificar que tenga el campo .label o .nombre)
import { useEmpresaPropia } from '../../hooks/useEmpresaPropia';

function MyComponent() {
  const { empresaPropia, empresaPropiaCfg } = useEmpresaPropia();
  // empresaPropia: 70 | 50 | 20 | 10
  // empresaPropiaCfg.nombre: 'UCOT' | 'CUTCSA' | ...

  return <h1>Radar de Flota en Vivo — {empresaPropiaCfg.nombre}</h1>;
}
```

Si el hook no devuelve `nombre`, usar:
```ts
const NOMBRES = { '70':'UCOT','50':'CUTCSA','20':'COME','10':'COETC' };
const nombreOp = NOMBRES[String(empresaPropia)] ?? `Op ${empresaPropia}`;
```

---

## Fix 3 — `Sin datos GTFS para UCOT — HABIL` en Planificación

### Síntoma
Tab "Vista del Día" de Planificación muestra "Sin datos GTFS para UCOT — HABIL" pero `gtfs_timetable` SÍ tiene UCOT (verificado: 70_306_0_HABIL existe con 90 viajes).

### Hipótesis
El componente lee de OTRA colección (probablemente `gtfs_servicios`, `servicios_planificados` o `viajes_planificados`) que está vacía o requiere import previo. **Acción**: ubicar el query en `frontend/src/pages/traffic/planificacion/VistaDia.tsx` o similar y reportar qué colección consulta.

---

## Casos de prueba (mínimo)

```ts
// Test 1: signInWithCustomToken funcional
test('login genera firebase auth session', async () => {
  await loginCustom('superadmin', 'password');
  expect(auth.currentUser).not.toBeNull();
  expect(auth.currentUser?.uid).toBe('329');
});

// Test 2: Centro de Mando carga buses
test('CentroMando shows buses for all operators', async () => {
  render(<CentroMandoUnificado />);
  await waitFor(() => {
    expect(screen.queryByText('Sin datos')).toBeNull(); // todos los operadores muestran datos
    expect(screen.getByText(/^[1-9]\d*$/)).toBeInTheDocument(); // al menos 1 bus
  });
});

// Test 3: Hardcodes resueltos
test('ShadowRadar header is dynamic', () => {
  const { rerender } = render(<ShadowRadar />, { empresaPropia: 50 });
  expect(screen.getByText(/Detecta coches de CUTCSA/)).toBeInTheDocument();
  rerender(<ShadowRadar />, { empresaPropia: 70 });
  expect(screen.getByText(/Detecta coches de UCOT/)).toBeInTheDocument();
});
```

---

## No-regresión

Antes de cada commit:
- `npx tsc --noEmit --skipLibCheck` 0 errores
- Verificación visual:
  - Cumplimiento (ya OK) sigue OK
  - Posición de Flota (ya OK) sigue OK
  - Vista General sigue OK
- Verificación funcional cross-operador (CRÍTICO):
  - Cambiar `empresaPropia` a CUTCSA (50) → cabeceras y queries reflejan CUTCSA
  - Cambiar a COME (20) → ídem
  - Cambiar a COETC (10) → ídem

---

## Acción Code (orden sugerido)

```powershell
# Paso 1 — Fix 1 (auth) — el más impactante
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot

# Backend: agregar generación de custom token en endpoint de login
# Editar functions/src/api/auth.ts (o donde sea)
cd functions
npm run build
firebase deploy --only functions:api --project ucot-gestor-cloud

# Frontend: signInWithCustomToken en authService
cd ../frontend
# editar authService o equivalente
npx tsc --noEmit --skipLibCheck
npm run build
firebase deploy --only hosting --project ucot-gestor-cloud

# Verificar visual: Centro de Mando + Inteligencia Cross-Op + ShadowRadar.
# Esperado: ya cargan datos.

# Paso 2 — Fix 2 (hardcodes UCOT) — varios archivos
# Editar 6-7 archivos según lista.
npx tsc --noEmit --skipLibCheck
npm run build
firebase deploy --only hosting

# Verificar visual: cambiar localStorage empresaPropia a CUTCSA y validar que TODO refleje CUTCSA.

# Paso 3 — Fix 3 (Planificación) — investigación + posible fix de import GTFS
# Reportar al bridge si requiere acción separada.

# Commit todo
git add functions/ frontend/src/ docs/ORDEN_CODE_QA_CROSS_MODULOS_2026_05_04.md cowork-tools/bridge/inbox.md

git commit -m "fix(qa-cross-modulos): auth con signInWithCustomToken + remover hardcodes UCOT

(1) Auth: el login custom ahora genera Firebase Custom Token via admin
SDK y el frontend hace signInWithCustomToken. Resuelve el bug raíz que
hacía que TODA query con isAuthenticated() devolviera permission-denied
en Centro de Mando, Inteligencia Cross-Op, Radar de Competencia,
SystemIntegrity, RoadAlertService.

(2) Hardcodes UCOT: 6 archivos refactorizados para usar empresaPropia
desde useEmpresaPropia(). ShadowRadar, MapaFlotaHub, ListeroHub,
NavigationModule, PlanificacionHub.EmpresaGuard, queries con
agencyId=='70'.

(3) Reglas Firestore: vehicle_events vuelve a 'if isAuthenticated()'
ahora que el auth funciona (cierra el escape temporal del 2026-05-04
de la mañana). gtfs_timetable, gtfs_stops, horarios_stm quedan con
'allow read: if true' porque son datos públicos IMM no sensibles.

No-regresión §11: tsc 0 errores, verificación visual cross-operador,
los 3 módulos que ya andaban siguen andando.

Refs: docs/ORDEN_CODE_QA_CROSS_MODULOS_2026_05_04.md"

git push origin main
```

Reportar DONE en bridge con:
- Commit hash
- buildId
- Confirmación de que `getAuth().currentUser` es no-null tras login en producción
- Cuántos módulos pasan de "Sin datos" a tener datos reales
- Resultado de cambiar `empresaPropia` a CUTCSA (50) y ver títulos/queries dinámicos
