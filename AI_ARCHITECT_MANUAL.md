
# 🧠 AI ARCHITECT MANUAL (TransForma Project)
*Last Updated: 2026-01-22*

## 1. 🛡️ Protocolos de Base de Datos (DATABASE LAWS)
* **Principio de Persistencia:** JAMÁS usar `deleteMany` o `reset` en producción. Usar siempre `upsert`.
* **Arquitectura Híbrida (JSONB):**
    * El esquema SQL (`schema.prisma`) es RÍGIDO. Solo se modifica bajo orden explícita.
    * **Regla de Oro:** Si necesitas guardar un dato nuevo (ej: `alergias`, `status_extra`, `legacy_id`, `classification`, `driverStatus` si no existe enum) y la columna NO existe, **DEBES** guardarlo dentro del campo `metadata` (JSON).
    * *Incorrecto:* `User.create({ ..., classification: 'Admin' })` (Rompe el build si la columna no existe).
    * *Correcto:* `User.create({ ..., metadata: { classification: 'Admin' } })` (Funciona siempre).

## 2. 🚀 Protocolos de Despliegue (OPS-TRIGGER)
* No despliegues "porque sí".
* El despliegue se dispara editando `ops/manifest.json`.
* Si el build falla, NO intentes parches oscuros. Vuelve a la configuración estándar y reporta.
* Usar `FORCE_ACCESS_UPDATE` u otros comandos definidos en GitHub Actions.

## 3. 🔧 Herramientas de Auto-Mantenimiento
* **Scripts:** Los scripts en `src/scripts/` son tus aliados (ej: `evolve_db.ts`, `ensure_access.ts`).
* **Evolve DB:** Antes de pedir cambios de esquema, verifica si `metadata` puede resolver el problema.
* **Master Keys:** `ensure_access.ts` se ejecuta al arranque para garantizar acceso admin.

## 4. 🔐 Seguridad y Acceso
* El usuario `0000` y `admin@transformafacil.com` son INMORTALES.
* Cualquier script de inicio (`start`) debe garantizar su existencia.
* Passwords siempre hasheados con bcrypt.

## 5. 🏗️ Controller Logic
* Usa `Prisma` syntax correcto. 
* Relaciones: Usa `connect: { id: ... }`. NO uses `relationId` directos si no estás seguro de que la FK está expuesta.
