# Ironlog database

The live database is the Supabase project **ironlog**. This folder is its
complete, ordered record.

| Path | What it is |
|---|---|
| `migrations/` | Every change to the database, numbered by date and time. The first file is the baseline: the whole live structure on the day this folder was set up. |
| `schema.sql` | Generated snapshot of the live structure (tables, access rules, functions, triggers, indexes). Do not edit by hand. |
| `cron-jobs.sql` | Generated list of the scheduled jobs on the live database. Do not edit by hand. |
| `functions/` | Edge functions (`send-workout-reminders`, `purge-progress-photos`). |
| `data/` | Food catalog source files, loaded once by hand. |
| `legacy/` | The old hand-run scripts. History only, never run. |
| `config.toml` | Supabase CLI settings for local development. |

## Changing the database

1. Create a new migration file. With the Supabase CLI:
   `supabase migration new short_name_of_change`.
   Without it, add `migrations/YYYYMMDDHHMMSS_short_name_of_change.sql` by
   hand, using a time later than every other file in the folder.
2. Write the SQL. Make it safe to run once on the live database: use
   `if not exists`, `create or replace`, and `drop policy if exists` before
   `create policy`. Never edit a migration that has already been merged; add a
   new one instead.
3. Open a pull request. The **Database migrations** check lists exactly which
   migrations would run.
4. Merging to `main` applies the new migrations to the live database and
   records them, so each one runs exactly once. Merging is the approval:
   **don't merge a migration you haven't understood.**

Never paste SQL into the Supabase SQL Editor to change the database. A change
made there is missing from this record, and the weekly **Database structure
snapshot** job will flag it as drift.

Read-only queries in the SQL Editor (looking at data) are fine.

## Backups

See `docs/backups.md`.
