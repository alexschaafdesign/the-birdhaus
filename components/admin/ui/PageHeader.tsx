import type { ReactNode } from 'react';
import { ADMIN_TYPE } from './styles';

// The top of a 2027 admin page: an accent-red overline (the section, or a
// count: "SHOWS · 14 UPCOMING"), the title, an optional line under it, and the
// page's actions on the right (they wrap under on a phone).
export function PageHeader({
  overline,
  title,
  description,
  actions,
}: {
  overline?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {overline && <p className={`${ADMIN_TYPE.overline} text-accent-red mb-1`}>{overline}</p>}
        <h1 className={ADMIN_TYPE.title}>{title}</h1>
        {description && <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted} mt-1`}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export default PageHeader;
