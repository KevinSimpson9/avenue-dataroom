import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'border border-brand-line bg-white text-brand-fg hover:bg-brand-bg disabled:opacity-50',
  ghost: 'text-brand-fg hover:bg-brand-line/40',
  danger: 'border border-red-300 text-red-700 hover:bg-red-50',
};

const sizes = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md font-medium transition ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
});
