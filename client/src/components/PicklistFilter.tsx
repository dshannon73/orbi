import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { metaApi } from '@/api';
import { cn } from '@/lib/utils';

interface PicklistFilterProps {
  /** Salesforce object API name, e.g. 'Opportunity' */
  object: string;
  /** Salesforce field API name, e.g. 'StageName' */
  field: string;
  /** Comma-separated selected values. Prefix with ! for NOT IN mode. */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Persistent visible label shown above the control */
  label?: string;
}

export function PicklistFilter({ object, field, value, onChange, placeholder = 'All', label }: PicklistFilterProps) {
  const { data } = useQuery({
    queryKey: ['picklist', object, field],
    queryFn: () => metaApi.picklist(object, field),
    staleTime: Infinity,
  });

  const allValues: string[] = data?.data?.values ?? [];

  const isNegated = value.startsWith('!');
  const selectedRaw = isNegated ? value.slice(1) : value;
  const selected = new Set(selectedRaw ? selectedRaw.split(',').map(v => v.trim()).filter(Boolean) : []);

  function toggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    const joined = [...next].join(',');
    onChange(joined ? (isNegated ? '!' + joined : joined) : '');
  }

  function toggleNegate() {
    if (!selected.size) return;
    const joined = [...selected].join(',');
    onChange(isNegated ? joined : '!' + joined);
  }

  function clear() { onChange(''); }

  const activeCount = selected.size;
  const hasValue = activeCount > 0;

  const triggerLabel = hasValue
    ? `${activeCount} selected`
    : placeholder;

  return (
    <div className="flex flex-col gap-0.5">
      {label && <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-0.5">{label}</span>}
    <div className="flex items-center gap-1">
      {/* External ≠ button — always visible next to the filter */}
      <button
        onClick={toggleNegate}
        disabled={!hasValue}
        className={cn(
          'h-8 px-1.5 rounded-md border text-xs font-bold transition-colors shrink-0',
          isNegated
            ? 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200'
            : 'bg-white text-slate-300 border-slate-200 hover:text-slate-600 hover:border-slate-300',
          !hasValue && 'opacity-30 cursor-default'
        )}
        title={isNegated ? 'Exclude mode — click to include' : 'Click to exclude (≠)'}
      >
        ≠
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors max-w-[180px]',
              hasValue && !isNegated && 'border-blue-400 bg-blue-50 text-blue-700',
              isNegated && 'border-red-300 bg-red-50 text-red-600',
              !hasValue && 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            {hasValue && (
              <span
                role="button"
                onClick={e => { e.stopPropagation(); clear(); }}
                className="shrink-0 text-current opacity-60 hover:opacity-100"
              >
                <X size={11} />
              </span>
            )}
            {!hasValue && <ChevronDown size={11} className="shrink-0 opacity-50" />}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="z-50 min-w-[200px] max-h-72 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg p-1 text-sm"
            onCloseAutoFocus={e => e.preventDefault()}
          >
            <div className="px-2 py-1 mb-0.5 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{placeholder}</span>
            </div>

            {allValues.length === 0 && (
              <div className="px-2 py-3 text-xs text-slate-400 text-center">Loading…</div>
            )}

            {allValues.map(val => {
              const checked = selected.has(val);
              return (
                <DropdownMenu.Item
                  key={val}
                  onSelect={e => { e.preventDefault(); toggle(val); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer outline-none hover:bg-slate-50 text-slate-700 select-none"
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                    checked
                      ? isNegated ? 'bg-red-500 border-red-500' : 'bg-blue-600 border-blue-600'
                      : 'border-slate-300'
                  )}>
                    {checked && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2">
                        <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="truncate">{val}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
    </div>
  );
}
