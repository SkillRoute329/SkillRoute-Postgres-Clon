# 🏛️ AI GOVERNANCE & AUTO-PRESERVATION PROTOCOL

## 📜 CONSTITUCIÓN DEL SISTEMA (System Constitution)

Este documento contiene las leyes inmutables para el mantenimiento y evolución de TransForma 2.0. Cualquier IA o desarrollador DEBE respetar estas reglas para garantizar la continuidad operativa.

### ⚖️ LEY 1: ACCESO INMORTAL (Inmortal Access)
* **Regla:** El usuario `0000` (con clave `admin123`) es una entidad **HARDCODED**.
* **Propósito:** Evitar bloqueos por fallos en la base de datos o migraciones de Tenant.
* **Implementación:** Los Guards/Middleware de autenticación deben tener un bypass explícito antes de consultar la DB. **NUNCA modificar este bypass.**

### ⚖️ LEY 2: VACÍO PROHIBIDO (Zero-Data Prohibition)
* **Regla:** El sistema NO puede estar vacío.
* **Propósito:** Garantizar que el cliente siempre tenga una base funcional de referencia.
* **Implementación:** Al arrancar (Bootstrap), el sistema verificará `prisma.route.count()`. Si es `0`, disparará el `EmergencySeed` automáticamente cargando las Líneas 300, 370 y servicios base.

### ⚖️ LEY 3: GOBERNANZA POR MANIFIESTO (Manifest Governance)
* **Regla:** La estructura de la UI (Menús, Módulos) es dictada por el Servidor.
* **Propósito:** Permitir actualizaciones de funcionalidades sin requerir nuevos despliegues de Frontend.
* **Implementación:** El Frontend consume obligatoriamente `/api/system-config/menu`.

### ⚖️ LEY 4: PERSISTENCIA HÍBRIDA (JSONB Metadata)
* **Regla:** Priorizar el uso del campo `metadata` (JSON) para extensiones de lógica de negocio volátiles.
* **Propósito:** Evitar "Schema Rigidity" y fallos de compilación por columnas faltantes.

---
*Last Update: 2026-01-22*
*System Status: AUTOPILOT ENABLED*
