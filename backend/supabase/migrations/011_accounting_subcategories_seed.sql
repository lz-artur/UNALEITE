-- Inserir subcategorias padrão associadas às categorias existentes

DO $$
DECLARE
  v_fornecedores uuid;
  v_insumos uuid;
  v_materia_prima uuid;
  v_folha uuid;
  v_impostos uuid;
  v_utilidades uuid;
  v_manutencao uuid;
  v_outros_pagar uuid;
  v_vendas uuid;
  v_rendimentos uuid;
  v_servicos uuid;
  v_outros_receber uuid;
BEGIN
  -- Obter IDs das categorias
  SELECT id INTO v_fornecedores FROM accounting_categories WHERE name = 'Fornecedores' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_insumos FROM accounting_categories WHERE name = 'Insumos' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_materia_prima FROM accounting_categories WHERE name = 'Matéria Prima' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_folha FROM accounting_categories WHERE name = 'Folha de Pagamento' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_impostos FROM accounting_categories WHERE name = 'Impostos' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_utilidades FROM accounting_categories WHERE name = 'Utilidades' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_manutencao FROM accounting_categories WHERE name = 'Manutenção' AND entry_type = 'Pagar' LIMIT 1;
  SELECT id INTO v_outros_pagar FROM accounting_categories WHERE name = 'Outros' AND entry_type = 'Pagar' LIMIT 1;
  
  SELECT id INTO v_vendas FROM accounting_categories WHERE name = 'Vendas' AND entry_type = 'Receber' LIMIT 1;
  SELECT id INTO v_rendimentos FROM accounting_categories WHERE name = 'Rendimentos' AND entry_type = 'Receber' LIMIT 1;
  SELECT id INTO v_servicos FROM accounting_categories WHERE name = 'Serviços' AND entry_type = 'Receber' LIMIT 1;
  SELECT id INTO v_outros_receber FROM accounting_categories WHERE name = 'Outros' AND entry_type = 'Receber' LIMIT 1;

  -- Inserir subcategorias
  IF v_fornecedores IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_fornecedores, 'Embalagens'), (v_fornecedores, 'Materiais de Limpeza'), (v_fornecedores, 'Serviços Terceirizados') ON CONFLICT DO NOTHING;
  END IF;

  IF v_insumos IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_insumos, 'Condimentos'), (v_insumos, 'Conservantes'), (v_insumos, 'Culturas Láticas') ON CONFLICT DO NOTHING;
  END IF;

  IF v_materia_prima IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_materia_prima, 'Leite Cru') ON CONFLICT DO NOTHING;
  END IF;

  IF v_folha IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_folha, 'Salários'), (v_folha, 'Férias'), (v_folha, '13º Salário'), (v_folha, 'Prêmios') ON CONFLICT DO NOTHING;
  END IF;

  IF v_impostos IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_impostos, 'DAS'), (v_impostos, 'ICMS'), (v_impostos, 'INSS'), (v_impostos, 'FGTS') ON CONFLICT DO NOTHING;
  END IF;

  IF v_utilidades IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_utilidades, 'Energia Elétrica'), (v_utilidades, 'Água'), (v_utilidades, 'Internet e Telefone') ON CONFLICT DO NOTHING;
  END IF;
  
  IF v_manutencao IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_manutencao, 'Manutenção de Máquinas'), (v_manutencao, 'Manutenção Predial'), (v_manutencao, 'Manutenção de Veículos') ON CONFLICT DO NOTHING;
  END IF;
  
  IF v_vendas IS NOT NULL THEN
    INSERT INTO accounting_subcategories (category_id, name) VALUES (v_vendas, 'Venda de Queijos'), (v_vendas, 'Venda de Bebidas Lácteas'), (v_vendas, 'Venda de Manteiga') ON CONFLICT DO NOTHING;
  END IF;
END $$;
