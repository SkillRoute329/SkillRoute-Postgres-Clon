# Declaración de Cumplimiento de Seguridad — ISO/IEC 27001:2022

Este documento establece la Declaración de Cumplimiento de los controles de seguridad de la información de **SkillRoute**, mapeando las medidas técnicas y organizacionales implementadas en la versión *Self-Hosted* y *Cloud-Native* contra los requisitos del estándar internacional **ISO/IEC 27001:2022 (Anexo A)**.

---

## 1. Alcance y Enfoque

SkillRoute se despliega en un modelo híbrido:
1. **Self-Hosted / Local Master Edition**: Alojado en la infraestructura local del operador (servidores dedicados UCOT) corriendo bajo Node.js, Express y PostgreSQL 15 con PostGIS.
2. **Cloud-Native Edition**: Backend modularizado y funciones Serverless sobre Google Cloud/Firebase.

La presente declaración detalla las políticas y controles activos de seguridad implementados por diseño (*Security by Design*) para garantizar la Confidencialidad, Integridad y Disponibilidad (CIA Triad) de los datos del tránsito y el personal.

---

## 2. Matriz de Mapeo de Controles (Anexo A)

### A.5 Controles Organizacionales

| Control | Descripción ISO | Implementación y Evidencia en SkillRoute | Estado |
|---|---|---|---|
| **A.5.15** | Control de accesos | Acceso basado en el principio de menor privilegio. Roles definidos en base de datos (`users.role`): `CONDUCTOR`, `DRIVER`, `LISTERO`, `TRAFFIC`, `ADMIN`, `SUPERADMIN`. Lógica forzada a nivel de API (middleware `verifyAuth`, `requireAdmin`) y base de datos (`firestore.rules`). | **CUMPLE** |
| **A.5.18** | Derechos de propiedad intelectual | Todo el código fuente y las bases de datos de SkillRoute se encuentran protegidos mediante licencias corporativas internas y repositorios seguros privados en GitHub. Módulos clave como el *Motor de Rotación de Servicios* y el *Algoritmo de Cooldowns de Consecuencias* son propiedad industrial protegida. | **CUMPLE** |
| **A.5.36** | Cumplimiento de requisitos legales y regulatorios | Cumplimiento estricto con la Ley de Protección de Datos Personales de Uruguay (Ley 18.331) y las directivas de auditoría del Sistema de Transporte Metropolitano (STM/IMM). | **CUMPLE** |

### A.8 Controles Tecnológicos

| Control | Descripción ISO | Implementación y Evidencia en SkillRoute | Estado |
|---|---|---|---|
| **A.8.2** | Clasificación de la información | Clasificación en tres niveles: (1) Pública (tarifas, SLA, proceso onboarding); (2) Operacional Privada (colectivos activos, cartones de servicio, incidencias); (3) Datos Personales Sensibles (registro de jornales, cédulas de identidad, fichas médicas de conductores). | **CUMPLE** |
| **A.8.12** | Seguridad de las redes | Cifrado obligatorio en tránsito mediante **TLS 1.3 / HTTPS** para todas las peticiones a la API del backend. Configuración de cabeceras de seguridad HTTP robustas en Express: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. | **CUMPLE** |
| **A.8.20** | Control de privilegios de acceso | Los tokens de sesión se generan utilizando **JSON Web Tokens (JWT)** con algoritmo de firma robusta `HS256` y expiración automática de 24 horas. Almacenados en cookies seguras HTTP-only y cabeceras de autorización en el frontend. | **CUMPLE** |
| **A.8.24** | Uso de criptografía | Almacenamiento seguro de contraseñas de usuarios en base de datos PostgreSQL utilizando algoritmos de derivación de clave adaptables con sal única (hashes criptográficos). Claves de API externas (ej. integraciones de mensajería) almacenadas en variables de entorno seguras (`.env`) nunca expuestas en el repositorio Git. | **CUMPLE** |
| **A.8.31** | Uso de utilidades de sistema con privilegios | Acceso administrativo a paneles críticos (`AdminStressTest.tsx`, `DataIngestion.tsx`, `SystemParamsPage.tsx`) restringido estrictamente mediante el middleware de backend `requireAdmin` y filtros dinámicos por ID de SuperAdmin. | **CUMPLE** |
| **A.8.33** | Auditoría y registro de logs | Logs operacionales gestionados a través de **Winston Logger** en el backend. Se registra el método HTTP, endpoint, código de estado, duración de procesamiento en ms, y el ID del usuario autenticado para cada transacción, almacenados en `logs/backend-out.log` y `logs/backend-err.log`. | **CUMPLE** |
| **A.8.34** | Protección de sistemas de información en desarrollo y pruebas | Separación completa de entornos: Desarrollo local, Pruebas automatizadas (Vitest y Playwright con bases de datos aisladas), y Producción desplegada (PM2 en puerto 3001/3006). | **CUMPLE** |

---

## 3. Plan de Respaldo y Recuperación ante Desastres (Disaster Recovery)

Para garantizar la resiliencia operativa y mitigar riesgos de pérdida de datos por fallas de hardware locales (servidores del operador):
- **Respaldo de Base de Datos Diaria**: Automatizado a través de `exportar_db.bat` que invoca `pg_dump` para la base de datos PostgreSQL local `skillroute_master`.
- **Estructura de Respaldo**: Respaldos completos acumulados de ~4.44 GB con validación de integridad automática post-generación.
- **Plan de Restauración**: Script `importar_db.bat` validado para la reconstrucción completa del esquema de base de datos relacional y geoespacial (PostGIS) en un equipo de contingencia en menos de 15 minutos.
