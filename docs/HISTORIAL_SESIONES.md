# 📚 HISTORIAL DE SESIONES — append-only

> Cada sesión productiva agrega UNA entrada al final, formato fijo. Sirve para auditar la evolución del proyecto sin tener que leer git log. Para Claude: NO borres ni reescribas entradas viejas — son trazabilidad histórica.

---

## 2026-04-24 — Sesión maratón: MVP DRO completo + cleanup módulo + FCM

**Duración:** ~6 horas activas (Cowork chat con auth UCOT 329).

**Features entregadas:**

| Feature | Archivo(s) nuevo(s) | Líneas | Estado |
|---|---|---|---|
| Fix ShadowRadar (TDZ, truncamiento, race, filtros estrictos) | — (modificado) | +234/-50 | prod |
| MVP-1 shapeReconstruction (cron + reconstrucción cross-operador) | `functions/src/shapeReconstruction.ts` | 382 | prod (239 shapes generadas) |
| MVP-2 droMatrix (Fréchet direccional + persistencia) | `functions/src/droMatrix.ts` | 335 | prod (1.850 pares) |
| MVP-3 snapToShape (utility frontend) | `frontend/src/services/snapToShape.ts` | 272 | prod |
| MVP-4 ShadowRadar tiered DRO (T1/T2/T3 con badge) | — (modificado) | +230 | prod |
| v2 ShadowRadar production-grade (HRR + empty state + coverage panel) | — (modificado) | +230 | prod |
| v3 Corridor Intelligence Dashboard (KPIs + tabla + xlsx) | `frontend/src/pages/traffic/CorridorIntelligence.tsx` | 686 | prod |
| v4 Corridor Map (Leaflet + 239 shapes + buses live + DRO overlay) | `frontend/src/pages/traffic/CorridorMap.tsx` | 571 | prod |
| v6 Shadow Analytics (histórico + charts + top duelos) | `frontend/src/pages/traffic/ShadowAnalytics.tsx` | 594 | prod |
| v5 FCM dispatcher + ACK loop (onCreate trigger + endpoint) | `functions/src/fcmAlertDispatcher.ts` | 286 | prod backend |
| Sidebar restructure (3 bloques con identidad) | — (modificado) | +~40 | prod |

**Archivos legacy borrados:**
- `frontend/src/pages/traffic/OperationsIntelligenceHub.tsx` (2.687 líneas, agregador genérico sin Firestore)
- `frontend/src/pages/traffic/LiveMapPage.tsx` (599 líneas, reemplazado por CorridorMap)
- `frontend/src/pages/traffic/ServiceStatistics.tsx` (237 líneas, KPIs duplicados en CEO)

**Directrices nuevas en CLAUDE.md:**
1. **Alcance del producto** — cross-operador desde el MVP, datos UCOT son demo.
2. **Verificación funcional (dir 7)** — el agente prueba, no el usuario.
3. **Filosofía de producto** — no "MVP" como excusa, 100% funcional desde el primer commit.
4. **Nivel internacional por defecto** — comparar cada feature contra Optibus/Swiftly/Remix/TfL/RATP. 6 preguntas obligatorias antes de cerrar feature.

**Métricas reales medidas en producción:**
- 1.850 corredores en matriz DRO (940 cross-operador, 910 intra-empresa)
- 6.595 km totales compartidos del sistema
- 10.000 eventos shadow en 7 días (83% críticos = `RIVAL_PISANDO_TURNO`)
- CUTCSA con **764 pares** de canibalización interna detectados
- Top duelo cross-operador: UCOT L316 IDA vs CUTCSA L103 VUELTA, **22 km compartidos**, DRO 20.1%
- ShadowRadar con **89% de cobertura DRO** vs 11% heurística (CUTCSA empresa propia)

**Total código nuevo en la sesión:** ~4.400 líneas en 12+ archivos.

**Truncamientos sufridos durante la sesión:** 4 (ShadowRadar.tsx 2×, CLAUDE.md 1×, Sidebar.tsx + App.tsx 1× en cascada). Todos rescatados con Python atomic write `os.replace(tmp, path)`. Patrón ya documentado en CLAUDE.md desde antes.

**Decisiones operativas que quedaron afuera:**
- Refactor cross-operador del CEO Dashboard (1.467 líneas) — se pospone por riesgo de truncamiento con contexto cargado. Plan documentado en `SESION_ACTUAL.md`.

**Commits sugeridos hechos por Jonathan via Claude Code:**
- (los nombres específicos quedaron en git log; ver `git log --oneline -20`).

---

<!-- Próximas entradas se agregan ABAJO. Formato:

## YYYY-MM-DD — Título corto

**Duración:** XYZ
**Features entregadas:** tabla
**Decisiones:** ...
**Métricas medidas:** ...
**Pendientes para próxima:** ...

-->
