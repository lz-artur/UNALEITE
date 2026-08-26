-- Add financial categorization fields to milk_types
ALTER TABLE milk_types
ADD COLUMN IF NOT EXISTS cost_center_id uuid references cost_centers(id),
ADD COLUMN IF NOT EXISTS accounting_category_id uuid references accounting_categories(id),
ADD COLUMN IF NOT EXISTS accounting_subcategory_id uuid references accounting_subcategories(id);
