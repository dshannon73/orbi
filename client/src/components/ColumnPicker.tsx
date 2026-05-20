import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColumnPickerProps {
  columns: { id: string; label: string }[];
  visibility: Record<string, boolean>;
  onChange: (id: string, visible: boolean) => void;
  label?: string;
}

export function ColumnPicker({ columns, visibility, onChange, label = 'Columns' }: ColumnPickerProps) {
  const hiddenCount = columns.filter(c => visibility[c.id] === false).length;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors',
            hiddenCount > 0
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'
          )}
          title="Show/hide columns"
        >
          <Columns3 size={13} />
          {label}{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[180px] bg-white rounded-xl border border-slate-200 shadow-lg p-1 text-sm"
          // prevent closing when clicking items
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Columns
          </div>
          {columns.map(col => {
            const visible = visibility[col.id] !== false;
            return (
              <DropdownMenu.CheckboxItem
                key={col.id}
                checked={visible}
                onCheckedChange={v => onChange(col.id, v)}
                onSelect={e => e.preventDefault()}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer outline-none hover:bg-slate-50 text-slate-700 select-none"
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                  visible ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                )}>
                  {visible && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-white">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {col.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
