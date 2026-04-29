# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-04-29 19:45 — Code cerró 8 items de BRIDGE-012 + deploy confirmado.

---

## ✅ ESTADO: DEMO LUNES 4 MAYO — LISTA

Producción en `4a7a310d` (build `1777491129408`, deploy `8acf03a7`).
URL: `https://ucot-gestor-cloud.web.app`

### Items cerrados en esta sesión (4a7a310d)

| # | Item | Fix aplicado | Verificado en prod |
|---|------|--------------|-------------------|
| 1 | CEO Dashboard crash | `Map as MapIcon` — shadowing del global `new Map()` | ✅ Bundle solo tiene `new Date()` |
| 4 | CorridorMap UCOT 0 sh. | `— pendiente` + tooltip GTFS | ✅ `pendiente` en chunk CorridorMap |
| 5 | WithDamages en inglés | STATUS_CONFIG agrega `WithDamages → 'Con daños'` | ✅ `Con da` en chunk Maintenance |
| 6 | Alertas RIVAL sin detalle | DashboardHome usa `linea_id+mensaje_chofer+timestamp` | ✅ `Rival pisando turno` en DashboardHome |
| 7 | Cobertura 100%/0 turnos | `—` cuando `turnosTotal === 0` | ✅ `Sin turnos programados` en DashboardHome |
| 8 | ConnectivityGuard ERROR rojo | `console.error → console.warn` | ✅ `console.warn` en bundle |
| 2 | H1 CUTCSA CorridorIntelligence | Ya era dinámico (`empresaCfg.label`) — behavior OK | ✅ Deploy fresquísimo cubre |
| 3 | H1 CUTCSA EconomicProjections | Ya era dinámico (`empresaCfg.label`) — behavior OK | ✅ Deploy fresquísimo cubre |

**Nota items 2+3:** el código YA usaba `empresaCfg.label` dinámico desde `39172dbb`. Cowork veía "CUTCSA" porque el localStorage del browser tenía ese operador seleccionado. Comportamiento correcto — para la demo CUTCSA el H1 mostrará "CUTCSA" que es exactamente lo esperado. En fresh session (incognito) muestra "UCOT" (default).

### Sprints anteriores confirmados en prod

| Sprint | Items | Estado |
|--------|-------|--------|
| A (b1e59ce8) | recharts chunk, Firestore rules, índice service_matrices | ✅ |
| B+C (39172dbb) | cross-op dinámico, datos honestos, IncidentCommand UID | ✅ |
| D+E (64aafbf5) | branding SkillRoute, redirects, Mantenimiento fechas | ✅ |

---

## 📋 PRÓXIMO PASO INMEDIATO

### BRIDGE-014: IMM OAuth Stub (pre-lunes, no bloqueante demo)

Cowork dejó el plan en `docs/IMM_OAUTH_STUB.md`. Tarea:
- Crear Cloud Function stub `immOAuthCallback` que devuelva 200 OK con HTML branded
- NO canjea code por token, NO llama a API IMM real
- URL ya registrada: `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback`
- Actualmente devuelve 404 → debe devolver 200 con branded HTML

Pasos para Code:
```bash
# 1. Leer docs/IMM_OAUTH_STUB.md para el código completo
# 2. Aplicar cambios en functions/src/index.ts (stub endpoint)
# 3. cd functions && npm run build
# 4. firebase deploy --only functions --project ucot-gestor-cloud
# 5. Verificar: curl https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback → 200 HTML
# 6. Verificar: curl con ?error=access_denied → 400 HTML
```

### Verificaciones pendientes post-demo (Cowork)

Cuando Cowork pueda abrir el browser:
1. `https://ucot-gestor-cloud.web.app/dashboard/traffic/ceo` — NO debe mostrar "Error en Módulo"
2. `https://ucot-gestor-cloud.web.app/dashboard` — alertas deben mostrar "⚠️ Rival pisando turno — Línea X" (si hay alertas activas en `alertas_regulacion`)
3. `https://ucot-gestor-cloud.web.app/dashboard/traffic/corridor-map` — UCOT debe mostrar "— pendiente" con tooltip
4. Consola sin ERROR rojo de ConnectivityGuard

---

## 🔲 Backlog post-demo

- **BRIDGE-014**: IMM OAuth stub (pre-lunes si hay tiempo)
- **v2 HRR en vivo**: headway real en tramo compartido
- **Dashboard seat-km market share** v3 cross-operador
- **Scraper JSF horarios**: scheduler refresh periódico
- **APK Android**: actualizar con build actual
- **Cumplimiento OTP oscilación**: verificar con 2 snapshots reales 15 min aparte (C.1 parcial)

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan (outlier en tendenciaOLS) — pre-existente
- `monitoring.ts` warning Rollup (dynamic + static import) — pre-existente, no afecta runtime
- Items 2+3 (H1 dinámico): en sesión con localStorage=CUTCSA mostrará "CUTCSA" — correcto

---

## Decisiones operativas de esta sesión

- **CEO crash causa raíz**: `import { Map } from 'lucide-react'` shadowing del global JavaScript `Map`. Fix simple: alias `Map as MapIcon`.
- **Items 2+3**: comportamiento correcto, no había bug de código — el operador en localStorage era CUTCSA. Para la demo CUTCSA esto es el output esperado.
- **deploy 64aafbf5**: el commit tenía el código correcto pero version.json no se actualizó en el deploy previo. Este deploy (`4a7a310d`) sí tiene version.json correcto.
