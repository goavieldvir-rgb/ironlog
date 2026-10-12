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
