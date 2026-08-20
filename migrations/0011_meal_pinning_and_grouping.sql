-- Pinned saved meals appear as quick-tap tiles on the dashboard; unpinned meals
-- remain findable through the diary food search. Existing meals default to pinned
-- so nothing disappears from the dashboard on deploy.
ALTER TABLE saved_meals ADD COLUMN pinned INTEGER NOT NULL DEFAULT 1;

-- Diary items logged together from one saved meal share a group id so the diary
-- can render them as a single meal instead of loose foods. Adding the same meal
-- twice in a day produces two distinct groups. Rows logged before this migration
-- stay NULL and render individually.
ALTER TABLE diary_items ADD COLUMN meal_group_id TEXT;

CREATE INDEX diary_items_meal_group_id_N1 ON diary_items(meal_group_id);
