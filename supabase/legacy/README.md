# Legacy SQL scripts: history only, do not run

Before November 2026, database changes were made by pasting these scripts into
the Supabase SQL Editor by hand. They are kept so the reasoning behind each
change stays findable (code comments still mention some of them by name).

**Do not run any of these against the live database.** Several are not safe to
re-run, and the `*-rollback.sql` files would put back older, weaker access
rules. Everything they did is already part of the live database, which is
captured exactly in `supabase/migrations/` (the baseline) and
`supabase/schema.sql`.

To change the database now, see `supabase/README.md`.
