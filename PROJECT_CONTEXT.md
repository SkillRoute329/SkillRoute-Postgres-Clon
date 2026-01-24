
# 🚌 PROYECTO: TransForma-
**Objetivo:** Plataforma de Gestión de Transporte Público (Uruguay).
**Stack:** React (Vite) + Node.js (Express) + Prisma + PostgreSQL.
**Infraestructura:** Railway (Deploy automático).

## 🚨 REGLAS DE ORO (NO ROMPER NUNCA)
1. **GIT BRANCH:** La rama principal es **`main`**. NUNCA usar `master`.
2. **MOBILE FIRST:** Toda vista debe tener `overflow-x-auto` en tablas y ser responsive. El usuario final usa celular.
3. **DATOS:**
   - Prioridad Líneas: 300 y 306.
   - Matriz de Horarios: Debe soportar notas de texto ("C.Tab.") y columna "Servicio".
4. **PRIORIDADES ACTUALES:**
   - 1. Módulo RRHH (Usuarios/Login) -> **CRÍTICO**.
   - 2. Control de Flota (Fotos).
   - 3. Matriz de Horarios.

## 🛑 ARQUITECTURA DE DATOS
- **User:** Vinculado a `Employee`. Login con CI.
- **Roles:** ADMIN, INSPECTOR, CHOFER, MANTENIMIENTO.
