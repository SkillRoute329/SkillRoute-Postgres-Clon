# Módulo: ShadowRadar (Radar de Sombra)

## En el negocio

El ShadowRadar detecta en tiempo real cuándo un bus de una empresa rival está operando en la misma ruta que un bus propio, a qué distancia, y qué tan seria es la amenaza competitiva. 

Para UCOT: si un bus de CUTCSA está a 200 metros adelante en la línea 300, el conductor propio puede regular (ir más lento o más rápido) para no perder pasajeros. El sistema genera la alerta automáticamente y la muestra al listero y al conductor.

Esta es la función diferenciadora de SkillRoute — ningún operador puede tener esta información por sí solo porque requiere datos de todos los operadores simultáneamente.

## Arquitectura del módulo

```
BACKEND (cada 2 min)
─────────────────────
ingestaIMM.ts
  └─ Trae GPS de todos los buses del STM (UCOT + CUTCSA + COME + COETC)
  └─ Escribe: viajes_activos (posición GPS de cada bus)
              competencia_monitoreo/*/pings (buses rivales por línea UCOT)

shadowDispatcher.ts
  └─ Lee: viajes_activos (posición de buses UCOT)
  └─ Lee: competencia_monitoreo/*/pings (rivales en el área)
  └─ Lee: corridor_overlap (% de solapamiento entre rutas)
  └─ Calcula: distancia bus_propio ↔ bus_rival
  └─ Clasifica: CRÍTICO / ALTO / MEDIO / BAJO (tiers T1/T2/T3)
  └─ Escribe: alertas_regulacion (la alerta con detalle)
              shadow_tracker (estado del radar para el frontend)
              alertas_log (historial)

FRONTEND (ShadowRadar.tsx)
──────────────────────────
5 onSnapshot simultáneos:
  1. viajes_activos → buses en mapa
  2. alertas_regulacion → alertas activas
  3. corridor_overlap → tiers de amenaza (T1/T2/T3)
  4. shapes_cross_operator → forma de las rutas en el mapa
  5. vehicle_events → contexto adicional de cada bus
```

## Clasificación de amenaza (tiers)

| Tier | Condición | Acción sugerida |
|---|---|---|
| T1 — Crítico | Solapamiento DRO ≥ 60% + bus rival a < 300m | Alerta roja — regular inmediatamente |
| T2 — Alto | Solapamiento DRO 30-60% + bus rival a < 600m | Alerta naranja — monitorear |
| T3 — Medio | Solapamiento DRO < 30% o distancia > 600m | Alerta amarilla — informativo |

El DRO (Directional Route Overlap) viene de `corridor_overlap` que calcula `droMatrix.ts` cada lunes.

## Colecciones involucradas

| Colección | Rol en ShadowRadar | Frecuencia de actualización |
|---|---|---|
| `viajes_activos` | Posición GPS de todos los buses | Cada 2 min (ingestaIMM) |
| `competencia_monitoreo/*/pings` | Pings de buses rivales por línea UCOT | Cada 2 min |
| `corridor_overlap` | % solapamiento entre rutas (tiers) | Semanal (lunes, droMatrix) |
| `shapes_cross_operator` | Geometría de las rutas para el mapa | Semanal (lunes, gtfsImporter) |
| `alertas_regulacion` | Alertas generadas por shadowDispatcher | Cada 2 min |
| `shadow_tracker` | Estado del radar (para overlay frontend) | Cada 2 min |
| `alertas_log` | Historial de alertas (analytics) | Cada 2 min |
| `hrr_live` | HRR calculado por hrrEngine | Cada 10 min |

## Consecuencias de tocar partes del módulo

| Si tocás... | Se rompe... |
|---|---|
| Schema de `viajes_activos` | Mapa en vivo + todas las alertas de rivalidad |
| Schema de `corridor_overlap` | Clasificación T1/T2/T3 — todas las alertas pierden tier |
| Schema de `alertas_regulacion` | Frontend no puede renderizar las alertas correctamente |
| `ingestaIMM.ts` | Sin datos GPS → todo el radar queda en blanco |
| `shadowDispatcher.ts` | No se generan alertas nuevas (las existentes siguen hasta que expiran) |
| `ShadowRadar.tsx` — los 5 listeners | Verificar después de cualquier cambio que todos los onSnapshot sigan activos |

## Archivos del módulo

| Archivo | Ubicación | Rol | Tamaño |
|---|---|---|---|
| ShadowRadar.tsx | frontend/src/pages/traffic/ | UI principal | ~67KB — ⚠️ no editar desde Cowork |
| ShadowAnalytics.tsx | frontend/src/pages/traffic/ | Análisis histórico | |
| shadowDispatcher.ts | functions/src/ | Motor de detección | |
| ingestaIMM.ts | functions/src/ | Ingesta GPS | |
| droMatrix.ts | functions/src/ | Calcula solapamiento | |
| hrrEngine.ts | functions/src/ | Calcula HRR | |

## Estado

| Componente | Estado |
|---|---|
| Ingesta GPS (ingestaIMM) | ✅ Activo — 745 buses detectados (2026-05-02) |
| Motor de alertas (shadowDispatcher) | ✅ Activo |
| Tiers T1/T2/T3 (droMatrix + corridor_overlap) | ✅ 1850 pares DRO calculados |
| Frontend ShadowRadar | ✅ Funcional (fix 2026-04-24) |
| HRR en vivo (hrrEngine) | ✅ Activo |
| Analytics (ShadowAnalytics) | ✅ Funcional |
