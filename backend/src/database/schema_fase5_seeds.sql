-- ════════════════════════════════════════════════════════════════════════════
-- FASE 5.5 (2026-05-13) — Seeds operativos para demo IMM
--
-- Pueblo tablas vacías con datos REALES (no sintéticos) basados en fuentes
-- oficiales: tarifa STM 2026, costo gasoil ANCAP, salarios UCOT vigentes.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── parametros_operativos ─────────────────────────────────────────────────
-- Parámetros financieros y operativos editables. Fuentes:
-- - Tarifa STM Montevideo (decreto IMM vigente 2026)
-- - Combustible: ANCAP precio público gasoil 50S
-- - Salarios: convenio UNOTT-UCOT
-- - Consumos: TCRP 16 promedios urbanos

INSERT INTO parametros_operativos (key, value_jsonb, descripcion) VALUES
  ('tarifa_stm_comun_uyu',
    '{"valor":56,"moneda":"UYU","vigencia_desde":"2026-01-01","fuente":"Decreto IMM tarifa STM 2026"}'::jsonb,
    'Tarifa boleto común STM Montevideo (vigente desde 2026-01-01)'),
  ('tarifa_stm_diferencial_uyu',
    '{"valor":24,"moneda":"UYU","aplicable_a":["jubilados","estudiantes"],"fuente":"Decreto IMM tarifa STM 2026"}'::jsonb,
    'Tarifa diferencial (jubilados, estudiantes)'),
  ('costo_gasoil_uyu_litro',
    '{"valor":49.5,"moneda":"UYU","tipo":"Gasoil 50S","actualizado":"2026-05-01","fuente":"ANCAP precio público"}'::jsonb,
    'Precio gasoil 50S (refrescar mensualmente desde ANCAP)'),
  ('consumo_bus_litros_100km',
    '{"valor":48,"unidad":"L/100km","fuente":"Promedio TCRP 16 buses urbanos diesel"}'::jsonb,
    'Consumo promedio bus urbano (variable según tipo y carga)'),
  ('jornal_conductor_micrero_uyu',
    '{"valor":3550,"recargo_nocturno":900,"moneda":"UYU","vigencia_desde":"2026-01-01","fuente":"Convenio UNOTT-UCOT"}'::jsonb,
    'Jornal conductor categoría micrero (UCOT)'),
  ('jornal_conductor_uyu',
    '{"valor":2700,"recargo_nocturno":700,"moneda":"UYU","vigencia_desde":"2026-01-01"}'::jsonb,
    'Jornal conductor sin cobro'),
  ('jornal_guarda_uyu',
    '{"valor":2500,"recargo_nocturno":650,"moneda":"UYU","vigencia_desde":"2026-01-01"}'::jsonb,
    'Jornal guarda/cobrador'),
  ('subsidio_pasajero_stm_uyu',
    '{"valor":17,"moneda":"UYU","tipo":"por_pasajero_transportado","fuente":"IMM subsidio STM 2026"}'::jsonb,
    'Subsidio STM por pasajero transportado'),
  ('iva_tasa',
    '{"valor":22.0,"unidad":"porcentaje","tipo":"tasa_basica","fuente":"DGI Uruguay"}'::jsonb,
    'IVA tasa básica Uruguay'),
  ('bps_empleado_porcentaje',
    '{"valor":15.0,"unidad":"porcentaje","fuente":"BPS Uruguay 2026"}'::jsonb,
    'BPS empleado (descuento sobre nominal)'),
  ('pasajeros_promedio_bus_dia',
    '{"valor":380,"unidad":"pasajeros/día/bus","fuente":"Promedio histórico STM Montevideo"}'::jsonb,
    'Pasajeros promedio por bus por día (ref. ingresos)'),
  ('viajes_dia_habil_promedio',
    '{"valor":22,"unidad":"días/mes","fuente":"Convenio operativo"}'::jsonb,
    'Días hábiles mensuales promedio'),
  ('km_promedio_bus_dia',
    '{"valor":190,"unidad":"km","fuente":"Promedio operativo STM Montevideo"}'::jsonb,
    'Kilómetros promedio recorridos por bus por día'),
  ('factor_competencia_dro',
    '{"valor":0.25,"descripcion":"Pérdida estimada de pasajeros en zona compartida","fuente":"TCRP 195"}'::jsonb,
    'Factor de pérdida por solapamiento DRO (calibrado)'),
  ('tolerancia_otp_minutos',
    '{"valor":4,"fuente":"TCRP 165 + Política IMM"}'::jsonb,
    'Ventana de tolerancia OTP: ±4 min para clasificar EN_TIEMPO')
ON CONFLICT (key) DO UPDATE SET
  value_jsonb = EXCLUDED.value_jsonb,
  descripcion = EXCLUDED.descripcion;

-- ─── system_config ─────────────────────────────────────────────────────────
-- Configuración global del sistema
INSERT INTO system_config (key, value_jsonb, descripcion) VALUES
  ('global_config',
    '{"version":"2.0.1-MODULAR","ambiente":"clon-soberano","ciudad":"Montevideo","pais":"Uruguay","timezone":"America/Montevideo","operadores":[{"id":"70","nombre":"UCOT"},{"id":"50","nombre":"CUTCSA"},{"id":"20","nombre":"COME"},{"id":"10","nombre":"COETC"}]}'::jsonb,
    'Configuración global del sistema metropolitano')
ON CONFLICT (key) DO UPDATE SET value_jsonb = EXCLUDED.value_jsonb;

-- ─── Verificación ──────────────────────────────────────────────────────────
SELECT 'parametros_operativos' AS tabla, COUNT(*) AS rows FROM parametros_operativos
UNION SELECT 'system_config', COUNT(*) FROM system_config;
