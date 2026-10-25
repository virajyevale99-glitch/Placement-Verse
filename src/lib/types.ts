// Shapes returned by the Apps Script backend. Public types contain ONLY allowlisted fields.

export type PublicationStatus = 'draft' | 'published';

export interface PublicPlacement {
  placement_id: string;
  student_id: string;
  student_name: string;
  department: string;
  company_id: string;
  company_name: string;
  company_logo_url: string;
  job_role: string;
  placement_date: string; // YYYY-MM-DD calendar date
  published_at: string; // ISO timestamp
  announcement_title: string;
  announcement_message: string;
  ctc?: number; // present only when show_ctc = true
  currency?: string;
  student_photo_url?: string; // present only when show_student_photos = true
}

export interface PlacementStats {
  total_students: number;
  placed_students: number;
  yet_to_be_placed: number;
  placement_rate: number;
  total_offers: number;
}

export interface CompanySummary {
  company_id: string;
  display_name: string;
  logo_url: string;
  website_url: string;
  placed_students: number;
  offers: number;
  roles: string[];
  latest_placement_date: string;
}

export interface PublicBatch {
  batch_id: string;
  batch_name: string;
  academic_year: string;
  department: string;
  total_students: number;
  timezone: string;
}

export interface PublicConfig {
  app_name: string;
  active_batch_id: string;
  display_timezone: string;
  announcements_enabled: string;
  latest_wins_limit: string;
  show_ctc: string;
  show_student_photos: string;
}

export interface PublicSnapshot {
  config: PublicConfig;
  batch: PublicBatch | null;
  stats: PlacementStats;
  placements: PublicPlacement[]; // newest first, stable order
  companies: CompanySummary[];
  students?: PublicStudent[];
  generated_at: string;
  demo?: boolean;
}

export interface CompanyGroup {
  company_id: string;
  company_name: string;
  company_logo_url: string;
  placements: PublicPlacement[];
}

export interface Cohort {
  date: string;
  announcement_count: number;
  unique_students: number;
  company_count: number;
  companies: CompanyGroup[];
  placements: PublicPlacement[];
}

export interface PublicStudent {
  student_id: string;
  full_name: string;
  roll_number: string;
  department: string;
  photo_url?: string;
}

export interface DirectoryEntry {
  student_id: string;
  student_name: string;
  roll_number?: string;
  department: string;
  latest_placement_date: string;
  offers: PublicPlacement[];
  status: 'placed' | 'unplaced';
}

// ---------- Admin ----------

export interface AdminStudent {
  student_id: string;
  batch_id: string;
  full_name: string;
  roll_number: string;
  department: string;
  graduation_year: string;
  photo_url: string;
  internal_notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string;
  placement_count: number;
  published_count: number;
}

export interface AdminCompany {
  company_id: string;
  display_name: string;
  normalized_name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
  updated_at: string;
  placement_count: number;
  published_count: number;
}

export interface AdminPlacement {
  placement_id: string;
  student_id: string;
  company_id: string;
  job_role: string;
  placement_date: string;
  ctc: string;
  currency: string;
  announcement_title: string;
  announcement_message: string;
  publication_status: PublicationStatus;
  published_at: string;
  internal_notes: string;
  request_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  student_name: string;
  roll_number: string;
  student_archived: boolean;
  company_name: string;
}

export interface Batch {
  batch_id: string;
  batch_name: string;
  academic_year: string;
  department: string;
  total_students: string;
  timezone: string;
  description: string;
  updated_at: string;
}

export interface AuditLog {
  log_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  change_summary: string;
  created_at: string;
}

export interface AdminOverview {
  batch: PublicBatch | null;
  stats: PlacementStats;
  total_companies: number;
  published_announcements: number;
  draft_announcements: number;
  registered_students: number;
  archived_students: number;
  recent_activity: AuditLog[];
}

export interface BulkResult<T> {
  created: T[];
  failed: { index: number; errors: { field: string; message: string }[] }[];
  created_count: number;
  failed_count: number;
  replayed?: boolean;
}

export interface BackendError {
  code: string;
  message: string;
  details: Array<{ field?: string; message?: string; index?: number; errors?: { field: string; message: string }[] }>;
  retryable: boolean;
}

export type BackendResponse<T> = { ok: true; data: T } | { ok: false; error: BackendError };
