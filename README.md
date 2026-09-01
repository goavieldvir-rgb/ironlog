# Ironlog

A personal strength & mobility training log. Build routines, follow them set by set,
log weight and reps, see your previous numbers while you log, and browse full history —
all synced to the cloud so it works across your phone and laptop. Each person who uses
the app gets their own private login and their own history; nobody sees anyone else's data.

- **Routines** — build a template once (exercises + target sets/reps), reuse it every time.
- **Logging** — while logging, you see your last weight/reps for that exercise right next
  to the input, so you always know what to beat.
- **History** — every session saved, set by set, browsable by date.
- **Mobility / Physio** — exercises and routines can be tagged "Mobility" and filtered
  separately from strength work.
- **Video links** — attach an example video URL to any exercise; it shows up wherever
  that exercise appears (library, routine, active session, history).
- **Accounts** — email/password sign-up. Everyone shares the same app, but Supabase
  Row Level Security keeps each account's data private (see `supabase.sql`).
- **Admin mode** — optionally, one or more accounts can be marked admin. An admin sees
  a "People" tab, can pick anyone's account, and build routines/exercises (and view
  their logged history) on their behalf — see `supabase-admin-upgrade.sql`.

---

## Turning on admin mode (optional)

If you want to be able to build routines for family members yourself instead of them
doing it, run this once, after everyone already has an account (or run it any time —
it also works retroactively):

1. Supabase → **SQL Editor** → New query → paste in the entire contents of
   `supabase-admin-upgrade.sql` → **Run**.
2. At the very bottom of that script, edit the email in the last line to match your
   own account, then run just that line again (select it, click "Run selection") —
   this is what actually makes *you* the admin. Nobody else becomes admin by default.
3. Refresh the app and log in — you'll see a new **People** tab. Pick anyone from the
   list to build their routines/exercises for them, or view their history. A banner at
   the top reminds you whose account you're managing, with a link back to your own.

---

## 1. Create your Supabase project (free)

1. Go to [supabase.com](https://supabase.com), sign in (GitHub login is easiest), and
   click **New project**. Name it anything (e.g. `ironlog`), set a database password
   (you won't need to remember it — Supabase stores it), pick any region, and create.
   It takes a minute or two to spin up.
2. In the left sidebar, go to the **SQL Editor** → **New query**. Open `supabase.sql`
   from this repo, copy its entire contents, paste it into the editor, and click **Run**.
   This creates the three tables the app needs and locks every row to its owner.
3. In the left sidebar, go to **Authentication → Providers**, make sure **Email** is
   enabled (it is by default). Then go to **Authentication → Sign in / Providers →
   Email** settings and turn **off "Confirm email"** — otherwise each new sign-up has to
   click a confirmation link before they can log in, which adds friction for family/friends
   signing up. (Leave it on if you'd rather have that extra verification step.)
4. Go to **Project Settings → API**. You'll see a **Project URL** and an **anon public**
   key — keep this tab open, you'll need both in the next step.

## 2. Run it locally

```bash
npm install
cp .env.example .env.local
# paste your Project URL and anon key into .env.local
npm run dev
```

Open the printed local URL, click **Create account**, and start building your library.

## 3. Put it on GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create ironlog --public --source=. --push
# or: create a repo on github.com, then
#   git remote add origin https://github.com/<you>/ironlog.git
#   git push -u origin main
```

## 4. Deploy to GitHub Pages (free hosting, auto-updates on push)

This repo includes `.github/workflows/deploy.yml`, which builds and publishes the app
every time you push to `main`.

1. In your new GitHub repo: **Settings → Pages → Build and deployment → Source** →
   select **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret** — add these
   two, using the values from Project Settings → API (step 1.4):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main` (or re-run the workflow from the **Actions** tab). After it finishes,
   your app is live at `https://<you>.github.io/ironlog/`.

That's it — unlike some backends, Supabase doesn't need you to separately allow-list
your domain, so there's no extra step here.

## 5. Share it with family/friends

Send them the GitHub Pages URL. Each person clicks **Create account** and gets their own
private login — separate routines, separate history, nobody can see anyone else's data
(enforced server-side by the Row Level Security policies in `supabase.sql`, not just
hidden in the UI).

---

## Project structure

```
src/
  supabase.js             Supabase client init (reads keys from env vars)
  context/AuthContext.jsx  Email/password auth state
  lib/db.js                All reads/writes (exercises, routines, sessions)
  components/
    Login.jsx               Sign in / create account
    Layout.jsx               Nav shell
    Dashboard.jsx            Overview, stats, quick-start
    ExerciseLibrary.jsx      Exercise CRUD (name, category, video link, notes)
    RoutineList.jsx          Browse/start/delete routines
    RoutineBuilder.jsx       Build/edit a routine from your exercise library
    WorkoutSession.jsx       Active logging screen (sets/reps/weight, shows previous)
    History.jsx              Past sessions list
    SessionDetail.jsx        Full set-by-set breakdown of one past session
```

Data lives in three Postgres tables — `exercises`, `routines`, `sessions` — each row
tagged with a `user_id` and protected by the policies in `supabase.sql`. When you finish
logging a session, the app also updates a "last weight/reps" snapshot on each exercise
row so the next time you do it, the log screen shows what you did last time.

## Customizing

- Colors, type, and the overall look live in `tailwind.config.js` and `src/index.css`.
- Want kg/lb per person instead of per exercise? It's currently set per-exercise in
  `ExerciseLibrary.jsx` — straightforward to move to a user setting if you want that.
- Want Google sign-in instead of/alongside email+password? Enable the provider in
  Supabase Authentication → Providers, then add a
  `supabase.auth.signInWithOAuth({ provider: 'google' })` call and button.
