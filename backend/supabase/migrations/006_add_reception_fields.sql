ALTER TABLE milk_receptions
ADD COLUMN IF NOT EXISTS car_plate text,
ADD COLUMN IF NOT EXISTS driver_name text,
ADD COLUMN IF NOT EXISTS analyst_name text,
ADD COLUMN IF NOT EXISTS observations text;
