import { cn } from '@/lib/utils';
import { type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'slack' | 'action';
type Size = 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, string> = {
  primary:     'text-[#0e0d1a] font-semibold shadow-sm hover:brightness-110',
  secondary:   'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost:       'bg-transparent text-slate-600 hover:bg-slate-100 border border-slate-200',
  destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  slack:       'bg-[#4a154b] text-white hover:bg-[#611f69] shadow-sm',
  action:      'text-amber-700 border border-amber-200 hover:brightness-105 font-medium',
};

const variantInlineStyles: Partial<Record<Variant, React.CSSProperties>> = {
  primary: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
  },
  action: {
    background: 'rgba(251,191,36,0.08)',
  },
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-8 px-3.5 text-[13px] gap-1.5',
  lg: 'h-10 px-4 text-sm gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className, style, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      style={{ ...variantInlineStyles[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
