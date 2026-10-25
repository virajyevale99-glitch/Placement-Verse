/**
 * PlacementVerse — Google Apps Script backend
 * ------------------------------------------------------------
 * Google Sheets is the database. This script is the only thing that reads
 * or writes it. The Next.js server (on Vercel) calls this script's web-app
 * URL with an HMAC-signed request. Browsers never call it directly.
 *
 * Request  (POST, JSON):  { "body": "<json string>", "ts": <unix ms>, "sig": "<hex hmac>" }
 *   sig = HMAC_SHA256(APPS_SCRIPT_SHARED_SECRET, ts + "." + body)
 *   body = { "op": "public.snapshot", "payload": {...}, "actor_id": "adm_viraj", "request_id": "..." }
 *
 * Response (always HTTP 200, JSON):
 *   { "ok": true,  "data": ... }
 *   { "ok": false, "error": { "code": "VALIDATION", "message": "...", "details": [...] , "retryable": false } }
 *
 * Script Properties (Project Settings → Script properties):
 *   APPS_SCRIPT_SHARED_SECRET  (required, 32+ random chars; same value in Vercel)
 *   SPREADSHEET_ID             (optional; defaults to the spreadsheet this script is bound to)
 *
 * Manual functions you can run from the editor:
 *   setupSpreadsheet()   – creates tabs/headers; safe to run repeatedly
 *   seedDemoData()       – inserts fictional demo data (refuses unless DEMO_SEED_ALLOWED=true)
 */

// ============================================================
// Schema
// ============================================================

var SCHEMA = {
  Students: ['student_id', 'batch_id', 'full_name', 'roll_number', 'department', 'graduation_year',
    'photo_url', 'internal_notes', 'created_at', 'updated_at', 'archived_at'],
  Companies: ['company_id', 'normalized_name', 'display_name', 'logo_url', 'website_url',
    'created_at', 'updated_at'],
  Placements: ['placement_id', 'student_id', 'company_id', 'job_role', 'placement_date', 'ctc',
    'currency', 'announcement_title', 'announcement_message', 'publication_status', 'published_at',
    'internal_notes', 'request_id', 'created_by', 'created_at', 'updated_at'],
  Batches: ['batch_id', 'batch_name', 'academic_year', 'department', 'total_students', 'timezone',
    'description', 'updated_at'],
  Admins: ['admin_id', 'display_name', 'email', 'enabled', 'created_at'],
  AuditLogs: ['log_id', 'actor_id', 'actor_name', 'action', 'entity_type', 'entity_id',
    'change_summary', 'created_at'],
  AppConfig: ['key', 'value', 'updated_at']
};

var DEFAULT_CONFIG = {
  app_name: 'PlacementVerse',
  active_batch_id: '',
  display_timezone: 'Asia/Kolkata',
  announcements_enabled: 'true',
  latest_wins_limit: '12',
  show_ctc: 'false',
  show_student_photos: 'false',
  qualifying_status: 'published'
};

// Only these config keys may ever leave the server in a public response.
var PUBLIC_CONFIG_KEYS = ['app_name', 'active_batch_id', 'display_timezone', 'announcements_enabled',
  'latest_wins_limit', 'show_ctc', 'show_student_photos'];

var DEFAULT_ADMINS = [
  { admin_id: 'adm_viraj', display_name: 'Viraj Yevale', email: '' },
  { admin_id: 'adm_uditi', display_name: 'Uditi', email: '' }
];

var LIMITS = {
  MAX_BULK: 500,
  LOCK_WAIT_MS: 20000,
  SIG_MAX_SKEW_MS: 5 * 60 * 1000,
  IDEMPOTENCY_TTL_S: 6 * 60 * 60,
  SNAPSHOT_TTL_S: 60,
  THROTTLE_WINDOW_S: 15 * 60,
  THROTTLE_MAX_FAILS: 5
};

// ============================================================
// Errors / responses
// ============================================================

function ApiError(code, message, details, retryable) {
  this.code = code;
  this.message = message;
  this.details = details || [];
  this.retryable = !!retryable;
}

function fail(code, message, details) { throw new ApiError(code, message, details, false); }

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Entry points
// ============================================================

function doGet() {
  // Health check only. No data is ever returned from GET.
  return jsonOut({ ok: true, data: { service: 'placementverse', status: 'up' } });
}

function doPost(e) {
  var result;
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    var body = verifyEnvelope_(raw);
    result = { ok: true, data: dispatch_(body) };
  } catch (err) {
    result = errorResponse_(err);
  }
  return jsonOut(result);
}

function errorResponse_(err) {
  if (err instanceof ApiError) {
    return { ok: false, error: { code: err.code, message: err.message, details: err.details, retryable: err.retryable } };
  }
  var msg = String(err && err.message ? err.message : err);
  var transient = /timed out|Service invoked too many times|Lock|temporarily|rate limit|quota/i.test(msg);
  console.error(msg);
  return {
    ok: false,
    error: {
      code: transient ? 'BACKEND_BUSY' : 'INTERNAL',
      message: transient ? 'The spreadsheet is busy. Please retry in a moment.' : 'Unexpected server error.',
      details: [],
      retryable: transient
    }
  };
}

// ============================================================
// Request authentication (HMAC between Next.js server and this script)
// ============================================================

function getSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SHARED_SECRET');
  if (!s || s.length < 32) fail('MISCONFIGURED', 'APPS_SCRIPT_SHARED_SECRET is missing or shorter than 32 characters.');
  return s;
}

