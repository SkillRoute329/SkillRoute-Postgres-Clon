
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

## 4. 🛡️ Protocolo Anti-Competencia (Dynamic Headway)
* **Concepto:** El horario teórico es una referencia, el intervalo real es la ley.
* **Regla de Despacho:** El sistema permitirá al Inspector ingresar "Avistamiento Competencia".
* **Algoritmo de Reacción:**
    * Si (Tiempo desde Competencia < 3 min) -> Generar "Alerta de Retención" (+2 min espera) al Chofer en su App.
    * Objetivo: Maximizar la carga capturando la demanda acumulada posterior, no competir por las sobras.

## 5. 📉 Reglas de Eficiencia (Eco-Driving)
* **Monitoreo:** Cada viaje cerrado generará un "Score de Eficiencia" (basado en cumplimiento de horario sin adelantos bruscos).
* **Sanción Automática:** Llegar > 3 minutos ANTES a la terminal (correr) genera una "Alerta de Gasto de Combustible".
* **Recompensa:** Los mejores Scores tendrán prioridad automática en la solicitud de "Cambios de Turno" (Módulo RRHH).

* **Análisis:** El sistema debe ser capaz de agrupar estos puntos para decirnos DÓNDE y CUÁNDO se vende, y sugerir recortes de servicios vacíos.

## 7. 🕵️ Inteligencia Competitiva (STM Integration)
* **Fuente de Datos:** API de Transporte Público de Montevideo (Open Data).
* **Lógica de Ingesta:**
    * El sistema consultará posiciones de líneas rivales (filtradas por número de línea).
    * **Cálculo de Amenaza:** Si un rival está a < 500 metros adelante -> ALERTA ROJA.
* **Input Manual (Respaldo):** Botón en App Conductor/Inspector para reportar "Avistamiento Visual".
