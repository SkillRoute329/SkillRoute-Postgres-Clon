INSERT INTO users (id, email, full_name, role, agency_id, data_jsonb) 
VALUES ('329', 'imm-global@local.host', 'Operador Global IMM', 'SUPERADMIN', '70', '{"password":"Skill329"}') 
ON CONFLICT (id) DO UPDATE SET role = 'SUPERADMIN', data_jsonb = EXCLUDED.data_jsonb;
