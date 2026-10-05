import type { ComponentProps } from 'react';
import { SmpteBars } from './SmpteBars';

// Birdhaus DS primitive — Content / Section Header. An accent-red overline label
// over a one-band SMPTE rule (bars-1-ink). Type is Data/Overline 11: Bold,
// lh 1.3, +2.5 tracking (--spacing(0.625)). Optional count renders "LABEL (9)".
// The rule is s (2px) by default, m (4px) for weight, or 'none' for a bare
// label (the Home mockup's Upcoming / Latest recordings headers).
// The label is a real heading (h2 by default) so sections stay navigable.

type Level = 'h2' | 'h3';

export type SectionHeaderProps = Omit<ComponentProps<'div'>, 'children'> & {
  label: string;
  count?: number;
  as?: Level;
  rule?: 's' | 'm' | 'none';
};

export function SectionHeader({
  label,
  count,
  as: Heading = 'h2',
  rule = 's',
  className = '',
  ...props
}: SectionHeaderProps) {
  return (
    <div {...props} className={`flex w-full flex-col gap-3 ${className}`}>
      <Heading className="text-data-overline-11 text-accent-red font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
        {label}
        {count !== undefined && ` (${count})`}
      </Heading>
      {rule !== 'none' && <SmpteBars bands={1} size={rule} />}
    </div>
  );
}

export default SectionHeader;
