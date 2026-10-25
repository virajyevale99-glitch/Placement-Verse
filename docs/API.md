# Apps Script API contract

All calls are `POST` to the web-app URL with a signed envelope. Only the Next.js server calls it.

## Envelope

```json
{ "body": "<JSON string>", "ts": 1792500000000, "sig": "<hex>" }
```

- `sig = HMAC_SHA256(APPS_SCRIPT_SHARED_SECRET, ts + "." + body)` as lowercase hex.
- `ts` must be within 5 minutes of the script's clock. Each signature is accepted once (replay cache, 10 min).
- `body` is JSON: `{ "op": "...", "payload": {...}, "actor_id": "adm_viraj", "request_id": "...", "nonce": "..." }`.
  - `actor_id` is required for `admin.*` ops and must be an **enabled** row in the Admins tab.
  - `request_id` makes an admin write idempotent: repeating it returns the first result with `"replayed": true` (6 h cache; bulk placements also match stored `request_id` columns after the cache expires).

## Response

Always HTTP 200 JSON:

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": { "code": "VALIDATION", "message": "…", "details": [{ "index": 3, "errors": [{ "field": "placement_date", "message": "…" }] }], "retryable": false } }
```

Error codes: `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, `UNKNOWN_OP`, `VALIDATION`, `DUPLICATE`, `NOT_FOUND`, `BATCH_BELOW_PLACED`, `BACKEND_BUSY` (retryable), `WRITE_UNVERIFIED`, `MISCONFIGURED`, `INTERNAL`.

## Public reads (published data only, explicit field allowlist)

| op | payload | returns |
|---|---|---|
| `public.snapshot` | – | `{ config, batch, stats, placements[], companies[], generated_at }` |
| `public.stats` | – | `{ total_students, placed_students, yet_to_be_placed, placement_rate, total_offers }` |
| `public.announcements` | `limit?, offset?` | newest-first page of placements |
| `public.directory` | `query?, company_id?, from?, to?, sort?: 'name', page?, page_size?` | one entry per student with all offers |
| `public.companies` | – | company summaries |
| `public.company` | `company_id` | `{ company, placements[] }` |
| `public.cohorts` | `page?, days_per_page?` | day groups with company sub-groups; a day is never split across pages |
| `public.placement` | `placement_id` | one placement |
| `public.student` | `student_id` | `{ student_name, offers[] }` |

Public placement fields: `placement_id, student_id, student_name, department, company_id, company_name, company_logo_url, job_role, placement_date, published_at, announcement_title, announcement_message`, plus `ctc, currency` only when `show_ctc=true` and `student_photo_url` only when `show_student_photos=true`. Drafts, archived students, internal notes, `created_by`, `request_id` and audit data are never returned.

## Login helpers

`auth.admin {admin_id}` → `{ enabled, display_name }` · `auth.throttleCheck {key}` → `{ blocked }` · `auth.throttleRecord {key, success}`. Passwords never reach the script.

## Admin operations (require `actor_id`; every write takes the script lock and writes an audit row)

| op | payload |
|---|---|
| `admin.overview` | – |
| `admin.students.list` | – |
| `admin.students.create` | `full_name, roll_number, department?, graduation_year?, photo_url?, internal_notes?` |
| `admin.students.bulkCreate` | `{ rows: [...], partial?: boolean }` |
| `admin.students.update` | `student_id` + any student fields |
| `admin.students.archive` / `unarchive` | `student_id` |
| `admin.companies.list` / `create` / `update` | `display_name, logo_url?, website_url?` (+ `company_id` to update) |
| `admin.placements.list` | – |
| `admin.placements.create` | one placement (see below) |
| `admin.placements.bulkCreate` | `{ items: [placement...], partial?: boolean }` (max 500) |
| `admin.placements.update` | `placement_id` + any placement fields |
| `admin.placements.setStatus` | `{ placement_ids: [...], status: 'draft' \| 'published' }` |
| `admin.batches.list` / `create` / `update` | `batch_name, academic_year, department, total_students, timezone, description` (+ `batch_id`, `force_correction`, `correction_reason` to update) |
| `admin.config.get` / `update` | `{ values: { app_name?, active_batch_id?, display_timezone?, announcements_enabled?, latest_wins_limit?, show_ctc?, show_student_photos? } }` |
| `admin.audit.list` | `limit?` |
| `admin.export` | `entity: 'students' \| 'placements' \| 'companies'` |

Placement fields: `student_id, company_id, placement_date (YYYY-MM-DD), job_role?, ctc?, currency? (default INR), announcement_title?, announcement_message?, publication_status ('draft' default \| 'published'), internal_notes?`.

A placement is a duplicate when the same student, company, role (case-insensitive) and date already exist. Duplicates are rejected, never merged or overwritten.

### Bulk placement flow

1. Validate every item (types, dates, ids exist, student not archived).
2. Check duplicates against existing rows and within the request.
3. Under the script lock, re-read fresh data so concurrent saves are seen.
4. If any item failed and `partial` is false → `VALIDATION`, nothing written.
5. Append all valid rows in one range write.
6. Re-read the id column; any id not found → `WRITE_UNVERIFIED` listing them.
7. Audit, release the lock, return `{ created[], failed[], created_count, failed_count }`.
