# Convenciones de código — SkillRoute / GestionUcot

> Documento operativo de consulta rápida. Para el detalle arquitectónico completo y plan de migración ver `ARQUITECTURA_OBJETIVO.md` en la raíz.
>
> **Este documento cumple la función de "skill" para agentes de IA**: CLAUDE.md apunta acá al inicio de cada sesión. Debe ser corto, concreto y consultable en menos de 30 segundos.

---

## 1. Antes de escribir un archivo nuevo, preguntarse

1. **¿Dónde va?** → §2 (carpeta correcta por tipo de código)
2. **¿Cómo se llama?** → §3 (sufijo y caso)
3. **¿En qué idioma?** → §4 (ES dominio, EN infra)
4. **¿Va a ser grande?** → §5 (límite por tipo; dividir antes de crecer)
5. **¿Es una feature nueva?** → §6 (template feature-first)

---

## 2. Dónde va cada tipo de código

```
frontend/src/
├── app/                 → entry, router, providers
├── pages/               → solo shells de ruta (contenedores finos <250 líneas)
├── features/            → código cohesivo por dominio: disruptions/, competidores/, cartones/, etc.
│   └── <feature>/
│       ├── components/  → UI específica de la feature
│       ├── hooks/       → useX específico de la feature
│       ├── services/    → acceso a Firestore de la feature
│       ├── schemas/     → Zod schemas
│       ├── engine/      → lógica pura (sin I/O) si aplica
│       └── index.ts     → API pública (lo que otras features pueden importar)
├── shared/              → reutilizable entre features
│   ├── components/      → Button, Modal, ErrorBoundary
│   ├── hooks/           → useRealtimeData, useDebounce
│   ├── utils/           → formatTimestamp, haversine
│   ├── lib/             → firebase init, socket init
│   └── types/           → tipos globales
├── config/              → parametros-operativos.ts, feature-flags
└── schemas/             → Zod schemas compartidos (boundaries)

functions/src/
├── index.ts             → solo exports, cero lógica
├── api/                 → handlers HTTP divididos por dominio (competidores.ts, cartones.ts, ...)
├── publishers/          → GTFS-RT, GTFS-static, SIRI, NeTEx
├── engines/             → lógica de negocio pura (otp, ewt, forecast)
├── schedulers/          → triggers de schedule (refreshCompetidores, ingestaIMM)
├── ingest/              → adaptadores a fuentes externas (immRealtime)
└── shared/              → utils compartidos (firestore helpers, logger)

backend/src/             → LOCAL DEV/PRUEBAS, no es producción
                          Producción = functions/src/

scripts/                 → operativos (check_integrity.sh, migraciones)
docs/                    → documentación técnica, ADRs, changelogs
archive/                 → cementerio ordenado (no borrar, mover acá)
```

**Regla**: si dudás entre `features/<x>/` y `shared/`, empezar en la feature. Solo subir a `shared/` cuando una segunda feature lo necesite de verdad (no "por si acaso").

---

## 3. Sufijos y casing

| Sufijo / regla | Uso | Ejemplo |
|----------------|-----|---------|
| `*Page.tsx` | Páginas de ruta (shell) | `ShadowRadarPage.tsx` |
| `*Dashboard.tsx` | Páginas con múltiples widgets | `CEODashboard.tsx` |
| `*Manager.tsx` | UI admin CRUD | `CartonManager.tsx` |
| `*Widget.tsx` | Componente dashboard suelto | `ActiveDisruptionsWidget.tsx` |
| `*Service.ts` | I/O con Firestore/HTTP | `forecastService.ts` |
| `*Engine.ts` | Lógica pura sin I/O | `scheduleComplianceEngine.ts` |
| `*Adapter.ts` | Conversión entre formatos | `gtfsAdapter.ts` |
| `*Client.ts` | Cliente de API externa | `immRealtimeClient.ts` |
| `*Module.tsx` | ⚠️ deprecado — usar Page o Dashboard | — |

