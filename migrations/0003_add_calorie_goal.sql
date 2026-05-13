ALTER TABLE users ADD COLUMN calorie_goal_value REAL;
ALTER TABLE users ADD COLUMN calorie_goal_type TEXT DEFAULT 'manual';
