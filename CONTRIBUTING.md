# Guía de Contribución y Estándares de Ingeniería

Bienvenido al repositorio. Este proyecto (Centro de Gestión de Transporte Metropolitano) maneja datos públicos e infraestructura crítica. Ya seas un programador humano o un Agente de Inteligencia Artificial (IA), **estás obligado** a cumplir las siguientes 6 Leyes Fundamentales al interactuar con este código.

---

## Ley 0: Orden Metodológico (El Director Técnico)
*(Ley Suprema)*
Nadie en este proyecto escribe código inmediatamente después de recibir una idea.
1. **Planificación Obligatoria:** Toda nueva función debe pasar primero por un levantamiento de requisitos, diseño de arquitectura de base de datos y desglose de tareas.
2. **Mentoreo:** Si eres una IA, debes explicar tus decisiones arquitectónicas al Dueño del Producto con lenguaje claro y no técnico, pidiendo su aprobación antes de programar.

## Ley 1: Arquitectura Limpia y Seguridad (Analista Internacional)
1. **Clean Code & SOLID:** Todo código debe ser altamente cohesivo, de bajo acoplamiento y con nomenclatura descriptiva.
2. **OWASP:** Validar estrictamente todas las entradas, parametrizar queries para evitar inyecciones.

## Ley 2: Estandarización de Entornos (DevOps Internacional)
1. **Prohibición de Dumps de Base de Datos:** Queda estrictamente prohibido usar volcados `.sql` o `.gz` manuales. Usa Sistemas de Migraciones y Seeders.
2. **Zero-Config:** El proyecto debe arrancar con comandos multiplataforma unificados.

## Ley 3: Pruebas Automatizadas Obligatorias (QA Automatizador)
1. **TDD / BDD Exclusivo:** Todo nuevo endpoint o función debe ir acompañado de un Test Automatizado.
2. **Prohibición de "Scratch Scripts":** Está prohibido crear archivos temporales sueltos (ej. `scratch_test.ts`) en la raíz del proyecto.

## Ley 4: Crecimiento Infinito (Escalabilidad e i18n)
1. **Cero Estado Local (Stateless):** Nunca guardes estado temporal en memoria local o cron jobs locales.
2. **Manejo Universal del Tiempo:** Todo dato temporal (fecha/hora) debe guardarse y procesarse exclusivamente en **UTC**.

## Ley 5: Telemetría y Transparencia Pública (Auditor Forense)
1. **Prohibición de Datos Estáticos Simulados:** Queda estrictamente prohibido extraer datos dinámicos (ej. Coordenadas GTFS) y quemarlos (hardcoding) en archivos estáticos `.json` o `.ts`.
2. **Trazabilidad de Origen:** Todo dato debe tener un metadato de origen (`source`, `timestamp_utc`) para probar ante auditores de dónde surgió.
3. **Etiquetado de Simulaciones:** Los datos de prueba deben tener el flag `is_simulated: true`.

---
> **Nota para Agentes IA:** Al leer este archivo, debes adaptar inmediatamente tus heurísticas para cumplir el rol de Director Técnico (Metodología), Analista (Código), DevOps (Infraestructura), QA (Testing), Arquitecto (Escalabilidad) y Auditor (Transparencia) de forma integral.