**Casing**:
- `PascalCase` para componentes/páginas React (`.tsx`)
- `camelCase` para servicios/funciones (`.ts`)
- `kebab-case` para rutas UI (`/admin/active-disruptions`)
- `SCREAMING_SNAKE_CASE` para constantes globales (`IVA_TRANSPORTE`)
- `snake_case` para colecciones Firestore (`cartones_de_servicio`)

---

## 4. Idioma: español dominio, inglés infra

**Principio**: si Jonathan o un operador UCOT diría el término en español en una reunión, va en español. Si es concepto de ingeniería genérico, va en inglés.

| Contexto | Idioma | Ejemplo ✅ | Ejemplo ❌ |
|----------|--------|------------|------------|
| Colecciones Firestore de dominio | **ES** | `competidores`, `cartones_de_servicio`, `lineas`, `vehiculos` | `competitors`, `service_cards` |
| Colecciones infra | **EN** | `users`, `audit_logs`, `feature_flags` | `usuarios` |
| Nombres de tipo | **ES/EN mixto OK** | `type Competidor = { linea, codigoEmpresa }` | `type Competidor = { lineNumber }` |
| Funciones/variables código | **EN excepto conceptos UCOT** | `getParametro()`, `parseCarton()`, `calculateOTP()` | `obtenerParametro()` para operaciones genéricas |
| Rutas UI | **EN** | `/admin/operating-parameters` | `/admin/parametros-operativos` |
| Mensajes UI al usuario | **ES** | "Guardado correctamente" | "Saved successfully" |
| Comentarios en código | **ES** | `// cruce de medianoche` | `// midnight crossing` |
| Commits | **ES** | `fix: corregir IVA en forecast` | — |

**Conceptos UCOT que siempre van en ES** (sin equivalente EN preciso):
`cartón`, `boletín`, `variante`, `regulador`, `desvío`, `inspector`, `delegación`, `pasajero`

---

## 5. Límites de tamaño por archivo

| Tipo | Máximo | Si se supera |
|------|--------|--------------|
| Página React | 250 líneas | Extraer hooks → `features/<x>/hooks/`, componentes → `features/<x>/components/` |
| Componente | 150 líneas | Dividir por responsabilidad visual |
| Servicio | 300 líneas | Dividir por entidad |
| Cloud Function handler | 400 líneas | Dividir en subdominios dentro de `functions/src/api/` |
| Utility | 200 líneas | Agrupar funciones puras en módulos más pequeños |

**Scout rule**: cada vez que toques un archivo grande, dejalo más chico que antes. No refactor masivos — refactor incremental al paso del trabajo real.

**Hotspots conocidos (2026-04)** que requieren división al próximo toque:
- `functions/src/intelligenceApi.ts` (~2400 líneas) → dividir a `functions/src/api/*.ts`
- `frontend/src/services/excel/ExcelParserV2.ts` (744 líneas)
- `frontend/src/pages/traffic/ShadowRadar.tsx` (~650 líneas)
- `frontend/src/pages/economic/EconomicProjectionsPage.tsx` (~580 líneas)

---

## 6. Template para feature nueva

```bash
mkdir -p frontend/src/features/<nombre>/{components,hooks,services,schemas,__tests__}
```

```
frontend/src/features/<nombre>/
├── components/
│   └── <Nombre>Card.tsx        ← UI atómica
├── hooks/
│   └── use<Nombre>.ts          ← estado y side effects
├── services/
│   └── <nombre>Service.ts      ← Firestore CRUD
├── schemas/
│   └── <nombre>.ts             ← Zod schema + types + state machine si aplica
├── engine/                     ← opcional: lógica pura
├── __tests__/
│   └── <nombre>.test.ts
└── index.ts                    ← exporta SOLO lo que puede usar otra feature
```

**`index.ts` es la API pública**. Todo lo que no esté exportado desde ahí es interno a la feature y otras features no lo pueden importar. Esto evita acoplamiento cruzado.

