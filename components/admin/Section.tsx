import type { ReactNode } from 'react';

// The canonical admin card: a subtly-tinted bordered container with an optional
// title/action header. Shared across the admin forms and list toolbars so the
// dashboard reads as one system. Omit `title` to use it as a plain grouping card
// (e.g. a list's filter toolbar).
export default function Section({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title ? <h2 className="text-sm font-semibold text-[#E8E0D0]/90">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
