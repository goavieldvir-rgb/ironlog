-- Ironlog: undo supabase-brand-colors.sql. Coaches who picked one of the new
-- colors or their own color go back to the usual orange; everything else
-- stays. All or nothing.

begin;

update public.coach_settings set brand_color = null
where brand_color is not null
  and brand_color not in ('ember', 'gold', 'lime', 'mint', 'teal', 'sky', 'violet', 'pink');

alter table public.coach_settings drop constraint if exists coach_settings_brand_check;
alter table public.coach_settings add constraint coach_settings_brand_check check (
  (brand_name is null or char_length(brand_name) between 1 and 40)
  and (brand_color is null or brand_color in ('ember', 'gold', 'lime', 'mint', 'teal', 'sky', 'violet', 'pink'))
  and (brand_logo is null or (brand_logo ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' and char_length(brand_logo) < 120000))
);

commit;
notify pgrst, 'reload schema';
