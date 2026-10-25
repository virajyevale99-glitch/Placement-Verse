'use client';
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const MAX_DOTS = 240;

/**
 * The batch as a seat map: one dot per student, lit mint once placed.
 * Seats are anonymous (no names, no ordering by student) — it shows proportion, not identity.
 * Large batches are scaled so each dot represents several students; the caption says so.
 */
export function SeatMap({ total, placed }: { total: number; placed: number }) {
  const reduce = useReducedMotion();
  const safeTotal = Math.max(0, total);
  const safePlaced = Math.min(Math.max(0, placed), safeTotal);
  const perDot = safeTotal > MAX_DOTS ? Math.ceil(safeTotal / MAX_DOTS) : 1;
  const dots = Math.ceil(safeTotal / perDot);
  const lit = Math.round(safePlaced / perDot);
  const cols = dots <= 60 ? 10 : dots <= 120 ? 15 : 20;

  const seats = useMemo(() => Array.from({ length: dots }, (_, i) => i < lit), [dots, lit]);

  if (!safeTotal) {
    return <p className="text-sm text-mist">Batch strength has not been set yet.</p>;
  }

  return (
    <figure>
      <div
        role="img"
        aria-label={`${safePlaced} of ${safeTotal} students placed`}
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {seats.map((on, i) => (
          <motion.span
            key={i}
            className="aspect-square rounded-full"
            initial={reduce ? false : { scale: 0.4, backgroundColor: '#262E52' }}
            animate={{ scale: 1, backgroundColor: on ? '#34D399' : '#262E52', boxShadow: on ? '0 0 12px rgba(52,211,153,0.55)' : '0 0 0 rgba(0,0,0,0)' }}
            transition={reduce ? { duration: 0 } : { delay: on ? 0.25 + i * 0.035 : 0.1 + (i % cols) * 0.01, duration: 0.45, ease: 'easeOut' }}
          />
        ))}
      </div>
      {perDot > 1 ? <figcaption className="mt-3 text-xs text-dim">Each dot is about {perDot} students.</figcaption> : null}
    </figure>
  );
}