function hmacHex_(message, secret) {
  var bytes = Utilities.computeHmacSha256Signature(message, secret);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyEnvelope_(raw) {
  if (!raw || raw.length > 2000000) fail('BAD_REQUEST', 'Missing or oversized request.');
  var env;
  try { env = JSON.parse(raw); } catch (x) { fail('BAD_REQUEST', 'Request is not valid JSON.'); }
  if (!env || typeof env.body !== 'string' || typeof env.sig !== 'string' || typeof env.ts !== 'number') {
    fail('UNAUTHORIZED', 'Unsigned request.');
  }
  if (Math.abs(Date.now() - env.ts) > LIMITS.SIG_MAX_SKEW_MS) fail('UNAUTHORIZED', 'Request expired.');
  var expected = hmacHex_(env.ts + '.' + env.body, getSecret_());
  if (!safeEqual_(expected, env.sig)) fail('UNAUTHORIZED', 'Invalid signature.');
  // Replay protection: a signature may be used once.
  var cache = CacheService.getScriptCache();
  var replayKey = 'sig:' + env.sig.substring(0, 64);
  if (cache.get(replayKey)) fail('UNAUTHORIZED', 'Replayed request.');
  cache.put(replayKey, '1', 600);
  var body;
  try { body = JSON.parse(env.body); } catch (x2) { fail('BAD_REQUEST', 'Body is not valid JSON.'); }
  if (!body || typeof body.op !== 'string') fail('BAD_REQUEST', 'Missing op.');
  return body;
}

// ============================================================
// Dispatcher
// ============================================================

var PUBLIC_OPS = {
  'public.snapshot': function (p) { return publicSnapshot_(); },
  'public.stats': function (p) { return publicSnapshot_().stats; },
  'public.announcements': function (p) { return publicAnnouncements_(p); },
  'public.directory': function (p) { return publicDirectory_(p); },
  'public.companies': function (p) { return publicCompanies_(); },
  'public.company': function (p) { return publicCompany_(p); },
  'public.cohorts': function (p) { return publicCohorts_(p); },
  'public.placement': function (p) { return publicPlacement_(p); },
  'public.student': function (p) { return publicStudent_(p); }
};

// Auth helper ops: called only by the Next.js login route (still HMAC-signed).
var AUTH_OPS = {
  'auth.admin': function (p) { return authAdmin_(p); },
  'auth.throttleCheck': function (p) { return throttleCheck_(p); },
  'auth.throttleRecord': function (p) { return throttleRecord_(p); }
};

var ADMIN_OPS = {
  'admin.overview': function (p, a) { return adminOverview_(); },
  'admin.students.list': function (p, a) { return adminListStudents_(); },
  'admin.students.create': function (p, a, r) { return createStudents_([p], a, r, false).created[0]; },
  'admin.students.bulkCreate': function (p, a, r) { return createStudents_(p.rows, a, r, !!p.partial); },
  'admin.students.update': function (p, a) { return updateStudent_(p, a); },
  'admin.students.archive': function (p, a) { return archiveStudent_(p, a, true); },
  'admin.students.unarchive': function (p, a) { return archiveStudent_(p, a, false); },
  'admin.companies.list': function (p, a) { return adminListCompanies_(); },
  'admin.companies.create': function (p, a, r) { return createCompany_(p, a, r); },
  'admin.companies.update': function (p, a) { return updateCompany_(p, a); },
  'admin.placements.list': function (p, a) { return adminListPlacements_(); },
  'admin.placements.create': function (p, a, r) { return bulkCreatePlacements_({ items: [p], partial: false }, a, r).created[0]; },
  'admin.placements.bulkCreate': function (p, a, r) { return bulkCreatePlacements_(p, a, r); },
  'admin.placements.update': function (p, a) { return updatePlacement_(p, a); },
  'admin.placements.setStatus': function (p, a) { return setPlacementStatus_(p, a); },
  'admin.batches.list': function (p, a) { return readTable_('Batches').rows; },
  'admin.batches.create': function (p, a, r) { return createBatch_(p, a, r); },
  'admin.batches.update': function (p, a) { return updateBatch_(p, a); },
  'admin.config.get': function (p, a) { return getConfig_(); },
  'admin.config.update': function (p, a) { return updateConfig_(p, a); },
  'admin.audit.list': function (p, a) { return listAudit_(p); },
  'admin.export': function (p, a) { return adminExport_(p, a); }
};

function dispatch_(body) {
  var op = body.op;
  var payload = body.payload || {};
  if (PUBLIC_OPS[op]) return PUBLIC_OPS[op](payload);
  if (AUTH_OPS[op]) return AUTH_OPS[op](payload);
  if (ADMIN_OPS[op]) {
    var actor = requireAdmin_(body.actor_id);
    var requestId = body.request_id ? cleanStr_(body.request_id, 80) : '';
    if (requestId) {
      var cached = CacheService.getScriptCache().get('req:' + op + ':' + requestId);
      if (cached) {
        var prior = JSON.parse(cached);
        if (prior && typeof prior === 'object') prior.replayed = true;
        return prior;
      }
    }
    var out = ADMIN_OPS[op](payload, actor, requestId);
    if (requestId) {
      try {
        var s = JSON.stringify(out);
        if (s.length < 90000) CacheService.getScriptCache().put('req:' + op + ':' + requestId, s, LIMITS.IDEMPOTENCY_TTL_S);
      } catch (ignore) { /* best effort */ }
    }
    return out;
  }
  fail('UNKNOWN_OP', 'Unknown operation: ' + op);
}

function requireAdmin_(actorId) {
  if (!actorId || typeof actorId !== 'string') fail('UNAUTHORIZED', 'Administrator identity required.');
  var admins = readTable_('Admins').rows;
  for (var i = 0; i < admins.length; i++) {
    if (admins[i].admin_id === actorId) {
      if (String(admins[i].enabled).toLowerCase() !== 'true') fail('FORBIDDEN', 'Administrator is disabled.');
      return { admin_id: admins[i].admin_id, display_name: admins[i].display_name };
    }
  }
  fail('FORBIDDEN', 'Unknown administrator.');
}

// ============================================================
// Spreadsheet access
// ============================================================

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) fail('MISCONFIGURED', 'Missing tab "' + name + '". Run setupSpreadsheet() first.');
  return sh;
}

function normalizeCell_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    // Sheets may auto-convert a date-like string. Convert back to an ISO calendar date.
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

/** Reads a whole tab in ONE call and maps rows to objects using the header row. */
function readTable_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { sheet: sh, header: [], rows: [] };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var empty = true;
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      var val = normalizeCell_(values[r][c]);
      if (val !== '') empty = false;
      obj[header[c]] = val;
    }
    if (empty) continue;
    Object.defineProperty(obj, '_row', { value: r + 1, enumerable: false });
    rows.push(obj);
  }
  return { sheet: sh, header: header, rows: rows };
}

/** Escapes values that Sheets would otherwise treat as formulas. */
function cellSafe_(v) {
  var s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function toRowArray_(header, obj) {
  return header.map(function (h) { return cellSafe_(obj[h] === undefined ? '' : obj[h]); });
}

/** Appends many rows with a single write. Forces text format so dates/IDs are not mangled. */
function appendRows_(table, objs) {
  if (!objs.length) return;
  var sh = table.sheet;
  var start = sh.getLastRow() + 1;
  var rows = objs.map(function (o) { return toRowArray_(table.header, o); });
  var range = sh.getRange(start, 1, rows.length, table.header.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function writeRow_(table, obj) {
  if (!obj._row) fail('INTERNAL', 'Row position unknown.');
  var range = table.sheet.getRange(obj._row, 1, 1, table.header.length);
  range.setNumberFormat('@');
  range.setValues([toRowArray_(table.header, obj)]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LIMITS.LOCK_WAIT_MS);
  } catch (e) {
    throw new ApiError('BACKEND_BUSY', 'Another update is in progress. Please retry.', [], true);
  }
  try {
    var out = fn();
    SpreadsheetApp.flush();
    invalidatePublicCache_();
    return out;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Helpers: ids, time, validation
// ============================================================

function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 20); }
function nowIso_() { return new Date().toISOString(); }

function cleanStr_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return max && s.length > max ? s.substring(0, max) : s;
}

function V() { this.errors = []; }
V.prototype.add = function (field, message, index) {
  var e = { field: field, message: message };
  if (index !== undefined) e.index = index;
  this.errors.push(e);
};
V.prototype.str = function (obj, field, opts, index) {
  var raw = obj[field];
  var s = cleanStr_(raw);
  if (!s) {
    if (opts.required) this.add(field, 'is required', index);
    return '';
  }
  if (opts.min && s.length < opts.min) this.add(field, 'must be at least ' + opts.min + ' characters', index);
  if (opts.max && s.length > opts.max) this.add(field, 'must be at most ' + opts.max + ' characters', index);
  if (opts.pattern && !opts.pattern.test(s)) this.add(field, opts.patternMessage || 'has an invalid format', index);
  return s;
};

function isValidDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function isHttpsUrl_(s) { return /^https:\/\/[^\s<>"']+$/i.test(s) && s.length <= 500; }

function isValidTimezone_(tz) {
  if (!/^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+\-]+){1,2})$/.test(tz)) return false;
  try { Utilities.formatDate(new Date(), tz, 'yyyy'); return true; } catch (e) { return false; }
}

