PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  protein_goal_g REAL,
  preferred_weight_unit TEXT DEFAULT 'lb',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  serving_quantity REAL NOT NULL,
  serving_unit TEXT NOT NULL,
  protein_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  carbohydrate_g REAL NOT NULL DEFAULT 0,
  calories REAL NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private',
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX foods_owner_user_id_N1 ON foods(owner_user_id);
CREATE INDEX foods_owner_description_N1 ON foods(owner_user_id, description);
CREATE INDEX foods_visibility_description_N1 ON foods(visibility, description);

CREATE TABLE saved_meals (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX saved_meals_owner_user_id_N1 ON saved_meals(owner_user_id);
CREATE INDEX saved_meals_owner_name_N1 ON saved_meals(owner_user_id, name);
CREATE INDEX saved_meals_visibility_name_N1 ON saved_meals(visibility, name);

CREATE TABLE saved_meal_items (
  id TEXT PRIMARY KEY,
  saved_meal_id TEXT NOT NULL,
  food_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  quantity_unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (saved_meal_id) REFERENCES saved_meals(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id)
);

CREATE INDEX saved_meal_items_saved_meal_id_N1 ON saved_meal_items(saved_meal_id);
CREATE INDEX saved_meal_items_food_id_N1 ON saved_meal_items(food_id);

CREATE TABLE diary_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  food_id TEXT NOT NULL,
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id),
  FOREIGN KEY (source_saved_meal_id) REFERENCES saved_meals(id)
);

CREATE INDEX diary_items_user_date_N1 ON diary_items(user_id, eaten_date);
CREATE INDEX diary_items_user_food_N1 ON diary_items(user_id, food_id);
CREATE INDEX diary_items_source_saved_meal_N1 ON diary_items(source_saved_meal_id);

CREATE TABLE weight_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  weight_value REAL NOT NULL,
  weight_unit TEXT NOT NULL DEFAULT 'lb',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX weight_entries_U1 ON weight_entries(user_id, entry_date);
CREATE INDEX weight_entries_user_date_N1 ON weight_entries(user_id, entry_date);

CREATE TABLE goal_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_weight_value REAL NOT NULL,
  goal_weight_unit TEXT NOT NULL DEFAULT 'lb',
  target_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX goal_plans_user_active_N1 ON goal_plans(user_id, is_active);
