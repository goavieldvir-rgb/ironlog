-- Shared exercise library: 12 more one-sided exercises (batch 2).
--
-- Only adds rows to global_exercises. Safe to run more than once: a name
-- that is already in the library is skipped.

insert into public.global_exercises (name, name_he, category, unit, bodyweight)
select v.name, v.name_he, 'strength', 'kg', v.bodyweight
from (values
  ('Single-arm landmine press', 'לחיצת לנדמיין ביד אחת', false),
  ('Landmine Meadows row', 'חתירת מדואוס בלנדמיין', false),
  ('Single-arm kettlebell swing', 'סווינג קטלבל ביד אחת', false),
  ('Single-arm incline dumbbell press', 'לחיצת חזה בשיפוע עם דמבל ביד אחת', false),
  ('Single-arm machine shoulder press', 'לחיצת כתפיים במכונה ביד אחת', false),
  ('Single-arm dumbbell overhead tricep extension', 'יישור טריצפס מעל הראש עם דמבל ביד אחת', false),
  ('Standing cable hip abduction', 'הרחקת ירך בעמידה בכבל', false),
  ('Standing cable hip adduction', 'קירוב ירך בעמידה בכבל', false),
  ('Single-leg lying leg curl', 'כפיפת ברך בשכיבה ברגל אחת', false),
  ('Single-leg box squat', 'סקוואט לקופסה על רגל אחת', true),
  ('Single-leg seated calf raise', 'הרמת עקבים בישיבה ברגל אחת', false),
  ('Copenhagen plank', 'פלאנק קופנהגן', true)
) as v(name, name_he, bodyweight)
where not exists (
  select 1 from public.global_exercises g where lower(g.name) = lower(v.name)
);
