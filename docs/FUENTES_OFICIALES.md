# Fuentes Oficiales de los Parámetros del Sistema

**Última actualización:** 2026-04-23
**Contexto:** Este documento lista las fuentes oficiales verificables de cada parámetro económico / operativo que SkillRoute usa para calcular ingresos, costos, proyecciones y detecciones de competencia.

## Política de datos

1. **Transparencia total.** Cada valor usado por el sistema está documentado acá con su fuente y, cuando aplica, URL verificable por un tercero.
2. **Editable por Super Administrador.** Todos los parámetros llevan el flag `editableByAdmin: true`. La UI permite modificarlos sin redeploy (pendiente migración a colección Firestore `parametros_operativos`).
3. **Honestidad sobre la confianza del dato.** Cada parámetro tiene un nivel `confidence`:
   - `oficial` — publicado por organismo regulador con URL verificable
   - `calibrado` — basado en literatura internacional revisada (UITP, TRL, BRT Standard)
   - `estimado` — mejor estimación disponible sin calibración externa
   - `hardcoded` — valor provisional, deuda técnica a migrar
4. **Disclaimer visible al usuario.** Cuando un número en un KPI viene de `estimado` o `hardcoded`, la UI muestra un badge y el texto del `disclaimer`. El usuario ejecutivo nunca ve un número como "verdad absoluta" si no lo es.
5. **Advertencia global.** El sistema puede contener errores producto de no tener la fuente ground-truth real para algunos datos (ej. boletaje minuto-a-minuto UCOT, salarios exactos individuales). En esos casos, se utilizan datos de fuentes oficiales o literatura internacional como mejor aproximación disponible, y se indica explícitamente.

---

## Registro de fuentes

### Tarifa STM

- **Valor actual:** $45 UYU / boleto (urbano)
- **Fuente:** Intendencia de Montevideo — Sistema de Transporte Metropolitano
- **URL:** https://www.montevideo.gub.uy/buses/tarifas
- **Confidence:** oficial
- **Nota:** Si la IMM publica ajuste, actualizar `TARIFA_STM.valor` en `parametros-operativos.ts` (un solo lugar para frontend y backend).

### Precio gasoil — Combustible por km

- **Valor actual:** $12 UYU / km
- **Fuente primaria:** ANCAP — precios oficiales combustibles
- **URL:** https://www.ancap.com.uy/pagina/precios-de-paridad-de-importacion
- **Método:** precio gasoil oficial × consumo estimado bus urbano (~40 L / 100 km)
- **Confidence:** calibrado
- **Disclaimer:** Consumo estimado. Para precisión mayor, conectar telemetría CAN/OBD-II de los vehículos.

### Salario conductor diario

- **Valor actual:** $1 800 UYU / día
- **Fuente:** Consejo de Salarios Grupo 13 "Transporte y Actividades Conexas" — Ministerio de Trabajo y Seguridad Social (MTSS)
- **URL:** https://www.gub.uy/ministerio-trabajo-seguridad-social/politicas-y-gestion/consejos-salarios
- **Confidence:** calibrado
- **Disclaimer:** Promedio de convenio. Salario real depende de antigüedad, turno y categoría. Para cifras exactas conectar a sistema de nómina UCOT.

### Kilometraje promedio por viaje

- **Valor actual:** 18 km / viaje
- **Fuente:** Recorridos oficiales STM por línea
- **URL:** https://www.montevideo.gub.uy/buses/recorridos
- **Confidence:** estimado
- **Disclaimer:** Promedio agregado. Varianza real por línea 14-25 km. Pendiente tabla por línea.

### Ocupación hora pico / valle

- **Valores:** pico 0.85 / valle 0.45
- **Fuente:** BRT Standard (ITDP — Institute for Transportation and Development Policy)
- **URL:** https://www.itdp.org/library/standards-and-guides/the-bus-rapid-transit-standard/
- **Confidence:** calibrado
- **Disclaimer:** Promedios internacionales Latinoamérica. Pendiente calibrar con datos APC reales UCOT.

