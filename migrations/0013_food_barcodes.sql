ALTER TABLE foods ADD COLUMN barcode TEXT;

CREATE INDEX foods_barcode_N1
  ON foods(barcode);
