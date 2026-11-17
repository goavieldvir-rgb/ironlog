# Database backups

Ironlog's Supabase project is on the free plan, which keeps no backups you can
restore. Instead, the **Nightly database backup** workflow
(`.github/workflows/backup.yml`) saves a copy every night at 01:00 UTC.

- **What's in it:** everything in the database: every table and its data,
  sign-in accounts (`auth`), access rules, functions and scheduled jobs. Three
  files: `roles.sql`, `schema.sql`, `data.sql`.
- **What's not in it:** progress photo *files* (only their records), the
  edge function code (that is already in this repo), and the scheduled-job run
  history.
- **Where:** GitHub → this repo → **Actions** → *Nightly database backup* →
  pick a night → **Artifacts**. Each copy is kept for 30 days.
- **Locked:** each file is encrypted with `BACKUP_PASSPHRASE`. Without that
  passphrase the backups cannot be opened, by anyone, including you.

## One-time setup (repo owner)

1. **Copy the connection string.** Supabase dashboard → the Ironlog project →
   **Connect** (top of the page) → **Session pooler** → copy the URI. Replace
   `[YOUR-PASSWORD]` with the database password. Any symbols in the
   password are fine; the workflow encodes them. If you don't have it:
   **Project Settings → Database → Reset database password**. The app doesn't
   use this password, so resetting it doesn't affect anyone.
2. **Make a passphrase.** A long one, for example five random words. Store it
   in your password manager. **If it's lost, every backup is unreadable.**
3. **Add both to GitHub.** Repo → **Settings → Secrets and variables →
   Actions → New repository secret**:
   - `SUPABASE_DB_URL` = the connection string from step 1
   - `BACKUP_PASSPHRASE` = the passphrase from step 2
4. **Test it.** **Actions → Nightly database backup → Run workflow**. After a
   few minutes it should be green, with one artifact.

If a night's backup fails, GitHub emails the repo owner.

## Restoring (into a new, empty Supabase project)

Only needed after a real loss of data. Restore into a **new** project first,
check it, and only then point the app at it.

```bash
# 1. Download the artifact from the Actions tab and unzip it, then unlock it
gpg --decrypt ironlog-db-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz
mkdir backup && tar -xzf backup.tar.gz -C backup

# 2. Restore (connection string of the NEW project, Session pooler)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file backup/roles.sql \
  --file backup/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file backup/data.sql \
  --dbname "postgresql://...new project..."
```

Then redeploy the two edge functions from `supabase/functions/`, re-add their
secrets, and update the app's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
repository secrets. Supabase's full guide:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
