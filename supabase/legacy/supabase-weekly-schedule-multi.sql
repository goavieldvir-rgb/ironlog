-- Extends the weekly schedule from one routine per day to up to three —
-- e.g. Sunday could be a cardio session AND a strength session. Each
-- day/slot combination is its own row now instead of one row per day.
-- slot: 0, 1, or 2 — three independent, generically-named slots (not
-- locked to "cardio" or "strength" specifically, so you're free to use
-- them however makes sense for a given day).
--
-- Existing single-routine assignments become slot 0 automatically —
-- nothing about your current schedule changes or gets lost.

alter table weekly_schedule add column if not exists slot integer not null default 0;
alter table weekly_schedule add constraint weekly_schedule_slot_check check (slot between 0 and 2);

-- The old constraint only allowed one row per (user, day) — replace it
-- with one that allows up to three, one per slot.
alter table weekly_schedule drop constraint if exists weekly_schedule_user_id_day_of_week_key;
alter table weekly_schedule add constraint weekly_schedule_user_id_day_of_week_slot_key unique (user_id, day_of_week, slot);
