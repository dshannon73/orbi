import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variants: Record<Variant, string> = {
  default: 'bg-blue-100 text-blue-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800',
  neutral: 'bg-slate-100 text-slate-700',
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
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', variants[variant], className)}>
      {children}
    </span>
  );
}
