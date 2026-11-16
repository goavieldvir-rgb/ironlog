-- Ironlog: a coach's own look for their trainees' app.
--
-- Run after supabase-coach-extras.sql. Safe to run more than once.
--
-- - brand_name: shown to their trainees as "Coached by <name>".
-- - brand_color: one of the app's accent colours (all readable with the
--   app's dark text), by name. Null keeps the usual orange.
-- - brand_logo: a small square logo, resized in the browser and stored as a
--   data: URL (under ~90 KB), so no storage bucket is needed.
-- - my_brand(): the signed-in person's coach's look.

alter table public.coach_settings add column if not exists brand_name text;
alter table public.coach_settings add column if not exists brand_color text;
alter table public.coach_settings add column if not exists brand_logo text;

alter table public.coach_settings drop constraint if exists coach_settings_brand_check;
alter table public.coach_settings add constraint coach_settings_brand_check check (
  (brand_name is null or char_length(brand_name) between 1 and 40)
  and (brand_color is null or brand_color in ('ember', 'gold', 'lime', 'mint', 'teal', 'sky', 'violet', 'pink'))
  and (brand_logo is null or (brand_logo ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' and char_length(brand_logo) < 120000))
);

create or replace function public.my_brand()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('name', cs.brand_name, 'color', cs.brand_color, 'logo', cs.brand_logo)
    from public.coach_settings cs where cs.coach_id = public.coach_for(auth.uid())), '{}'::jsonb);
$$;
revoke execute on function public.my_brand() from public, anon;
grant execute on function public.my_brand() to authenticated;

notify pgrst, 'reload schema';