function normalizeCompanyName_(name) {
  return cleanStr_(name).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|plc|gmbh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boolStr_(v) { return String(v).toLowerCase() === 'true'; }

// ============================================================
// Config & batch
// ============================================================

function getConfig_() {
  var rows = readTable_('AppConfig').rows;
  var cfg = {};
  for (var k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
  rows.forEach(function (r) { if (r.key) cfg[r.key] = r.value; });
  return cfg;
}

function activeBatch_(cfg, batches) {
  var list = batches || readTable_('Batches').rows;
  for (var i = 0; i < list.length; i++) if (list[i].batch_id === cfg.active_batch_id) return list[i];
  return list.length ? list[0] : null;
}

// ============================================================
// Public read model (strict allowlists)
// ============================================================

function invalidatePublicCache_() {
  try { CacheService.getScriptCache().remove('public:snapshot'); } catch (e) { /* ignore */ }
}

/**
 * Builds the complete public read model from four batched tab reads.
 * Every field that leaves this function is explicitly listed below.
 */
function buildPublicModel_() {
  var cfg = getConfig_();
  var batches = readTable_('Batches').rows;
  var batch = activeBatch_(cfg, batches);
  var batchId = batch ? batch.batch_id : '';
  var showCtc = boolStr_(cfg.show_ctc);
  var showPhotos = boolStr_(cfg.show_student_photos);

  var students = {};
  readTable_('Students').rows.forEach(function (s) {
    if (s.archived_at) return;
    if (batchId && s.batch_id !== batchId) return;
    students[s.student_id] = s;
  });
  var companies = {};
  readTable_('Companies').rows.forEach(function (c) { companies[c.company_id] = c; });

  var qualifying = cfg.qualifying_status || 'published';
  var placements = [];
  readTable_('Placements').rows.forEach(function (p) {
    if (p.publication_status !== qualifying) return;
    var s = students[p.student_id];
    var c = companies[p.company_id];
    if (!s || !c) return;
    var item = {
      placement_id: p.placement_id,
      student_id: s.student_id,
      student_name: s.full_name,
      department: s.department,
      company_id: c.company_id,
      company_name: c.display_name,
      company_logo_url: c.logo_url,
      job_role: p.job_role,
      placement_date: p.placement_date,
      published_at: p.published_at,
      announcement_title: p.announcement_title,
      announcement_message: p.announcement_message
    };
    if (showCtc && p.ctc !== '') { item.ctc = Number(p.ctc); item.currency = p.currency || 'INR'; }
    if (showPhotos && s.photo_url) item.student_photo_url = s.photo_url;
    placements.push(item);
  });
  placements.sort(comparePlacementsDesc_);

  var publicConfig = {};
  PUBLIC_CONFIG_KEYS.forEach(function (k) { publicConfig[k] = cfg[k]; });

  var totalStudents = batch ? Math.max(0, parseInt(batch.total_students, 10) || 0) : 0;
  return {
    config: publicConfig,
    batch: batch ? {
      batch_id: batch.batch_id, batch_name: batch.batch_name, academic_year: batch.academic_year,
      department: batch.department, total_students: totalStudents, timezone: batch.timezone || cfg.display_timezone
    } : null,
    stats: computeStats_(totalStudents, placements),
    placements: placements,
    companies: summarizeCompanies_(placements, companies),
    generated_at: nowIso_()
  };
}

/** Newest first: placement_date desc, then published_at desc, then placement_id (stable, total order). */
function comparePlacementsDesc_(a, b) {
  if (a.placement_date !== b.placement_date) return a.placement_date < b.placement_date ? 1 : -1;
  var ta = a.published_at || '', tb = b.published_at || '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.placement_id < b.placement_id ? -1 : a.placement_id > b.placement_id ? 1 : 0;
}

function computeStats_(totalStudents, placements) {
  var unique = {};
  placements.forEach(function (p) { unique[p.student_id] = true; });
  var placed = Object.keys(unique).length;
  var total = Math.max(0, totalStudents || 0);
  var rate = total > 0 ? Math.min(100, (placed / total) * 100) : 0;
  return {
    total_students: total,
    placed_students: placed,
    yet_to_be_placed: Math.max(total - placed, 0),
    placement_rate: Math.round(rate * 10) / 10,
    total_offers: placements.length
  };
}

function summarizeCompanies_(placements, companyMap) {
  var by = {};
  placements.forEach(function (p) {
    var g = by[p.company_id];
    if (!g) {
      var c = companyMap[p.company_id] || {};
      g = by[p.company_id] = {
        company_id: p.company_id, display_name: p.company_name, logo_url: p.company_logo_url,
        website_url: c.website_url || '', students: {}, roles: {}, offers: 0, latest_placement_date: ''
      };
    }
    g.students[p.student_id] = true;
    if (p.job_role) g.roles[p.job_role] = true;
    g.offers++;
    if (p.placement_date > g.latest_placement_date) g.latest_placement_date = p.placement_date;
  });
  return Object.keys(by).map(function (k) {
    var g = by[k];
    return {
      company_id: g.company_id, display_name: g.display_name, logo_url: g.logo_url, website_url: g.website_url,
      placed_students: Object.keys(g.students).length, offers: g.offers,
      roles: Object.keys(g.roles).sort(), latest_placement_date: g.latest_placement_date
    };
  }).sort(function (a, b) {
    return b.placed_students - a.placed_students || (a.display_name < b.display_name ? -1 : 1);
  });
}

function publicSnapshot_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('public:snapshot');
  if (hit) return JSON.parse(hit);
  var model = buildPublicModel_();
  try {
    var s = JSON.stringify(model);
    if (s.length < 95000) cache.put('public:snapshot', s, LIMITS.SNAPSHOT_TTL_S);
  } catch (e) { /* too large to cache: fine, still correct */ }
  return model;
}

function clampInt_(v, def, min, max) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = def;
  return Math.max(min, Math.min(max, n));
}

function publicAnnouncements_(p) {
  var snap = publicSnapshot_();
  var limit = clampInt_(p.limit, 20, 1, 100);
  var offset = clampInt_(p.offset, 0, 0, 1000000);
  return {
    items: snap.placements.slice(offset, offset + limit),
    total: snap.placements.length, offset: offset, limit: limit,
    has_more: offset + limit < snap.placements.length
  };
}

/** One entry per unique student, carrying ALL of that student's published offers. */
function buildDirectory_(placements) {
  var by = {};
  var order = [];
  placements.forEach(function (p) {
    if (!by[p.student_id]) {
      by[p.student_id] = { student_id: p.student_id, student_name: p.student_name, department: p.department, offers: [] };
      order.push(p.student_id);
    }
    by[p.student_id].offers.push(p);
  });
  return order.map(function (id) {
    var e = by[id];
    e.latest_placement_date = e.offers[0].placement_date; // placements arrive newest-first
    return e;
  });
}

function publicDirectory_(p) {
  var snap = publicSnapshot_();
  var q = cleanStr_(p.query, 100).toLowerCase();
  var companyId = cleanStr_(p.company_id, 64);
  var from = isValidDate_(cleanStr_(p.from)) ? cleanStr_(p.from) : '';
  var to = isValidDate_(cleanStr_(p.to)) ? cleanStr_(p.to) : '';
  var entries = buildDirectory_(snap.placements).filter(function (e) {
    if (q && e.student_name.toLowerCase().indexOf(q) === -1) return false;
    return e.offers.some(function (o) {
      if (companyId && o.company_id !== companyId) return false;
      if (from && o.placement_date < from) return false;
      if (to && o.placement_date > to) return false;
      return true;
    });
  });
  if (p.sort === 'name') {
    entries.sort(function (a, b) {
      var x = a.student_name.toLowerCase(), y = b.student_name.toLowerCase();
      return x < y ? -1 : x > y ? 1 : (a.student_id < b.student_id ? -1 : 1);
    });
  }
  var pageSize = clampInt_(p.page_size, 24, 1, 200);
  var page = clampInt_(p.page, 1, 1, 100000);
  var start = (page - 1) * pageSize;
  return {
    items: entries.slice(start, start + pageSize), total: entries.length, page: page, page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(entries.length / pageSize))
  };
}

function publicCompanies_() { return publicSnapshot_().companies; }

function publicCompany_(p) {
  var id = cleanStr_(p.company_id, 64);
  var snap = publicSnapshot_();
  var summary = null;
  snap.companies.forEach(function (c) { if (c.company_id === id) summary = c; });
  if (!summary) fail('NOT_FOUND', 'Company not found.');
  return { company: summary, placements: snap.placements.filter(function (x) { return x.company_id === id; }) };
}

