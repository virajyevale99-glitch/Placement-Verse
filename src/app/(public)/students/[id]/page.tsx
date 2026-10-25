import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Sparkles } from 'lucide-react';
import { getPublicSnapshot } from '@/lib/backend/public';
import { DIVISION_D_STUDENTS } from '@/data/students-division-d';
import { Container } from '@/components/site/section';
import { PlacementTicket } from '@/components/site/placement-ticket';
import { hueFor, initials } from '@/lib/core/placements';

import type { PublicPlacement } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface LoadedStudent {
  id: string;
  name: string;
  rollNumber: string;
  department: string;
  photoUrl?: string;
  sapNo?: string;
  group?: string;
  offers: PublicPlacement[];
  isPlaced: boolean;
}

async function load(rawParam: string): Promise<LoadedStudent | null> {
  const id = decodeURIComponent(rawParam).trim().toLowerCase();
  const snap = await getPublicSnapshot();

  // Match in Division D roster
  const divD = DIVISION_D_STUDENTS.find(
    (s) =>
      s.rollNumber.toLowerCase() === id ||
      s.fullName.toLowerCase() === id ||
      s.sapNo === id
  );

  // Match in snap registered students (if any)
  const snapStudent = (snap.students || []).find(
    (s) =>
      s.student_id.toLowerCase() === id ||
      s.roll_number.toLowerCase() === id ||
      s.full_name.toLowerCase() === id
  );

  // Match in placements
  const offers = snap.placements.filter(
    (p) =>
      p.student_id.toLowerCase() === id ||
      (divD && p.student_name.toLowerCase() === divD.fullName.toLowerCase()) ||
      (snapStudent && p.student_id.toLowerCase() === snapStudent.student_id.toLowerCase())
  );

  if (!divD && !snapStudent && !offers.length) return null;

  const name =
    offers[0]?.student_name ||
    divD?.fullName ||
    snapStudent?.full_name ||
    'Student';

  const rollNumber =
    divD?.rollNumber ||
    snapStudent?.roll_number ||
    '';

  const department =
    offers[0]?.department ||
    divD?.department ||
    snapStudent?.department ||
    'MBA';

  const photoUrl =
    offers[0]?.student_photo_url ||
    snapStudent?.photo_url ||
    undefined;

  return {
    id: rawParam,
    name,
    rollNumber,
    department,
    photoUrl,
    sapNo: divD?.sapNo,
    group: divD?.group,
    offers,
    isPlaced: offers.length > 0,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const student = await load((await params).id);
  if (!student) return { title: 'Student not found' };
  if (student.isPlaced) {
    return {
      title: `${student.name} (${student.rollNumber}) — Placed`,
      description: `${student.name} was placed at ${student.offers.map((o) => o.company_name).join(', ')}.`,
    };
  }
  return {
    title: `${student.name} (${student.rollNumber}) — Division D`,
    description: `Candidate profile for ${student.name} (Roll: ${student.rollNumber}), NMIMS MBA Batch 17 (2026-27) Division D.`,
  };
}

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await load((await params).id);
  if (!student) notFound();

  const h = hueFor(student.id || student.name);

  return (
    <Container className="max-w-4xl pb-16 pt-12 sm:pt-16">
      <Link
        href="/students"
        className="inline-flex items-center gap-2 text-sm text-mist hover:text-ink transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to all students
      </Link>

      <div className="mt-8 rounded-2xl border border-line bg-indigo-deep p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {student.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photoUrl}
                alt={student.name}
                className="size-20 rounded-full object-cover ring-2 ring-champagne/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex size-20 shrink-0 items-center justify-center rounded-full font-display text-2xl font-bold shadow-inner"
                style={{
                  background: `hsl(${h} 45% 20%)`,
                  color: `hsl(${h} 85% 85%)`,
                }}
              >
                {initials(student.name)}
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
                  {student.name}
                </h1>
                {student.rollNumber ? (
                  <span className="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-xs font-semibold text-champagne">
                    {student.rollNumber}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-mist">
                {[
                  student.department,
                  'Division D',
                  student.group ? `Group ${student.group}` : null,
                  'NMIMS MBA Batch 17 (2026-27)',
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
            </div>
          </div>

          <div>
            {student.isPlaced ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-sm font-semibold text-emerald-300 border border-emerald-500/30">
                <Sparkles className="size-4" /> Placed ({student.offers.length}{' '}
                {student.offers.length === 1 ? 'offer' : 'offers'})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3.5 py-1.5 text-sm font-medium text-amber-300 border border-amber-400/20">
                <Clock className="size-4" /> Yet to be placed
              </span>
            )}
          </div>
        </div>

        {student.isPlaced ? (
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-mist">
              Placement Offers & Announcements
            </h2>
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
              {student.offers.map((p) => (
                <li key={p.placement_id}>
                  <PlacementTicket p={p} className="h-full" />
                  {p.announcement_message ? (
                    <p className="mt-3 whitespace-pre-line px-1 text-sm leading-relaxed text-mist">
                      {p.announcement_message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-line/60 bg-white/[0.02] p-6 text-center">
            <Clock className="mx-auto size-8 text-dim" />
            <h3 className="mt-3 font-display text-base font-semibold text-ink">
              Placement in progress
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-mist">
              No placement offers have been officially published yet for this
              candidate. Offer announcements and celebration tickets will be
              featured here as soon as they go live.
            </p>
          </div>
        )}
      </div>
    </Container>
  );
}
