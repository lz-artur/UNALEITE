CREATE TABLE public.production_order_adjustments (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    production_order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE NOT NULL,
    finished_product_lot_id uuid REFERENCES public.finished_product_lots(id) ON DELETE CASCADE NOT NULL,
    old_quantity numeric NOT NULL,
    new_quantity numeric NOT NULL,
    reason text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES public.app_users(id)
);

-- Habilitar RLS
ALTER TABLE public.production_order_adjustments ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Enable read access for authenticated users" 
ON public.production_order_adjustments FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON public.production_order_adjustments FOR INSERT 
TO authenticated WITH CHECK (true);
