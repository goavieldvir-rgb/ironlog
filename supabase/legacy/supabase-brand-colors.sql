-- Ironlog: more brand colors for coaches (PR #95).
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run.
--
-- Adds red, green, royal blue, navy, purple, grey and black & white to the
-- coach's color choices, and lets a coach enter their own exact color
-- (#rrggbb). The app picks readable text for every color by itself.
--
-- All or nothing, and safe to run more than once. It first checks that
-- supabase-coach-branding.sql (or the combined coach-tools script) ran.
-- supabase-brand-colors-rollback.sql puts the old list back.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coach_settings' and column_name = 'brand_color'
  ) then
    raise exception 'MISSING: coach_settings.brand_color. Run the coach-tools script first; nothing was changed.';
  end if;
end $$;

alter table public.coach_settings drop constraint if exists coach_settings_brand_check;
alter table public.coach_settings add constraint coach_settings_brand_check check (
  (brand_name is null or char_length(brand_name) between 1 and 40)
  and (brand_color is null
       or brand_color in ('ember', 'red', 'gold', 'lime', 'green', 'mint', 'teal', 'sky', 'royal', 'navy', 'violet', 'purple', 'pink', 'grey', 'mono')
       or brand_color ~ '^#[0-9A-Fa-f]{6}$')
  and (brand_logo is null or (brand_logo ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' and char_length(brand_logo) < 120000))
);

commit;
notify pgrst, 'reload schema';
