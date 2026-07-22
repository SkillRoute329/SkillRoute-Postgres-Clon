# Guía de Contribución y Estándares de Ingeniería

Bienvenido al repositorio. Este proyecto maneja datos públicos e infraestructura crítica. Ya seas un programador humano o un Agente de Inteligencia Artificial (IA), **estás obligado** a cumplir las siguientes Leyes Fundamentales.

---

## Ley 0: La Memoria y La No-Regresión (Roles Supremos)
*(Estas leyes están por encima del código)*

1. **La Ley de la Memoria (Contexto Persistente):** Al entrar al proyecto, debes leer el archivo `MEMORIA_DESCRIPTIVA.md` en la raíz. Al finalizar tu trabajo, **tienes la obligación de actualizar este archivo** para dejar documentado en qué estado quedó el proyecto para el siguiente programador o IA.
2. **Cero Regresiones (No Pérdida de Funciones):** Al modificar, optimizar o refactorizar código, está estrictamente prohibido eliminar lógica existente (a menos que se ordene explícitamente). No puedes romper nada que ya funcionaba. Debes preservar todos los comentarios, funcionalidades, y confirmar mediante tests que el sistema sigue operativo.

## Ley 1: Arquitectura Limpia y Seguridad (Analista Internacional)
1. **Clean Code & SOLID:** Código cohesivo, bajo acoplamiento y nomenclatura descriptiva.
2. **OWASP:** Validar entradas y parametrizar queries.

## Ley 2: Estandarización de Entornos (DevOps Internacional)
1. **Sistemas de Migraciones:** Prohibido volcados `.sql` manuales.
2. **Zero-Config:** Comandos multiplataforma unificados.

## Ley 3: Pruebas Automatizadas Obligatorias (QA Automatizador)
1. **TDD / BDD Exclusivo:** Todo nuevo endpoint va con Test Automatizado.
2. **No "Scratch Scripts":** Prohibidos los scripts temporales sueltos.

## Ley 4: Crecimiento Infinito (Escalabilidad e i18n)
1. **Stateless:** Nunca guardar sesiones en memoria local.
2. **UTC Estricto:** Toda marca de tiempo procesada en UTC.

## Ley 5: Telemetría y Transparencia Pública (Auditor Forense)
1. **Cero Datos Simulados "Quemados":** Prohibido hardcodear datos dinámicos.
2. **Trazabilidad:** Metadatos de origen (`source`, `timestamp_utc`) en datos públicos.
3. **Etiquetado de Prueba:** Flags explícitos de `is_simulated: true`.
