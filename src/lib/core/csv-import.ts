// Turns parsed CSV rows into validated API payloads, with a per-row error report.
import { normalizeCompanyName } from './normalize';

export interface RowIssue {
  row: number; // 1-based data row number as shown in a spreadsheet (header = row 1, so first data row = 2)
  messages: string[];
}

export interface StudentRow {
  full_name: string;
  roll_number: string;
  department: string;
  graduation_year: string;
}

const STUDENT_REQUIRED = ['full_name', 'roll_number'];
const PLACEMENT_REQUIRED = ['roll_number', 'company', 'placement_date'];

export function missingColumns(header: string[], required: string[]): string[] {
  return required.filter((c) => !header.includes(c));
}

export function prepareStudentRows(rows: Record<string, string>[], existingRolls: Set<string>, defaultDepartment = '') {
  const issues: RowIssue[] = [];
  const valid: StudentRow[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const messages: string[] = [];
    const s: StudentRow = {
      full_name: (r.full_name ?? r.name ?? '').trim(),
      roll_number: (r.roll_number ?? r.roll ?? '').trim(),
      department: (r.department ?? '').trim() || defaultDepartment,
      graduation_year: (r.graduation_year ?? '').trim(),
    };
    if (s.full_name.length < 2) messages.push('full_name is missing or too short');
    if (s.full_name.length > 100) messages.push('full_name is longer than 100 characters');
    if (!s.roll_number) messages.push('roll_number is missing');
    else if (!/^[A-Za-z0-9][A-Za-z0-9_\-/.]*$/.test(s.roll_number)) messages.push('roll_number has invalid characters');
    const key = s.roll_number.toLowerCase();
    if (key && existingRolls.has(key)) messages.push(`roll_number ${s.roll_number} already exists`);
    if (key && seen.has(key)) messages.push(`roll_number ${s.roll_number} appears twice in this file`);
    if (s.graduation_year && !/^(20\d\d|2100)$/.test(s.graduation_year)) messages.push('graduation_year must be a year like 2027');
    seen.add(key);
    if (messages.length) issues.push({ row: i + 2, messages });
    else valid.push(s);
  });
  return { valid, issues };
}

export interface PlacementRowInput {
  student_id: string;
  company_id: string;
  job_role: string;
  placement_date: string;
  ctc: string;
  currency: string;
  publication_status: 'draft' | 'published';
  announcement_title: string;
  announcement_message: string;
  internal_notes: string;
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY (Indian convention). */
export function normalizeCsvDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) [y, m, d] = s.split('-').map(Number);
  else if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(s)) [d, m, y] = s.split(/[/.-]/).map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function preparePlacementRows(
  rows: Record<string, string>[],
  students: { student_id: string; roll_number: string; archived_at: string }[],
  companies: { company_id: string; display_name: string; normalized_name?: string }[],
  existingKeys: Set<string>,
) {
  const byRoll = new Map(students.filter((s) => !s.archived_at).map((s) => [s.roll_number.toLowerCase(), s.student_id]));
  const byCompany = new Map(companies.map((c) => [c.normalized_name || normalizeCompanyName(c.display_name), c.company_id]));
  const issues: RowIssue[] = [];
  const valid: PlacementRowInput[] = [];
  const unknownCompanies = new Set<string>();
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const messages: string[] = [];
    const roll = (r.roll_number ?? '').trim();
    const companyName = (r.company ?? r.company_name ?? '').trim();
    const studentId = byRoll.get(roll.toLowerCase());
    const companyId = byCompany.get(normalizeCompanyName(companyName));
    const date = normalizeCsvDate(r.placement_date ?? r.date ?? '');
    const status = (r.status ?? r.publication_status ?? 'draft').trim().toLowerCase();
    const ctc = (r.ctc ?? '').replace(/[,\s]/g, '');
    if (!roll) messages.push('roll_number is missing');
    else if (!studentId) messages.push(`no active student with roll number ${roll}`);
    if (!companyName) messages.push('company is missing');
    else if (!companyId) {
      messages.push(`company "${companyName}" doesn't exist yet`);
      unknownCompanies.add(companyName);
    }
    if (!date) messages.push('placement_date must be YYYY-MM-DD or DD/MM/YYYY');
    if (status !== 'draft' && status !== 'published') messages.push('status must be draft or published');
    if (ctc && !(Number.isFinite(Number(ctc)) && Number(ctc) >= 0)) messages.push('ctc must be a number');
    const role = ''; // job roles are not tracked
    if (studentId && companyId && date) {
      const key = [studentId, companyId, role.toLowerCase(), date].join('|');
      if (existingKeys.has(key)) messages.push('this placement is already recorded');
      if (seen.has(key)) messages.push('appears twice in this file');
      seen.add(key);
    }
    if (messages.length) issues.push({ row: i + 2, messages });
    else
      valid.push({
        student_id: studentId!, company_id: companyId!, job_role: role, placement_date: date!, ctc,
        currency: ((r.currency ?? '').trim() || 'INR').toUpperCase(), publication_status: status as 'draft' | 'published',
        announcement_title: '', announcement_message: (r.message ?? '').trim(), internal_notes: '',
      });
  });
  return { valid, issues, unknownCompanies: [...unknownCompanies] };
}

export const STUDENT_TEMPLATE = 'full_name,roll_number,department,graduation_year\r\nAsha Rao,D001,MBA,2027\r\n';
export const PLACEMENT_TEMPLATE = 'roll_number,company,placement_date,ctc,status\r\nD001,Example Company,2026-10-20,1800000,draft\r\n';
export { STUDENT_REQUIRED, PLACEMENT_REQUIRED };
