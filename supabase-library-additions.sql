-- Shared library additions (2026-10-14): machines and variants trainees were
-- already typing in as their own exercises, plus a few common gym staples.
-- English names match the aliases in src/lib/demoVideos.js so the built-in
-- demo shows up. Safe to re-run: a name that's already there is skipped.
insert into public.global_exercises (name, name_he, category, unit, bodyweight, intensity_type)
select v.name, v.name_he, 'strength', 'kg', v.bodyweight, 'rpe'
from (values
  ('Assisted pull-up', 'מתח בסיוע (מכונה)', false),
  ('Assisted dip', 'מקבילים בסיוע (מכונה)', false),
  ('Hip abduction machine', 'מכונת הרחקת ירכיים', false),
  ('Hip adduction machine', 'מכונת קירוב ירכיים', false),
  ('Incline Smith machine press', 'לחיצת חזה בשיפוע במכונת סמית׳', false),
  ('Machine lateral raise', 'הרחקה צדדית במכונה', false),
  ('Machine single-arm row', 'חתירה ביד אחת במכונה (איזו-לטרלית)', false),
  ('Single-arm lat pulldown', 'משיכת פולי עליון ביד אחת', false),
  ('Wide-grip lat pulldown', 'משיכת פולי עליון אחיזה רחבה', false),
  ('Cable chest press', 'לחיצת חזה בכבל', false),
  ('Seated dumbbell curl', 'כפיפת מרפק בישיבה עם דמבלים', false),
  ('Static lunge', 'לאנג׳ סטטי', false),
  ('Split squat', 'פילוג רגליים (ספליט סקוואט)', false),
  ('Step-down', 'ירידה ממדרגה (סטפ-דאון)', false),
  ('Scapular push-up', 'שכיבות סמיכה סקפולריות', true),
  ('Weighted pull-up', 'מתח עם משקל', false),
  ('Captain''s chair leg raise', 'הרמת רגליים בכיסא רומי', true),
  ('Smith machine squat', 'סקוואט במכונת סמית׳', false),
  ('Smith machine bench press', 'לחיצת חזה במכונת סמית׳', false),
  ('Seated row machine', 'חתירה בישיבה במכונה', false),
  ('Cable glute kickback', 'בעיטת ישבן בכבל', false),
  ('Leg press calf raise', 'הרמת עקבים במכונת לחיצת רגליים', false),
  ('Hanging knee raise', 'הרמת ברכיים בתלייה', true),
  ('Single-leg Romanian deadlift', 'דדליפט רומני על רגל אחת', false),
  ('Cable woodchopper', 'חוטב עצים בכבל (וודצ׳ופר)', false),
  ('Machine preacher curl', 'כפיפת מרפק בספסל סקוט במכונה', false)
) as v(name, name_he, bodyweight)
where not exists (
  select 1 from public.global_exercises g where lower(g.name) = lower(v.name)
);
