import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  buildCohorts, buildDirectory, computeStats, dailySeries, filterDirectory, formatDate, paginate, paginateCohorts, summarizeCompanies,
} from '../src/lib/core/placements';
import { csvCell, parseCsv, parseCsvObjects, toCsv } from '../src/lib/core/csv';
import { normalizeCsvDate, preparePlacementRows, prepareStudentRows } from '../src/lib/core/csv-import';
import { normalizeCompanyName } from '../src/lib/core/normalize';
import { demoSnapshot } from '../src/lib/demo';
import type { PublicPlacement } from '../src/lib/types';

let n = 0;
function p(student: string, company: string, date: string, extra: Partial<PublicPlacement> = {}): PublicPlacement {
  n++;
  return {
    placement_id: `plc_${String(n).padStart(4, '0')}`, student_id: student, student_name: `Name ${student}`, department: 'MBA',
    company_id: company, company_name: `Co ${company}`, company_logo_url: '', job_role: 'Analyst', placement_date: date,
    published_at: `${date}T10:00:${String(n % 60).padStart(2, '0')}.000Z`, announcement_title: '', announcement_message: '', ...extra,
  };
}

test('stats: unique students, remaining, rate (60/12 → 48, 20%)', () => {
  const list = Array.from({ length: 12 }, (_, i) => p(`s${i}`, 'c1', '2026-10-20'));
  list.push(p('s0', 'c2', '2026-10-21')); // second offer
  assert.deepEqual(computeStats(60, list), { total_students: 60, placed_students: 12, yet_to_be_placed: 48, placement_rate: 20, total_offers: 13 });
});

test('stats: zero batch and over-placement are safe', () => {
  assert.deepEqual(computeStats(0, []), { total_students: 0, placed_students: 0, yet_to_be_placed: 0, placement_rate: 0, total_offers: 0 });
  const s = computeStats(2, [p('a', 'c', '2026-01-01'), p('b', 'c', '2026-01-01'), p('c', 'c', '2026-01-01')]);
  assert.equal(s.placement_rate, 100);
  assert.equal(s.yet_to_be_placed, 0);
  assert.equal(computeStats(Number.NaN, []).total_students, 0);
  assert.equal(computeStats(3, [p('a', 'c', '2026-01-01')]).placement_rate, 33.3);
});

test('cohorts: 15 same-day placements (8 at one company, 7 elsewhere) are all present', () => {
  const list = Array.from({ length: 15 }, (_, i) => p(`s${i}`, i < 8 ? 'big' : `o${i % 3}`, '2026-10-20'));
  list.push(p('x', 'big', '2026-10-19'));
  const cohorts = buildCohorts(list);
  assert.equal(cohorts[0].date, '2026-10-20');
  assert.equal(cohorts[0].announcement_count, 15);
  assert.equal(cohorts[0].unique_students, 15);
  assert.equal(cohorts[0].companies[0].company_id, 'big');
  assert.equal(cohorts[0].companies[0].placements.length, 8);
  assert.equal(cohorts[0].companies.reduce((s, g) => s + g.placements.length, 0), 15);
  assert.equal(cohorts[1].announcement_count, 1);
});

test('cohorts: order is stable regardless of input order', () => {
  const list = [p('a', 'c', '2026-10-20', { published_at: '' }), p('b', 'c', '2026-10-20', { published_at: '' }), p('c', 'c', '2026-10-21')];
  const one = buildCohorts(list).flatMap((d) => d.placements.map((x) => x.placement_id));
  const two = buildCohorts([...list].reverse()).flatMap((d) => d.placements.map((x) => x.placement_id));
  assert.deepEqual(one, two);
});

test('cohort pagination is by whole day and covers every record', () => {
  const list = Array.from({ length: 40 }, (_, i) => p(`s${i}`, 'c', `2026-10-${String(1 + (i % 9)).padStart(2, '0')}`));
  const cohorts = buildCohorts(list);
  let total = 0;
  for (let page = 1; page <= paginateCohorts(cohorts, 1, 4).totalPages; page++) {
    total += paginateCohorts(cohorts, page, 4).days.reduce((s, d) => s + d.announcement_count, 0);
  }
  assert.equal(total, 40);
});