/**
 * Groups published placements by calendar date (placement_date is already a calendar date
 * in the batch's timezone), with company sub-groups. Pagination is by DAY: a day is never
 * split across pages, so no announcement can be silently cut off.
 */
function buildCohorts_(placements) {
  var days = {};
  var order = [];
  placements.forEach(function (p) {
    if (!days[p.placement_date]) { days[p.placement_date] = []; order.push(p.placement_date); }
    days[p.placement_date].push(p);
  });
  return order.map(function (date) {
    var items = days[date];
    var students = {};
    var companies = {};
    var companyOrder = [];
    items.forEach(function (p) {
      students[p.student_id] = true;
      if (!companies[p.company_id]) {
        companies[p.company_id] = { company_id: p.company_id, company_name: p.company_name, company_logo_url: p.company_logo_url, placements: [] };
        companyOrder.push(p.company_id);
      }
      companies[p.company_id].placements.push(p);
    });
    var groups = companyOrder.map(function (k) { return companies[k]; }).sort(function (a, b) {
      return b.placements.length - a.placements.length || (a.company_name < b.company_name ? -1 : a.company_name > b.company_name ? 1 : 0);
    });
    return {
      date: date, announcement_count: items.length, unique_students: Object.keys(students).length,
      company_count: groups.length, companies: groups, placements: items
    };
  });
}

function publicCohorts_(p) {
  var all = buildCohorts_(publicSnapshot_().placements);
  var pageSize = clampInt_(p.days_per_page, 7, 1, 60);
  var page = clampInt_(p.page, 1, 1, 100000);
  var start = (page - 1) * pageSize;
  return {
    days: all.slice(start, start + pageSize), total_days: all.length, page: page, days_per_page: pageSize,
    has_more: start + pageSize < all.length
  };
}

function publicPlacement_(p) {
  var id = cleanStr_(p.placement_id, 64);
  var hit = null;
  publicSnapshot_().placements.forEach(function (x) { if (x.placement_id === id) hit = x; });
  if (!hit) fail('NOT_FOUND', 'Announcement not found.');
  return hit;
}

function publicStudent_(p) {
  var id = cleanStr_(p.student_id, 64);
  var offers = publicSnapshot_().placements.filter(function (x) { return x.student_id === id; });
  if (!offers.length) fail('NOT_FOUND', 'Student not found.');
  return { student_id: id, student_name: offers[0].student_name, department: offers[0].department,
    student_photo_url: offers[0].student_photo_url || '', offers: offers };
}

// ============================================================
// Auth helper ops (login support; passwords never touch this script)
// ============================================================

function authAdmin_(p) {
  var id = cleanStr_(p.admin_id, 64);
  var rows = readTable_('Admins').rows;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].admin_id === id) {
      return { admin_id: id, display_name: rows[i].display_name, enabled: boolStr_(rows[i].enabled) };
    }
  }
  return { admin_id: id, enabled: false };
}

function throttleKey_(p) { return 'throttle:' + cleanStr_(p.key, 120).replace(/[^a-zA-Z0-9:._-]/g, '_'); }

function throttleCheck_(p) {
  var n = parseInt(CacheService.getScriptCache().get(throttleKey_(p)) || '0', 10);
  return { blocked: n >= LIMITS.THROTTLE_MAX_FAILS, failures: n, max: LIMITS.THROTTLE_MAX_FAILS };
}

function throttleRecord_(p) {
  var cache = CacheService.getScriptCache();
  var key = throttleKey_(p);
  if (p.success) { cache.remove(key); return { failures: 0 }; }
  var n = parseInt(cache.get(key) || '0', 10) + 1;
  cache.put(key, String(n), LIMITS.THROTTLE_WINDOW_S);
  return { failures: n };
}

// ============================================================
// Audit
// ============================================================

function audit_(actor, action, entityType, entityId, summary) {
  var t = readTableHeaderOnly_('AuditLogs');
  appendRows_(t, [{
    log_id: newId_('log'), actor_id: actor.admin_id, actor_name: actor.display_name, action: action,
    entity_type: entityType, entity_id: entityId, change_summary: cleanStr_(summary, 2000), created_at: nowIso_()
  }]);
}

function readTableHeaderOnly_(name) {
  var sh = sheet_(name);
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  return { sheet: sh, header: header, rows: [] };
}

function listAudit_(p) {
  var rows = readTable_('AuditLogs').rows.slice().reverse();
  var limit = clampInt_(p.limit, 100, 1, 1000);
  return { items: rows.slice(0, limit), total: rows.length };
}

function diffSummary_(before, after, fields) {
  var parts = [];
  fields.forEach(function (f) {
    if (String(before[f] || '') !== String(after[f] || '')) parts.push(f + ': "' + (before[f] || '') + '" → "' + (after[f] || '') + '"');
  });
  return parts.join('; ') || 'no field changes';
}

// ============================================================
// Students
// ============================================================

function validateStudent_(v, input, index, defaults) {
  return {
    full_name: v.str(input, 'full_name', { required: true, min: 2, max: 100 }, index),
    roll_number: v.str(input, 'roll_number', { required: true, max: 40, pattern: /^[A-Za-z0-9][A-Za-z0-9_\-\/.]*$/, patternMessage: 'may contain letters, numbers, - _ / .' }, index),
    department: v.str(input, 'department', { max: 80 }, index) || (defaults && defaults.department) || '',
    graduation_year: v.str(input, 'graduation_year', { pattern: /^(20\d\d|2100)$/, patternMessage: 'must be a year between 2000 and 2100' }, index),
    photo_url: (function () {
      var u = v.str(input, 'photo_url', { max: 500 }, index);
      if (u && !isHttpsUrl_(u)) v.add('photo_url', 'must be an https:// URL', index);
      return u;
    })(),
    internal_notes: v.str(input, 'internal_notes', { max: 1000 }, index)
  };
}

function createStudents_(rows, actor, requestId, partial) {
  if (!Array.isArray(rows) || !rows.length) fail('VALIDATION', 'No students supplied.');
  if (rows.length > LIMITS.MAX_BULK) fail('VALIDATION', 'At most ' + LIMITS.MAX_BULK + ' students per request.');
  return withLock_(function () {
    var cfg = getConfig_();
    var batch = activeBatch_(cfg);
    if (!batch) fail('VALIDATION', 'Create a batch first.');
    var table = readTable_('Students');
    var seen = {};
    table.rows.forEach(function (s) { if (s.batch_id === batch.batch_id) seen[s.roll_number.toLowerCase()] = s.student_id; });
    var valid = [], failures = [];
    rows.forEach(function (input, i) {
      var v = new V();
      var s = validateStudent_(v, input || {}, i, batch);
      if (s.roll_number && seen[s.roll_number.toLowerCase()]) v.add('roll_number', 'already exists in this batch', i);
      if (v.errors.length) { failures.push({ index: i, errors: v.errors }); return; }
      seen[s.roll_number.toLowerCase()] = 'pending';
      var now = nowIso_();
      s.student_id = newId_('stu');
      s.batch_id = batch.batch_id;
      s.created_at = now; s.updated_at = now; s.archived_at = '';
      valid.push(s);
    });
    if (failures.length && !partial) {
      fail('VALIDATION', failures.length + ' row(s) failed validation. Nothing was saved.', failures);
    }
    appendRows_(table, valid);
    valid.forEach(function (s) { audit_(actor, 'student.create', 'student', s.student_id, s.full_name + ' (' + s.roll_number + ')'); });
    return { created: valid.map(adminStudentView_), failed: failures, created_count: valid.length, failed_count: failures.length };
  });
}

