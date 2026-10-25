import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_RPC, MUTATING_OPS, batchUpdate, bulkPlacements, configUpdate, placementInput, studentInput, zodDetails } from '../src/lib/validation/schemas';

test('placement input: valid, defaults, and rejects bad ids/dates/ctc', () => {
  const ok = placementInput.parse({ student_id: 'stu_abc123', company_id: 'cmp_xyz', placement_date: '2026-10-20', ctc: '18,00,000' });
  assert.equal(ok.publication_status, 'draft');
  assert.equal(ok.currency, 'INR');
  assert.equal(ok.ctc, '1800000');
  const bad = placementInput.safeParse({ student_id: 'stu_x; DROP', company_id: 'cmp_1', placement_date: '2026-02-30', ctc: '-5' });
  assert.equal(bad.success, false);
  if (!bad.success) assert.deepEqual(bad.error.issues.map((i) => i.path[0]).sort(), ['ctc', 'placement_date', 'student_id']);
});

test('bulk placements: limits and per-row error indices', () => {
  assert.equal(bulkPlacements.safeParse({ items: [] }).success, false);
  const r = bulkPlacements.safeParse({ items: [{ student_id: 'stu_a', company_id: 'cmp_a', placement_date: '2026-10-20' }, { student_id: 'stu_b', company_id: 'nope', placement_date: '2026-10-20' }] });
  assert.equal(r.success, false);
  if (!r.success) assert.deepEqual(zodDetails(r.error), [{ field: 'company_id', message: 'Invalid id', index: 1 }]);
  const many = Array.from({ length: 501 }, () => ({ student_id: 'stu_a', company_id: 'cmp_a', placement_date: '2026-10-20' }));
  assert.equal(bulkPlacements.safeParse({ items: many }).success, false);
});

test('student input requires a name and a safe roll number; URLs must be https', () => {
  assert.equal(studentInput.safeParse({ full_name: 'Asha Rao', roll_number: 'MBA/24/001' }).success, true);
  assert.equal(studentInput.safeParse({ full_name: 'A', roll_number: '1' }).success, false);
  assert.equal(studentInput.safeParse({ full_name: 'Asha', roll_number: '=cmd' }).success, false);
  assert.equal(studentInput.safeParse({ full_name: 'Asha', roll_number: 'R1', photo_url: 'javascript:alert(1)' }).success, false);
});

test('batch update: timezone must be real, total must be a whole number', () => {
  assert.equal(batchUpdate.safeParse({ batch_id: 'bat_1', timezone: 'Asia/Kolkata', total_students: '60' }).success, true);
  assert.equal(batchUpdate.safeParse({ batch_id: 'bat_1', timezone: 'Mars/Olympus' }).success, false);
  assert.equal(batchUpdate.safeParse({ batch_id: 'bat_1', total_students: 2.5 }).success, false);
});

test('settings cannot carry secrets or unknown keys', () => {
  assert.equal(configUpdate.safeParse({ values: { show_ctc: 'true' } }).success, true);
  assert.equal(configUpdate.safeParse({ values: { admin_password: '1234' } }).success, false);
  assert.equal(configUpdate.safeParse({ values: { show_ctc: 'yes' } }).success, false);
});

test('admin RPC allowlist covers every mutation and nothing destructive', () => {
  const ops = Object.keys(ADMIN_RPC);
  for (const op of MUTATING_OPS) assert.ok(ops.includes(op), op);
  assert.ok(ops.every((op) => op.startsWith('admin.')));
  assert.ok(!ops.some((op) => /delete|drop|raw|sql/i.test(op)));
});
