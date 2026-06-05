import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt$(v: unknown): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v as number);
}

export function fmtCompact$(v: unknown): string {
  if (v == null) return '—';
  const n = v as number;
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function fmtDate(v: unknown): string {
  if (!v) return '—';
  const s = v as string;
  return new Date(s + (s.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  return new Date(v as string).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtPct(v: unknown): string {
  if (v == null) return '—';
  return `${v}%`;
}

/** Convert a glob-style role pattern like *AMER*PACE* to a SOQL LIKE clause fragment */
export function globToSoql(pattern: string): string {
  return pattern
    .split('*')
    .map(s => s.replace(/'/g, "\\'"))
    .join('%');
}
