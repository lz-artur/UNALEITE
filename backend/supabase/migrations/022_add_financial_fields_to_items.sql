-- Add financial categorization fields to supply_items
ALTER TABLE supply_items
ADD COLUMN IF NOT EXISTS cost_center_id uuid references cost_centers(id),
ADD COLUMN IF NOT EXISTS accounting_category_id uuid references accounting_categories(id),
ADD COLUMN IF NOT EXISTS accounting_subcategory_id uuid references accounting_subcategories(id),
ADD COLUMN IF NOT EXISTS cost_type text;

-- Add financial categorization fields to finished_products
ALTER TABLE finished_products
ADD COLUMN IF NOT EXISTS cost_center_id uuid references cost_centers(id),
ADD COLUMN IF NOT EXISTS accounting_category_id uuid references accounting_categories(id),
ADD COLUMN IF NOT EXISTS accounting_subcategory_id uuid references accounting_subcategories(id),
ADD COLUMN IF NOT EXISTS cost_type text;
