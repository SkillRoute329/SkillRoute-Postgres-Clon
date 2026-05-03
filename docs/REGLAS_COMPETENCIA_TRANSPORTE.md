# Reglas de Competencia en Transporte Público — SkillRoute

> Este documento es la fuente de verdad para cualquier módulo que analice competencia,
> solapamiento de rutas o comparación entre líneas. Leer ANTES de implementar cualquier
> función relacionada con DRO, comparación de rutas o análisis de mercado.

---

## ¿Qué es competencia real en transporte público?

Dos líneas compiten cuando un pasajero puede elegir entre ellas para llegar al mismo destino.
Esto requiere que:

1. **Compartan tramo físico** — pasen por las mismas calles o muy cerca (< 120m)
2. **Vayan en la misma dirección** — IDA con IDA, VUELTA con VUELTA
3. **Sean de diferente línea** — una línea no compite consigo misma

---

## Reglas que NUNCA se pueden violar

### Regla 1 — Mismo sentido obligatorio
**Nunca comparar IDA contra VUELTA.**

Un bus que va al centro y un bus que viene del centro no compiten: el pasajero que quiere ir al centro no puede usar el que viene. Geográficamente pueden compartir la misma calle (calles de doble mano), pero operativamente son servicios distintos e incomparables.

```
❌ UCOT L.300 IDA  vs  CUTCSA L.106 VUELTA  →  Inválido
✅ UCOT L.300 IDA  vs  CUTCSA L.106 IDA     →  Competencia real
✅ UCOT L.300 VUELTA vs CUTCSA L.106 VUELTA →  Competencia real
```

### Regla 2 — Una línea no compite contra sí misma
**Nunca comparar la misma línea (mismo número, misma empresa) en cualquier combinación.**

```
❌ UCOT L.71 IDA    vs  UCOT L.71 VUELTA   →  Inválido (son el mismo servicio)
❌ UCOT L.71 IDA    vs  UCOT L.71 IDA      →  Inválido (idéntico)
```

### Regla 3 — En comparación interna cada par se muestra una sola vez
Cuando se comparan líneas de la misma empresa entre sí, el par A-B y el par B-A son el mismo par.
Solo mostrar uno.

```
✅ UCOT L.300 IDA  ↔  UCOT L.307 IDA  →  Mostrar una vez
❌ UCOT L.307 IDA  ↔  UCOT L.300 IDA  →  No mostrar (duplicado)
```

---

## Definición de sentido IDA / VUELTA en el sistema STM

El GTFS de la IMM usa:
- `direction_id = 0` → **IDA** (salida desde terminal origen)
- `direction_id = 1` → **VUELTA** (retorno hacia terminal origen)

Los documentos en Firestore (`shapes_cross_operator`) tienen el campo `sentido: 'IDA' | 'VUELTA'`.

---

## Definición de solapamiento (DRO)

**DRO = Directional Route Overlap** (TCRP Report 195, Transit Cooperative Research Program)

Para el par (A → B):
- Se toma cada punto GPS del recorrido A (submuestreado cada 5 puntos para velocidad)
- Se busca el punto más cercano del recorrido B usando la grilla espacial (celdas 0.008°)
- Si la distancia Haversine ≤ 120m → ese punto está en zona compartida
- `DRO(A→B) = (puntos compartidos de A) / (total puntos A) × 100%`

El **DRO Simétrico** = promedio(DRO_A_en_B, DRO_B_en_A). Es la métrica principal.

### Umbrales operativos

| DRO Simétrico | Categoría | Interpretación |
|---|---|---|
| ≥ 70% | Crítica | Competencia directa severa. Mismo corredor, mismos pasajeros. |
| ≥ 40% | Alta | Competencia significativa. Evaluar diferenciación por frecuencia. |
| ≥ 15% | Media | Corredores parcialmente compartidos. Monitorear headway. |
| < 15% | Baja | Rutas complementarias. Coincidencia en tramos cortos o puntos de paso. |

---

## Casos de uso válidos

### Cross-empresa (competencia externa)
- Empresa A = UCOT, Empresa B = CUTCSA → análisis competitivo clásico
- Siempre: solo mismo sentido, distinta empresa

### Intra-empresa (redundancia interna)
- Empresa A = UCOT, Empresa B = UCOT → detectar líneas propias que se pisan
- Útil para: optimización de frecuencias, análisis de canibalización interna
- Siempre: solo mismo sentido, distinta línea

### Comparación selectiva
- Filtro "Buscar línea": permite ver solo pares que involucran una línea específica
- Útil para: analizar el impacto competitivo de una línea particular

---

## Qué NO es competencia aunque geográficamente se parezca

- **Misma línea IDA vs VUELTA**: comparten el mismo tramo físico (calle de doble mano) pero son el mismo servicio
- **Líneas de distintos horarios que no coinciden**: si la L.300 opera de 6am a 11pm y la L.106 opera de 10pm a 2am, el solapamiento geográfico existe pero la competencia operativa es mínima (actualmente no modelado)
- **Zonas de paso sin parada**: un bus puede cruzar un barrio sin tener paradas allí — esos tramos no son competencia real (actualmente no distinguido por falta de datos de paradas activas)

---

## Implementación en código

El control de estas reglas debe estar en la capa de cálculo, NO en la capa de visualización.

### Patrón obligatorio en cualquier función de comparación de rutas:

```typescript
for (let iA = 0; iA < shapesA.length; iA++) {
  for (let iB = 0; iB < shapesB.length; iB++) {
    const sA = shapesA[iA];
    const sB = shapesB[iB];

    // REGLA 1: nunca comparar una línea contra sí misma
    if (sA.id === sB.id) continue;

    // REGLA 2: en comparación interna, evitar duplicados y misma línea diferente sentido
    if (selfComp && iA >= iB) continue;
    if (selfComp && sA.linea === sB.linea) continue;

    // REGLA 3: nunca comparar IDA vs VUELTA — no es competencia real
    if (sA.sentido !== sB.sentido) continue;

    // ... calcular DRO
  }
}
```

---

## Referencias

- **TCRP Report 195** — Transit Cooperative Research Program: métrica DRO estándar de la industria
- **GTFS Reference** — Google/MobilityData: definición de direction_id (0=IDA, 1=VUELTA)
- **IMM API** — `https://api.montevideo.gub.uy/api/transportepublico/buses/gtfs/static/latest/google_transit.zip`
- **STM GPS en vivo** — `POST https://www.montevideo.gub.uy/buses/rest/stm-online` — codigoEmpresa: 10=COETC, 20=COME, 50=CUTCSA, 70=UCOT

---

*Documento creado: 2026-05-02. Actualizar si cambian los umbrales operativos o la definición de empresa.*
