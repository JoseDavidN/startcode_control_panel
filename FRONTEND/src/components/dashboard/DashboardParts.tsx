import type { ReactNode } from 'react';

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

/* ── Estado vacío honesto ─────────────────────────────────────────── */
export const Empty = ({ title, hint, icon }: { title: string; hint: string; icon?: ReactNode }) => (
  <div className="edge-dashed rounded-xl flex flex-col items-center justify-center text-center gap-2 py-10 px-6">
    <span className="text-white/20">{icon ?? <ChartIcon />}</span>
    <div className="text-sm font-medium text-white/60">{title}</div>
    <p className="text-xs text-white/35 max-w-[380px] leading-relaxed">{hint}</p>
  </div>
);

export const SectionTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <h2 className="text-base font-semibold text-white/90 tracking-tight">{children}</h2>
    {right}
  </div>
);
