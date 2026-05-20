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

/**
 * Text filter with per-term negation using - prefix.
 * e.g. "-Block, Emerson" excludes Block and includes Emerson.
 * Values are passed as-is to the server; server parses - prefix per term.
 */
export function FilterInput({ value, onChange, placeholder, title, className, label }: FilterInputProps) {
  const active = !!value;

  return (
    <div className="flex flex-col gap-0.5">
      {label && <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-0.5">{label}</span>}
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          title={title}
          className={cn(
            'h-8 pl-2.5 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6 transition-colors',
            active ? 'border-blue-400 bg-blue-50' : 'border-slate-200',
            className
          )}
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1.5 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 rounded"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
