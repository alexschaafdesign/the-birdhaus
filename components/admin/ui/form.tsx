import type { ComponentProps, ReactNode } from 'react';
import { FORM } from '@/components/night/form';
import { ADMIN_TYPE } from './styles';

// Admin form controls on the 2027 FORM look (components/night/form.ts): paper
// field, ink border, accent-red focus and errors, square corners. `invalid`
// switches to the red border and sets aria-invalid; pair it with Field's
// `error`. Disabled fields fade, as everywhere in the DS.

const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  className = '',
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={FORM.label}>{label}</span>
      {hint && <span className={`${FORM.hint} block`}>{hint}</span>}
      {children}
      {error && (
        <span role="alert" className={`${FORM.fieldError} block`}>
          {error}
        </span>
      )}
    </label>
  );
}

type Invalid = { invalid?: boolean };

export function Input({ invalid, className = '', ...props }: ComponentProps<'input'> & Invalid) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${invalid ? FORM.fieldInvalid : FORM.field} ${DISABLED} ${className}`}
      {...props}
    />
  );
}

export function Textarea({ invalid, className = '', ...props }: ComponentProps<'textarea'> & Invalid) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${invalid ? FORM.fieldInvalid : FORM.field} resize-y ${DISABLED} ${className}`}
      {...props}
    />
  );
}

export function Select({ invalid, className = '', ...props }: ComponentProps<'select'> & Invalid) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`${invalid ? FORM.fieldInvalid : FORM.field} cursor-pointer ${DISABLED} ${className}`}
      {...props}
    />
  );
}

export function Checkbox({
  label,
  className = '',
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode }) {
  return (
    <label className={`${ADMIN_TYPE.body} inline-flex cursor-pointer items-center gap-2 ${className}`}>
      <input type="checkbox" className={`accent-surface-ink size-4 ${ADMIN_TYPE.focus} ${DISABLED}`} {...props} />
      {label}
    </label>
  );
}

// Boxed success / info line (role="status"). Errors are plain red text, not a
// box: use FORM.error / Field's `error` for those, per the 2027 form rule.
export function Notice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={`${FORM.notice} ${className}`}>
      {children}
    </div>
  );
}