---

## 7. Reglas técnicas no negociables

### 7.1 Backend de producción = `functions/src/`
Nunca agregar lógica de producción en `backend/src/` — ese es dev/pruebas. Después de editar `functions/src/*.ts` compilar con `cd functions && npm run build` antes de deployar.

### 7.2 Validar en boundaries con Zod
Toda lectura de Firestore que cruza al frontend pasa por schema de `frontend/src/schemas/`. Todo payload HTTP de Cloud Function valida antes de responder. En caso de fallo: log + fallback seguro.

### 7.3 Timestamps siempre con timezone explícito
Usar `formatTimestampMvd()` de `shared/utils/formatTimestamp.ts`. Nunca `new Date().toLocaleString()` sin locale. Montevideo = `-03:00`.

### 7.4 Parámetros operativos siempre desde `config/parametros-operativos.ts`
Nunca hardcodear tarifas, IVA, factores económicos. Si aparece un número mágico en código, mover a parámetros y leer con `getParametroValor()`.

### 7.5 Pre-deploy obligatorio
`bash scripts/check_integrity.sh` antes de cada deploy. Exit 1 ⇒ no deployar.

### 7.6 Truncamiento en archivos grandes
Archivos >400 líneas son susceptibles a truncamiento con `Edit` de strings largos o `>>` heredocs. Mitigaciones en orden:
1. Python atómico con `os.replace(tmp, path)` — más seguro
2. Edits múltiples pequeños (1-20 líneas) con `tsc --noEmit` entre cada uno
3. Correr `check_integrity.sh` al final
4. Si queda corrupto: limpiar bytes null con Python y reaplicar

---

## 8. Antes de crear un archivo nuevo, checklist rápido

- [ ] ¿Carpeta correcta por §2? (page vs feature vs shared)
- [ ] ¿Sufijo correcto por §3? (*Page, *Service, *Engine...)
- [ ] ¿Idioma correcto por §4? (ES dominio, EN infra)
- [ ] ¿Hay una feature existente donde debería ir primero?
- [ ] ¿Va a superar el límite de §5? → planear división desde ya
- [ ] ¿Uso Zod si cruza boundary Firestore ↔ frontend?
- [ ] ¿Uso `formatTimestampMvd()` si muestra fechas?
- [ ] ¿Uso `getParametroValor()` si usa tarifas/IVA/factores?

---

## 9. Señales de que hay que refactorizar antes de seguir

| Señal | Acción |
|-------|--------|
| Voy a editar archivo >400 líneas | Extraer al menos un bloque a submódulo antes de editar |
| Voy a duplicar lógica que ya existe | Subir al shared antes de duplicar |
| Necesito importar `feature-A` desde `feature-B` | Mover la pieza compartida a `shared/` o reevaluar si es la misma feature |
| Firestore tiene 2 colecciones que significan lo mismo | Abrir ADR de unificación, no crear una tercera |
| Veo `new Date()` sin timezone | Reemplazar por helper |
| Veo número mágico (tarifa, IVA, factor) | Mover a `parametros-operativos.ts` |

---

## 10. Dónde buscar cuando dudes

| Busco... | Voy a... |
|----------|----------|
| Detalle arquitectónico completo | `ARQUITECTURA_OBJETIVO.md` en raíz |
| Historia del proyecto y módulos | `CLAUDE.md` en raíz |
| Fuentes de datos públicas | `docs/FUENTES_OFICIALES.md` |
| Cómo consumir GTFS-RT | `docs/GTFS_RT_PUBLISHER.md` |
| Decisiones arquitectónicas razonadas | `docs/decisiones/*.md` (ADRs) |
| Cambios recientes | `docs/changelogs/*.md` |

---

**Principio final**: un archivo bien nombrado y bien ubicado desde el minuto cero ahorra horas de refactor después. El costo de nombrar bien es bajo, el costo de renombrar es alto.
