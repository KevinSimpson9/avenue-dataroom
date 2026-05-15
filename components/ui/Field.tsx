import type { InputHTMLAttributes, ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
}

export function Field({ label, hint, className = '', id, ...rest }: FieldProps) {
  const inputId = id || `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-xs uppercase tracking-wider text-brand-muted">{label}</span>
      <input
        id={inputId}
        className={`mt-1 w-full rounded-md border border-brand-line bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent ${className}`}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-xs text-brand-muted">{hint}</span> : null}
    </label>
  );
}
