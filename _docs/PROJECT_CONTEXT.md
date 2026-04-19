# 🚌 PROYECTO: TransForma- 2.0 (MODO DIOS)

**Objetivo:** Plataforma de Gestión de Transporte Público (Uruguay) con Inteligencia Competitiva.
**Stack:** React (Vite) + Firebase (Auth/Firestore).
**Infraestructura:** Google Cloud (Firebase).

## 🚨 REGLAS DE ORO (NO ROMPER NUNCA)

1. **MOBILITY FIRST:** El 90% del uso es en celular. Tablas con scroll horizontal y botones grandes.
2. **DATOS OFICIALES:** Los "Cartones" (matrices) son la ley. No se simulan, se ingieren desde el Excel oficial.
3. **CATEGORIZACIÓN:** Los servicios se agrupan por temporada (VERANO/INVIERNO) y tipo de día (HABIL/SABADO/DOMINGO).
4. **COMPETENCIA:** Monitoreo en tiempo real de UCOT vs Rivales (103, 128, etc) vía IMM API.

## 🏁 PRIORIDADES ACTUALES (SESIÓN 3+)

- **1. Gestión de Cartones:** Ingesta y visualización de matrices oficiales.
- **2. Inteligencia Competitiva:** Radar de brecha con competidores.
- **3. Listero Digital:** Asignación de coche y guarda a servicios del cartón.
- **4. RRHH:** Perfil de empleado y control de asistencias.

## 🛑 ARQUITECTURA DE DATOS

- **Carton:** Documento por servicio con `rawMatrix` (puntos de control x tiempos).
- **Viaje Activo:** Posición en tiempo real y estado del servicio.
- **Roles:** SUPERADMIN (0000), ADMINISTRATIVO, PERSONAL_DE_TRAFICO, CHOFER.
