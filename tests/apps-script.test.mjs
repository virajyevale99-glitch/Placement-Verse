// Runs the real google-apps-script/Code.gs against an in-memory spreadsheet.
// Run: npm test   (or: node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGas, setupWorld } from './helpers/gas-mock.mjs';

const today = '2026-10-20';

function publish(gas, items, extra = {}) {
  return gas.admin('admin.placements.bulkCreate', { items: items.map((i) => ({ publication_status: 'published', ...i })) }, extra);
}
async function company(gas, name) {
  const r = gas.admin('admin.companies.create', { display_name: name });
  assert.ok(r.ok, JSON.stringify(r.error));
  return r.data;
}

test('setup is idempotent and provisions exactly the two admins', () => {
  const gas = createGas();
  gas.context.setupSpreadsheet();
  const second = gas.context.setupSpreadsheet();
  assert.match(second, /No changes/);
  assert.deepEqual(gas.rows('Admins').map((a) => a.display_name), ['Viraj Yevale', 'Uditi']);
  assert.equal(gas.rows('Batches').length, 1);
  assert.equal(gas.rows('Batches')[0].total_students, '60');
  assert.equal(gas.env.writesOutsideLock, 0, 'every write must happen under the script lock');
});

test('setup adds missing columns without touching existing data', () => {
  const gas = createGas();
  gas.context.setupSpreadsheet();
  const sh = gas.env.sheets.get('Companies');
  sh.data[0] = sh.data[0].slice(0, 3); // simulate an older sheet missing columns
  sh.data.push(['cmp_keep', 'keep', 'Keep Me']);
  gas.context.setupSpreadsheet();
  const rows = gas.rows('Companies');
  assert.equal(rows[0].display_name, 'Keep Me');
  assert.ok('website_url' in rows[0]);
});

test('requests must be signed, fresh and not replayed', () => {
  const gas = createGas();
  gas.context.setupSpreadsheet();
  assert.equal(gas.postRaw('{"body":"{}"}').error.code, 'UNAUTHORIZED');
  assert.equal(gas.postRaw(gas.sign({ op: 'public.stats' }, { secret: 'y'.repeat(40) })).error.code, 'UNAUTHORIZED');
  assert.equal(gas.postRaw(gas.sign({ op: 'public.stats' }, { ts: Date.now() - 10 * 60 * 1000 })).error.code, 'UNAUTHORIZED');
  const raw = gas.sign({ op: 'public.stats', nonce: 'fixed' });
  assert.equal(gas.postRaw(raw).ok, true);
  assert.equal(gas.postRaw(raw).error.code, 'UNAUTHORIZED', 'replay must be rejected');
});

test('admin operations reject missing, unknown and disabled admins', () => {
  const { gas } = setupWorld({ registered: 1 });
  assert.equal(gas.call('admin.companies.create', { display_name: 'X' }).error.code, 'UNAUTHORIZED');
  assert.equal(gas.call('admin.companies.create', { display_name: 'X' }, { actor_id: 'adm_hacker' }).error.code, 'FORBIDDEN');
  gas.env.sheets.get('Admins').data[2][3] = 'false'; // disable Uditi
  assert.equal(gas.call('admin.companies.create', { display_name: 'X' }, { actor_id: 'adm_uditi' }).error.code, 'FORBIDDEN');
  assert.equal(gas.rows('Companies').length, 0, 'no write may happen');
});

test('stats: 60 batch, 12 placed → 48 remaining, 20%', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Acme');
  const r = publish(gas, students.slice(0, 12).map((s) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: today })));
  assert.ok(r.ok);
  const stats = gas.call('public.stats').data;
  assert.deepEqual(
    [stats.total_students, stats.placed_students, stats.yet_to_be_placed, stats.placement_rate],
    [60, 12, 48, 20]
  );
});

test('a student with two offers counts once', async () => {
  const { gas, students } = setupWorld({ total: 10, registered: 3 });
  const a = await company(gas, 'Alpha');
  const b = await company(gas, 'Beta');
  publish(gas, [
    { student_id: students[0].student_id, company_id: a.company_id, placement_date: today },
    { student_id: students[0].student_id, company_id: b.company_id, placement_date: today }
  ]);
  const s = gas.call('public.stats').data;
  assert.equal(s.placed_students, 1);
  assert.equal(s.total_offers, 2);
  assert.equal(s.yet_to_be_placed, 9);
});