function adminStudentView_(s) {
  return {
    student_id: s.student_id, batch_id: s.batch_id, full_name: s.full_name, roll_number: s.roll_number,
    department: s.department, graduation_year: s.graduation_year, photo_url: s.photo_url,
    internal_notes: s.internal_notes, created_at: s.created_at, updated_at: s.updated_at, archived_at: s.archived_at
  };
}

function findById_(rows, field, id) {
  for (var i = 0; i < rows.length; i++) if (rows[i][field] === id) return rows[i];
  return null;
}

function updateStudent_(p, actor) {
  var id = cleanStr_(p.student_id, 64);
  return withLock_(function () {
    var table = readTable_('Students');
    var s = findById_(table.rows, 'student_id', id);
    if (!s) fail('NOT_FOUND', 'Student not found.');
    var merged = {};
    ['full_name', 'roll_number', 'department', 'graduation_year', 'photo_url', 'internal_notes'].forEach(function (f) {
      merged[f] = p[f] !== undefined ? p[f] : s[f];
    });
    var v = new V();
    var clean = validateStudent_(v, merged);
    table.rows.forEach(function (o) {
      if (o.student_id !== id && o.batch_id === s.batch_id && o.roll_number.toLowerCase() === clean.roll_number.toLowerCase()) {
        v.add('roll_number', 'already exists in this batch');
      }
    });
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    var before = {};
    for (var k in clean) { before[k] = s[k]; s[k] = clean[k]; }
    s.updated_at = nowIso_();
    writeRow_(table, s);
    audit_(actor, 'student.update', 'student', id, diffSummary_(before, s, ['full_name', 'roll_number', 'department', 'graduation_year', 'photo_url']));
    return adminStudentView_(s);
  });
}

function archiveStudent_(p, actor, archive) {
  var id = cleanStr_(p.student_id, 64);
  return withLock_(function () {
    var table = readTable_('Students');
    var s = findById_(table.rows, 'student_id', id);
    if (!s) fail('NOT_FOUND', 'Student not found.');
    s.archived_at = archive ? nowIso_() : '';
    s.updated_at = nowIso_();
    writeRow_(table, s);
    audit_(actor, archive ? 'student.archive' : 'student.unarchive', 'student', id, s.full_name);
    return adminStudentView_(s);
  });
}

function adminListStudents_() {
  var placements = readTable_('Placements').rows;
  var counts = {};
  placements.forEach(function (p) {
    var c = counts[p.student_id] || (counts[p.student_id] = { total: 0, published: 0 });
    c.total++;
    if (p.publication_status === 'published') c.published++;
  });
  return readTable_('Students').rows.map(function (s) {
    var v = adminStudentView_(s);
    var c = counts[s.student_id] || { total: 0, published: 0 };
    v.placement_count = c.total;
    v.published_count = c.published;
    return v;
  });
}

// ============================================================
// Companies
// ============================================================

function validateCompany_(v, input) {
  var out = {
    display_name: v.str(input, 'display_name', { required: true, min: 1, max: 100 }),
    logo_url: v.str(input, 'logo_url', { max: 500 }),
    website_url: v.str(input, 'website_url', { max: 500 })
  };
  if (out.logo_url && !isHttpsUrl_(out.logo_url)) v.add('logo_url', 'must be an https:// URL');
  if (out.website_url && !isHttpsUrl_(out.website_url)) v.add('website_url', 'must be an https:// URL');
  out.normalized_name = normalizeCompanyName_(out.display_name);
  if (out.display_name && !out.normalized_name) v.add('display_name', 'must contain letters or numbers');
  return out;
}

function createCompany_(p, actor) {
  return withLock_(function () {
    var v = new V();
    var c = validateCompany_(v, p);
    var table = readTable_('Companies');
    var existing = null;
    table.rows.forEach(function (o) { if (o.normalized_name === c.normalized_name) existing = o; });
    if (existing) {
      fail('DUPLICATE', '"' + existing.display_name + '" already exists.', [{ field: 'display_name', message: 'duplicate of ' + existing.company_id, existing_id: existing.company_id }]);
    }
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    var now = nowIso_();
    c.company_id = newId_('cmp');
    c.created_at = now; c.updated_at = now;
    appendRows_(table, [c]);
    audit_(actor, 'company.create', 'company', c.company_id, c.display_name);
    return c;
  });
}

function updateCompany_(p, actor) {
  var id = cleanStr_(p.company_id, 64);
  return withLock_(function () {
    var table = readTable_('Companies');
    var c = findById_(table.rows, 'company_id', id);
    if (!c) fail('NOT_FOUND', 'Company not found.');
    var merged = {};
    ['display_name', 'logo_url', 'website_url'].forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : c[f]; });
    var v = new V();
    var clean = validateCompany_(v, merged);
    table.rows.forEach(function (o) {
      if (o.company_id !== id && o.normalized_name === clean.normalized_name) v.add('display_name', 'another company already uses this name');
    });
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    var before = { display_name: c.display_name, logo_url: c.logo_url, website_url: c.website_url };
    for (var k in clean) c[k] = clean[k];
    c.updated_at = nowIso_();
    writeRow_(table, c);
    audit_(actor, 'company.update', 'company', id, diffSummary_(before, c, ['display_name', 'logo_url', 'website_url']));
    return c;
  });
}

function adminListCompanies_() {
  var counts = {};
  readTable_('Placements').rows.forEach(function (p) {
    var c = counts[p.company_id] || (counts[p.company_id] = { total: 0, published: 0 });
    c.total++;
    if (p.publication_status === 'published') c.published++;
  });
  return readTable_('Companies').rows.map(function (c) {
    var n = counts[c.company_id] || { total: 0, published: 0 };
    return {
      company_id: c.company_id, display_name: c.display_name, normalized_name: c.normalized_name,
      logo_url: c.logo_url, website_url: c.website_url, created_at: c.created_at, updated_at: c.updated_at,
      placement_count: n.total, published_count: n.published
    };
  });
}

// ============================================================
// Placements
// ============================================================

function placementKey_(p) {
  return [p.student_id, p.company_id, String(p.job_role || '').toLowerCase(), p.placement_date].join('|');
}

function validatePlacement_(v, input, index, ctx) {
  var out = {
    student_id: v.str(input, 'student_id', { required: true, max: 64 }, index),
    company_id: v.str(input, 'company_id', { required: true, max: 64 }, index),
    job_role: v.str(input, 'job_role', { max: 120 }, index),
    placement_date: v.str(input, 'placement_date', { required: true }, index),
    ctc: '',
    currency: (v.str(input, 'currency', { max: 3, pattern: /^[A-Za-z]{3}$/, patternMessage: 'must be a 3-letter code like INR' }, index) || 'INR').toUpperCase(),
    announcement_title: v.str(input, 'announcement_title', { max: 140 }, index),
    announcement_message: v.str(input, 'announcement_message', { max: 1000 }, index),
    publication_status: v.str(input, 'publication_status', { max: 20 }, index) || 'draft',
    internal_notes: v.str(input, 'internal_notes', { max: 1000 }, index)
  };
  if (out.placement_date && !isValidDate_(out.placement_date)) v.add('placement_date', 'must be a real date in YYYY-MM-DD format', index);
  if (out.publication_status !== 'draft' && out.publication_status !== 'published') v.add('publication_status', 'must be draft or published', index);
  var rawCtc = input.ctc;
  if (rawCtc !== undefined && rawCtc !== null && String(rawCtc).trim() !== '') {
    var n = Number(String(rawCtc).replace(/,/g, ''));
    if (!isFinite(n) || n < 0 || n > 1e10) v.add('ctc', 'must be a non-negative number', index);
    else out.ctc = String(n);
  }
  if (ctx) {
    var s = out.student_id && ctx.students[out.student_id];
    if (out.student_id && !s) v.add('student_id', 'does not exist', index);
    else if (s && s.archived_at) v.add('student_id', 'is archived', index);
    if (out.company_id && !ctx.companies[out.company_id]) v.add('company_id', 'does not exist', index);
  }
  return out;
}

