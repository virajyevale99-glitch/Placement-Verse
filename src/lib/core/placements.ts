// Pure, dependency-free placement logic shared by pages and tests.
// It mirrors the Apps Script read model so client-side filtering never drops records.
import type {
  Cohort,
  CompanyGroup,
  CompanySummary,
  DirectoryEntry,
  PlacementStats,
  PublicPlacement,
  PublicStudent,
} from '../types';

/** Newest first: placement_date desc, published_at desc, placement_id asc. A total, stable order. */
export function comparePlacementsDesc(a: PublicPlacement, b: PublicPlacement): number {
  if (a.placement_date !== b.placement_date) return a.placement_date < b.placement_date ? 1 : -1;
  const ta = a.published_at || '';
  const tb = b.published_at || '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.placement_id < b.placement_id ? -1 : a.placement_id > b.placement_id ? 1 : 0;
}

export function sortPlacements(list: PublicPlacement[]): PublicPlacement[] {
  return [...list].sort(comparePlacementsDesc);
}

/**
 * placedStudents = unique students with at least one qualifying placement
 * yetToBePlaced  = max(total - placed, 0)
 * placementRate  = total > 0 ? placed / total * 100 : 0   (capped at 100)
 */
export function computeStats(totalStudents: number, placements: Pick<PublicPlacement, 'student_id'>[]): PlacementStats {
  const total = Math.max(0, Number.isFinite(totalStudents) ? Math.floor(totalStudents) : 0);
  const placed = new Set(placements.map((p) => p.student_id)).size;
  const rate = total > 0 ? Math.min(100, (placed / total) * 100) : 0;
  return {
    total_students: total,
    placed_students: placed,
    yet_to_be_placed: Math.max(total - placed, 0),
    placement_rate: Math.round(rate * 10) / 10,
    total_offers: placements.length,
  };
}

/** Groups by calendar date, then by company. Every placement lands in exactly one company group. */
export function buildCohorts(placements: PublicPlacement[]): Cohort[] {
  const sorted = sortPlacements(placements);
  const days = new Map<string, PublicPlacement[]>();
  for (const p of sorted) {
    const list = days.get(p.placement_date);
    if (list) list.push(p);
    else days.set(p.placement_date, [p]);
  }
  return [...days.entries()].map(([date, items]) => {
    const groups = new Map<string, CompanyGroup>();
    for (const p of items) {
      let g = groups.get(p.company_id);
      if (!g) {
        g = { company_id: p.company_id, company_name: p.company_name, company_logo_url: p.company_logo_url, placements: [] };
        groups.set(p.company_id, g);
      }
      g.placements.push(p);
    }
    const companies = [...groups.values()].sort(
      (a, b) => b.placements.length - a.placements.length || a.company_name.localeCompare(b.company_name),
    );
    return {
      date,
      announcement_count: items.length,
      unique_students: new Set(items.map((p) => p.student_id)).size,
      company_count: companies.length,
      companies,
      placements: items,
    };
  });
}

/** Paginates by whole days so a day's cohort is never split or truncated. */
export function paginateCohorts(cohorts: Cohort[], page: number, daysPerPage: number) {
  const size = Math.max(1, Math.floor(daysPerPage));
  const totalPages = Math.max(1, Math.ceil(cohorts.length / size));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return { days: cohorts.slice((current - 1) * size, current * size), page: current, totalPages };
}

/** One entry per unique student, carrying every published offer and placement status. */
export function buildDirectory(placements: PublicPlacement[], allStudents?: PublicStudent[]): DirectoryEntry[] {
  const by = new Map<string, DirectoryEntry>();
  for (const p of sortPlacements(placements)) {
    let e = by.get(p.student_id);
    if (!e) {
      e = {
        student_id: p.student_id,
        student_name: p.student_name,
        roll_number: undefined,
        department: p.department,
        latest_placement_date: p.placement_date,
        offers: [],
        status: 'placed',
      };
      by.set(p.student_id, e);
    }
    e.offers.push(p);
  }

  if (allStudents && allStudents.length > 0) {
    for (const s of allStudents) {
      let existing = by.get(s.student_id);
      if (!existing) {
        existing = [...by.values()].find(
          (e) => (e.roll_number && e.roll_number.toLowerCase() === s.roll_number.toLowerCase()) ||
                 e.student_name.toLowerCase() === s.full_name.toLowerCase()
        );
      }
      if (existing) {
        if (s.full_name) existing.student_name = s.full_name;
        if (!existing.roll_number) existing.roll_number = s.roll_number;
      } else {
        const key = s.student_id || s.roll_number;
        by.set(key, {
          student_id: key,
          student_name: s.full_name,
          roll_number: s.roll_number,
          department: s.department || 'MBA',
          latest_placement_date: '',
          offers: [],
          status: 'unplaced',
        });
      }
    }
  }

  return [...by.values()];
}

