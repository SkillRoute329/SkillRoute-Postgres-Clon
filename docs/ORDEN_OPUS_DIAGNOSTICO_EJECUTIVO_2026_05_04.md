# ORDEN OPUS — Módulo "Diagnóstico Ejecutivo" (jugada estratégica)

**Fecha:** 2026-05-04
**Modelo recomendado:** **Claude Opus** (algoritmos analíticos complejos + decisiones de arquitectura)
**Severidad:** ESTRATÉGICA — multiplica el TAM del producto. No es feature menor.

---

## 0. Por qué este módulo (contexto estratégico)

SkillRoute hoy muestra **datos**. Operadores y reguladores los interpretan a mano. Este módulo cambia eso: **el sistema diagnostica solo, detecta inconsistencias, sugiere acciones**. Convierte datos en decisiones.

**Universo de clientes nuevo:**
- Los 4 operadores (UCOT/CUTCSA/COME/COETC) — cada uno ve su diagnóstico
- IMM/STM como regulador (post-MVP) — ve diagnóstico del sistema completo
- Otros municipios uruguayos y latam pequeños

**Diferenciador competitivo definitivo:** Optibus, Swiftly, Remix solo le hablan al operador. SkillRoute le habla **al operador con visión cross-operador y al regulador con visión sistémica**. Eso ningún competidor lo replica con datos públicos.

---

## 1. Estructura del módulo

### Ruta y archivos
- **Ruta**: `/dashboard/inteligencia/diagnostico-ejecutivo`
- **Sidebar**: nuevo item bajo "INTELIGENCIA COMPETITIVA", después de "Inteligencia Cross-Op."
- **Componente principal**: `frontend/src/pages/inteligencia/DiagnosticoEjecutivo.tsx`
- **Servicio**: `frontend/src/services/diagnosticoEjecutivoService.ts`
- **Sub-componentes** (uno por bloque):
  - `frontend/src/components/diagnostico/BloquePerdidaMercado.tsx`
  - `frontend/src/components/diagnostico/BloqueInconsistenciasInternas.tsx`
  - `frontend/src/components/diagnostico/BloqueComparativaRival.tsx`
  - `frontend/src/components/diagnostico/BloqueRecomendaciones.tsx`

### UX general
- **Selector de operador** en cabecera (UCOT/CUTCSA/COME/COETC). SuperAdmin puede cambiar; rol operador-específico ve solo el suyo.
- **Layout vertical de 4 bloques**: cada bloque es una card con su propio loading state, conclusión destacada y detalle expandible.
- **"Última actualización"** visible en cabecera con timestamp de cuándo se calculó cada bloque.
- **Botón "Exportar diagnóstico (PDF)"** que genera el reporte ejecutivo del operador seleccionado para llevar a directivos.

---

## 2. Bloque 1 — Pérdida de mercado (cross-operador)

### Datos fuente
- `corridor_overlap` (302 pares cross-op, ya poblado): tiene `lineaA, agencyA, lineaB, agencyB, sharedKm, pctAInB`
- `vehicle_events` últimos 7 días (filtro por `agencyId` y rivales)
- `gtfs_timetable` (frecuencia programada)

### Algoritmo
Para cada corredor donde el operador tiene solapamiento con rival:
1. Contar buses operador propios pasando por el corredor en última semana
2. Contar buses rivales pasando por el mismo corredor
3. **Share** = buses propios / (buses propios + buses rivales)
4. Comparar con share de la semana anterior — calcular delta
5. Si delta < -5pts → marca "Pérdida de terreno"
6. Top 5 corredores con mayor caída en valor absoluto

### Output (UI)
```
🔻 PÉRDIDA DE MERCADO — UCOT (semana actual vs semana anterior)
Balance global: -3.2 pts (32% gano / 68% pierdo)

TOP 5 CORREDORES EN RIESGO:
1. Av Italia (8 km compartidos)
   • Tu share bajó del 42% al 31% (−11 pts)
   • Rival principal: CUTCSA L191 (aumentó frecuencia 22%)
   • Línea afectada: L329 IDA
   ⚠ Pérdida estimada: 380 pasajeros/día

2. 8 de Octubre (...)
3. (...)

🟢 TOP 3 OPORTUNIDADES (corredores donde estás ganando):
1. Bv Artigas — tu share subió del 28% al 34%
   • Recomendación: aumentar frecuencia para consolidar
```

