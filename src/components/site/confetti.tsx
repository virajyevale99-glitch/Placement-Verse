'use client';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['#F6D78B', '#34D399', '#8B5CF6', '#3B82F6', '#ffffff'];

/** One short confetti burst. Plays once per mount, never for reduced-motion users, purely decorative. */
export function ConfettiBurst({ pieces = 36, trigger = 0 }: { pieces?: number; trigger?: number }) {
  const reduce = useReducedMotion();
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    if (!reduce) setSeed(Date.now() + trigger);
  }, [trigger, reduce]);
  if (reduce || seed === null) return null;

  const rand = (i: number, k: number) => {
    const x = Math.sin(seed / 1000 + i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: pieces }, (_, i) => {
        const left = rand(i, 1) * 100;
        const drift = (rand(i, 2) - 0.5) * 160;
        const rotate = (rand(i, 3) - 0.5) * 720;
        const delay = rand(i, 4) * 0.35;
        const w = 5 + rand(i, 5) * 5;
        return (
          <motion.span
            key={`${seed}-${i}`}
            className="absolute top-0 block rounded-[2px]"
            style={{ left: `${left}%`, width: w, height: w * 1.8, background: COLORS[i % COLORS.length] }}
            initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
            animate={{ y: 420, x: drift, opacity: 0, rotate }}
            transition={{ duration: 2.2, delay, ease: [0.2, 0.7, 0.4, 1] }}
          />
        );
      })}
    </div>
  );
}
