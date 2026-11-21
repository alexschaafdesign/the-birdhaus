'use client';

import { useState, type ReactNode } from 'react';
import { ADMIN_TYPE } from './styles';
import { TodoMark } from './TodoMark';

// The 2027 admin card, in place of the old dark Section: paper ground, a 1px
// ink border, square corners, an optional overline title plus an action slot.
// It keeps Section's props (title / action / collapsible / defaultOpen), so a
// page moves over by swapping the import. Omit `title` to get a plain grouping
// box (a list's filter toolbar, say). `todo` puts an amber to-do mark beside
// the title (what still needs doing here); `id` makes it a jump target.
// Tokens only.
export function Panel({
  title,
  todo,
  id,
  action,
  className = '',
  collapsible = false,
  defaultOpen = false,
  children,
}: {
  title?: string;
  todo?: string | null;
  id?: string;
  action?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = collapsible ? open : true;

  return (
    <section id={id} className={`border-surface-ink bg-surface-paper border p-4 sm:p-5 scroll-mt-6 ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${expanded ? 'mb-4' : ''}`}>
          {collapsible && title ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`${ADMIN_TYPE.overline} ${ADMIN_TYPE.focus} ui-hover:text-accent-red flex cursor-pointer items-center gap-2`}
            >
              <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
                ▸
              </span>
              {title}
              {todo && <TodoMark>{todo}</TodoMark>}
            </button>
          ) : title ? (
            <h2 className={`${ADMIN_TYPE.overline} flex flex-wrap items-center gap-x-3 gap-y-1`}>
              {title}
              {todo && <TodoMark>{todo}</TodoMark>}
            </h2>
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

export default Panel;
