// In-memory stand-ins for the Google Apps Script services Code.gs uses.
// They load the REAL google-apps-script/Code.gs into an isolated VM context,
// so the tests exercise the exact code you deploy.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CODE_PATH = path.resolve(here, '../../google-apps-script/Code.gs');

class MockRange {
  constructor(sheet, row, col, nRows, nCols) {
    Object.assign(this, { sheet, row, col, nRows, nCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nRows; r++) {
      const line = [];
      for (let c = 0; c < this.nCols; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    this.sheet.env.assertWriteAllowed();
    this.sheet.env.writeCalls++;
    if (values.length !== this.nRows || values.some((l) => l.length !== this.nCols)) {
      throw new Error('setValues dimension mismatch');
    }
    if (this.sheet.env.failNextWrite) {
      this.sheet.env.failNextWrite = false;
      throw new Error('Service Spreadsheets timed out while accessing document');
    }
    for (let r = 0; r < this.nRows; r++) {
      const rowIdx = this.row - 1 + r;
      while (this.sheet.data.length <= rowIdx) this.sheet.data.push([]);
      for (let c = 0; c < this.nCols; c++) {
        let v = values[r][c];
        const text = this.sheet.textRows.has(rowIdx + 1);
        if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1); // Sheets strips the escape quote
        else if (typeof v === 'string' && /^[=]/.test(v)) v = '#FORMULA:' + v; // would execute in real Sheets
        else if (!text && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = new Date(v + 'T00:00:00+05:30'); // auto-conversion
        this.sheet.data[rowIdx][this.col - 1 + c] = v;
      }
    }
    return this;
  }
  setNumberFormat(fmt) {
    if (fmt === '@') for (let r = 0; r < this.nRows; r++) this.sheet.textRows.add(this.row + r);
    return this;
  }
}

class MockSheet {
  constructor(env, name) {
    this.env = env; this.name = name; this.data = []; this.textRows = new Set(); this.maxRows = 1000;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some((v) => v !== '' && v !== undefined)) return r + 1;
    return 0;
  }
  getLastColumn() {
    let max = 0;
    for (const line of this.data) for (let c = (line || []).length - 1; c >= 0; c--) if (line[c] !== '' && line[c] !== undefined) { max = Math.max(max, c + 1); break; }
    return max;
  }
  getMaxRows() { return Math.max(this.maxRows, this.data.length); }
  getRange(row, col, nRows = 1, nCols = 1) {
    if (row < 1 || col < 1 || nRows < 1 || nCols < 1) throw new Error(`bad range ${row},${col},${nRows},${nCols}`);
    this.env.readCalls++;
    return new MockRange(this, row, col, nRows, nCols);
  }
  setFrozenRows() { return this; }
}

export function createGas({ secret = 'x'.repeat(40), props = {}, now } = {}) {
  const env = {
    sheets: new Map(), cache: new Map(), lockHeld: false, lockBusy: false, writeCalls: 0, readCalls: 0,
    failNextWrite: false, writesOutsideLock: 0, setupMode: false,
    assertWriteAllowed() { if (!this.lockHeld) this.writesOutsideLock++; }
  };
  const properties = { APPS_SCRIPT_SHARED_SECRET: secret, ...props };
  const spreadsheet = {
    getSheetByName: (n) => env.sheets.get(n) || null,
    insertSheet: (n) => { const s = new MockSheet(env, n); env.sheets.set(n, s); return s; }
  };
  const context = {
    console: { log() {}, error() {} },
    Date: now ? class extends Date { constructor(...a) { super(...(a.length ? a : [now()])); } static now() { return now(); } } : Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in properties ? properties[k] : null) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (env.cache.has(k) ? env.cache.get(k) : null),
        put: (k, v) => { if (String(v).length > 100000) throw new Error('Argument too large'); env.cache.set(k, String(v)); },
        remove: (k) => env.cache.delete(k)
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { if (env.lockBusy || env.lockHeld) throw new Error('Lock timeout'); env.lockHeld = true; },
        releaseLock() { env.lockHeld = false; }
      })
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (msg, key) => Array.from(crypto.createHmac('sha256', key).update(msg, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, fmt) => {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
        const get = (t) => parts.find((p) => p.type === t).value;
        if (fmt === 'yyyy') return get('year');
        return `${get('year')}-${get('month')}-${get('day')}`;
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Kolkata' },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; } })
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), context, { filename: 'Code.gs' });

  const sign = (bodyObj, opts = {}) => {
    const body = JSON.stringify({ nonce: crypto.randomUUID(), ...bodyObj });
    const ts = opts.ts ?? Date.now();
    const sig = crypto.createHmac('sha256', opts.secret ?? secret).update(`${ts}.${body}`).digest('hex');
    return JSON.stringify({ body, ts, sig });
  };
  const postRaw = (raw) => JSON.parse(context.doPost({ postData: { contents: raw } }).content);
  const call = (op, payload = {}, extra = {}) => postRaw(sign({ op, payload, ...extra }));
  const admin = (op, payload = {}, extra = {}) => call(op, payload, { actor_id: 'adm_viraj', ...extra });
  const rows = (tab) => {
    const sh = env.sheets.get(tab);
    const [header, ...rest] = sh.data;
    return rest.filter((l) => l.some((v) => v !== '')).map((l) => Object.fromEntries(header.map((h, i) => [h, l[i] ?? ''])));
  };
  return { context, env, sign, postRaw, call, admin, rows, properties };
}

/** Fresh, set-up spreadsheet with one batch of `total` students registered. */
export function setupWorld({ total = 60, registered = total } = {}) {
  const gas = createGas();
  gas.context.setupSpreadsheet();
  const batchId = gas.rows('Batches')[0].batch_id;
  if (total !== 60) gas.admin('admin.batches.update', { batch_id: batchId, total_students: total });
  const students = [];
  if (registered) {
    const res = gas.admin('admin.students.bulkCreate', {
      rows: Array.from({ length: registered }, (_, i) => ({ full_name: `Student ${String(i + 1).padStart(3, '0')}`, roll_number: `R${i + 1}` }))
    });
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    students.push(...res.data.created);
  }
  return { gas, batchId, students };
}