export interface DirectoryFilter {
  query?: string;
  companyId?: string;
  from?: string;
  to?: string;
  status?: 'all' | 'placed' | 'unplaced';
  sort?: 'newest' | 'name';
}

export function filterDirectory(entries: DirectoryEntry[], f: DirectoryFilter): DirectoryEntry[] {
  const q = (f.query || '').trim().toLowerCase();
  const hasOfferFilters = !!(f.companyId || f.from || f.to);

  const out = entries.filter((e) => {
    if (f.status === 'placed' && e.status === 'unplaced') return false;
    if (f.status === 'unplaced' && e.status === 'placed') return false;

    if (hasOfferFilters) {
      if (!e.offers.length) return false;
      const match = e.offers.some((o) => {
        if (f.companyId && o.company_id !== f.companyId) return false;
        if (f.from && o.placement_date < f.from) return false;
        if (f.to && o.placement_date > f.to) return false;
        return true;
      });
      if (!match) return false;
    }

    if (q) {
      const matchName = e.student_name.toLowerCase().includes(q);
      const matchRoll = e.roll_number ? e.roll_number.toLowerCase().includes(q) : false;
      const matchCompany = e.offers.some((o) => o.company_name.toLowerCase().includes(q));
      if (!matchName && !matchRoll && !matchCompany) return false;
    }

    return true;
  });

  if (f.sort === 'name') {
    out.sort((a, b) => a.student_name.localeCompare(b.student_name, undefined, { sensitivity: 'base' }) || (a.student_id < b.student_id ? -1 : 1));
  } else if (f.sort === 'newest') {
    out.sort((a, b) => {
      if (a.latest_placement_date && b.latest_placement_date) {
        return b.latest_placement_date.localeCompare(a.latest_placement_date) || a.student_name.localeCompare(b.student_name);
      }
      if (a.latest_placement_date) return -1;
      if (b.latest_placement_date) return 1;
      return (a.roll_number || '').localeCompare(b.roll_number || '') || a.student_name.localeCompare(b.student_name);
    });
  }
  return out;
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages, total: items.length };
}

export function summarizeCompanies(placements: PublicPlacement[]): CompanySummary[] {
  const by = new Map<string, { s: CompanySummary; students: Set<string>; roles: Set<string> }>();
  for (const p of placements) {
    let g = by.get(p.company_id);
    if (!g) {
      g = {
        s: { company_id: p.company_id, display_name: p.company_name, logo_url: p.company_logo_url, website_url: '', placed_students: 0, offers: 0, roles: [], latest_placement_date: '' },
        students: new Set(),
        roles: new Set(),
      };
      by.set(p.company_id, g);
    }
    g.students.add(p.student_id);
    if (p.job_role) g.roles.add(p.job_role);
    g.s.offers++;
    if (p.placement_date > g.s.latest_placement_date) g.s.latest_placement_date = p.placement_date;
  }
  return [...by.values()]
    .map(({ s, students, roles }) => ({ ...s, placed_students: students.size, roles: [...roles].sort() }))
    .sort((a, b) => b.placed_students - a.placed_students || a.display_name.localeCompare(b.display_name));
}

export interface DailyPoint {
  date: string;
  offers: number;
  newStudents: number;
  cumulativeStudents: number;
}

/** Daily activity and cumulative UNIQUE students placed (a student's second offer does not move the cumulative line). */
export function dailySeries(placements: PublicPlacement[]): DailyPoint[] {
  const asc = sortPlacements(placements).reverse();
  const seen = new Set<string>();
  const out: DailyPoint[] = [];
  for (const p of asc) {
    let point = out[out.length - 1];
    if (!point || point.date !== p.placement_date) {
      point = { date: p.placement_date, offers: 0, newStudents: 0, cumulativeStudents: seen.size };
      out.push(point);
    }
    point.offers++;
    if (!seen.has(p.student_id)) {
      seen.add(p.student_id);
      point.newStudents++;
    }
    point.cumulativeStudents = seen.size;
  }
  return out;
}

// ---------- formatting ----------

export function formatDate(isoDate: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  // A calendar date is formatted in UTC so it never shifts by a day in the viewer's timezone.
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Today's calendar date in an IANA timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function formatCtc(amount: number | undefined, currency = 'INR'): string {
  if (amount === undefined || !Number.isFinite(amount)) return '';
  if (currency === 'INR') {
    if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(amount % 1e7 === 0 ? 0 : 2)} Cr`;
    if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(amount % 1e5 === 0 ? 0 : 1)} LPA`;
  }
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Deterministic hue for a monogram so the same company always gets the same color. */
export function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
