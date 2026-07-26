'use client';

import { useState, type ReactNode } from 'react';

// The canonical admin card: a subtly-tinted bordered container with an optional
// title/action header. Shared across the admin forms and list toolbars so the
// dashboard reads as one system. Omit `title` to use it as a plain grouping card
// (e.g. a list's filter toolbar).
//
// Pass `collapsible` to make the title a show/hide toggle; `defaultOpen`
// controls the initial state (collapsed by default).
export default function Section({
  title,
  action,
  className = '',
  collapsible = false,
  defaultOpen = false,
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = collapsible ? open : true;

  return (
    <section className={`rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${expanded ? 'mb-4' : ''}`}>
          {collapsible && title ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-[#E8E0D0]/90 hover:text-[#E8E0D0]"
            >
              <span
                className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}
                aria-hidden
              >
                ▸
              </span>
              {title}
            </button>
          ) : title ? (
            <h2 className="text-sm font-semibold text-[#E8E0D0]/90">{title}</h2>
          ) : (
            <span />
          )}
          {expanded && action}
        </div>
      )}
      {expanded && children}
    </section>
  );
}
