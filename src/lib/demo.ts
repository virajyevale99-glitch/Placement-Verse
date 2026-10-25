// Local snapshot used when GOOGLE_APPS_SCRIPT_URL is not set and NODE_ENV !== 'production'.
// Configured for MBA Batch 17 (2026-27) Division D (59 students).
// All demo placement roles have been removed so the batch starts fresh (0 placed of 59).
import { DIVISION_D_STUDENTS } from '@/data/students-division-d';
import { computeStats, summarizeCompanies } from './core/placements';
import type { PublicPlacement, PublicSnapshot } from './types';

export { DIVISION_D_STUDENTS };

export function demoSnapshot(): PublicSnapshot {
  // Demo placement roles removed; new placements can be added via the admin panel.
  const placements: PublicPlacement[] = [];
  const totalStudents = DIVISION_D_STUDENTS.length; // 59 students in Division D

  return {
    config: {
      app_name: 'PlacementVerse',
      active_batch_id: 'bat_div_d',
      display_timezone: 'Asia/Kolkata',
      announcements_enabled: 'true',
      latest_wins_limit: '9',
      show_ctc: 'false',
      show_student_photos: 'false',
    },
    batch: {
      batch_id: 'bat_div_d',
      batch_name: 'MBA Batch 17 (2026-27) - Division D',
      academic_year: '2026-27',
      department: 'MBA',
      total_students: totalStudents,
      timezone: 'Asia/Kolkata',
    },
    stats: computeStats(totalStudents, placements),
    placements,
    companies: summarizeCompanies(placements),
    generated_at: new Date().toISOString(),
    demo: true,
  };
}