### Mantenimiento por km

- **Valor actual:** $3 UYU / km
- **Fuente:** Benchmark UITP KPIs costos operacionales bus urbano
- **URL:** https://www.uitp.org/publications/key-performance-indicators-kpis
- **Confidence:** calibrado

### Seguro diario por vehículo

- **Valor actual:** $500 UYU / día
- **Fuente:** Estimación basada en primas BSE (Banco de Seguros del Estado) flota comercial
- **URL:** https://www.bse.com.uy/inicio/empresas/vehiculos-empresa
- **Confidence:** estimado

### Elasticidad de demanda vs flota

- **Valor actual:** 0.002 (fracción por % de reducción)
- **Fuente:** Balcombe et al. (2004) "The demand for public transport: a practical guide", TRL Report 593
- **URL:** https://trl.co.uk/publications/trl593---the-demand-for-public-transport-a-practical-guide
- **Método:** Elasticidad frecuencia→demanda urbana corto plazo rango 0.15-0.35; escalado a "% por % de reducción" = 0.0015-0.0035. Se usa el valor conservador 0.002.
- **Confidence:** calibrado
- **Disclaimer:** Literatura UK/Europa. Pendiente calibrar con datos históricos UCOT.

### Radio de detección de competencia

- **Valor actual:** 0.3 km (300 m)
- **Fuente:** Estándar operativo UCOT — corredor compartido real
- **Confidence:** calibrado
- **Nota:** Fix #1 (2026-04-23). Antes había contradicción: comentario decía 300 m pero código usaba 2 km. Se resolvió a favor de 300 m para evitar falsos positivos.

### Radio de bunching (agrupamiento)

- **Valor actual:** 0.8 km
- **Fuente:** UITP headway control best practices
- **URL:** https://www.uitp.org/publications
- **Confidence:** calibrado

---

## Datos que seguirán siendo estimaciones hasta tener ground-truth

Los siguientes parámetros son **estimaciones razonables** basadas en literatura internacional o benchmarks, no datos UCOT exactos. Cuando estén disponibles las fuentes reales, deben reemplazarse:

| Parámetro | Qué necesitamos para ground-truth |
|---|---|
| Pasajeros promedio por viaje | Integración APC (Automatic Passenger Counting) en flota UCOT |
| Ocupación pico/valle | APC + datos por hora y por línea |
| Kilometraje por línea | Tabla dinámica `lineas_ucot.kmViaje` alimentada por GTFS |
| Salario conductor diario | Integración con sistema de nómina UCOT |
| Mantenimiento | Conexión a órdenes de trabajo del taller |
| Combustible por km | Telemetría CAN/OBD-II de los buses |
| Elasticidad demanda | Series históricas internas UCOT (3+ años) |

---

## Cómo editar un parámetro (Super Admin)

1. En la UI de administración, ir a **Configuración → Parámetros Operativos**.
2. Cada parámetro muestra: valor actual, unidad, fuente, URL, confidence, última modificación.
3. Modificar el campo `valor`. Al guardar, el sistema:
   - Registra el cambio en `parametros_operativos_historial` (con userId + timestamp + valor anterior).
   - Actualiza `fechaVigenciaDesde` automáticamente.
   - Sube el `confidence` a `oficial` si se indica URL nueva.
4. Un cambio puede revertirse desde el historial.

> **Recomendación:** antes de modificar, anotá en el campo `fuente` de dónde sacaste el nuevo valor. Eso preserva la trazabilidad para auditorías posteriores.

---

## Archivos involucrados

- `frontend/src/config/parametros-operativos.ts` — fuente única del lado cliente
- `backend/src/config/parametros-operativos.ts` — espejo server-side (mantener sincronizado)
- `FUENTES_OFICIALES.md` — este documento
- `docs/CHANGELOG_FIXES_2026-04-23.md` — historial de cambios en parámetros
