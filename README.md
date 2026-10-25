# PlacementVerse

*Every offer has a story. Every student deserves the spotlight.*

A placement celebration site configured for **MBA Batch 17 (2026-27) — Division D** (59 students): live placement statistics, a searchable directory of everyone placed, company profiles, insights charts, and a celebration wall where every same-day offer gets its own card. Two administrators (**Viraj Yevale** and **Uditi**) manage the platform from a secure dashboard, backed by Google Sheets.

---

## Batch Profile: Division D

- **Batch**: MBA Batch 17 (2026–27) — Division D
- **Total Students**: 59
- **Roll Number Range**: `D001` through `D065`
- **Initial State**: All 59 students are loaded with **0 placed** (all fictional demo roles and pre-set placements have been removed).
- **Import Template**: [`public/students-division-d.csv`](file:///c:/Users/harsh/Desktop/placementverse/placementverse/public/students-division-d.csv) and [`src/data/students-division-d.ts`](file:///c:/Users/harsh/Desktop/placementverse/placementverse/src/data/students-division-d.ts) contain the complete verified roster of Division D students.

---

## How to Access the Admin Panel

The admin panel allows placement coordinators to manage students, recruiter companies, announcements, and batch details.

### 1. Admin URLs
- **Sign-in page**: [`http://localhost:3000/admin/login`](http://localhost:3000/admin/login)
- **Dashboard**: [`http://localhost:3000/admin`](http://localhost:3000/admin) (redirects to login if not signed in)

### 2. Administrator Credentials
Exactly two identities are provisioned in the system:

| Administrator | Username | Password |
|---|---|---|
| **Viraj Yevale** | `viraj` | `DivisionDRocks` |
| **Uditi** | `uditi` | `DivisionDRocks` |

> Both administrators use the same fixed password in **every environment** (development and production). There is no hashing, no `npm run hash-password`, and no password environment variable.
>
> **Changing the password:** edit the `ADMIN_PASSWORD` constant in [`src/lib/auth/password.ts`](src/lib/auth/password.ts) and redeploy.

### 3. Enabling Admin in Development
When running without Google Apps Script (`GOOGLE_APPS_SCRIPT_URL` unset), the app runs in pure public demo mode where admin login is disabled.

To access the live admin dashboard:
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Follow **[docs/SETUP.md](docs/SETUP.md)** to deploy the Google Apps Script backend and set `GOOGLE_APPS_SCRIPT_URL`, `APPS_SCRIPT_SHARED_SECRET`, and `ADMIN_SESSION_SECRET`.
3. Restart `npm run dev`. Go to `/admin/login`, choose your name, and sign in.

### 4. Admin Security Features
- **Session Duration**: Signed HttpOnly `SameSite=Strict` cookie valid for 8 hours.
- **Brute-force Throttling**: 5 consecutive failed login attempts locks sign-in for 15 minutes.
- **Kill-switch**: Setting `enabled` to `FALSE` in the spreadsheet's `Admins` tab immediately revokes access without needing a redeploy.

---

## How to Add New Students as Placed

When a student receives an offer, you can mark them as placed using three methods:

### Method 1: Web Admin Dashboard (Recommended)

1. **Sign in** to `/admin/login` as Viraj or Uditi.
2. **Add the Company (if not already added)**:
   - Navigate to **Companies** (`/admin/companies`) → Click **+ Add company**.
   - Enter Company Name (e.g. `McKinsey & Company`), website URL, and optional logo image URL.
   - Click **Save**.
3. **Add the Placement**:
   - Navigate to **Placements** (`/admin/placements`) → Click **+ Add placement**, or use **Bulk Placements** at [`/admin/placements/new`](http://localhost:3000/admin/placements/new).
   - **Company**: Select the recruiter from the dropdown.
   - **Student**: Pick the Division D student (searchable by name or roll number like `D001`, `D014`).
   - **Placement Date**: Select the offer date (YYYY-MM-DD).
   - *Job roles are not collected*, since they are not known.
   - **CTC & Currency** *(optional)*: e.g., `1800000`, `INR`. (Remains hidden publicly unless `show_ctc` is turned on in Settings).
   - **Announcement Title & Message** *(optional)*: Custom win headline or congratulations message.
   - **Publication Status**:
     - `published` *(default)*: Immediately makes the offer visible on the homepage, celebration wall, placed student directory, and increases the placed count.
     - `draft`: Keeps the placement private for coordinator review before making it public.
4. Click **Publish Placement**.

---

### Method 2: Bulk CSV Import

For batch announcements (e.g. Day 1 placements), you can import multiple offers at once:

1. In the admin dashboard, go to **Import / Export** (`/admin/import-export`).
2. Scroll to **Import Placements**.
3. Prepare a CSV file with the following headers:
   ```csv
   roll_number,company,placement_date,ctc,status
   D001,Demo Analytics Co,2026-10-25,1800000,published
   D003,Sample Capital Partners,2026-10-25,2200000,published
   D014,Example Consulting Group,2026-10-25,1900000,published
   ```
   - `roll_number`: Student roll number from Division D (`D001` to `D065`).
   - `company`: Must match an existing company display name in the database.
   - `placement_date`: `YYYY-MM-DD` or `DD/MM/YYYY`.
   - `status`: Either `published` or `draft`.
4. Drag and drop the CSV into the importer. Review the validation summary and click **Import Placements**.

---

### Method 3: Direct Spreadsheet Entry

Because Google Sheets is the database, coordinators can also record offers directly in the sheet:
1. Open the private **PlacementVerse DB** Google Sheet.
2. Switch to the **Placements** tab.
3. Add a new row:
   - `placement_id`: e.g. `plc_` + random ID (or run `newId_('plc')`).
   - `student_id`: The student's ID from the `Students` tab.
   - `company_id`: The company ID from the `Companies` tab.
   - `placement_date`: e.g. `2026-10-25`.
   - `publication_status`: `published`.
   - `published_at`: ISO timestamp (e.g. `2026-10-25T10:00:00.000Z`).
4. The website revalidates public data every 60 seconds.

---

## Importing Division D Students to Google Sheets

If you are setting up a fresh Google Sheet database for Division D:

1. Open **Admin → Import / Export** (`/admin/import-export`).
2. Download or use [`public/students-division-d.csv`](file:///c:/Users/harsh/Desktop/placementverse/placementverse/public/students-division-d.csv).
3. Under **Import Students**, drag and drop `students-division-d.csv`.
4. The system validates all 59 student records (`D001`–`D065`) and adds them to the active batch.
5. In **Admin → Batches**, ensure batch strength is set to `59`.

---

## Architecture

```
Visitors ─► Next.js on Vercel ──(HMAC-signed POST)──► Google Apps Script web app ──► Google Sheet (private)
Admins   ─► /admin (signed session cookie) ─► /api/admin/rpc ─► same, with actor id
```

- **Frontend**: Next.js 15 (App Router), TypeScript strict, Tailwind CSS 4, Radix UI primitives, Motion, Lucide.
- **Backend**: Google Apps Script (`google-apps-script/Code.gs`) bound to the private Google Sheet.
- **Security**: No Google credentials in Vercel. Requests are HMAC-SHA256 signed. Admin sign-in uses one fixed shared password (`ADMIN_PASSWORD` in `src/lib/auth/password.ts`) with HttpOnly strict session cookies.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev          # http://localhost:3000

# 3. Run test suite
npm test             # 53 passing tests

# 4. Build for production
npm run build
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_APPS_SCRIPT_URL` | Web-app `/exec` URL from Apps Script. Empty locally = preview mode. |
| `APPS_SCRIPT_SHARED_SECRET` | 32+ character HMAC secret shared with Apps Script script property. |
| `ADMIN_SESSION_SECRET` | 32+ character secret for signing admin session cookies (`npm run gen-secret`). |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (e.g. `http://localhost:3000` or production domain). |

---

## How Statistics are Calculated

- **Placed Students**: Count of unique active students with at least one *published* placement in the active batch. (Second offers never count twice).
- **Yet to be Placed**: `max(batch strength − placed, 0)`.
- **Placement Rate**: `(placed / batch strength) × 100`, bounded between 0% and 100%.
- **Total Offers**: Total number of published placement records.

---

## Tests

Run tests with Node's built-in test runner:
```bash
npm test
```
- Tests `tests/apps-script.test.mjs` against the real `Code.gs` in an in-memory Google Sheets simulator.
- Tests auth (fixed admin password), session cookies, rate limiting, and Division D batch snapshots in `tests/core.test.ts` and `tests/auth.test.ts`.