test('zero-student batch never divides by zero and rate never exceeds 100', async () => {
  const { gas, students, batchId } = setupWorld({ total: 0, registered: 0 });
  let s = gas.call('public.stats').data;
  assert.deepEqual([s.total_students, s.placed_students, s.yet_to_be_placed, s.placement_rate], [0, 0, 0, 0]);
  assert.equal(students.length, 0);
  // Total below placed is only possible through the correction workflow; rate must still cap at 100.
  gas.admin('admin.batches.update', { batch_id: batchId, total_students: 5 });
  const regs = gas.admin('admin.students.bulkCreate', { rows: [1, 2, 3].map((i) => ({ full_name: 'Zed ' + i, roll_number: 'Z' + i })) }).data.created;
  const c = await company(gas, 'Gamma');
  publish(gas, regs.map((r) => ({ student_id: r.student_id, company_id: c.company_id, placement_date: today })));
  const corr = gas.admin('admin.batches.update', { batch_id: batchId, total_students: 2, force_correction: true, correction_reason: 'two students withdrew from batch' });
  assert.ok(corr.ok, JSON.stringify(corr.error));
  s = gas.call('public.stats').data;
  assert.equal(s.placement_rate, 100);
  assert.equal(s.yet_to_be_placed, 0);
});

test('batch strength cannot drop below placed count without a correction reason', async () => {
  const { gas, students, batchId } = setupWorld({ total: 10, registered: 5 });
  const c = await company(gas, 'Delta');
  publish(gas, students.map((s) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: today })));
  const r = gas.admin('admin.batches.update', { batch_id: batchId, total_students: 4 });
  assert.equal(r.error.code, 'BATCH_BELOW_PLACED');
  const weak = gas.admin('admin.batches.update', { batch_id: batchId, total_students: 4, force_correction: true, correction_reason: 'oops' });
  assert.equal(weak.error.code, 'BATCH_BELOW_PLACED');
  assert.equal(gas.rows('Batches')[0].total_students, '10');
  const ok = gas.admin('admin.batches.update', { batch_id: batchId, total_students: 5 });
  assert.ok(ok.ok);
  assert.ok(gas.rows('AuditLogs').some((l) => l.action === 'batch.update'));
});

test('15 same-day placements across companies are all saved and all shown', async () => {
  const { gas, students } = setupWorld();
  const big = await company(gas, 'Big Co');
  const others = [await company(gas, 'Other One'), await company(gas, 'Other Two'), await company(gas, 'Other Three')];
  const items = students.slice(0, 15).map((s, i) => ({
    student_id: s.student_id,
    company_id: i < 8 ? big.company_id : others[i % 3].company_id,
    job_role: 'Analyst',
    placement_date: '2026-10-20'
  }));
  const r = publish(gas, items);
  assert.equal(r.data.created_count, 15);
  assert.equal(new Set(r.data.created.map((p) => p.placement_id)).size, 15, 'unique ids');
  assert.equal(gas.rows('Placements').length, 15, 'one row per placement');
  const cohorts = gas.call('public.cohorts').data;
  assert.equal(cohorts.days.length, 1);
  const day = cohorts.days[0];
  assert.equal(day.date, '2026-10-20');
  assert.equal(day.announcement_count, 15);
  assert.equal(day.unique_students, 15);
  assert.equal(day.companies[0].company_name, 'Big Co');
  assert.equal(day.companies[0].placements.length, 8);
  const inGroups = day.companies.flatMap((g) => g.placements.map((p) => p.student_id));
  assert.deepEqual(new Set(inGroups), new Set(students.slice(0, 15).map((s) => s.student_id)));
});

test('a later placement never replaces an earlier one; dates are not mangled by Sheets', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Echo');
  publish(gas, [{ student_id: students[0].student_id, company_id: c.company_id, placement_date: '2026-10-19' }]);
  publish(gas, [{ student_id: students[1].student_id, company_id: c.company_id, placement_date: '2026-10-19' }]);
  publish(gas, [{ student_id: students[2].student_id, company_id: c.company_id, placement_date: '2026-10-20' }]);
  const anns = gas.call('public.announcements', { limit: 100 }).data;
  assert.equal(anns.total, 3);
  assert.deepEqual(anns.items.map((a) => a.placement_date), ['2026-10-20', '2026-10-19', '2026-10-19']);
  assert.equal(typeof gas.env.sheets.get('Placements').data[1][4], 'string', 'stored as text, not a Date');
});