function placementContext_() {
  var students = {}, companies = {};
  readTable_('Students').rows.forEach(function (s) { students[s.student_id] = s; });
  readTable_('Companies').rows.forEach(function (c) { companies[c.company_id] = c; });
  return { students: students, companies: companies };
}

/**
 * Bulk placement creation.
 *  1. validate every item  2. check student/company ids  3. check duplicates (existing + within request)
 *  4. acquire script lock  5. append all rows in ONE setValues call  6. verify every new id is present
 *  7. release lock         8. return created + failed with reasons
 *
 * Atomicity: by default (partial=false) NOTHING is written if any item fails validation. The append
 * itself is a single range write, which Sheets applies as one operation, but Google does not document
 * it as a transaction — so step 6 re-reads and reports any id that did not land.
 */
function bulkCreatePlacements_(p, actor, requestId) {
  var items = p && p.items;
  if (!Array.isArray(items) || !items.length) fail('VALIDATION', 'No placements supplied.');
  if (items.length > LIMITS.MAX_BULK) fail('VALIDATION', 'At most ' + LIMITS.MAX_BULK + ' placements per request.');
  var partial = !!p.partial;

  return withLock_(function () {
    var ctx = placementContext_();
    var table = readTable_('Placements');
    var existingKeys = {};
    var existingReq = {};
    table.rows.forEach(function (r) {
      existingKeys[placementKey_(r)] = r.placement_id;
      if (r.request_id) existingReq[r.request_id] = r;
    });

    // Retry safety that survives cache expiry: if every row for this request id already exists, return them.
    if (requestId) {
      var already = [];
      items.forEach(function (it, i) { var r = existingReq[requestId + ':' + i]; if (r) already.push(r); });
      if (already.length === items.length) {
        return { created: already.map(adminPlacementView_), failed: [], created_count: already.length, failed_count: 0, replayed: true };
      }
    }

    var valid = [], failures = [];
    var now = nowIso_();
    items.forEach(function (input, i) {
      var v = new V();
      var pl = validatePlacement_(v, input || {}, i, ctx);
      if (!v.errors.length) {
        var key = placementKey_(pl);
        if (existingKeys[key]) v.add('placement', 'duplicate of existing placement ' + existingKeys[key], i);
        else existingKeys[key] = 'pending:' + i;
      }
      if (v.errors.length) { failures.push({ index: i, errors: v.errors }); return; }
      pl.placement_id = newId_('plc');
      pl.request_id = requestId ? requestId + ':' + i : '';
      pl.created_by = actor.admin_id;
      pl.created_at = now; pl.updated_at = now;
      pl.published_at = pl.publication_status === 'published' ? now : '';
      if (!pl.announcement_title) {
        var c = ctx.companies[pl.company_id];
        pl.announcement_title = 'Placed at ' + (c ? c.display_name : 'a new company');
      }
      valid.push(pl);
    });

    if (failures.length && !partial) {
      fail('VALIDATION', failures.length + ' of ' + items.length + ' placement(s) failed validation. Nothing was saved.', failures);
    }

    appendRows_(table, valid);
    SpreadsheetApp.flush();

    // Verify.
    var ids = {};
    var sh = table.sheet;
    var idCol = table.header.indexOf('placement_id') + 1;
    sh.getRange(2, idCol, Math.max(sh.getLastRow() - 1, 1), 1).getValues().forEach(function (r) { ids[String(r[0])] = true; });
    var missing = valid.filter(function (pl) { return !ids[pl.placement_id]; });
    if (missing.length) {
      throw new ApiError('WRITE_UNVERIFIED', missing.length + ' row(s) could not be verified after writing. Check the sheet before retrying.', missing.map(function (m) { return { placement_id: m.placement_id }; }), false);
    }

    audit_(actor, valid.length > 1 ? 'placement.bulk_create' : 'placement.create', 'placement',
      valid.length === 1 ? valid[0].placement_id : (requestId || 'bulk'),
      valid.length + ' created (' + valid.filter(function (x) { return x.publication_status === 'published'; }).length + ' published), ' + failures.length + ' failed');

    return { created: valid.map(adminPlacementView_), failed: failures, created_count: valid.length, failed_count: failures.length };
  });
}

function adminPlacementView_(p) {
  var out = {};
  SCHEMA.Placements.forEach(function (k) { out[k] = p[k] === undefined ? '' : p[k]; });
  return out;
}

function updatePlacement_(p, actor) {
  var id = cleanStr_(p.placement_id, 64);
  return withLock_(function () {
    var ctx = placementContext_();
    var table = readTable_('Placements');
    var row = findById_(table.rows, 'placement_id', id);
    if (!row) fail('NOT_FOUND', 'Placement not found.');
    var fields = ['student_id', 'company_id', 'job_role', 'placement_date', 'ctc', 'currency', 'announcement_title',
      'announcement_message', 'publication_status', 'internal_notes'];
    var merged = {};
    fields.forEach(function (f) { merged[f] = p[f] !== undefined ? p[f] : row[f]; });
    var v = new V();
    var clean = validatePlacement_(v, merged, undefined, ctx);
    var key = placementKey_(clean);
    table.rows.forEach(function (o) {
      if (o.placement_id !== id && placementKey_(o) === key) v.add('placement', 'would duplicate placement ' + o.placement_id);
    });
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    var before = {};
    fields.forEach(function (f) { before[f] = row[f]; row[f] = clean[f]; });
    if (row.publication_status === 'published' && !row.published_at) row.published_at = nowIso_();
    if (row.publication_status === 'draft') row.published_at = '';
    row.updated_at = nowIso_();
    writeRow_(table, row);
    audit_(actor, 'placement.update', 'placement', id, diffSummary_(before, row, fields.filter(function (f) { return f !== 'internal_notes'; })));
    return adminPlacementView_(row);
  });
}

function setPlacementStatus_(p, actor) {
  var ids = Array.isArray(p.placement_ids) ? p.placement_ids : [p.placement_id];
  var status = cleanStr_(p.status, 20);
  if (status !== 'draft' && status !== 'published') fail('VALIDATION', 'status must be draft or published');
  if (!ids.length || ids.length > LIMITS.MAX_BULK) fail('VALIDATION', 'Provide 1-' + LIMITS.MAX_BULK + ' placement ids.');
  return withLock_(function () {
    var table = readTable_('Placements');
    var ctx = placementContext_();
    var updated = [], failed = [];
    var now = nowIso_();
    ids.forEach(function (rawId, i) {
      var id = cleanStr_(rawId, 64);
      var row = findById_(table.rows, 'placement_id', id);
      if (!row) { failed.push({ index: i, placement_id: id, errors: [{ field: 'placement_id', message: 'not found' }] }); return; }
      if (status === 'published') {
        var s = ctx.students[row.student_id];
        if (!s || s.archived_at) { failed.push({ index: i, placement_id: id, errors: [{ field: 'student_id', message: 'student missing or archived' }] }); return; }
      }
      if (row.publication_status === status) { updated.push(adminPlacementView_(row)); return; }
      row.publication_status = status;
      row.published_at = status === 'published' ? now : '';
      row.updated_at = now;
      writeRow_(table, row);
      updated.push(adminPlacementView_(row));
    });
    audit_(actor, status === 'published' ? 'placement.publish' : 'placement.unpublish', 'placement',
      ids.length === 1 ? cleanStr_(ids[0], 64) : 'multiple', updated.length + ' updated, ' + failed.length + ' failed');
    return { updated: updated, failed: failed, updated_count: updated.length, failed_count: failed.length };
  });
}

