-- Shared exercise library: one-sided exercises and clearer equipment names.
--
-- 1. Adds 17 single-arm / single-leg exercises.
-- 2. Renames 16 exercises whose name did not say the equipment (for example
--    "Lateral raise" becomes "Dumbbell lateral raise").
-- 3. Removes 5 vague doubles of exercises that already have a clearly named
--    version ("Bicep curl" next to "Dumbbell curl").
--
-- Only the shared library (global_exercises) changes. Exercises in people's
-- accounts are their own copies in public.exercises, with no link back to
-- this table, so routines and history are not touched. The app keeps
-- recognising the old names for clips and example videos.
--
-- Safe to run more than once: every step checks the current names first.

insert into public.global_exercises (name, name_he, category, unit, bodyweight)
select v.name, v.name_he, 'strength', 'kg', v.bodyweight
from (values
  ('Single-arm seated cable row', 'חתירה בישיבה בכבל ביד אחת', false),
  ('Single-arm dumbbell bench press', 'לחיצת חזה עם דמבל ביד אחת', false),
  ('Single-arm cable chest press', 'לחיצת חזה בכבל ביד אחת', false),
  ('Single-arm cable chest fly', 'פרפר חזה בכבל ביד אחת', false),
  ('Single-arm dumbbell shoulder press', 'לחיצת כתפיים עם דמבל ביד אחת', false),
  ('Single-arm cable rear delt fly', 'פרפר כתף אחורית בכבל ביד אחת', false),
  ('Single-arm cable curl', 'כפיפת מרפק בכבל ביד אחת', false),
  ('Single-arm dumbbell preacher curl', 'כפיפת מרפק בספסל סקוט עם דמבל ביד אחת', false),
  ('Single-arm cable tricep pushdown', 'פוש דאון טריצפס בכבל ביד אחת', false),
  ('Single-arm cable overhead tricep extension', 'יישור טריצפס בכבל מעל הראש ביד אחת', false),
  ('Single-leg leg press', 'לחיצת רגליים ברגל אחת', false),
  ('Single-leg leg extension', 'יישור ברך ברגל אחת', false),
  ('Single-leg seated leg curl', 'כפיפת ברך בישיבה ברגל אחת', false),
  ('Single-leg calf raise', 'הרמת עקבים על רגל אחת', true),
  ('Single-leg hip thrust', 'היפ ת׳רסט על רגל אחת', true),
  ('Single-leg glute bridge', 'גשר ישבן על רגל אחת', true),
  ('Single-arm machine chest press', 'לחיצת חזה במכונה ביד אחת', false)
) as v(name, name_he, bodyweight)
where not exists (
  select 1 from public.global_exercises g where lower(g.name) = lower(v.name)
);

update public.global_exercises g
set name = v.new_name, name_he = v.new_name_he
from (values
  ('Lateral raise', 'Dumbbell lateral raise', 'הרחקה צדדית עם דמבלים'),
  ('Rear delt fly', 'Dumbbell rear delt fly', 'פרפר כתף אחורית עם דמבלים'),
  ('Chest-supported row', 'Chest-supported dumbbell row', 'חתירה נתמכת חזה עם דמבלים'),
  ('Preacher curl', 'Dumbbell preacher curl', 'כפיפת מרפק בספסל סקוט עם דמבל'),
  ('Hammer curl', 'Dumbbell hammer curl', 'כפיפת מרפק פטיש עם דמבלים (האמר קרל)'),
  ('Overhead tricep extension', 'Dumbbell overhead tricep extension', 'יישור טריצפס מעל הראש עם דמבל'),
  ('Tricep kickback', 'Dumbbell tricep kickback', 'קיקבק טריצפס עם דמבל'),
  ('Front raise', 'Dumbbell front raise', 'הרמה קדמית עם דמבלים'),
  ('Tricep pushdown', 'Cable tricep pushdown', 'פוש דאון טריצפס בכבל'),
  ('Face pull', 'Cable face pull', 'פייס פול בכבל'),
  ('Incline bench press', 'Incline barbell bench press', 'לחיצת חזה בשיפוע עם מוט'),
  ('Overhead press', 'Barbell overhead press', 'לחיצה מעל הראש עם מוט'),
  ('Upright row', 'Barbell upright row', 'חתירה זקופה עם מוט'),
  ('Romanian deadlift', 'Barbell Romanian deadlift', 'דדליפט רומני עם מוט'),
  ('Hip thrust', 'Barbell hip thrust', 'היפ ת׳רסט עם מוט'),
  ('Skull crusher', 'EZ-bar skull crusher', 'סקאל קראשר עם מוט EZ')
) as v(old_name, new_name, new_name_he)
where g.name = v.old_name
  and not exists (
    select 1 from public.global_exercises x where lower(x.name) = lower(v.new_name)
  );

delete from public.global_exercises
where name in ('Bicep curl', 'Leg curl', 'Calf raise', 'Dumbbell row', 'Cable crossover');
