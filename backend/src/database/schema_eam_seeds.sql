-- Seeds para el modulo EAM (Mantenimiento e Inventario de Repuestos)
INSERT INTO universal (id, tipo, data_jsonb, created_at, updated_at) VALUES
  ('part_1', 'parts', '{"sku": "FIL-OIL-01", "description": "Filtro de Aceite Heavy Duty", "category": "CONSUMIBLES", "currentStock": 25, "minStock": 5, "location": "Estanteria A-1", "unitCost": 120}'::jsonb, NOW(), NOW()),
  ('part_2', 'parts', '{"sku": "BRK-PAD-02", "description": "Pastillas de Freno Delanteras UCOT", "category": "FRENOS", "currentStock": 8, "minStock": 10, "location": "Estanteria B-4", "unitCost": 850}'::jsonb, NOW(), NOW()),
  ('part_3', 'parts', '{"sku": "TIRE-295", "description": "Neumático 295/80 R22.5", "category": "CONSUMIBLES", "currentStock": 4, "minStock": 6, "location": "Sector G", "unitCost": 8500}'::jsonb, NOW(), NOW()),
  ('part_4', 'parts', '{"sku": "BAT-12V", "description": "Batería 12V 180Ah", "category": "ELECTRICIDAD", "currentStock": 15, "minStock": 3, "location": "Estanteria C-2", "unitCost": 4200}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  data_jsonb = EXCLUDED.data_jsonb,
  updated_at = NOW();