function adminListPlacements_() {
  var ctx = placementContext_();
  return readTable_('Placements').rows.map(function (p) {
    var v = adminPlacementView_(p);
    var s = ctx.students[p.student_id];
    var c = ctx.companies[p.company_id];
    v.student_name = s ? s.full_name : '(missing student)';
    v.roll_number = s ? s.roll_number : '';
    v.student_archived = s ? !!s.archived_at : true;
    v.company_name = c ? c.display_name : '(missing company)';
    return v;
  }).sort(comparePlacementsDesc_);
}

// ============================================================
// Batches & config
// ============================================================

function validateBatch_(v, input) {
  var out = {
    batch_name: v.str(input, 'batch_name', { required: true, max: 100 }),
    academic_year: v.str(input, 'academic_year', { max: 20 }),
    department: v.str(input, 'department', { max: 80 }),
    total_students: '',
    timezone: v.str(input, 'timezone', { max: 60 }) || 'Asia/Kolkata',
    description: v.str(input, 'description', { max: 500 })
  };
  var n = Number(input.total_students);
  if (!isFinite(n) || n < 0 || n > 100000 || Math.floor(n) !== n) v.add('total_students', 'must be a whole number between 0 and 100000');
  else out.total_students = String(n);
  if (!isValidTimezone_(out.timezone)) v.add('timezone', 'is not a recognised IANA timezone, e.g. Asia/Kolkata');
  return out;
}

function createBatch_(p, actor) {
  return withLock_(function () {
    var v = new V();
    var b = validateBatch_(v, p);
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    b.batch_id = newId_('bat');
    b.updated_at = nowIso_();
    appendRows_(readTable_('Batches'), [b]);
    var cfg = getConfig_();
    if (!cfg.active_batch_id || p.make_active) setConfigValues_({ active_batch_id: b.batch_id });
    audit_(actor, 'batch.create', 'batch', b.batch_id, b.batch_name + ' (' + b.total_students + ' students)');
    return b;
  });
}

function placedCountForBatch_(batchId) {
  var students = {};
  readTable_('Students').rows.forEach(function (s) { if (s.batch_id === batchId && !s.archived_at) students[s.student_id] = true; });
  var placed = {};
  readTable_('Placements').rows.forEach(function (p) {
    if (p.publication_status === 'published' && students[p.student_id]) placed[p.student_id] = true;
  });
  return Object.keys(placed).length;
}

function updateBatch_(p, actor) {
  var id = cleanStr_(p.batch_id, 64);
  return withLock_(function () {
    var table = readTable_('Batches');
    var b = findById_(table.rows, 'batch_id', id);
    if (!b) fail('NOT_FOUND', 'Batch not found.');
    var merged = {};
    ['batch_name', 'academic_year', 'department', 'total_students', 'timezone', 'description'].forEach(function (f) {
      merged[f] = p[f] !== undefined ? p[f] : b[f];
    });
    var v = new V();
    var clean = validateBatch_(v, merged);
    if (v.errors.length) fail('VALIDATION', 'Please fix the highlighted fields.', v.errors);
    var placed = placedCountForBatch_(id);
    var correction = '';
    if (Number(clean.total_students) < placed) {
      var reason = cleanStr_(p.correction_reason, 500);
      if (!p.force_correction || reason.length < 10) {
        fail('BATCH_BELOW_PLACED', 'Batch strength (' + clean.total_students + ') cannot be lower than the ' + placed +
          ' students already placed. Use the correction workflow with a reason if this is intentional.',
          [{ field: 'total_students', message: 'must be at least ' + placed, placed: placed }]);
      }
      correction = ' [CORRECTION below placed count ' + placed + ': ' + reason + ']';
    }
    var before = {};
    for (var k in clean) { before[k] = b[k]; b[k] = clean[k]; }
    b.updated_at = nowIso_();
    writeRow_(table, b);
    audit_(actor, 'batch.update', 'batch', id, diffSummary_(before, b, ['batch_name', 'academic_year', 'department', 'total_students', 'timezone', 'description']) + correction);
    return b;
  });
}

var EDITABLE_CONFIG = {
  app_name: function (v) { return v.length >= 1 && v.length <= 60; },
  active_batch_id: function (v) { return /^bat_[a-z0-9]+$/.test(v); },
  display_timezone: function (v) { return isValidTimezone_(v); },
  announcements_enabled: function (v) { return v === 'true' || v === 'false'; },
  latest_wins_limit: function (v) { return /^\d+$/.test(v) && Number(v) >= 3 && Number(v) <= 48; },
  show_ctc: function (v) { return v === 'true' || v === 'false'; },
  show_student_photos: function (v) { return v === 'true' || v === 'false'; }
};

function setConfigValues_(values) {
  var table = readTable_('AppConfig');
  var now = nowIso_();
  var toAppend = [];
  Object.keys(values).forEach(function (k) {
    var row = findById_(table.rows, 'key', k);
    if (row) { row.value = values[k]; row.updated_at = now; writeRow_(table, row); }
    else toAppend.push({ key: k, value: values[k], updated_at: now });
  });
  appendRows_(table, toAppend);
}

function updateConfig_(p, actor) {
  var values = p.values || {};
  var v = new V();
  var clean = {};
  Object.keys(values).forEach(function (k) {
    if (!EDITABLE_CONFIG[k]) { v.add(k, 'is not an editable setting'); return; }
    var s = cleanStr_(values[k], 100);
    if (!EDITABLE_CONFIG[k](s)) v.add(k, 'has an invalid value'); else clean[k] = s;
  });
  if (v.errors.length) fail('VALIDATION', 'Invalid settings.', v.errors);
  if (clean.active_batch_id && !findById_(readTable_('Batches').rows, 'batch_id', clean.active_batch_id)) {
    fail('VALIDATION', 'Unknown batch.', [{ field: 'active_batch_id', message: 'does not exist' }]);
  }
  return withLock_(function () {
    setConfigValues_(clean);
    audit_(actor, 'config.update', 'config', 'app', Object.keys(clean).map(function (k) { return k + '=' + clean[k]; }).join('; '));
    return getConfig_();
  });
}

// ============================================================
// Overview & export
// ============================================================

function adminOverview_() {
  var model = buildPublicModel_();
  var placements = readTable_('Placements').rows;
  var drafts = placements.filter(function (p) { return p.publication_status === 'draft'; }).length;
  var students = readTable_('Students').rows;
  return {
    batch: model.batch,
    stats: model.stats,
    total_companies: readTable_('Companies').rows.length,
    published_announcements: placements.filter(function (p) { return p.publication_status === 'published'; }).length,
    draft_announcements: drafts,
    registered_students: students.filter(function (s) { return !s.archived_at; }).length,
    archived_students: students.filter(function (s) { return !!s.archived_at; }).length,
    recent_activity: listAudit_({ limit: 10 }).items
  };
}

function adminExport_(p, actor) {
  var entity = cleanStr_(p.entity, 20);
  var data;
  if (entity === 'students') data = adminListStudents_().map(function (s) {
    return { roll_number: s.roll_number, full_name: s.full_name, department: s.department, graduation_year: s.graduation_year,
      archived: s.archived_at ? 'yes' : 'no', placements: s.placement_count };
  });
  else if (entity === 'placements') data = adminListPlacements_().map(function (x) {
    return { placement_id: x.placement_id, roll_number: x.roll_number, student_name: x.student_name, company_name: x.company_name,
      job_role: x.job_role, placement_date: x.placement_date, ctc: x.ctc, currency: x.currency, publication_status: x.publication_status };
  });
  else if (entity === 'companies') data = adminListCompanies_().map(function (c) {
    return { display_name: c.display_name, website_url: c.website_url, logo_url: c.logo_url, placements: c.placement_count };
  });
  else fail('VALIDATION', 'entity must be students, placements or companies');
  // Export is read-only; logging it gives a trail of who pulled data out.
  withLock_(function () { audit_(actor, 'export', entity, '-', data.length + ' rows exported'); });
  return { entity: entity, rows: data };
}

