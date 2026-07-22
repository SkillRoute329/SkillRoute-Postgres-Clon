# Guía de Contribución y Estándares de Ingeniería

Bienvenido al repositorio. Este proyecto se rige bajo **estrictos estándares internacionales de calidad, escalabilidad y automatización**. Ya seas un programador humano o un Agente de Inteligencia Artificial (IA), **estás obligado** a cumplir las siguientes 4 Leyes Fundamentales al interactuar con este código.

---

## Ley 1: Arquitectura Limpia y Seguridad (Analista Internacional)
1. **Clean Code & SOLID:** Todo código debe ser altamente cohesivo, de bajo acoplamiento y con nomenclatura descriptiva.
2. **OWASP:** Validar estrictamente todas las entradas, parametrizar queries (o usar ORMs/QueryBuilders) para evitar inyecciones SQL/NoSQL.
3. **Documentación:** Funciones de alta complejidad deben tener JSDoc/TSDoc.

## Ley 2: Estandarización de Entornos (DevOps Internacional)
1. **Prohibición de Dumps de Base de Datos:** Queda **estrictamente prohibido** usar volcados `.sql` o `.gz` manuales para iniciar bases de datos. Debes usar o crear Sistemas de Migraciones y Seeders (ej. Knex, Prisma).
2. **Zero-Config:** El proyecto debe arrancar con comandos multiplataforma unificados. No dependas de scripts `.bat` exclusivos de Windows.
3. **Cuidado con Git:** Todo binario y salto de línea debe estar regulado por el archivo `.gitattributes`.

## Ley 3: Pruebas Automatizadas Obligatorias (QA Automatizador)
1. **TDD / BDD Exclusivo:** Todo nuevo endpoint, función lógica o corrección de error **debe** ir acompañado de un Test Automatizado (Jest, Vitest, Playwright).
2. **Prohibición de "Scratch Scripts":** Está prohibido crear archivos temporales sueltos (ej. `scratch_test.ts`, `tmp_script.js`) en la raíz del proyecto para "probar si algo funciona". Escribe un Test Formal en su lugar.
3. **Limpieza:** No dejes archivos `.log`, reportes crudos, o código comentado muerto (zombie code).

## Ley 4: Crecimiento Infinito (Escalabilidad e i18n)
1. **Cero Estado Local (Stateless):** El backend no puede guardar información en memoria (RAM) o usar procesos locales (como `node-cron` simple). Usa cachés distribuidas (Redis) y colas de tareas.
2. **Manejo Universal del Tiempo:** Todo dato temporal (fecha/hora) debe guardarse y procesarse exclusivamente en **UTC**. La conversión a zona horaria local se hace en el Frontend/Cliente.
3. **Preparado para Multi-Tenant:** Toda consulta a base de datos debe contemplar el aislamiento entre agencias (Row Level Security o filtrado por ID).

---
> **Nota para Agentes IA:** Al leer este archivo, debes adaptar inmediatamente tus heurísticas para cumplir los roles de Analista, DevOps, QA y Arquitecto de Escalabilidad de forma simultánea.