### Conclusión auto-generada al inicio del bloque
Una frase: *"Estás perdiendo participación en 4 de los 12 corredores compartidos. La pérdida más grave es Av Italia frente a CUTCSA L191 (-11 pts en 1 semana)."*

---

## 3. Bloque 2 — Inconsistencias internas (auto-auditoría)

### Datos fuente
- `vehicle_events` últimos 7 días por operador
- `etapa_stats` (OTP por parada del cron `etapaStatsTick`)
- `gtfs_timetable` (horarios programados para validación)

### Algoritmos (4 detecciones independientes)

**A) Líneas con OTP crónicamente bajo**
```
Para cada (linea, sentido) del operador:
  Calcular OTP diario últimos 7 días
  Si OTP < 60% en al menos 5 de los 7 días → ALERTA
  Marcar como "OTP crítico sostenido"
```

**B) Coches anómalos (potencial problema de conductor o vehículo)**
```
Para cada (linea, sentido):
  Calcular OTP promedio de la línea
  Para cada coche en esa línea con ≥10 pasadas:
    Si OTP del coche < OTP línea − 20pts → ALERTA
  "El coche X tiene OTP 58% vs 78% del promedio de L405. Probable problema RRHH o mantenimiento."
```

**C) Etapas con desvío sistemático (problema estructural de horario)**
```
Para cada (linea, sentido, parada):
  Calcular desv promedio de las pasadas en esa parada
  Si |desv promedio| > 5 min Y muestra ≥ 30 pasadas → ALERTA
  "L405 etapa 'Av Italia y Morales' tiene desvío sistemático +6.2 min.
   El horario está mal calibrado — solicitar ajuste a STM."
```

**D) Bunching crónico (corredores con sobre-oferta)**
```
Para cada corredor con ≥2 líneas propias:
  Calcular gaps entre buses consecutivos
  Si % de gaps < 30% del headway programado > 40% → ALERTA bunching
  "Corredor 8 de Octubre: 4 líneas UCOT solapadas con bunching constante.
   Reorganizar headways para reducir desperdicio."
```

### Output (UI)
4 sub-cards expandibles, cada una con:
- Conteo de detecciones (ej. "3 líneas con OTP crítico")
- Lista detallada con evidencia numérica
- Acción sugerida concreta

### Conclusión auto-generada
*"Detectamos 8 inconsistencias internas: 3 líneas con OTP crítico sostenido, 2 coches anómalos, 2 etapas con horario mal calibrado, y 1 corredor con bunching crónico. Detalle abajo."*

---

## 4. Bloque 3 — Comparativa vs rival más cercano

### Datos fuente
- `corridor_overlap` para identificar el rival más cercano por línea
- `vehicle_events` últimos 7 días para ambos operadores
- `gtfs_timetable` para cobertura horaria

### Algoritmo
Para cada línea del operador:
1. Encontrar el rival con mayor `sharedKm` (rival principal en ese corredor)
2. Calcular OTP del operador en esa línea vs OTP del rival
3. Calcular velocidad operativa promedio (km/h) propia vs rival
4. Identificar franjas horarias donde el rival opera y el operador no (o viceversa)
5. Generar tabla comparativa

### Output (UI)
Tabla:
```
Línea propia | Rival principal | OTP propio vs rival | Vel. prom. | Cobertura horaria
L329 IDA     | CUTCSA L191    | 67% vs 82% (-15)   | 18 vs 22   | rival cubre 5-7 AM, vos no
L405         | COETC LG       | 71% vs 65% (+6)    | 19 vs 17   | similar
...
```

Alertas resaltadas:
- "L329 va 15 puntos abajo en OTP frente a CUTCSA — cliente probablemente prefiere el rival"
- "Rival cubre franja 5-7 AM en Av Italia donde vos no operás — perdés todos esos pasajeros"

### Conclusión auto-generada
*"Vas mejor que el rival en 3 de tus 12 líneas, igual en 2, peor en 7. La pelea más floja: L329 IDA (-15 pts vs CUTCSA)."*

