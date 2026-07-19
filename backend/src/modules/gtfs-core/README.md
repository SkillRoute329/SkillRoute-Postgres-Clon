# 🚨 MÓDULO GTFS-CORE (ZONA PROTEGIDA) 🚨

Este módulo contiene toda la lógica de sincronización, importación masiva y resolución de horarios del Sistema de Transporte Metropolitano (STM) y GTFS de la Intendencia de Montevideo.

**⚠️ ADVERTENCIA A TODOS LOS DESARROLLADORES ⚠️**
1. **NO TOCAR** directamente los scripts ni servicios dentro de esta carpeta sin autorización o sin un plan arquitectónico.
2. **ENCAPSULACIÓN ESTRICTA:** Ningún otro módulo del sistema debe importar archivos internos de este directorio (como `gtfsService.ts` o los JSON de datos). **TODO** el consumo de este módulo debe hacerse obligatoriamente a través del archivo `index.ts` principal de esta carpeta.
3. El mapeo de rutas a agencias se auto-genera con `scripts/generate_agency_mapping.js` conectándose en vivo a la API oficial de la IMM. NO SE PERMITE USAR EXPRESIONES REGULARES para "adivinar" agencias.

Cualquier alteración a este módulo podría romper el motor core del sistema (Schedule Compliance, Forecasting, Dashboard de Planificación).
