-- Calorie-only diary entries (quick "add calories") have no food, so food_id
-- must be nullable. SQLite can't drop NOT NULL in place, so rebuild the table.
-- Nothing references diary_items by foreign key, so the swap is safe.
CREATE TABLE diary_items_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  food_id TEXT,
  source_saved_meal_id TEXT,
  eaten_date TEXT NOT NULL,
  meal_label TEXT,
  quantity REAL NOT NULL,
  quantity_unit TEXT NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbohydrate_g REAL NOT NULL,
  calories REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meal_group_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id),
  FOREIGN KEY (source_saved_meal_id) REFERENCES saved_meals(id)
);

INSERT INTO diary_items_new (id, user_id, food_id, source_saved_meal_id, eaten_date, meal_label, quantity, quantity_unit, protein_g, fat_g, carbohydrate_g, calories, notes, created_at, updated_at, meal_group_id)
SELECT id, user_id, food_id, source_saved_meal_id, eaten_date, meal_label, quantity, quantity_unit, protein_g, fat_g, carbohydrate_g, calories, notes, created_at, updated_at, meal_group_id
FROM diary_items;

DROP TABLE diary_items;
ALTER TABLE diary_items_new RENAME TO diary_items;

CREATE INDEX diary_items_user_date_N1 ON diary_items(user_id, eaten_date);
CREATE INDEX diary_items_user_food_N1 ON diary_items(user_id, food_id);
CREATE INDEX diary_items_source_saved_meal_N1 ON diary_items(source_saved_meal_id);
CREATE INDEX diary_items_meal_group_id_N1 ON diary_items(meal_group_id);
