-- Perfil fiscal informado para o produto utilizado nos pedidos de homologação.
update public.finished_products
set fiscal_code = '1861',
    fiscal_name = 'QUEIJO TIPO MUSSARELA',
    ncm = '04061010',
    goods_origin = '0',
    commercial_unit_symbol = 'KG',
    tax_unit_symbol = 'KG',
    internal_cfop = '5101',
    icms_cst = '00',
    pis_cst = '06',
    cofins_cst = '06',
    ibs_cbs_cst = '200',
    ibs_cbs_classification = '200003',
    ibs_state_rate = 0.1,
    ibs_state_reduction = 100,
    ibs_city_rate = 0,
    ibs_city_reduction = 100,
    cbs_rate = 0.9,
    cbs_reduction = 100,
    updated_at = now()
where code = 'PA004';