test('directory: one entry per student, all offers kept, filters and sort', () => {
  const list = [p('amy', 'c1', '2026-10-01'), p('zed', 'c2', '2026-10-05'), p('amy', 'c2', '2026-10-09'), p('bob', 'c1', '2026-09-01')];
  const dir = buildDirectory(list);
  assert.equal(dir.length, 3);
  assert.equal(dir.find((e) => e.student_id === 'amy')!.offers.length, 2);
  assert.equal(dir[0].student_id, 'amy', 'newest first by latest offer');
  assert.deepEqual(filterDirectory(dir, { companyId: 'c2' }).map((e) => e.student_id).sort(), ['amy', 'zed']);
  assert.deepEqual(filterDirectory(dir, { from: '2026-10-02', to: '2026-10-06' }).map((e) => e.student_id), ['zed']);
  assert.deepEqual(filterDirectory(dir, { sort: 'name' }).map((e) => e.student_name), ['Name amy', 'Name bob', 'Name zed']);
  assert.deepEqual(filterDirectory(dir, { query: 'BO' }).map((e) => e.student_id), ['bob']);
});

test('directory: supports whole batch roster with search by roll number and status', () => {
  const roster = [
    { student_id: 's1', full_name: 'Aashish Verma', roll_number: 'D001', department: 'MBA' },
    { student_id: 's2', full_name: 'Aastha Narang', roll_number: 'D002', department: 'MBA' },
    { student_id: 's3', full_name: 'Viraj Yevale', roll_number: 'D063', department: 'MBA' },
  ];
  const placements = [p('s3', 'c1', '2026-10-15')];
  const dir = buildDirectory(placements, roster);
  assert.equal(dir.length, 3);
  assert.equal(dir.find((e) => e.roll_number === 'D063')!.status, 'placed');
  assert.equal(dir.find((e) => e.roll_number === 'D001')!.status, 'unplaced');

  // Search by roll number
  const byRoll = filterDirectory(dir, { query: 'd001' });
  assert.equal(byRoll.length, 1);
  assert.equal(byRoll[0].student_name, 'Aashish Verma');

  // Search by name
  const byName = filterDirectory(dir, { query: 'viraj' });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].roll_number, 'D063');

  // Filter by status
  assert.equal(filterDirectory(dir, { status: 'unplaced' }).length, 2);
  assert.equal(filterDirectory(dir, { status: 'placed' }).length, 1);
});

test('pagination never drops items and clamps out-of-range pages', () => {
  const items = Array.from({ length: 53 }, (_, i) => i);
  const seen: number[] = [];
  for (let pg = 1; pg <= 3; pg++) seen.push(...paginate(items, pg, 24).items);
  assert.deepEqual(seen, items);
  assert.equal(paginate(items, 99, 24).page, 3);
  assert.equal(paginate([], 1, 24).totalPages, 1);
});

test('company summaries count unique students and collect roles', () => {
  const list = [p('a', 'c1', '2026-10-01', { job_role: 'PM' }), p('a', 'c1', '2026-10-02', { job_role: 'Analyst' }), p('b', 'c1', '2026-10-03')];
  const [c] = summarizeCompanies(list);
  assert.equal(c.placed_students, 2);
  assert.equal(c.offers, 3);
  assert.deepEqual(c.roles, ['Analyst', 'PM']);
  assert.equal(c.latest_placement_date, '2026-10-03');
});

test('cumulative series counts unique students only', () => {
  const s = dailySeries([p('a', 'c', '2026-10-01'), p('b', 'c', '2026-10-01'), p('a', 'd', '2026-10-03'), p('c', 'c', '2026-10-04')]);
  assert.deepEqual(s.map((d) => [d.date, d.offers, d.cumulativeStudents]), [['2026-10-01', 2, 2], ['2026-10-03', 1, 2], ['2026-10-04', 1, 3]]);
});

