import type { ComponentProps } from 'react';

// Birdhaus DS primitive — a styled <button>, matching the Figma "Button" set
// (DESIGN SYSTEM - BIRDHAUS, node 111:220) and its documentation frame.
// Variant and size are props; interaction states are CSS only: ui-hover /
// ui-pressed (custom variants in app/globals.css) and native :disabled.
// Colors and type come from the generated tokens (--color-*, --text-*). Sizes
// are Tailwind spacing steps sized to the exact Figma values (h-13 = 52,
// px-6.5 = 26, gap-2.5 = 10 …) — the DS spacing scale doesn't cover them.
// Corners are square per the DS rule. No hex or px literals live here.

export type Variant = 'primary' | 'secondary' | 'ghost';
export type Size = 'm' | 's';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2.5 rounded-none ' +
  'font-commit-mono font-bold whitespace-nowrap transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-red ' +
  // Pressed shifts down 2px — no shadow, the offset is the feedback.
  'ui-pressed:translate-y-0.5 ' +
  // Same geometry when disabled, just 30%.
  'disabled:pointer-events-none disabled:opacity-30';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-surface-ink text-surface-paper ' +
    'ui-hover:bg-accent-red ui-pressed:bg-accent-red',
  secondary:
    'border-2 border-surface-ink bg-transparent text-surface-ink ' +
    'ui-hover:bg-surface-ink ui-hover:text-surface-paper ' +
    'ui-pressed:border-accent-red ui-pressed:bg-accent-red ui-pressed:text-surface-paper',
  // No box, zero horizontal padding so it sits flush with body text.
  ghost: 'bg-transparent text-accent-red ui-hover:underline ui-pressed:text-surface-ink',
};

// M: UI/Button 15 (Bold, lh 1.2, +1 tracking). S: Body/3 — 14 Bold (lh 1.5).
const SIZES: Record<Size, string> = {
  m: 'h-13 text-ui-button-15 leading-[1.2] tracking-[--spacing(0.25)]',
  s: 'h-9.5 text-body-3 leading-normal',
};

const PADDING: Record<Size, string> = { m: 'px-6.5', s: 'px-4.5' };

const ICON_SIZES: Record<Size, string> = { m: 'size-4', s: 'size-3.5' };

// The class string, exported so a link (next/link) can wear the same button
// styling — e.g. NextShow's RSVP — without nesting a <button> in an <a>.
export function buttonClassName(variant: Variant = 'primary', size: Size = 'm') {
  const padding = variant === 'ghost' ? 'px-0' : PADDING[size];
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${padding}`;
}

// Figma's Icon / arrow-right, used as a mask so it takes the label's color
// (currentColor) through every state.
export function ButtonArrow({ size = 'm' }: { size?: Size }) {
  return (
    <span
      aria-hidden
      className={`${ICON_SIZES[size]} shrink-0 bg-current mask-[url(/redesign/icons/arrow-right.svg)] mask-contain mask-center mask-no-repeat`}
    />
  );
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant;
  size?: Size;
  /** Trailing arrow — on every Figma variant; the docs call it optional. */
  arrow?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'm',
  arrow = true,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={`${buttonClassName(variant, size)} ${className}`} {...props}>
      {children}
      {arrow && <ButtonArrow size={size} />}
    </button>
  );
}

export default Button;