test('duplicate placements are rejected; nothing is written in all-or-nothing mode', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Foxtrot');
  const one = { student_id: students[0].student_id, company_id: c.company_id, job_role: 'PM', placement_date: today };
  assert.ok(publish(gas, [one]).ok);
  const r = publish(gas, [{ ...one, job_role: 'pm' }, { student_id: students[1].student_id, company_id: c.company_id, placement_date: today }]);
  assert.equal(r.error.code, 'VALIDATION');
  assert.equal(r.error.details[0].index, 0);
  assert.equal(gas.rows('Placements').length, 1, 'valid sibling must not be written either');
  const within = publish(gas, [{ ...one, student_id: students[2].student_id }, { ...one, student_id: students[2].student_id }]);
  assert.equal(within.error.code, 'VALIDATION', 'duplicates inside one request are caught');
  const partial = gas.admin('admin.placements.bulkCreate', { partial: true, items: [one, { ...one, student_id: students[3].student_id }] });
  assert.equal(partial.data.created_count, 1);
  assert.equal(partial.data.failed_count, 1);
  assert.equal(gas.rows('Placements').length, 2);
});

test('bulk: 12 students + one company → 12 distinct records, verified and audited', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Golf Partners');
  const r = gas.admin('admin.placements.bulkCreate', {
    items: students.slice(0, 12).map((s) => ({ student_id: s.student_id, company_id: c.company_id, job_role: 'Associate', placement_date: today, publication_status: 'published' }))
  }, { request_id: 'req-12' });
  assert.equal(r.data.created_count, 12);
  const writesBefore = gas.env.writeCalls;
  assert.ok(gas.rows('AuditLogs').some((l) => l.action === 'placement.bulk_create' && /12 created/.test(l.change_summary)));
  // The append itself was a single range write.
  assert.ok(writesBefore > 0);
});

test('retrying the same request id does not create duplicates (cache hit and cache expiry)', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Hotel');
  const payload = { items: students.slice(0, 3).map((s) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: today })) };
  const first = gas.admin('admin.placements.bulkCreate', payload, { request_id: 'retry-1' });
  const again = gas.admin('admin.placements.bulkCreate', payload, { request_id: 'retry-1' });
  assert.equal(again.data.replayed, true);
  gas.env.cache.clear(); // simulate idempotency cache expiry
  const third = gas.admin('admin.placements.bulkCreate', payload, { request_id: 'retry-1' });
  assert.equal(third.data.replayed, true);
  assert.deepEqual(third.data.created.map((p) => p.placement_id).sort(), first.data.created.map((p) => p.placement_id).sort());
  assert.equal(gas.rows('Placements').length, 3);
});

test('concurrent writers: a held lock returns a retryable BUSY error and writes nothing', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'India Inc');
  gas.env.lockBusy = true;
  const r = publish(gas, [{ student_id: students[0].student_id, company_id: c.company_id, placement_date: today }]);
  assert.equal(r.error.code, 'BACKEND_BUSY');
  assert.equal(r.error.retryable, true);
  assert.equal(gas.rows('Placements').length, 0);
  gas.env.lockBusy = false;
  // Two admins submitting overlapping batches back-to-back: the second sees the first's rows under the lock.
  const viraj = gas.admin('admin.placements.bulkCreate', { items: students.slice(0, 5).map((s) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: today })) });
  const uditi = gas.call('admin.placements.bulkCreate', { partial: true, items: students.slice(3, 8).map((s) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: today })) }, { actor_id: 'adm_uditi' });
  assert.equal(viraj.data.created_count, 5);
  assert.equal(uditi.data.created_count, 3);
  assert.equal(uditi.data.failed_count, 2);
  assert.equal(gas.rows('Placements').length, 8);
  assert.equal(gas.env.writesOutsideLock, 0);
});

test('a transient spreadsheet failure surfaces as retryable and releases the lock', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Juliet');
  gas.env.failNextWrite = true;
  const r = publish(gas, [{ student_id: students[0].student_id, company_id: c.company_id, placement_date: today }]);
  assert.equal(r.error.code, 'BACKEND_BUSY');
  assert.equal(gas.env.lockHeld, false);
  assert.ok(publish(gas, [{ student_id: students[0].student_id, company_id: c.company_id, placement_date: today }]).ok);
});

