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

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid #e0ddd6',
  fontSize: 12,
  color: '#374151',
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
};

const dateInputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid #e0ddd6',
  fontSize: 12,
  color: '#374151',
  background: '#fff',
  outline: 'none',
};

export function DateRangeFilter({ page, defaultPreset = 'current_fq', label = 'Date Range' }: Props) {
  const pf = usePageFilters();
  const datePreset = pf.get(page, 'datePreset', defaultPreset);
  const dateFrom   = pf.get(page, 'dateFrom');
  const dateTo     = pf.get(page, 'dateTo');

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-0.5">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={datePreset}
          onChange={e => pf.set(page, 'datePreset', e.target.value)}
          style={selectStyle}
          onFocus={e => { (e.target as HTMLElement).style.boxShadow = '0 0 0 2px rgba(251,191,36,0.4)'; }}
          onBlur={e => { (e.target as HTMLElement).style.boxShadow = 'none'; }}
        >
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {datePreset === 'custom' && (
          <>
            <input
              type="date"
              value={dateFrom}
              onChange={e => pf.set(page, 'dateFrom', e.target.value)}
              style={{ ...dateInputStyle, borderColor: dateFrom ? '#fbbf24' : '#e0ddd6', background: dateFrom ? '#fffbeb' : '#fff' }}
            />
            <span className="text-[11px]" style={{ color: '#c4bfb8' }}>–</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => pf.set(page, 'dateTo', e.target.value)}
              style={{ ...dateInputStyle, borderColor: dateTo ? '#fbbf24' : '#e0ddd6', background: dateTo ? '#fffbeb' : '#fff' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function sfFQ(date: Date): { from: string; to: string } {
  const m = date.getMonth();
  const y = date.getFullYear();
  if (m >= 1 && m <= 3)  return { from: fmt(new Date(y, 1, 1)),  to: fmt(new Date(y, 3, 30)) };
  if (m >= 4 && m <= 6)  return { from: fmt(new Date(y, 4, 1)),  to: fmt(new Date(y, 6, 31)) };
  if (m >= 7 && m <= 9)  return { from: fmt(new Date(y, 7, 1)),  to: fmt(new Date(y, 9, 31)) };
  const q4start = m === 0 ? new Date(y - 1, 10, 1) : new Date(y, 10, 1);
  const q4end   = m === 0 ? new Date(y, 0, 31)     : new Date(y + 1, 0, 31);
  return { from: fmt(q4start), to: fmt(q4end) };
}

function sfFY(date: Date): { from: string; to: string } {
  const fyStart = date.getMonth() >= 1 ? date.getFullYear() : date.getFullYear() - 1;
  return { from: fmt(new Date(fyStart, 1, 1)), to: fmt(new Date(fyStart + 1, 0, 31)) };
}

function shiftFQ(date: Date, quarters: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + quarters * 3);
  return d;
}

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
