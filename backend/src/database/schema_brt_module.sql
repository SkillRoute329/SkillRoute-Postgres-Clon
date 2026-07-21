-- Esquema para Módulo BRT Dinámico

CREATE TABLE IF NOT EXISTS brt_financial_config (
  id SERIAL PRIMARY KEY,
  tarifa_actual_uyus NUMERIC(10,2) NOT NULL DEFAULT 42,
  costo_dia_actual_uyus NUMERIC(12,2) NOT NULL DEFAULT 12500,
  tarifa_km_brt_uyus NUMERIC(10,2) NOT NULL DEFAULT 420,
  km_promedio_dia NUMERIC(10,2) NOT NULL DEFAULT 220,
  pasajeros_prom_dia INTEGER NOT NULL DEFAULT 450,
  captacion_empresa NUMERIC(5,2) NOT NULL DEFAULT 0.72,
  brt_bonus_nocturno NUMERIC(5,2) NOT NULL DEFAULT 1.25,
  brt_riesgo_kpi_min NUMERIC(5,2) NOT NULL DEFAULT 0.95,
  brt_costo_dia NUMERIC(12,2) NOT NULL DEFAULT 14500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar configuración inicial por defecto (solo si está vacía)
INSERT INTO brt_financial_config (id) 
SELECT 1 
WHERE NOT EXISTS (SELECT 1 FROM brt_financial_config WHERE id = 1);

CREATE TABLE IF NOT EXISTS brt_scenarios (
  id VARCHAR(50) PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  tramo VARCHAR(200) NOT NULL,
  descripcion TEXT NOT NULL,
  pasajeros_desplazados INTEGER NOT NULL DEFAULT 0,
  lineas_afectadas JSONB NOT NULL DEFAULT '[]',
  duracion_est_meses NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  impacto_passenger_min INTEGER NOT NULL DEFAULT 0,
  costo_adicional_dia NUMERIC(12,2) NOT NULL DEFAULT 0,
  plan_desvio JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrar escenarios iniciales si está vacío
INSERT INTO brt_scenarios (id, titulo, tramo, descripcion, pasajeros_desplazados, lineas_afectadas, duracion_est_meses, impacto_passenger_min, costo_adicional_dia, plan_desvio)
SELECT 'obra_8oct', 'Corte Total 8 de Octubre', 'Habana - Pan de Azúcar', 'Fase 1 de excavación profunda para estaciones subterráneas. Interrupción total de calzada.', 12500, '["100", "102", "103", "105", "109", "110", "111", "112", "113"]'::jsonb, 6, 15, 85000, 
'[
  {"tipo": "desvio", "accion": "Líneas por 8 de Octubre hacia afuera desvían por Av. Italia > Comercio > 8 de Octubre."},
  {"tipo": "desvio", "accion": "Líneas hacia el centro desvían por Comercio > José A. Cabrera > Bv. Batlle y Ordóñez."},
  {"tipo": "refuerzo", "accion": "Inyección de 4 coches retén en intercambiador Belloni en horas pico."},
  {"tipo": "info", "accion": "Inspectores de UCOT en paradas clave redirigiendo pasaje."}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM brt_scenarios WHERE id = 'obra_8oct');

INSERT INTO brt_scenarios (id, titulo, tramo, descripcion, pasajeros_desplazados, lineas_afectadas, duracion_est_meses, impacto_passenger_min, costo_adicional_dia, plan_desvio)
SELECT 'obra_italia', 'Reducción calzada Av. Italia', 'Comercio - Gallinal', 'Construcción de carril exclusivo central BRT. Se reduce a 1 carril por sentido.', 28000, '["21", "64", "71", "370", "407"]'::jsonb, 8, 22, 112000, 
'[
  {"tipo": "desvio", "accion": "Sin desvío, pero circulación a velocidad de paso (5km/h)."},
  {"tipo": "especial", "accion": "Suspensión temporal de línea 64, fusionando frecuencias con línea 21."},
  {"tipo": "refuerzo", "accion": "Costos de horas extras por retrasos en término de turnos."}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM brt_scenarios WHERE id = 'obra_italia');
