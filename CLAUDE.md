# Working in this repo

- **Database changes go in `supabase/migrations/` as a new numbered file**
  (see `supabase/README.md`). Do not add `supabase-*.sql` scripts to the repo
  root, do not ask anyone to paste SQL into the Supabase SQL Editor, and never
  run files from `supabase/legacy/`. A migration reaches the live database
  only when its pull request is merged to `main`.
- `supabase/schema.sql` and `supabase/platform.sql` are generated from the
  live database; don't edit them by hand.
- Every pull request must pass the **Check** workflow (the app builds and the
  reminder helper tests pass).
