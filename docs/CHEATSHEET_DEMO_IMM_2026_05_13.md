# 🎯 CHEATSHEET DEMO IMM — 2026-05-13

> Imprimí esto y tenelo al lado durante la reunión. Si algo falla, esta es la guía rápida.

---

## 🔐 ACCESO

| Item | Valor |
|---|---|
| URL del programa | **http://localhost:3006** |
| Usuario (interno) | **329** |
| Contraseña | **Skill329** |
| Rol | SUPERADMIN (ves los 4 operadores) |

---

## 📺 GUION DEL DEMO — ORDEN RECOMENDADO

### Apertura: "Esto NO es PowerPoint" (2 min)

**Abrir:** [Fleet Monitor](http://localhost:3006/traffic/fleet-monitor)

> "Lo primero que les muestro no es un slide. Son los **buses que están circulando en este segundo** por el sistema metropolitano de Montevideo. El mapa lo está actualizando un servidor propio acá adentro, sin pasar por Google, sin Firebase, sin nube externa."

**Métricas que ven en pantalla:**
- ~750-800 buses live (depende de la hora)
- 4 operadores con colores distintos
- Botones para filtrar por operador

**Si preguntan "¿de dónde sale esto?":**
> "Del endpoint público IMM. Nuestro servidor lo consume cada 10 segundos y lo guarda en nuestra base. Esto es lo que hace que la auditoría dependa solo de nosotros, no del proveedor cloud de turno."

---

### Paso 2: Centro de Mando Unificado (3 min)

**Abrir:** [Centro de Mando Unificado](http://localhost:3006/dashboard/super-admin/centro-mando)

**Mostrar:**
- 800+ buses activos cross-operador
- Distribución por empresa con números reales
- Alertas en vivo

**Discurso clave:**
> "Esto es lo que ningún operador puede hacer solo: ver el sistema completo. CUTCSA controla sus 2,000 buses, UCOT sus 300. Pero **nadie tiene la imagen completa**. Esta plataforma sí."

---

### Paso 3: Market Share vs Datos Oficiales STM (1 min)

**Abrir:** [Centro de Mando Unificado](http://localhost:3006/dashboard/super-admin/centro-mando) (mismo o ir a ShadowAnalytics)

**Discurso ORO para auditoría:**
> "El sistema reporta cuota de mercado: CUTCSA 64.8%, COETC 16.9%, UCOT 15.7%, COME 2.6%. Si comparan estos números con sus datos oficiales STM, la desviación es **menor a 0.2 puntos porcentuales**. No es coincidencia — es el feed IMM oficial fluyendo a través del clon."

---

### Paso 4: OTP por Línea (3 min)

**Abrir:** [Tablero OTP](http://localhost:3006/traffic/otp-dashboard)

**Mostrar:**
- OTP Global por empresa
- Variabilidad por línea (300=55%, 306=37%, 17=42%, 328=78%, etc.)

**Discurso:**
> "Acá no hay un número agregado decorativo. Cada línea tiene su % de cumplimiento real medido cada 10 segundos contra el horario GTFS oficial. La línea 306 está en 37%: tiene 10 buses con atraso sistemático. La 328 está en 78%, ejemplar. **El sistema no opina — mide**."

**Si preguntan "¿qué tolerancia usan?":**
> "±4 minutos. Política unificada IMM/TCRP 165."

---

### Paso 5: Triangulación IMM-Cartón-GPS (4 min) — KILLER FEATURE

**Decir:**
> "Esto es lo único que ningún competidor del mundo tiene. Optibus no se conecta al sistema interno del operador. Swiftly tampoco. Nuestra plataforma sí: cruza **tres capas en vivo**."

**Comando si querés mostrar en consola** (Ctrl+Shift+I → Network → buscar /api/cartones/triangulacion):
- IMM-GTFS: 100 paradas oficiales con horarios HH:MM:SS
- Cartón UCOT: lo que UCOT prometió a IMM
- GPS real: lo que pasó

**Mostrar coche 91** ([abrir consola del browser](http://localhost:3006) y pegar):
```javascript
fetch('/api/cartones/comparativa-etapas/91?agency_id=70', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('skillroute_jwt')}
}).then(r=>r.json()).then(d => console.table(d.viajes.flatMap(v => v.etapas)))
```

Sale tabla:
```
etapa | parada | tiempo_carton | tiempo_real_gps | desviacion_min | clasificacion
1     | PCarretas Tnal | 08:28 | 08:31 | +3 | EN_TIEMPO
2     | L.A.Herrera/Rivera | 08:48 | 08:54 | +6 | ATRASADO
...
```

**Discurso:**
> "Coche 91 hoy: línea 329, cartón 1070. Su compromiso con IMM eran 54 etapas en 4 viajes. Cumplió **el 58.8%**. La etapa 2 sale 6 minutos tarde sistemáticamente. Eso no era visible para nadie antes. Ahora es visible — y se puede corregir."

---

### Paso 6: Detección automática de cartones desajustados (2 min)

**Comando navegador console:**
```javascript
fetch('/api/cartones/ajustes-sugeridos/306?agency_id=70&dias=7', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('skillroute_jwt')}
}).then(r=>r.json()).then(d => console.log('PARADAS PROBLEMÁTICAS:', d.paradas_problematicas, '/', d.total_paradas_analizadas, '— ' + d.recomendacion_general))
```

**Discurso:**
> "Para la línea 306, en 7 días, **el sistema analizó 4,407 mediciones GPS y detectó 25 paradas con desviación sistemática**. 8 de ellas son críticas. Por cada parada problemática, el sistema sugiere específicamente cuántos minutos ajustar. UCOT no tiene que adivinar — el sistema le dice 'esta parada necesita +43 minutos'."

---

### Paso 7: Solapamiento cross-operador (2 min)

**Abrir:** [Corridor Map](http://localhost:3006/traffic/corridor-map)

**Discurso:**
> "Cuatro mil pares de líneas analizados. 11 pares en zona crítica T1: comparten más del 70% del recorrido en el mismo sentido. Eso no es competencia teórica — es competencia real medida sobre 329,874 puntos GPS oficiales."

**Ejemplo concreto:** COETC línea L14 vs CUTCSA línea 127 → 95% solapamiento, 6.88 km compartidos.

---

### Paso 8: Estado del sistema (cerrar con prueba de autonomía) (1 min)

**Comando navegador console:**
```javascript
fetch('/api/audit/poller-stats', {
  headers: {'Authorization': 'Bearer ' + localStorage.getItem('skillroute_jwt')}
}).then(r=>r.json()).then(d => console.log(d))
```

**Mostrar:**
- isRunning: true
- 55,000+ ciclos
- 0 errores
- agencies: [70, 50, 20, 10]

**Cierre:**
> "El sistema está corriendo en este servidor sin parar desde hace [N horas/días]. 55,000 ciclos del poller, cero errores. Toda esta data vive en Postgres que pueden auditar directamente si quieren. Es soberano."

---

## 🛟 SI ALGO FALLA EN VIVO

### El navegador no carga http://localhost:3006

```bash
pm2 status                              # ver qué hay corriendo
pm2 restart skillroute-frontend         # reiniciar solo el frontend
pm2 logs skillroute-frontend --lines 20 # ver qué dice
```

### Una pantalla está en blanco

Recarga con Ctrl+F5 (force refresh, ignora caché).

### Si el wifi se cae

**No importa.** Todo es local — Postgres, backend, frontend, watcher, backup. Lo único externo es el poller que llama a `montevideo.gub.uy/buses/rest/stm-online`. Si IMM cae, el sistema sigue con los últimos datos cargados (10.7M eventos históricos).

### El login no funciona

Verificar backend:
```bash
curl -s http://localhost:3001/api/health
```

Si responde `{"ok":true,"data":{"status":"UP"...`, está vivo. Si no:
```bash
pm2 restart skillroute-backend
```

### Para recargar TODO

```bash
pm2 restart all
```

### Para apagar al final del día

```bash
pm2 stop all      # detener todo
pm2 start all     # volver a levantarlo
```

---

## 🎯 NÚMEROS PARA TENER MEMORIZADOS

| Métrica | Valor | Por qué importa |
|---|---|---|
| Buses live ahora | 750-800 | Prueba que es real |
| Eventos GPS históricos | **10.7M** | Profundidad analítica |
| Alertas regulación históricas | **958K** | Trazabilidad operativa |
| Ciclos poller sin error | **55,000+** | Soberanía / autonomía |
| Pares DRO cross-op | **4,009** | Inteligencia única |
| Market share CUTCSA | **64.8%** (<0.2% vs STM) | Veracidad |
| Tolerancia OTP | ±4 min | Política IMM/TCRP 165 |
| Cartones cargados | 5 (lote piloto) + ~12 en cola | Ingesta automática |
| Servicios PM2 corriendo 24/7 | 5 | Continuidad operativa |

---

## 🚨 QUÉ NO HACER

- ❌ **No mostrar Math.random()** en consola — no hay (verificado)
- ❌ **No abrir pantallas de admin que muestren vacío** sin explicar: Maintenance, Licencias, Fichas Médicas son administrativas internas que se llenarán cuando UCOT migre su sistema interno
- ❌ **No prometer features que aún no están**: el HRR Engine (Headway-to-Rival Ratio) está armado pero el cron no se activó todavía — decir "preparado para activarse, requiere config final"

---

## 📞 CONTACTO TÉCNICO

Si necesitás soporte durante el demo, los comandos PM2 (arriba) cubren el 95% de problemas. Para el resto, decir: "tenemos el equipo técnico standby, pero como pueden ver el sistema sigue dándoles los números mientras lo arreglamos en segundo plano — la data no se pierde porque está en Postgres soberano con backup cada 6 horas".

---

**Última actualización:** 2026-05-13 17:35 UY
**Build:** clon autónomo skillroute v2.0.1-MODULAR + FASE 5.12
