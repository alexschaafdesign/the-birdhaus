import Link from 'next/link';
import { activeIssues, categoriesFor, issueHref, type ShowHealthFacts } from '@/lib/show-health';

// One quiet line under the show title listing only what's still open (each
// item jumps to the field that fixes it, from any tab). Nothing at all once
// everything's done. Same issues (lib/show-health) as the shows list chips,
// the tab dots and the marks on each field, so they can't disagree.
export default function ShowTodoLine({
  showId,
  facts,
  today,
}: {
  showId: number;
  facts: ShowHealthFacts;
  today: string;
}) {
  const issues = activeIssues(facts, today, categoriesFor(facts, today));
  if (issues.length === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-3">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-spectrum-amber" />
      <span className="font-bold">{issues.length} to do:</span>
      {issues.map((issue, i) => {
        const href = issueHref(showId, issue.key);
        return (
          <span key={issue.key} className="inline-flex items-center gap-1.5">
            {href ? (
              <Link href={href} className="underline decoration-dotted underline-offset-4 hover:text-accent-red">
                {issue.label}
              </Link>
            ) : (
              issue.label
            )}
            {i < issues.length - 1 && <span className="text-surface-ink/40">·</span>}
          </span>
        );
      })}
    </p>
  );
}
