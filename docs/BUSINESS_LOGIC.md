
# 🚌 REGLAS DE NEGOCIO Y LÓGICA DE TRANSPORTE (UCOT / GENERAL)

## 1. Jerarquía de Datos (Data Binding)
* Usuario -> Empresa -> Área -> Cargo -> Salario -> Coche/Lista -> Historial.
* NADA queda suelto. Cada acción genera un log estadístico.

## 2. Motor de Evaluación (ABL General)
* **Auto-Evaluación:** Basada en Boletines (Hora real vs Hora teórica).
* **Alertas Viales:** Si el desvío > X%, notificar "Cerca de Penalización".
* **Refuerzo Positivo:** Si el desvío disminuye, notificar "¡Estás mejorando!".

## 3. Lógica de Cambios (Swap Logic)
* **Solicitud de Correlativo (Ej: Chofer 100 con 200):**
    * Regla 1: No desplazar personal fijo (salvo acuerdo mutuo).
    * Regla 2: Si no caben en el mismo coche, asignar coches distintos con **MARGEN DE 45 MINUTOS** entre bajada y subida.
