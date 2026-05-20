import { Filter, User, Search, X } from 'lucide-react';
import { useFilters } from '@/store/filters';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/input';
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
    <div
      className="mb-4 rounded-xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e8e5de', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {/* Search */}
        {onSearchChange && (
          <div className="relative min-w-[180px] w-48">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#c4bfb8' }} />
            <Input
              className="pl-8 h-8 text-[12px]"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        )}

        {statusSlot}
        {extra}

        {/* Right: owner filters */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1">
            <User size={11} style={{ color: '#c4bfb8' }} className="shrink-0" />
            <FilterInput
              value={ownerName}
              onChange={setOwnerName}
              placeholder="Owner name…"
              title="Filter by owner name — supports globs and ≠"
              className="w-36"
            />
          </div>

          <div className="flex items-center gap-1">
            <Filter size={11} style={{ color: '#c4bfb8' }} className="shrink-0" />
            <FilterInput
              value={ownerRolePattern}
              onChange={setOwnerRolePattern}
              placeholder="Role: *AMER*SE*"
              title="Filter by owner role — supports globs and ≠"
              className="w-40"
            />
          </div>

          {/* My data toggle */}
          <button
            onClick={() => setJustMyData(!justMyData)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer"
            style={justMyData
              ? {
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#0e0d1a',
                  boxShadow: '0 2px 6px rgba(245,158,11,0.25)',
                }
              : {
                  background: '#f5f4f0',
                  color: '#8b8577',
                  border: '1px solid #e8e5de',
                }
            }
            title={currentUserName ? `Filter to ${currentUserName}'s records` : 'Filter to your records'}
          >
            <User size={11} />
            {justMyData ? 'My Data' : 'All Data'}
          </button>

          {activeFilters > 0 && (
            <button
              onClick={() => { setJustMyData(false); setOwnerName(''); setOwnerRolePattern(''); }}
              className="text-[11px] flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-60"
              style={{ color: '#b5b0a8' }}
              title="Clear all owner filters"
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5"
          style={{ background: '#fffbeb', borderTop: '1px solid #fde68a' }}
        >
          <span className="text-[10px] font-semibold mr-1" style={{ color: '#d97706' }}>Active:</span>
          {justMyData && currentUserName && (
            <Chip label={`My data — ${currentUserName}`} onRemove={() => setJustMyData(false)} />
          )}
          {ownerName && (
            <Chip
              label={`Owner ${ownerName.startsWith('!') ? '≠' : '='} ${ownerName.replace(/^!/, '')}`}
              onRemove={() => setOwnerName('')}
              variant={ownerName.startsWith('!') ? 'red' : 'amber'}
            />
          )}
          {ownerRolePattern && (
            <Chip
              label={`Role ${ownerRolePattern.startsWith('!') ? '≠' : '='} ${ownerRolePattern.replace(/^!/, '')}`}
              onRemove={() => setOwnerRolePattern('')}
              variant={ownerRolePattern.startsWith('!') ? 'red' : 'amber'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove, variant = 'amber' }: { label: string; onRemove: () => void; variant?: 'amber' | 'red' }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={variant === 'red'
        ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }
        : { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
      }
    >
      {label}
      <button onClick={onRemove} className="hover:opacity-70 cursor-pointer leading-none">✕</button>
    </span>
  );
}