---

## 5. Bloque 4 — Recomendaciones accionables

Este bloque NO consulta nuevos datos. **Combina los hallazgos de los Bloques 1-3 y genera acciones priorizadas**.

### Lógica de generación
```
Para cada hallazgo de los bloques 1-3:
  Si pérdida_mercado + rival_aumentó_frecuencia:
    → "Aumentar frecuencia en franja crítica de línea X"
  Si OTP_crítico_sostenido + bunching_corredor:
    → "Redistribuir headways de las líneas del corredor"
  Si coche_anómalo:
    → "Derivar coche X conductor a RRHH"
  Si etapa_desvío_sistemático:
    → "Solicitar al STM ajuste de boletín en parada Y"
  Si rival_cubre_franja_y_propio_no:
    → "Evaluar extensión de servicio en franja Z"
```

### Output (UI)
Lista priorizada por **impacto estimado** (descendente):
```
🎯 RECOMENDACIONES ACCIONABLES (5)

PRIORIDAD ALTA (3)
1. Reducir headway L329 IDA franja 17-19h: de 12 → 9 min
   • Razón: perdiendo 11 pts vs CUTCSA L191
   • Impacto estimado: recuperar ~250 pasajeros/día
   • Plazo sugerido: próxima vigencia STM

2. Solicitar ajuste boletín L405 etapa "Av Italia y Morales": +5 min
   • Razón: desvío sistemático +6.2 min en 87% de pasadas
   • Impacto: subir OTP línea de 64% → 78% sin cambiar operación

3. Derivar coche 117 conductor a RRHH
   • Razón: 18 días con OTP -22 pts del promedio
   • Impacto: subir OTP L405 1.5 pts si el problema es conductor

PRIORIDAD MEDIA (2)
4. (...)
5. (...)
```

### Conclusión auto-generada
*"3 acciones de impacto alto, 2 de impacto medio. Si se ejecutan las 3 primeras: OTP línea sube ~5 pts, share Av Italia recupera ~6 pts."*

---

## 6. Selector de operador + roles

```ts
const { user } = useAuth();
const role = user?.role;
const empresaPropia = user?.agencyId;

// Operadores visibles según rol
const operadoresDisponibles =
  role === 'superadmin' ? ['70', '50', '20', '10']
  : role === 'admin'    ? [empresaPropia]
  : [empresaPropia]; // Default: solo su propio operador
```

UI: dropdown en cabecera del módulo. SuperAdmin ve los 4. Admin de operador ve solo el suyo.

---

## 7. Exportación PDF

Botón "Exportar diagnóstico" genera PDF con:
- Header: "Diagnóstico Ejecutivo — [Operador] — [Fecha]"
- Resumen ejecutivo (3 conclusiones de los 4 bloques)
- Detalle por bloque con tablas
- Recomendaciones accionables
- Footer: "Generado por SkillRoute · Datos GTFS oficiales IMM + GPS feed STM"

Reusa la infraestructura de `jspdf` que ya está en `DiagnosticoCumplimiento.tsx → exportPDF()`.

---

## 8. Respeto a §17 (zonas estables)

**Este módulo NO toca ninguna zona estable**. Solo LEE de colecciones existentes (`corridor_overlap`, `vehicle_events`, `etapa_stats`, `gtfs_timetable`). Todos los archivos nuevos.

Único cambio en archivo existente: `frontend/src/components/Sidebar.tsx` agregar item "Diagnóstico Ejecutivo" — no es zona estable, es agregado.

---

## 9. No-regresión §11 + verificación §15

Antes de reportar DONE:
- `npx tsc --noEmit --skipLibCheck` 0 errores
- Build limpio
- `firebase deploy --only hosting`
- `curl /version.json` confirma commit nuevo
- Smoke test visual: módulo renderiza, los 4 bloques cargan sin errores en consola, exportar PDF funciona
- 3 módulos no tocados verificados sin regresión: Cumplimiento, Centro de Mando, Inteligencia Cross-Op

---

## 10. Casos de prueba mínimos

