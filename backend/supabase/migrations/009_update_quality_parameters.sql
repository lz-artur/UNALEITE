-- Inactivate CBT and CCS as they are not used for lot reception
UPDATE quality_parameters SET active = false WHERE name IN ('CBT', 'CCS');

-- Add new parameters
INSERT INTO quality_parameters (id, name, data_type, unit_label, min_value, max_value, required, auto_block, active) VALUES
  ('00000000-0000-0000-0000-000000000711', 'Álcool', 'Aprovado/Reprovado', null, null, null, true, true, true),
  ('00000000-0000-0000-0000-000000000712', 'pH', 'Numero', null, 6.6, 6.8, true, false, true),
  ('00000000-0000-0000-0000-000000000713', 'Porcentagem de Água', 'Numero', '%', null, 0, false, false, true),
  ('00000000-0000-0000-0000-000000000714', 'EST', 'Numero', '%', 11.4, null, false, false, true),
  ('00000000-0000-0000-0000-000000000715', 'ESD', 'Numero', '%', 8.4, null, false, false, true),
  ('00000000-0000-0000-0000-000000000716', 'Redutase', 'Numero', 'h', 2, null, false, false, true)
ON CONFLICT DO NOTHING;
