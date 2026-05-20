import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  label?: string;
}

export function FilterInput({ value, onChange, placeholder, title, className, label }: FilterInputProps) {
  const active = !!value;

  const baseStyle: React.CSSProperties = active
    ? { borderColor: '#fbbf24', background: '#fffbeb' }
    : { borderColor: '#e0ddd6', background: '#fff' };

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-0.5">{label}</span>
      )}
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          title={title}
          className={cn(
            'h-8 pl-2.5 rounded-lg border text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 pr-6 transition-all',
            className
          )}
          style={baseStyle}
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1.5 cursor-pointer p-0.5 rounded transition-opacity hover:opacity-60"
            style={{ color: '#d97706' }}
          >
            <X size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