test('calendar dates never shift by timezone when formatted', () => {
  assert.match(formatDate('2026-10-20'), /20 Oct 2026/);
});

test('demo snapshot matches Division D batch with zero initial placements', () => {
  const d = demoSnapshot();
  assert.deepEqual([d.stats.total_students, d.stats.placed_students, d.stats.yet_to_be_placed, d.stats.placement_rate], [59, 0, 59, 0]);
  assert.equal(d.batch?.total_students, 59);
  assert.equal(d.batch?.batch_name, 'MBA Batch 17 (2026-27) - Division D');
  assert.equal(d.placements.length, 0);
  assert.equal(d.companies.length, 0);
});

test('CSV: quotes, commas, newlines, BOM and formula injection', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', 'z']]);
  assert.throws(() => parseCsv('a,"b'));
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+91 98'), "'+91 98");
  const round = parseCsvObjects(toCsv([{ 'Full Name': 'A, B', roll: '1' }]));
  assert.deepEqual(round.header, ['full_name', 'roll']);
  assert.equal(round.rows[0].full_name, 'A, B');
});

test('student CSV import reports bad rows with spreadsheet row numbers', () => {
  const { valid, issues } = prepareStudentRows(
    [{ full_name: 'Asha Rao', roll_number: 'R1' }, { full_name: 'B', roll_number: 'R2' }, { full_name: 'Dup', roll_number: 'r1' }, { full_name: 'Old', roll_number: 'X9' }],
    new Set(['x9']), 'MBA',
  );
  assert.equal(valid.length, 1);
  assert.equal(valid[0].department, 'MBA');
  assert.deepEqual(issues.map((i) => i.row), [3, 4, 5]);
});

test('placement CSV import resolves roll numbers and company names, flags the rest', () => {
  const students = [{ student_id: 'stu_a', roll_number: 'R1', archived_at: '' }, { student_id: 'stu_b', roll_number: 'R2', archived_at: '2026-01-01' }];
  const companies = [{ company_id: 'cmp_x', display_name: 'Acme Technologies Pvt. Ltd.' }];
  const existing = new Set(['stu_a|cmp_x||2026-10-01']);
  const res = preparePlacementRows([
    { roll_number: 'r1', company: 'ACME technologies', placement_date: '20/10/2026', ctc: '18,00,000', status: 'Published' },
    { roll_number: 'R2', company: 'Acme Technologies', placement_date: '2026-10-20' },
    { roll_number: 'R1', company: 'Nope Inc', placement_date: '2026-13-01' },
    { roll_number: 'R1', company: 'Acme Technologies', placement_date: '2026-10-01' },
  ], students, companies, existing);
  assert.equal(res.valid.length, 1);
  assert.deepEqual(res.valid[0], {
    student_id: 'stu_a', company_id: 'cmp_x', job_role: '', placement_date: '2026-10-20', ctc: '1800000', currency: 'INR',
    publication_status: 'published', announcement_title: '', announcement_message: '', internal_notes: '',
  });
  assert.deepEqual(res.issues.map((i) => i.row), [3, 4, 5]);
  assert.deepEqual(res.unknownCompanies, ['Nope Inc']);
  assert.equal(normalizeCsvDate('31/02/2026'), null);
});

test('company-name normalisation is identical in the browser and in Code.gs', () => {
  const ctx: Record<string, unknown> = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const gs = ctx.normalizeCompanyName_ as (s: string) => string;
  for (const name of ['Acme Technologies Pvt. Ltd.', 'Tata Consultancy Services Limited', 'Ernst & Young LLP', '  Deloitte  ', 'Co-op Bank', 'GOOGLE INC', 'Big Co.']) {
    assert.equal(normalizeCompanyName(name), gs(name), name);
  }
});
