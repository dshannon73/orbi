import { Filter, User, Search } from 'lucide-react';
import { useFilters } from '@/store/filters';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterInput } from '@/components/FilterInput';
import { cn } from '@/lib/utils';

interface GlobalFilterBarProps {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  statusSlot?: React.ReactNode;
  extra?: React.ReactNode;
}

export function GlobalFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  statusSlot,
  extra,
}: GlobalFilterBarProps) {
  const {
    justMyData, ownerRolePattern, ownerName,
    setJustMyData, setOwnerRolePattern, setOwnerName,
  } = useFilters();
  const currentUserName = useAuthStore(s => s.user?.name);

  const activeFilters = [justMyData, ownerName, ownerRolePattern].filter(Boolean).length;

  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">

        {/* Left: search + per-page controls */}
        {onSearchChange && (
          <div className="relative min-w-[180px] w-48">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        )}

        {statusSlot}
        {extra}

        {/* Right: global owner filters */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">

          {/* Owner name filter with ≠ */}
          <div className="flex items-center gap-1">
            <User size={12} className="text-slate-400 shrink-0" />
            <FilterInput
              value={ownerName}
              onChange={setOwnerName}
              placeholder="Owner name…"
              title="Filter by owner name — supports globs and ≠"
              className="w-36"
            />
          </div>

          {/* Role pattern filter with ≠ */}
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-slate-400 shrink-0" />
            <FilterInput
              value={ownerRolePattern}
              onChange={setOwnerRolePattern}
              placeholder="Role: *AMER*SE*"
              title="Filter by owner role — supports globs and ≠"
              className="w-40"
            />
          </div>

          {/* Just my data toggle */}
          <Button
            variant={justMyData ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setJustMyData(!justMyData)}
            className={cn('h-8 gap-1.5 shrink-0 text-xs', justMyData && 'ring-2 ring-blue-300')}
            title={currentUserName ? `Filter to ${currentUserName}'s records` : 'Filter to your records'}
          >
            <User size={12} />
            {justMyData ? 'My Data' : 'All Data'}
          </Button>

          {/* Clear all */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setJustMyData(false); setOwnerName(''); setOwnerRolePattern(''); }}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
              title="Clear all owner filters"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/60 border-t border-blue-100">
          <span className="text-xs text-blue-500 font-medium mr-1">Active:</span>
          {justMyData && currentUserName && (
            <Chip label={`My data (${currentUserName})`} onRemove={() => setJustMyData(false)} />
          )}
          {ownerName && (
            <Chip
              label={`Owner ${ownerName.startsWith('!') ? '≠' : '='} ${ownerName.startsWith('!') ? ownerName.slice(1) : ownerName}`}
              onRemove={() => setOwnerName('')}
              variant={ownerName.startsWith('!') ? 'red' : 'blue'}
            />
          )}
          {ownerRolePattern && (
            <Chip
              label={`Role ${ownerRolePattern.startsWith('!') ? '≠' : '='} ${ownerRolePattern.startsWith('!') ? ownerRolePattern.slice(1) : ownerRolePattern}`}
              onRemove={() => setOwnerRolePattern('')}
              variant={ownerRolePattern.startsWith('!') ? 'red' : 'blue'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove, variant = 'blue' }: { label: string; onRemove: () => void; variant?: 'blue' | 'red' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'red' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
    )}>
      {label}
      <button onClick={onRemove} className="hover:opacity-75 cursor-pointer">✕</button>
    </span>
  );
}
