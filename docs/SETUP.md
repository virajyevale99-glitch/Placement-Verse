# PlacementVerse setup guide

This takes about 30 minutes. You need a Google account, a GitHub account, a free Vercel account, and Node.js 20 or newer on your computer.

> Tip: use a dedicated Google account (for example `placements.yourcollege@gmail.com`) to own the spreadsheet and script, so the site doesn't depend on one person's personal account.

---

## 1. Create the spreadsheet

1. Sign in to the dedicated Google account and go to <https://sheets.new>.
2. Rename it **PlacementVerse DB**.
3. Leave sharing as **Restricted** (the default). Do **not** choose "Anyone with the link". The website never reads the sheet directly; only the script does.

## 2. Add the Apps Script backend

1. In the spreadsheet: **Extensions → Apps Script**. A script editor opens, already bound to this spreadsheet.
2. Delete everything in `Code.gs` and paste the full contents of `google-apps-script/Code.gs` from this project.
3. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open `appsscript.json` and replace it with `google-apps-script/appsscript.json` from this project.
4. Save (Ctrl/Cmd + S).

## 3. Configure the spreadsheet link and secret

The script uses the spreadsheet it is bound to, so there is normally **no spreadsheet ID to set**. If you ever move the script to a standalone project, add a script property `SPREADSHEET_ID` with the long ID from the sheet's URL (`/spreadsheets/d/<THIS_PART>/edit`).

1. On your computer, in the project folder, run `npm install` once, then `npm run gen-secret`. Copy the output.
2. In Apps Script: **Project Settings → Script properties → Add script property**.
   - Property: `APPS_SCRIPT_SHARED_SECRET`
   - Value: the string you just generated.
3. Keep it somewhere safe. The same value goes into Vercel in step 7.

## 4. Create the tabs (initialise the database)

1. In the editor's function dropdown choose **setupSpreadsheet** and click **Run**.
2. Google asks for permission the first time. Choose your dedicated account → **Advanced → Go to project (unsafe)** → **Allow**. (It's "unsafe" only because you wrote the script yourself and it isn't verified by Google.)
3. Back in the spreadsheet you'll see seven tabs: Students, Companies, Placements, Batches, Admins, AuditLogs, AppConfig. A first batch of 60 students is created and the two administrators are provisioned.

Running `setupSpreadsheet` again is safe: it only adds what's missing.

**Optional demo data (never on the real sheet):** make a *copy* of the spreadsheet for testing, add a script property `DEMO_SEED_ALLOWED` = `true` in that copy, and run **seedDemoData**. It adds 60 fictional students, 12 placed (including a same-day cohort across three companies) and one private draft. It refuses to run if the property isn't set or if Students already has rows.

## 5. Deploy the script as a web app

1. **Deploy → New deployment**. Click the gear next to "Select type" → **Web app**.
2. Description: `PlacementVerse API`.
3. **Execute as: Me** (the dedicated account).
4. **Who has access: Anyone**.
5. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

Why "Anyone"? Vercel's server calls this URL without a Google login, and a deployment restricted to Google accounts would reject it. The URL is still protected: every request must carry an HMAC signature made with `APPS_SCRIPT_SHARED_SECRET`, expires after 5 minutes, and can't be replayed. Unsigned calls get `UNAUTHORIZED` and never touch the sheet.

> When you change `Code.gs` later: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## 6. Administrator password

Only two administrators exist: **Viraj Yevale** (username `viraj`) and **Uditi** (username `uditi`). There is no sign-up page.

Both sign in with the same fixed password, **`DivisionDRocks`**, in every environment (local and production). There is no hashing step and no password environment variable. The password is the `ADMIN_PASSWORD` constant in `src/lib/auth/password.ts`; to change it, edit that file and redeploy.

The password is never stored in the spreadsheet. The Admins tab holds only names and an `enabled` flag: set `enabled` to `FALSE` there to block an administrator immediately.

## 7. Configure environment variables

**Locally:** copy `.env.example` to `.env.local` and fill in:

| Variable | Value |
|---|---|
| `GOOGLE_APPS_SCRIPT_URL` | The `/exec` URL from step 5 |
| `APPS_SCRIPT_SHARED_SECRET` | Same value as the script property in step 3 |
| `ADMIN_SESSION_SECRET` | A *different* value from `npm run gen-secret` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; your Vercel URL in production |

Then run `npm run dev` and open <http://localhost:3000>.

**On Vercel:** the same variables go under **Project → Settings → Environment Variables** (see step 10). Don't prefix any of the secret ones with `NEXT_PUBLIC_`.

