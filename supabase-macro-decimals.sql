-- Nutrition targets: macro grams to one decimal.
-- Run once in the Supabase SQL Editor after supabase-nutrition.sql. Safe to
-- re-run. supabase/schema.sql carries the same columns.
--
-- Targets are set from a percentage split of the calorie goal, so grams are
-- rarely whole: 20% fat of 2,500 kcal is 55.6 g. Whole-number columns would
-- store 56. Existing values convert unchanged, and the >= 0 checks stay.

alter table public.nutrition_targets
  alter column protein type numeric(6,1) using protein::numeric(6,1),
  alter column carbs type numeric(6,1) using carbs::numeric(6,1),
  alter column fat type numeric(6,1) using fat::numeric(6,1);
