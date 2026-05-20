import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variants: Record<Variant, string> = {
  default: 'bg-amber-50 text-amber-700 border border-amber-100',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  warning: 'bg-amber-50 text-amber-600 border border-amber-100',
  danger:  'bg-red-50 text-red-600 border border-red-100',
  info:    'bg-sky-50 text-sky-700 border border-sky-100',
  neutral: 'bg-slate-100 text-slate-600 border border-slate-200',
};

export function statusVariant(s: string | null | undefined): Variant {
  if (!s) return 'neutral';
  const l = s.toLowerCase();
  if (l.includes('approv') || l.includes('won') || l.includes('closed won') || l.includes('complete')) return 'success';
  if (l.includes('reject') || l.includes('denied') || l.includes('closed lost') || l.includes('lost')) return 'danger';
  if (l.includes('pending') || l.includes('submitted') || l.includes('review') || l.includes('progress')) return 'warning';
  if (l.includes('open') || l.includes('active')) return 'info';
  return 'neutral';
}

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: Variant; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap leading-none',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
