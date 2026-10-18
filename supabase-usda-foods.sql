-- Nutrition: USDA FoodData Central staples. Run once in the Supabase SQL
-- Editor after supabase-nutrition.sql. Safe to re-run. supabase/schema.sql
-- carries the same source value and policy.
--
-- Adds source 'usda': a small, hand-picked set of generic gym staples the
-- Ministry of Health (Tzameret) list lacks (Greek yogurt, whey and soy
-- protein powder, PB2, lean ground beef, deli turkey, tofu, mozzarella ...).
-- Values are per 100 g from USDA FoodData Central SR Legacy (public domain,
-- CC0). The rows are also in supabase/data/usda-staples.json.

alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check
  check (source in ('moh', 'usda', 'off', 'user', 'coach'));

drop policy if exists "foods readable" on public.foods;
create policy "foods readable" on public.foods for select to authenticated using (
  nutrition_allowed() and (verified or source in ('moh', 'usda', 'off') or created_by = auth.uid() or is_admin())
);

insert into public.foods (source, source_ref, name_he, name_en, kcal, protein, carbs, fat, fiber, units, search_text)
select 'usda', v.* from (values
  ('170894', 'יוגורט יווני טבעי, 0% שומן', 'Yogurt, Greek, plain, nonfat', 59, 10.2, 3.6, 0.4, 0, '[{"he":"גביע","en":"container","g":170}]'::jsonb, 'יוגורט יווני טבעי, 0% שומנ yogurt, greek, plain, nonfat'),
  ('170903', 'יוגורט יווני טבעי, 2% שומן', 'Yogurt, Greek, plain, lowfat', 73, 9.9, 3.9, 1.9, 0, '[{"he":"גביע","en":"container","g":200}]'::jsonb, 'יוגורט יווני טבעי, 2% שומנ yogurt, greek, plain, lowfat'),
  ('171304', 'יוגורט יווני טבעי, מלא', 'Yogurt, Greek, plain, whole milk', 97, 9, 4, 5, 0, '[]'::jsonb, 'יוגורט יווני טבעי, מלא yogurt, greek, plain, whole milk'),
  ('173177', 'אבקת חלבון מי גבינה, איזולט', 'Protein powder, whey, isolate', 359, 58.1, 29.1, 1.2, 0, '[{"he":"סקופ","en":"scoop","g":28.7}]'::jsonb, 'אבקת חלבונ מי גבינה, איזולט protein powder, whey, isolate'),
  ('173180', 'אבקת חלבון מי גבינה', 'Protein powder, whey-based', 352, 78.1, 6.2, 1.6, 3.1, '[{"he":"כוס","en":"cup","g":97}]'::jsonb, 'אבקת חלבונ מי גבינה protein powder, whey-based'),
  ('173181', 'אבקת חלבון סויה', 'Protein powder, soy-based', 388, 55.6, 28.9, 5.6, 6.7, '[{"he":"סקופ","en":"scoop","g":45}]'::jsonb, 'אבקת חלבונ סויה protein powder, soy-based'),
  ('174267', 'אבקת חמאת בוטנים, דלת שומן (PB2)', 'Peanut flour, defatted', 327, 52.2, 34.7, 0.6, 15.8, '[{"he":"כוס","en":"cup","g":60}]'::jsonb, 'אבקת חמאת בוטנימ, דלת שומנ (pb2) peanut flour, defatted'),
  ('172435', 'קמח בוטנים, דל שומן', 'Peanut flour, low fat', 428, 33.8, 31.3, 21.9, 15.8, '[{"he":"כוס","en":"cup","g":60}]'::jsonb, 'קמח בוטנימ, דל שומנ peanut flour, low fat'),
  ('172941', 'חזה הודו פרוס (נקניק)', 'Turkey breast, sliced, deli, prepackaged', 106, 14.8, 2.2, 3.8, 0, '[{"he":"פרוסה","en":"slice","g":16}]'::jsonb, 'חזה הודו פרוס (נקניק) turkey breast, sliced, deli, prepackaged'),
  ('171792', 'בשר בקר טחון רזה 5% שומן, מבושל', 'Beef, ground, 95% lean, 5% fat, cooked, pan-broiled', 164, 25.8, 0, 5.9, 0, '[{"he":"מנה (85 גרם)","en":"serving (3 oz)","g":85}]'::jsonb, 'בשר בקר טחונ רזה 5% שומנ, מבושל beef, ground, 95% lean, 5% fat, cooked, pan-broiled'),
  ('174753', 'בשר בקר טחון 7% שומן, מבושל', 'Beef, ground, 93% lean, 7% fat, cooked, pan-broiled', 182, 25.6, 0.1, 8, 0, '[{"he":"מנה (85 גרם)","en":"serving (3 oz)","g":85}]'::jsonb, 'בשר בקר טחונ 7% שומנ, מבושל beef, ground, 93% lean, 7% fat, cooked, pan-broiled'),
  ('171793', 'בשר בקר טחון 10% שומן, מבושל', 'Beef, ground, 90% lean, 10% fat, cooked, pan-broiled', 204, 25.2, 0, 10.7, 0, '[{"he":"מנה (85 גרם)","en":"serving (3 oz)","g":85}]'::jsonb, 'בשר בקר טחונ 10% שומנ, מבושל beef, ground, 90% lean, 10% fat, cooked, pan-broiled'),
  ('173113', 'בשר בקר טחון רזה במיוחד 3% שומן, מבושל', 'Beef, ground, 97% lean, 3% fat, cooked, pan-broiled', 144, 26, 0, 3.6, 0, '[{"he":"מנה (85 גרם)","en":"serving (3 oz)","g":85}]'::jsonb, 'בשר בקר טחונ רזה במיוחד 3% שומנ, מבושל beef, ground, 97% lean, 3% fat, cooked, pan-broiled'),
  ('172828', 'מאפין אנגלי', 'Muffin, English, plain', 235, 7.7, 46, 1.8, 2.7, '[{"he":"יחידה","en":"muffin","g":57}]'::jsonb, 'מאפינ אנגלי muffin, english, plain'),
  ('172448', 'טופו קשה', 'Tofu, firm', 78, 9, 2.9, 4.2, 0.9, '[{"he":"כוס","en":"cup","g":252}]'::jsonb, 'טופו קשה tofu, firm'),
  ('170847', 'גבינת מוצרלה דלת שומן', 'Cheese, mozzarella, part skim', 254, 24.3, 2.8, 15.9, 0, '[]'::jsonb, 'גבינת מוצרלה דלת שומנ cheese, mozzarella, part skim'),
  ('169051', 'גבינת מוצרלה 0% שומן', 'Cheese, mozzarella, nonfat', 141, 31.7, 3.5, 0, 1.8, '[{"he":"כוס, מגורדת","en":"cup, shredded","g":113}]'::jsonb, 'גבינת מוצרלה 0% שומנ cheese, mozzarella, nonfat'),
  ('170148', 'זרעי המפ, קלופים', 'Seeds, hemp, hulled', 553, 31.6, 8.7, 48.8, 4, '[{"he":"כף","en":"tbsp","g":10}]'::jsonb, 'זרעי המפ, קלופימ seeds, hemp, hulled'),
  ('170495', 'ספירולינה, מיובשת', 'Spirulina, dried', 290, 57.5, 23.9, 7.7, 3.6, '[{"he":"כוס","en":"cup","g":112},{"he":"כף","en":"tbsp","g":7}]'::jsonb, 'ספירולינה, מיובשת spirulina, dried'),
  ('170163', 'חמאת קשיו, ללא מלח', 'Butter, cashew, plain, unsalted', 587, 17.6, 27.6, 49.4, 2, '[{"he":"כף","en":"tbsp","g":16}]'::jsonb, 'חמאת קשיו, ללא מלח butter, cashew, plain, unsalted')
) as v(source_ref, name_he, name_en, kcal, protein, carbs, fat, fiber, units, search_text)
on conflict (source, source_ref) where source_ref is not null do update set
  name_he = excluded.name_he, name_en = excluded.name_en, kcal = excluded.kcal, protein = excluded.protein,
  carbs = excluded.carbs, fat = excluded.fat, fiber = excluded.fiber, units = excluded.units, search_text = excluded.search_text;
