-- Progress photo thumbnails: each new photo is saved twice, the full image
-- and a small copy for the grid, so the photos page loads quickly. Safe to
-- re-run. Also folded into supabase-progress-photos.sql and supabase/schema.sql.
--
-- Photos added before this have no thumbnail; the app shows the full image
-- for them. Thumbnails live in the owner's folder next to the photo, so the
-- existing storage rules and the nightly purge already cover them.
alter table public.progress_photos add column if not exists thumb_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progress_photos_thumb_owner') then
    alter table public.progress_photos add constraint progress_photos_thumb_owner
      check (thumb_path is null or thumb_path like (user_id::text || '/%'));
  end if;
end $$;