```ts
// 1. Diagnóstico se genera para los 4 operadores
test('genera diagnóstico para UCOT, CUTCSA, COME, COETC', async () => {
  for (const ag of ['70','50','20','10']) {
    const d = await fetchDiagnostico(ag);
    expect(d.bloque1).toBeDefined();
    expect(d.bloque2.detecciones.length).toBeGreaterThanOrEqual(0);
    expect(d.bloque3.lineas.length).toBeGreaterThan(0);
    expect(d.bloque4.recomendaciones.length).toBeGreaterThanOrEqual(0);
  }
});

// 2. Recomendaciones no se generan si no hay datos
test('sin pasadas → sin recomendaciones, no inventar', async () => {
  // Mock: 0 eventos para línea X
  const d = await fetchDiagnostico('70');
  // Debería decir "Sin datos suficientes" en lugar de inventar
});

// 3. Anti-mock §política
test('campo desv null no se cuenta como 0', async () => {
  // Eventos con desviacionMin null no inflan ni desinflan métricas
});
```

---

## 11. Acción Code

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot

# 1. Crear archivos nuevos (sin tocar zonas estables §17)
# - frontend/src/pages/inteligencia/DiagnosticoEjecutivo.tsx
# - frontend/src/services/diagnosticoEjecutivoService.ts
# - frontend/src/components/diagnostico/Bloque*.tsx (×4)

# 2. Edits chicos en archivos existentes (no zona estable)
# - Sidebar.tsx: agregar item "Diagnóstico Ejecutivo"
# - App.tsx: agregar Route

# 3. Verificación pre-deploy
cd frontend
npx tsc --noEmit --skipLibCheck
npm run build
cd ..

# 4. Deploy
firebase deploy --only hosting --project ucot-gestor-cloud

# 5. §15 verificación post-deploy
curl https://skillroute.web.app/version.json
# Confirmar commit nuevo

# 6. Smoke test visual
# Abrir https://skillroute.web.app/dashboard/inteligencia/diagnostico-ejecutivo
# Cambiar operador entre UCOT/CUTCSA/COME/COETC y verificar que cada uno carga
# Exportar PDF UCOT — confirmar que se genera

# 7. Verificación no-regresión §11 (3 módulos)
# Cumplimiento, Centro de Mando, Inteligencia Cross-Op renderizan sin error

# 8. Commit + push
git add frontend/src/pages/inteligencia/ `
        frontend/src/services/diagnosticoEjecutivoService.ts `
        frontend/src/components/diagnostico/ `
        frontend/src/components/Sidebar.tsx `
        frontend/src/App.tsx `
        docs/ORDEN_OPUS_DIAGNOSTICO_EJECUTIVO_2026_05_04.md `
        cowork-tools/bridge/inbox.md

git commit -m "feat(inteligencia): modulo Diagnostico Ejecutivo (4 bloques + recomendaciones auto)

Modulo nuevo que convierte datos en decisiones:
1. Perdida de mercado cross-operador (corridor_overlap + delta share semana)
2. Inconsistencias internas (OTP critico, coches anomalos, etapas mal calibradas, bunching)
3. Comparativa vs rival mas cercano (OTP, velocidad, cobertura horaria)
4. Recomendaciones accionables auto-generadas con impacto estimado

UX: selector de operador (SuperAdmin ve 4, admin solo el suyo).
Exporta PDF para llevar a directivos.

Diferenciador comercial: Optibus/Swiftly/Remix solo le hablan al operador
individual. SkillRoute le habla al operador con vision cross-operador
y al regulador con vision sistemica. Eso ningun competidor replica con
datos publicos.

Cero datos simulados (politica anti-mock). Sin datos suficientes -> empty
state explicito en lugar de inventar.

§17 cumplida: modulo nuevo, no toca zonas estables.
§15 verificacion: version.json + smoke test + 3 modulos no-regresion.

Refs: docs/ORDEN_OPUS_DIAGNOSTICO_EJECUTIVO_2026_05_04.md"

git push origin main
```

---

## 12. Reportar DONE

Bridge a Cowork con:
- Commit hash + buildId
- Screenshot del módulo cargado para los 4 operadores
- PDF de muestra exportado
- Confirmación de que los 3 módulos no-regresión están OK
- Si algún bloque queda vacío "sin datos suficientes" para algún operador, listarlo (no es bug — es honestidad)
