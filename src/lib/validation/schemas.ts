// Zod schemas used by the admin API (server) and forms (client).
// The Apps Script backend re-validates everything; these give fast, friendly errors first.
import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().or(z.literal('')).transform((v) => v ?? '');
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/[^\s<>"']+$/i.test(v), 'Must be an https:// URL')
  .optional()
  .transform((v) => v ?? '');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Not a real date');

export const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9]{1,40}$`), 'Invalid id');

export const timezone = z
  .string()
  .trim()
  .max(60)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone (e.g. Asia/Kolkata)');

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Required').max(40),
  password: z.string().min(1, 'Required').max(200),
});

export const studentInput = z.object({
  full_name: trimmed(100).min(2, 'At least 2 characters'),
  roll_number: trimmed(40).min(1, 'Required').regex(/^[A-Za-z0-9][A-Za-z0-9_\-/.]*$/, 'Letters, numbers, - _ / . only'),
  department: optionalText(80),
  graduation_year: z
    .string()
    .trim()
    .refine((v) => v === '' || /^(20\d\d|2100)$/.test(v), 'Year between 2000 and 2100')
    .optional()
    .transform((v) => v ?? ''),
  photo_url: httpsUrl,
  internal_notes: optionalText(1000),
});

export const studentUpdate = studentInput.partial().extend({ student_id: id('stu') });

export const companyInput = z.object({
  display_name: trimmed(100).min(1, 'Required'),
  logo_url: httpsUrl,
  website_url: httpsUrl,
});
export const companyUpdate = companyInput.partial().extend({ company_id: id('cmp') });

const ctc = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === '' ? '' : String(v).replace(/,/g, '')))
  .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Must be a non-negative number');

export const placementInput = z.object({
  student_id: id('stu'),
  company_id: id('cmp'),
  job_role: optionalText(120),
  placement_date: isoDate,
  ctc,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, '3-letter code')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v.toUpperCase() : 'INR')),
  announcement_title: optionalText(140),
  announcement_message: optionalText(1000),
  publication_status: z.enum(['draft', 'published']).default('draft'),
  internal_notes: optionalText(1000),
});

export const placementUpdate = placementInput.partial().extend({ placement_id: id('plc') });

export const bulkPlacements = z.object({
  items: z.array(placementInput).min(1, 'Select at least one student').max(500),
  partial: z.boolean().optional().default(false),
});

export const setStatus = z.object({
  placement_ids: z.array(id('plc')).min(1).max(500),
  status: z.enum(['draft', 'published']),
});

export const batchInput = z.object({
  batch_name: trimmed(100).min(1, 'Required'),
  academic_year: optionalText(20),
  department: optionalText(80),
  total_students: z.coerce.number().int('Whole number').min(0).max(100000),
  timezone,
  description: optionalText(500),
});
export const batchUpdate = batchInput.partial().extend({
  batch_id: id('bat'),
  force_correction: z.boolean().optional(),
  correction_reason: optionalText(500),
});
export const batchCreate = batchInput.extend({ make_active: z.boolean().optional() });

export const configUpdate = z.object({
  values: z
    .object({
      app_name: trimmed(60).min(1),
      active_batch_id: id('bat'),
      display_timezone: timezone,
      announcements_enabled: z.enum(['true', 'false']),
      latest_wins_limit: z.string().regex(/^\d+$/).refine((v) => Number(v) >= 3 && Number(v) <= 48, '3 to 48'),
      show_ctc: z.enum(['true', 'false']),
      show_student_photos: z.enum(['true', 'false']),
    })
    .partial()
    .strict(),
});

export const bulkStudents = z.object({
  rows: z.array(studentInput).min(1).max(500),
  partial: z.boolean().optional().default(false),
});

export const empty = z.object({}).passthrough().transform(() => ({}));
export const byStudentId = z.object({ student_id: id('stu') });
export const auditList = z.object({ limit: z.coerce.number().int().min(1).max(1000).optional() });
export const exportInput = z.object({ entity: z.enum(['students', 'placements', 'companies']) });

/** Allowlist of admin operations the browser may request, each with its schema. */
export const ADMIN_RPC = {
  'admin.overview': empty,
  'admin.students.list': empty,
  'admin.students.create': studentInput,
  'admin.students.bulkCreate': bulkStudents,
  'admin.students.update': studentUpdate,
  'admin.students.archive': byStudentId,
  'admin.students.unarchive': byStudentId,
  'admin.companies.list': empty,
  'admin.companies.create': companyInput,
  'admin.companies.update': companyUpdate,
  'admin.placements.list': empty,
  'admin.placements.create': placementInput,
  'admin.placements.bulkCreate': bulkPlacements,
  'admin.placements.update': placementUpdate,
  'admin.placements.setStatus': setStatus,
  'admin.batches.list': empty,
  'admin.batches.create': batchCreate,
  'admin.batches.update': batchUpdate,
  'admin.config.get': empty,
  'admin.config.update': configUpdate,
  'admin.audit.list': auditList,
  'admin.export': exportInput,
} as const;

export type AdminOp = keyof typeof ADMIN_RPC;

/** Ops that change data: these invalidate the public cache on success and need a request id. */
export const MUTATING_OPS = new Set<AdminOp>([
  'admin.students.create', 'admin.students.bulkCreate', 'admin.students.update', 'admin.students.archive',
  'admin.students.unarchive', 'admin.companies.create', 'admin.companies.update', 'admin.placements.create',
  'admin.placements.bulkCreate', 'admin.placements.update', 'admin.placements.setStatus', 'admin.batches.create',
  'admin.batches.update', 'admin.config.update',
]);

/** Converts a zod error into the same detail shape the backend uses. */
export function zodDetails(error: z.ZodError) {
  return error.issues.map((i) => {
    const path = i.path.map(String);
    const idx = path[0] === 'items' || path[0] === 'rows' ? Number(path[1]) : undefined;
    return { field: path.slice(idx === undefined ? 0 : 2).join('.') || 'input', message: i.message, ...(idx !== undefined ? { index: idx } : {}) };
  });
}
