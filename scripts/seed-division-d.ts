import { createHmac, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DIVISION_D_STUDENTS } from '../src/data/students-division-d';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
}

const appsScriptUrl = env.GOOGLE_APPS_SCRIPT_URL;
const appsScriptSecret = env.APPS_SCRIPT_SHARED_SECRET;

if (!appsScriptUrl || !appsScriptSecret) {
  console.error('Missing GOOGLE_APPS_SCRIPT_URL or APPS_SCRIPT_SHARED_SECRET in .env.local');
  process.exit(1);
}

function sign(body: string, ts: number): string {
  return createHmac('sha256', appsScriptSecret).update(`${ts}.${body}`).digest('hex');
}

async function gasCall(op: string, payload: any = {}, actorId?: string) {
  const body = JSON.stringify({
    op,
    payload,
    actor_id: actorId,
    request_id: 'req_' + randomUUID().replace(/-/g, '').slice(0, 20),
    nonce: randomUUID(),
  });
  const ts = Date.now();
  const res = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ body, ts, sig: sign(body, ts) }),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text}`);
  }
}

async function run() {
  console.log('1. Checking public snapshot...');
  const snapRes = await gasCall('public.snapshot');
  console.log('Snapshot ok:', snapRes.ok);
  if (!snapRes.ok) {
    console.error('Failed to get snapshot:', snapRes.error);
    return;
  }
  console.log('Batch:', snapRes.data.batch);
  console.log('Stats:', snapRes.data.stats);

  const batchId = snapRes.data.batch?.batch_id;
  if (!batchId) {
    console.error('No active batch found!');
    return;
  }

  console.log('2. Listing existing students in Google Sheet...');
  const studentsRes = await gasCall('admin.students.list', {}, 'adm_viraj');
  console.log('Existing students count:', studentsRes.data?.length);

  const existingRolls = new Set(
    (studentsRes.data || []).map((s: any) => String(s.roll_number).toLowerCase())
  );

  const studentsToInsert = DIVISION_D_STUDENTS.filter(
    (s) => !existingRolls.has(s.rollNumber.toLowerCase())
  ).map((s) => ({
    full_name: s.fullName,
    roll_number: s.rollNumber,
    department: 'MBA',
    graduation_year: '2027',
    photo_url: '',
    internal_notes: `SAP: ${s.sapNo} | Group: ${s.group} | Phone: ${s.phone} | Email: ${s.email}`,
  }));

  console.log(`3. Students to insert: ${studentsToInsert.length} of ${DIVISION_D_STUDENTS.length}`);

  if (studentsToInsert.length > 0) {
    console.log('Inserting Division D students via admin.students.bulkCreate...');
    const bulkRes = await gasCall(
      'admin.students.bulkCreate',
      { rows: studentsToInsert, partial: true },
      'adm_viraj'
    );
    console.log('Bulk create result:', bulkRes);
  } else {
    console.log('All Division D students are already registered in the sheet!');
  }

  console.log('4. Verifying final student list...');
  const finalStudentsRes = await gasCall('admin.students.list', {}, 'adm_viraj');
  console.log('Total students in Google Sheet now:', finalStudentsRes.data?.length);
  const sample = (finalStudentsRes.data || []).slice(0, 3);
  console.log('Sample students:', sample);
}

run().catch(console.error);