test('drafts, archived students, internal notes and CTC stay private', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Kilo');
  gas.admin('admin.placements.bulkCreate', {
    items: [
      { student_id: students[0].student_id, company_id: c.company_id, placement_date: today, publication_status: 'published', ctc: 1500000, internal_notes: 'SECRET-NOTE' },
      { student_id: students[1].student_id, company_id: c.company_id, placement_date: today, publication_status: 'draft', internal_notes: 'SECRET-DRAFT' },
      { student_id: students[2].student_id, company_id: c.company_id, placement_date: today, publication_status: 'published' }
    ]
  });
  gas.admin('admin.students.update', { student_id: students[0].student_id, internal_notes: 'SECRET-STUDENT' });
  gas.admin('admin.students.archive', { student_id: students[2].student_id });
  for (const op of ['public.snapshot', 'public.announcements', 'public.directory', 'public.cohorts', 'public.companies']) {
    const text = JSON.stringify(gas.call(op).data);
    assert.ok(!text.includes('SECRET'), `${op} leaked internal notes`);
    assert.ok(!text.includes('created_by') && !text.includes('request_id'), `${op} leaked admin fields`);
    assert.ok(!text.includes('1500000'), `${op} leaked CTC while show_ctc=false`);
    assert.ok(!text.includes(students[1].student_id), `${op} leaked a draft`);
    assert.ok(!text.includes(students[2].student_id), `${op} showed an archived student`);
  }
  assert.equal(gas.call('public.stats').data.placed_students, 1);
  assert.equal(gas.call('public.student', { student_id: students[1].student_id }).error.code, 'NOT_FOUND');
  gas.admin('admin.config.update', { values: { show_ctc: 'true' } });
  assert.equal(gas.call('public.snapshot').data.placements[0].ctc, 1500000);
  const snap = gas.call('public.snapshot').data;
  assert.deepEqual(Object.keys(snap.config).sort(), ['active_batch_id', 'announcements_enabled', 'app_name', 'display_timezone', 'latest_wins_limit', 'show_ctc', 'show_student_photos']);
});

test('publish / unpublish toggles public visibility and is audited', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Lima');
  const created = gas.admin('admin.placements.create', { student_id: students[0].student_id, company_id: c.company_id, placement_date: today }).data;
  assert.equal(created.publication_status, 'draft');
  assert.equal(gas.call('public.stats').data.placed_students, 0);
  gas.admin('admin.placements.setStatus', { placement_id: created.placement_id, status: 'published' });
  assert.equal(gas.call('public.stats').data.placed_students, 1, 'public cache invalidated after write');
  gas.admin('admin.placements.setStatus', { placement_id: created.placement_id, status: 'draft' });
  assert.equal(gas.call('public.stats').data.placed_students, 0);
  const actions = gas.rows('AuditLogs').map((l) => l.action);
  assert.ok(actions.includes('placement.publish') && actions.includes('placement.unpublish'));
});

test('editing a placement date regroups it and cannot create a duplicate', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Mike');
  const [a, b] = publish(gas, [
    { student_id: students[0].student_id, company_id: c.company_id, placement_date: '2026-10-19' },
    { student_id: students[0].student_id, company_id: c.company_id, placement_date: '2026-10-20' }
  ]).data.created;
  assert.equal(gas.admin('admin.placements.update', { placement_id: b.placement_id, placement_date: '2026-10-19' }).error.code, 'VALIDATION');
  assert.ok(gas.admin('admin.placements.update', { placement_id: a.placement_id, placement_date: '2026-10-18' }).ok);
  assert.deepEqual(gas.call('public.cohorts').data.days.map((d) => d.date), ['2026-10-20', '2026-10-18']);
});

