# Tzameret foods (Israel Ministry of Health)

`tzameret-foods.json` holds the generic foods from the Ministry of Health
"Tzameret" food composition database (data.gov.il dataset `tzameret`), read
from the public mirror github.com/yontank/FoodCalories. Values are per 100 g.
It is generated, not hand-edited.

## Regenerate

```
node scripts/tzameret-import.mjs <csv-dir> <sql-out-dir> --json supabase/data/tzameret-foods.json
```

`<csv-dir>` holds `moh_mitzrachim.csv`, `moh_yehidot_mida_lemitzrachim.csv` and
`moh_yehidot_mida.csv`. The same run also writes upsert SQL chunks to `<sql-out-dir>`.

## Load into the database

```sql
-- 1) request (pg_net), returns an id
select net.http_get('https://raw.githubusercontent.com/goavieldvir-rgb/ironlog/main/supabase/data/tzameret-foods.json', timeout_milliseconds => 60000);
-- 2) once net._http_response has that id with status_code 200:
insert into public.foods (source, source_ref, name_he, name_en, kcal, protein, carbs, fat, fiber, units, search_text)
select 'moh', r.source_ref, r.name_he, r.name_en, r.kcal, r.protein, r.carbs, r.fat, r.fiber, coalesce(r.units,'[]'::jsonb), r.search_text
from net._http_response h, jsonb_to_recordset(h.content::jsonb) as r(source_ref text, name_he text, name_en text, kcal numeric, protein numeric, carbs numeric, fat numeric, fiber numeric, units jsonb, search_text text)
where h.id = <id>
on conflict (source, source_ref) where source_ref is not null do update set name_he=excluded.name_he, name_en=excluded.name_en, kcal=excluded.kcal, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, fiber=excluded.fiber, units=excluded.units, search_text=excluded.search_text;
```

# USDA staples

`usda-staples.json` is a hand-picked set of generic gym staples that Tzameret
lacks (Greek yogurt, whey and soy protein powder, PB2, lean ground beef, deli
turkey, tofu, mozzarella ...). Values per 100 g and household units come from
USDA FoodData Central SR Legacy (2018-04 release, public domain / CC0);
`source_ref` is the FDC id. Hebrew names were written for the app.

Load with `supabase-usda-foods.sql` (it carries the same rows), run once in the
SQL Editor.

# Open Food Facts products

`off-products.json` holds packaged products from Open Food Facts (ODbL, keep
the attribution shown in search) so they are found by typing, offline and
ranked with everything else, not only by barcode: every product OFF lists as
sold in Israel, plus the supplement brands trainees buy (Myprotein, Optimum
Nutrition, Dymatize, MuscleTech, Scitec, Quest, Grenade, Barebells, Applied
Nutrition, Olimp, Weider, ESN, BioTech USA, Nutrend, BSN, GymBeam, OstroVit).
Read from search.openfoodfacts.org in October 2026 and mapped with the app's
`offToFood`. Dropped: no usable macros, macros over 100 g, energy more than
30% off 4/4/9, protein powders under 45% protein, names in other scripts, and
repeats of the same brand and name.

`off-products-2.json` adds every other product with an Israeli barcode
(729...) and popular overseas brands: sports brands in full (Prozis, Bulk,
Isopure, Ghost, Premier Protein, Fulfil, Oikos, Kind, Clif and more, up to
300 each) and well-known food brands (Nutella, Kinder, Lotus, Oreo, Milka,
Pringles, Kellogg's, Alpro, Barilla and more, the 50 most popular each, English
names only). Same filters, minus anything already in the first file.

Load each like Tzameret (pg_net), as source 'off' with no `created_by`:

```sql
select net.http_get('https://raw.githubusercontent.com/goavieldvir-rgb/ironlog/main/supabase/data/off-products.json', timeout_milliseconds => 60000);
insert into public.foods (source, source_ref, barcode, name_he, name_en, brand, kcal, protein, carbs, fat, fiber, units, search_text)
select 'off', r.source_ref, r.barcode, r.name_he, r.name_en, r.brand, r.kcal, r.protein, r.carbs, r.fat, r.fiber, coalesce(r.units,'[]'::jsonb), r.search_text
from net._http_response h, jsonb_to_recordset(h.content::jsonb) as r(source_ref text, barcode text, name_he text, name_en text, brand text, kcal numeric, protein numeric, carbs numeric, fat numeric, fiber numeric, units jsonb, search_text text)
where h.id = <id>
on conflict (source, source_ref) where source_ref is not null do nothing;
```
