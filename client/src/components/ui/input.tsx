import { cn } from '@/lib/utils';
import { type InputHTMLAttributes } from 'react';

export function Input({ className, style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-lg bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50 transition-shadow',
        className
      )}
      style={{ border: '1px solid #e0ddd6', ...style }}
      {...props}
    />
  );
}