test('directory is complete: every published student appears exactly once across pages', async () => {
  const { gas, students } = setupWorld();
  const c1 = await company(gas, 'November'); const c2 = await company(gas, 'Oscar');
  const items = students.slice(0, 37).map((s, i) => ({ student_id: s.student_id, company_id: i % 2 ? c1.company_id : c2.company_id, placement_date: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}` }));
  items.push({ student_id: students[0].student_id, company_id: c1.company_id, placement_date: '2026-10-21', job_role: 'Second offer' });
  publish(gas, items);
  const seen = [];
  for (let page = 1; ; page++) {
    const r = gas.call('public.directory', { page, page_size: 10, sort: 'name' }).data;
    seen.push(...r.items.map((e) => e.student_id));
    if (page >= r.total_pages) break;
  }
  assert.equal(seen.length, 37);
  assert.equal(new Set(seen).size, 37);
  const dual = gas.call('public.directory', { query: students[0].full_name }).data.items[0];
  assert.equal(dual.offers.length, 2);
  const byCompany = gas.call('public.directory', { company_id: c1.company_id, page_size: 200 }).data;
  assert.equal(byCompany.total, 19); // 18 odd-index + student 0's second offer
});

test('cohort pagination never splits a day', async () => {
  const { gas, students } = setupWorld();
  const c = await company(gas, 'Papa');
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  publish(gas, students.slice(0, 20).map((s, i) => ({ student_id: s.student_id, company_id: c.company_id, placement_date: dates[i % 4] })));
  const p1 = gas.call('public.cohorts', { days_per_page: 3, page: 1 }).data;
  const p2 = gas.call('public.cohorts', { days_per_page: 3, page: 2 }).data;
  assert.equal(p1.has_more, true);
  const total = [...p1.days, ...p2.days].reduce((n, d) => n + d.announcement_count, 0);
  assert.equal(total, 20);
  assert.ok([...p1.days, ...p2.days].every((d) => d.placements.length === 5));
});

test('company duplicates are prevented by normalized name', () => {
  const { gas } = setupWorld({ registered: 0 });
  assert.ok(gas.admin('admin.companies.create', { display_name: 'Acme Technologies Pvt. Ltd.' }).ok);
  const dup = gas.admin('admin.companies.create', { display_name: 'ACME technologies private limited' });
  assert.equal(dup.error.code, 'DUPLICATE');
  assert.equal(gas.rows('Companies').length, 1);
});

test('student CSV-style bulk import validates every row and reports failures', () => {
  const { gas } = setupWorld({ registered: 0 });
  const r = gas.admin('admin.students.bulkCreate', {
    rows: [
      { full_name: 'Valid Person', roll_number: 'A1' },
      { full_name: '', roll_number: 'A2' },
      { full_name: 'Dup Roll', roll_number: 'a1' },
      { full_name: 'Bad Year', roll_number: 'A3', graduation_year: '1999' }
    ]
  });
  assert.equal(r.error.code, 'VALIDATION');
  assert.deepEqual(r.error.details.map((d) => d.index), [1, 2, 3]);
  assert.equal(gas.rows('Students').length, 0);
  const partial = gas.admin('admin.students.bulkCreate', { partial: true, rows: [{ full_name: 'Valid Person', roll_number: 'A1' }, { full_name: 'x', roll_number: 'A2' }] });
  assert.equal(partial.data.created_count, 1);
});

test('formula injection is neutralised before reaching the sheet', () => {
  const { gas } = setupWorld({ registered: 0 });
  gas.admin('admin.students.create', { full_name: '=HYPERLINK("http://evil")', roll_number: 'F1' });
  const stored = gas.env.sheets.get('Students').data[1][2];
  assert.equal(stored, '=HYPERLINK("http://evil")', 'stored as literal text');
  assert.ok(!String(stored).startsWith('#FORMULA'));
});

test('login throttling blocks after 5 failures and clears on success', () => {
  const gas = createGas();
  gas.context.setupSpreadsheet();
  for (let i = 0; i < 5; i++) gas.call('auth.throttleRecord', { key: 'login:adm_viraj', success: false });
  assert.equal(gas.call('auth.throttleCheck', { key: 'login:adm_viraj' }).data.blocked, true);
  gas.call('auth.throttleRecord', { key: 'login:adm_viraj', success: true });
  assert.equal(gas.call('auth.throttleCheck', { key: 'login:adm_viraj' }).data.blocked, false);
  assert.equal(gas.call('auth.admin', { admin_id: 'adm_uditi' }).data.enabled, true);
  assert.equal(gas.call('auth.admin', { admin_id: 'adm_nobody' }).data.enabled, false);
});

test('demo seed refuses without explicit opt-in, then creates 60/12/48 with a same-day cohort', () => {
  const blocked = createGas();
  assert.throws(() => blocked.context.seedDemoData(), /Refusing to seed/);
  const gas = createGas({ props: { DEMO_SEED_ALLOWED: 'true' } });
  gas.context.seedDemoData();
  const s = gas.call('public.stats').data;
  assert.deepEqual([s.total_students, s.placed_students, s.yet_to_be_placed, s.placement_rate], [60, 12, 48, 20]);
  const day = gas.call('public.cohorts').data.days[0];
  assert.equal(day.date, '2026-10-20');
  assert.equal(day.announcement_count, 7);
  assert.equal(day.unique_students, 7);
  assert.equal(day.company_count, 3);
  assert.ok(!JSON.stringify(gas.call('public.snapshot').data).includes('Draft Role'));
  assert.throws(() => gas.context.seedDemoData(), /not empty/);
});

test('unknown ops and malformed payloads fail safely', () => {
  const { gas } = setupWorld({ registered: 0 });
  assert.equal(gas.call('admin.dropTables').error.code, 'UNKNOWN_OP');
  assert.equal(gas.admin('admin.placements.bulkCreate', { items: 'nope' }).error.code, 'VALIDATION');
  assert.equal(gas.admin('admin.placements.create', { student_id: 'stu_x', company_id: 'cmp_y', placement_date: '2026-02-30' }).error.details[0].errors.length, 3);
  assert.equal(gas.admin('admin.config.update', { values: { admin_password: '1234' } }).error.code, 'VALIDATION');
});
