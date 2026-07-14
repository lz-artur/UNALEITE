ALTER TABLE milk_lot_analyses
ADD COLUMN alcool text,
ADD COLUMN ph numeric(12,4),
ADD COLUMN porcentagem_agua numeric(12,4),
ADD COLUMN est numeric(12,4),
ADD COLUMN esd numeric(12,4),
ADD COLUMN redutase text;