## 8. Test public access

1. Open the homepage. Right after `setupSpreadsheet` you'll see the default batch strength (60). Set it to **59** for Division D under **Admin → Batches** after importing the roster (step 9).
2. Open <http://localhost:3000/api/public/snapshot>: you should see JSON with `stats`, `placements` and `companies`, and **no** `internal_notes`, `created_by` or draft placements.
3. Confirm the spreadsheet is private: open its URL in a private/incognito window. Google should ask you to sign in or request access.

## 9. Test protected admin operations

1. Visit `/admin` while signed out: you're redirected to `/admin/login`.
2. Try signing in with a wrong password: you get "Incorrect username or password". After 5 failures, sign-in is locked for 15 minutes.
3. Sign in as Viraj (password `DivisionDRocks`). Import the Division D roster from `public/students-division-d.csv` under **Import / Export**, add a company, then **Placements → Add placements**: pick a date, a company and several students, preview, and publish. Job roles are not collected.
4. Check the celebration wall shows every student from that day, and the Placements and AuditLogs tabs in the sheet have one row per placement and a log entry.
5. Prove direct writes are blocked:
   ```bash
   curl -s -X POST -H 'content-type: application/json' \
     -d '{"op":"admin.placements.create","payload":{}}' https://YOUR-SITE/api/admin/rpc
   # → 401 UNAUTHORIZED
   curl -s -L -X POST -d '{"body":"{\"op\":\"admin.companies.create\"}","ts":0,"sig":"x"}' "$GOOGLE_APPS_SCRIPT_URL"
   # → {"ok":false,"error":{"code":"UNAUTHORIZED",...}}
   ```

## 10. Deploy to Vercel

1. Push the project to a **private** GitHub repository (`.env.local` is git-ignored; never commit it).
2. In Vercel: **Add New → Project → Import** the repository. Framework preset: **Next.js** (auto-detected). Leave build settings as default.
3. Before the first deploy, open **Environment Variables** and add the four variables from step 7 for the **Production** environment, with `NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app`.
4. Click **Deploy**.
5. Verify:
   - The homepage shows real numbers (not the demo banner).
   - `/admin/login` works for both administrators with `DivisionDRocks`, and any other password is rejected.
   - Publishing a placement shows up on `/celebrations` within a minute (the wall also polls every 60 seconds).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The Apps Script web app is not deployed with access 'Anyone'" | Redeploy with **Who has access: Anyone** (step 5). |
| Every call returns `UNAUTHORIZED: Invalid signature` | The secret in Vercel and the script property differ, or one has a trailing space. |
| `Missing tab "Students"` | Run `setupSpreadsheet` (step 4). |
| Changes to `Code.gs` have no effect | Deploy a **new version** of the existing deployment. |
| "The spreadsheet is busy" | Two saves collided. Wait a few seconds and retry: retries reuse the same request id, so nothing is duplicated. |
| Sign-in says "Incorrect username or password" | The password is exactly `DivisionDRocks` (case-sensitive) for both `viraj` and `uditi`. |

## Known limits of Google Sheets as a database

- **Quotas.** Apps Script caps each execution at 6 minutes, limits how many executions can run at once (around 30 per account), and has daily limits that are lower on free accounts than on Workspace. PlacementVerse caches the public snapshot (60 s in Apps Script, 60 s in Next.js), so visitor traffic makes very few script calls. Check the current numbers at <https://developers.google.com/apps-script/guides/services/quotas>.
- **Concurrency.** Every write takes a script-wide lock (`LockService`), so two admins saving at once are serialised, not interleaved. A save that can't get the lock in 20 seconds fails with a retryable error instead of guessing.
- **No transactions.** A bulk save appends all rows with a single range write, then re-reads to verify every new id landed. In all-or-nothing mode (the default) nothing is written if any row fails validation. If Google fails mid-write, the response says so (`WRITE_UNVERIFIED`) and lists the ids to check; it never claims success it can't confirm.
- **Scale.** Each request reads whole tabs. That's comfortable into the low thousands of placements. Beyond that, move to a real database: all data access goes through `src/lib/backend/client.ts`, so the pages don't change.
- **Latency.** Apps Script calls typically take 0.5–2 seconds. Public pages are cached, so visitors don't wait on it.
- **Manual sheet edits.** Editing cells by hand bypasses validation and the audit log. Prefer the admin dashboard; if you must edit, never change ids and keep dates as `YYYY-MM-DD`.
