import { usePageFilters } from '@/store/pageFilters';

export const DATE_PRESETS = [
  { value: 'today',       label: 'Today' },
  { value: 'this_week',   label: 'This Week' },
  { value: 'this_month',  label: 'This Month' },
  { value: 'last_month',  label: 'Last Month' },
  { value: 'last_30',     label: 'Last 30 Days' },
  { value: 'last_90',     label: 'Last 90 Days' },
  { value: 'next_30',     label: 'Next 30 Days' },
  { value: 'next_90',     label: 'Next 90 Days' },
  { value: 'current_fq',  label: 'Current FQ' },
  { value: 'last_fq',     label: 'Last FQ' },
  { value: 'next_fq',     label: 'Next FQ' },
  { value: 'current_fy',  label: 'Current FY' },
  { value: 'last_fy',     label: 'Last FY' },
  { value: 'custom',      label: 'Custom…' },
];

interface Props {
  page: string;
  defaultPreset?: string;
  label?: string;
}

export function DateRangeFilter({ page, defaultPreset = 'current_fq', label = 'Date Range' }: Props) {
  const pf = usePageFilters();
  const datePreset = pf.get(page, 'datePreset', defaultPreset);
  const dateFrom   = pf.get(page, 'dateFrom');
  const dateTo     = pf.get(page, 'dateTo');

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-0.5">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">
        <select
          value={datePreset}
          onChange={e => pf.set(page, 'datePreset', e.target.value)}
          className="h-8 px-2 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {datePreset === 'custom' && (
          <>
            <input type="date" value={dateFrom} onChange={e => pf.set(page, 'dateFrom', e.target.value)}
              className={`h-8 px-2 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateFrom ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} />
            <span className="text-xs text-slate-400">–</span>
            <input type="date" value={dateTo} onChange={e => pf.set(page, 'dateTo', e.target.value)}
              className={`h-8 px-2 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateTo ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} />
          </>
        )}
      </div>
    </div>
  );
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

// SF fiscal year starts Feb 1. FQ boundaries:
//   Q1: Feb 1  – Apr 30
//   Q2: May 1  – Jul 31
//   Q3: Aug 1  – Oct 31
//   Q4: Nov 1  – Jan 31
function sfFQ(date: Date): { from: string; to: string } {
  const m = date.getMonth(); // 0=Jan
  const y = date.getFullYear();
  if (m >= 1 && m <= 3)  return { from: fmt(new Date(y, 1, 1)),  to: fmt(new Date(y, 3, 30)) };
  if (m >= 4 && m <= 6)  return { from: fmt(new Date(y, 4, 1)),  to: fmt(new Date(y, 6, 31)) };
  if (m >= 7 && m <= 9)  return { from: fmt(new Date(y, 7, 1)),  to: fmt(new Date(y, 9, 31)) };
  // Q4: Nov–Jan. If current month is Jan, quarter started Nov of prior year.
  const q4start = m === 0 ? new Date(y - 1, 10, 1) : new Date(y, 10, 1);
  const q4end   = m === 0 ? new Date(y, 0, 31)     : new Date(y + 1, 0, 31);
  return { from: fmt(q4start), to: fmt(q4end) };
}

function sfFY(date: Date): { from: string; to: string } {
  // FY starts Feb 1. If month is Jan (0), FY started the previous Feb.
  const fyStart = date.getMonth() >= 1 ? date.getFullYear() : date.getFullYear() - 1;
  return { from: fmt(new Date(fyStart, 1, 1)), to: fmt(new Date(fyStart + 1, 0, 31)) };
}

function shiftFQ(date: Date, quarters: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + quarters * 3);
  return d;
}

/** Resolve a date preset to concrete { from, to } YYYY-MM-DD strings. */
export function resolveDateRange(preset: string, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  if (preset === 'custom') return { from: customFrom, to: customTo };

  switch (preset) {
    case 'today':      return { from: fmt(today), to: fmt(today) };
    case 'this_week': {
      const s = new Date(today); s.setDate(today.getDate() - today.getDay());
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'this_month':
      return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
               to:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case 'last_month':
      return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
               to:   fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case 'last_30': { const s = new Date(today); s.setDate(today.getDate() - 30); return { from: fmt(s), to: fmt(today) }; }
    case 'last_90': { const s = new Date(today); s.setDate(today.getDate() - 90); return { from: fmt(s), to: fmt(today) }; }
    case 'next_30': { const e = new Date(today); e.setDate(today.getDate() + 30); return { from: fmt(today), to: fmt(e) }; }
    case 'next_90': { const e = new Date(today); e.setDate(today.getDate() + 90); return { from: fmt(today), to: fmt(e) }; }
    case 'current_fq':  return sfFQ(today);
    case 'last_fq':     return sfFQ(shiftFQ(today, -1));
    case 'next_fq':     return sfFQ(shiftFQ(today, +1));
    case 'current_fy':  return sfFY(today);
    case 'last_fy':     return sfFY(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    default:            return sfFQ(today);
  }
}
