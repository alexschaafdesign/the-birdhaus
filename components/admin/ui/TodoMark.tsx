import type { ReactNode } from 'react';

// An open to-do, marked where it gets fixed: an amber square + a short reason
// ("Needed", "Need 1 more band"). Reads lib/show-health's issues, so it agrees
// with the to-do line under the show title and the dots on the tabs.
export function TodoMark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-data-caption-13 font-normal normal-case tracking-normal text-surface-ink">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-spectrum-amber" />
      {children}
    </span>
  );
}
