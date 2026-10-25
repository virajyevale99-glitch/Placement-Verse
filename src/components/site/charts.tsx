// Lightweight, dependency-free SVG charts. Each one has a text alternative (a table) for screen readers.
import { formatDate } from '@/lib/core/placements';

export function HBarChart({ data, label }: { data: { name: string; value: number; sub?: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <ul className="grid gap-3" aria-label={label}>
        {data.map((d) => (
          <li key={d.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-mist" title={d.name}>{d.name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/5" aria-hidden>
              <span className="block h-full rounded-full bg-gradient-to-r from-violet to-blue" style={{ width: `${(d.value / max) * 100}%` }} />
            </span>
            <span className="tabular w-10 text-right font-semibold text-ink">{d.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Column chart for daily activity. Columns are evenly spaced by event day (gaps are not to scale). */
export function ColumnChart({ data, label }: { data: { date: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 640, H = 200, pad = 28;
  const bw = Math.max(4, Math.min(36, (W - pad * 2) / Math.max(1, data.length) - 6));
  const step = (W - pad * 2) / Math.max(1, data.length);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0.5, 1].map((t) => (
          <line key={t} x1={pad} x2={W - pad} y1={H - (H - pad) * t} y2={H - (H - pad) * t} stroke="#262E52" strokeDasharray="3 5" />
        ))}
        {data.map((d, i) => {
          const h = ((H - pad) * d.value) / max;
          const x = pad + i * step + (step - bw) / 2;
          return (
            <g key={d.date}>
              <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill="#34D399" opacity={0.9}>
                <title>{`${formatDate(d.date)}: ${d.value}`}</title>
              </rect>
              <text x={x + bw / 2} y={H - h - 6} textAnchor="middle" fontSize="11" fill="#A8AFCB">{d.value}</text>
              {data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? (
                <text x={x + bw / 2} y={H + 18} textAnchor="middle" fontSize="11" fill="#8790B5">{formatDate(d.date, { day: 'numeric', month: 'short' })}</text>
              ) : null}
            </g>
          );
        })}
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#262E52" />
      </svg>
      <DataTable caption={label} rows={data.map((d) => [formatDate(d.date), String(d.value)])} head={['Date', 'Count']} />
    </figure>
  );
}

/** Step line for cumulative unique students placed, with the batch strength as a ceiling. */
export function CumulativeChart({ data, total, label }: { data: { date: string; value: number }[]; total: number; label: string }) {
  const W = 640, H = 220, pad = 32;
  const max = Math.max(1, total, ...data.map((d) => d.value));
  const x = (i: number) => pad + (data.length <= 1 ? (W - pad * 2) / 2 : (i * (W - pad * 2)) / (data.length - 1));
  const y = (v: number) => H - ((H - pad) * v) / max;
  let path = '';
  data.forEach((d, i) => {
    path += i === 0 ? `M ${x(i)} ${y(d.value)}` : ` H ${x(i)} V ${y(d.value)}`;
  });
  const area = data.length ? `${path} V ${H} H ${x(0)} Z` : '';
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="h-auto w-full" role="img" aria-label={label}>
        <defs>
          <linearGradient id="cum-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8B5CF6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {total > 0 ? (
          <g>
            <line x1={pad} x2={W - pad} y1={y(total)} y2={y(total)} stroke="#F6D78B" strokeOpacity="0.5" strokeDasharray="4 6" />
            <text x={W - pad} y={y(total) - 6} textAnchor="end" fontSize="11" fill="#F6D78B">Batch of {total}</text>
          </g>
        ) : null}
        {area ? <path d={area} fill="url(#cum-fill)" /> : null}
        {path ? <path d={path} fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.value)} r="3.5" fill="#080B16" stroke="#A78BFA" strokeWidth="2">
            <title>{`${formatDate(d.date)}: ${d.value} placed`}</title>
          </circle>
        ))}
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#262E52" />
        {data.length ? (
          <>
            <text x={x(0)} y={H + 18} textAnchor="start" fontSize="11" fill="#8790B5">{formatDate(data[0].date, { day: 'numeric', month: 'short' })}</text>
            <text x={x(data.length - 1)} y={H + 18} textAnchor="end" fontSize="11" fill="#8790B5">{formatDate(data[data.length - 1].date, { day: 'numeric', month: 'short' })}</text>
          </>
        ) : null}
      </svg>
      <DataTable caption={label} rows={data.map((d) => [formatDate(d.date), String(d.value)])} head={['Date', 'Students placed so far']} />
    </figure>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}
