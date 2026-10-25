import type { Metadata } from 'next';
import { getPublicSnapshot } from '@/lib/backend/public';
import { DIVISION_D_STUDENTS } from '@/data/students-division-d';
import { PageHeader, Container } from '@/components/site/section';
import { DirectoryBrowser } from '@/components/site/directory-browser';
import type { PublicStudent } from '@/lib/types';

// Rendered per request so builds never depend on Google; data itself is cached for 60 s (see lib/backend/public.ts).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Students — MBA Division D',
  description: 'Search all 59 MBA Batch 17 (2026-27) Division D candidates by name, roll number, and placement status.',
};

export default async function StudentsPage() {
  const snap = await getPublicSnapshot();

  const divisionDStudents: PublicStudent[] = DIVISION_D_STUDENTS.map((s) => ({
    student_id: s.rollNumber,
    full_name: s.fullName,
    roll_number: s.rollNumber,
    department: 'MBA',
  }));

  const allStudents: PublicStudent[] =
    snap.students && snap.students.length > 0 ? snap.students : divisionDStudents;

  return (
    <>
      <PageHeader
        title="Students — Division D"
        lead={`NMIMS MBA Batch 17 (2026-27) • ${snap.stats.total_students} candidates • ${snap.stats.placed_students} placed • ${snap.stats.yet_to_be_placed} yet to be placed`}
      />
      <Container>
        <DirectoryBrowser
          placements={snap.placements}
          students={allStudents}
          companies={snap.companies.map((c) => ({ id: c.company_id, name: c.display_name }))}
        />
      </Container>
    </>
  );
}
