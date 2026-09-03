import type { ComponentProps } from 'react';

// Birdhaus DS primitive — a styled <button>, no library, no a11y machinery to
// import. Colors and type come from the generated tokens (--color-*, --text-*);
// corners are square per the DS rule — rounded-none is the honest expression of
// a DS with no non-zero radius; there's no --radius token because a single-value
// token is machinery around a constant. No hex or px literals live here.

type Variant = 'solid' | 'accent' | 'outline';

const BASE =
  'inline-flex items-center justify-center rounded-none border px-4 py-2 ' +
  'font-berkeley text-ui-button-15 transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-red ' +
  'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  solid:
    'border-surface-ink bg-surface-ink text-surface-paper ' +
    'hover:border-accent-red hover:bg-accent-red',
  accent:
    'border-accent-red bg-accent-red text-surface-paper ' +
    'hover:border-surface-ink hover:bg-surface-ink',
  outline:
    'border-surface-ink bg-transparent text-surface-ink ' +
    'hover:bg-surface-ink hover:text-surface-paper',
};

export type ButtonProps = ComponentProps<'button'> & { variant?: Variant };

export function Button({ variant = 'solid', className = '', ...props }: ButtonProps) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export default Button;