// ============================================================
// Setup & seed (run manually from the Apps Script editor)
// ============================================================

/** Creates missing tabs and missing header columns. Never deletes or reorders data. Safe to re-run. */
function setupSpreadsheet() {
  var lock = LockService.getScriptLock();
  lock.waitLock(LIMITS.LOCK_WAIT_MS);
  try {
    var ss = ss_();
    var report = [];
    Object.keys(SCHEMA).forEach(function (name) {
      var cols = SCHEMA[name];
      var sh = ss.getSheetByName(name);
      if (!sh) {
        sh = ss.insertSheet(name);
        report.push('created tab ' + name);
      }
      var lastCol = sh.getLastColumn();
      var header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
      var missing = cols.filter(function (c) { return header.indexOf(c) === -1; });
      if (missing.length) {
        // Append missing columns to the right of whatever is already there; never move existing columns.
        sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        report.push(name + ': added columns ' + missing.join(', '));
      }
      sh.setFrozenRows(1);
      var width = Math.max(sh.getLastColumn(), cols.length);
      sh.getRange(1, 1, sh.getMaxRows(), width).setNumberFormat('@');
    });

    // Default config values (only keys that are missing).
    var cfgTable = readTable_('AppConfig');
    var have = {};
    cfgTable.rows.forEach(function (r) { have[r.key] = true; });
    var now = nowIso_();
    var addCfg = [];
    Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!have[k]) addCfg.push({ key: k, value: DEFAULT_CONFIG[k], updated_at: now }); });
    appendRows_(cfgTable, addCfg);
    if (addCfg.length) report.push('AppConfig: added ' + addCfg.map(function (r) { return r.key; }).join(', '));

    // Provision exactly the two administrators (no passwords here — those live in Vercel env vars).
    var adminTable = readTable_('Admins');
    var addAdmins = DEFAULT_ADMINS.filter(function (a) { return !findById_(adminTable.rows, 'admin_id', a.admin_id); })
      .map(function (a) { return { admin_id: a.admin_id, display_name: a.display_name, email: a.email, enabled: 'true', created_at: now }; });
    appendRows_(adminTable, addAdmins);
    if (addAdmins.length) report.push('Admins: provisioned ' + addAdmins.map(function (a) { return a.display_name; }).join(', '));

    // A first batch so the site has something to count against.
    var batches = readTable_('Batches');
    if (!batches.rows.length) {
      var b = { batch_id: newId_('bat'), batch_name: 'MBA 2025-27', academic_year: '2025-27', department: 'MBA',
        total_students: '60', timezone: 'Asia/Kolkata', description: 'Initial batch — edit in Admin → Batches', updated_at: now };
      appendRows_(batches, [b]);
      setConfigValues_({ active_batch_id: b.batch_id });
      report.push('Batches: created default batch of 60');
    }
    invalidatePublicCache_();
    var msg = report.length ? report.join('\n') : 'Everything already set up. No changes.';
    console.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

var DEMO_FIRST = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Vihaan', 'Ira', 'Arjun', 'Saanvi', 'Reyansh', 'Myra', 'Advait', 'Kiara',
  'Rohan', 'Tara', 'Ishaan', 'Meera', 'Dhruv', 'Anika', 'Kian', 'Zara'];
var DEMO_LAST = ['Mehta', 'Iyer', 'Kapoor', 'Nair'];

/**
 * Inserts FICTIONAL demo data: 60 students, 12 placed, including 6 students placed on the same day
 * across three companies. Refuses to run unless the script property DEMO_SEED_ALLOWED is "true",
 * so it cannot run against a production sheet by accident. Remove the property afterwards.
 */
function seedDemoData() {
  if (PropertiesService.getScriptProperties().getProperty('DEMO_SEED_ALLOWED') !== 'true') {
    throw new Error('Refusing to seed. Set script property DEMO_SEED_ALLOWED=true on a NON-production spreadsheet first.');
  }
  setupSpreadsheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(LIMITS.LOCK_WAIT_MS);
  try {
    if (readTable_('Students').rows.length) throw new Error('Students tab is not empty. Seed only into an empty demo spreadsheet.');
    var cfg = getConfig_();
    var batch = activeBatch_(cfg);
    var now = nowIso_();
    var students = [];
    for (var i = 0; i < 60; i++) {
      students.push({
        student_id: newId_('stu'), batch_id: batch.batch_id,
        full_name: DEMO_FIRST[i % 20] + ' ' + DEMO_LAST[Math.floor(i / 20) % 4] + ' (Demo)',
        roll_number: 'DEMO' + ('00' + (i + 1)).slice(-3), department: 'MBA', graduation_year: '2027',
        photo_url: '', internal_notes: 'demo record', created_at: now, updated_at: now, archived_at: ''
      });
    }
    appendRows_(readTable_('Students'), students);
    var companyNames = ['Demo Analytics Co', 'Sample Capital Partners', 'Example Consulting Group', 'Placeholder Retail Labs', 'Mock FinServe'];
    var companies = companyNames.map(function (n) {
      return { company_id: newId_('cmp'), normalized_name: normalizeCompanyName_(n), display_name: n, logo_url: '', website_url: '', created_at: now, updated_at: now };
    });
    appendRows_(readTable_('Companies'), companies);
    // [studentIndex, companyIndex, role, date]
    var plan = [
      [0, 0, 'Business Analyst', '2026-09-28'], [1, 1, 'Investment Analyst', '2026-10-02'],
      [2, 2, 'Associate Consultant', '2026-10-06'], [3, 3, 'Category Manager', '2026-10-09'],
      [4, 0, 'Product Analyst', '2026-10-12'], [5, 4, 'Risk Analyst', '2026-10-15'],
      // Same-day cohort: 6 students, 3 companies.
      [6, 0, 'Business Analyst', '2026-10-20'], [7, 0, 'Business Analyst', '2026-10-20'], [8, 0, 'Data Analyst', '2026-10-20'],
      [9, 2, 'Associate Consultant', '2026-10-20'], [10, 2, 'Associate Consultant', '2026-10-20'], [11, 1, 'Equity Research Associate', '2026-10-20'],
      // Second offer for an already-placed student (must NOT increase the placed count).
      [0, 1, 'Strategy Associate', '2026-10-20']
    ];
    var placements = plan.map(function (x, k) {
      var c = companies[x[1]];
      return {
        placement_id: newId_('plc'), student_id: students[x[0]].student_id, company_id: c.company_id, job_role: x[2],
        placement_date: x[3], ctc: String(1200000 + k * 50000), currency: 'INR', announcement_title: 'Placed at ' + c.display_name,
        announcement_message: '', publication_status: 'published', published_at: x[3] + 'T10:' + ('0' + k).slice(-2) + ':00.000Z',
        internal_notes: 'demo', request_id: '', created_by: 'adm_viraj', created_at: now, updated_at: now
      };
    });
    // One private draft: must never appear publicly.
    placements.push({
      placement_id: newId_('plc'), student_id: students[12].student_id, company_id: companies[3].company_id, job_role: 'Draft Role',
      placement_date: '2026-10-20', ctc: '', currency: 'INR', announcement_title: 'Draft — not public', announcement_message: '',
      publication_status: 'draft', published_at: '', internal_notes: 'pending offer letter', request_id: '', created_by: 'adm_uditi',
      created_at: now, updated_at: now
    });
    appendRows_(readTable_('Placements'), placements);
    invalidatePublicCache_();
    return 'Seeded 60 demo students, ' + companies.length + ' demo companies, ' + placements.length + ' placements (12 unique placed, 1 draft).';
  } finally {
    lock.releaseLock();
  }
}
