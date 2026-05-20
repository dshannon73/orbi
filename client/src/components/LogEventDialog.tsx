import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Building2, TrendingUp, CheckCircle2, AlertCircle, Loader2, CopyPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { activitiesApi, metaApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { fmt$ } from '@/lib/utils';

const SOLUTIONS_EVENT_RT_ID = '01230000001GgBYAA0';

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  description?: string;
}

interface RelatedResult {
  type: 'Opportunity' | 'Account';
  id: string;
  name: string;
  forecastCategory?: string;
  amount?: number | null;
  ownerName?: string;
  ownerRole?: string;
  aovBand?: string;
}

interface WhatSelection {
  id: string;
  name: string;
  type: 'Opportunity' | 'Account';
}

// ── Search filter state ──────────────────────────────────────────────────────
interface SearchFilters { oppName: string; accountName: string; ownerName: string; ownerRole: string; }
const emptyFilters: SearchFilters = { oppName: '', accountName: '', ownerName: '', ownerRole: '' };

function hasAnyFilter(f: SearchFilters) {
  return Object.values(f).some(v => v.length >= 2);
}

// ── Related To picker (per-event) ────────────────────────────────────────────
function RelatedPicker({
  value,
  onChange,
}: {
  value: WhatSelection | null;
  onChange: (v: WhatSelection | null) => void;
}) {
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [results, setResults] = useState<RelatedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const setFilter = (key: keyof SearchFilters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, [key]: e.target.value }));
  };

  // Debounced search
  useEffect(() => {
    if (!hasAnyFilter(filters)) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await activitiesApi.searchRelated({
          oppName: filters.oppName.length >= 2 ? filters.oppName : undefined,
          accountName: filters.accountName.length >= 2 ? filters.accountName : undefined,
          ownerName: filters.ownerName.length >= 2 ? filters.ownerName : undefined,
          ownerRole: filters.ownerRole.length >= 2 ? filters.ownerRole : undefined,
        });
        setResults(res.data.results ?? []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [filters]);

  // Close on outside click
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function select(r: RelatedResult) {
    onChange({ id: r.id, name: r.name, type: r.type });
    setFilters(emptyFilters);
    setResults([]);
    setOpen(false);
  }

  function clear() { onChange(null); setFilters(emptyFilters); setResults([]); }

  if (value) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
        {value.type === 'Opportunity'
          ? <TrendingUp size={12} className="text-emerald-600 shrink-0" />
          : <Building2 size={12} className="text-emerald-600 shrink-0" />}
        <span className="text-xs font-medium text-emerald-700 flex-1 truncate">{value.name}</span>
        <span className="text-[10px] text-emerald-500 shrink-0">{value.type === 'Opportunity' ? 'Opp' : 'Acct'}</span>
        <button onClick={clear} className="text-emerald-400 hover:text-emerald-700 ml-1"><X size={11} /></button>
      </div>
    );
  }

  return (
    <div ref={ref} className="space-y-1.5">
      {/* Filter inputs */}
      <div className="grid grid-cols-2 gap-1.5">
        {([
          ['oppName', 'Opp Name'],
          ['accountName', 'Account Name'],
          ['ownerName', 'Owner Name'],
          ['ownerRole', 'Owner Role'],
        ] as [keyof SearchFilters, string][]).map(([key, label]) => (
          <div key={key} className="relative">
            <input
              type="text"
              value={filters[key]}
              onChange={setFilter(key)}
              placeholder={label + '…'}
              className="w-full h-7 px-2 rounded border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
            />
          </div>
        ))}
      </div>

      {/* Results dropdown */}
      {(open && results.length > 0) || loading ? (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-md">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
              <Loader2 size={11} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.map(r => (
            <button
              key={r.id}
              onClick={() => select(r)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
            >
              <div className="mt-0.5 shrink-0">
                {r.type === 'Opportunity'
                  ? <TrendingUp size={12} className="text-blue-400" />
                  : <Building2 size={12} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{r.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {r.type === 'Opportunity' && <>
                    {r.forecastCategory && <span className="mr-2">{r.forecastCategory}</span>}
                    {r.amount != null && <span className="mr-2">{fmt$(r.amount)}</span>}
                    {r.ownerName && <span>{r.ownerName}</span>}
                  </>}
                  {r.type === 'Account' && <>
                    {r.aovBand && <span className="mr-2">{r.aovBand}</span>}
                    {r.ownerName && <span>{r.ownerName}</span>}
                  </>}
                </p>
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 mt-0.5
                ${r.type === 'Opportunity' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                {r.type === 'Opportunity' ? 'Opp' : 'Acct'}
              </span>
            </button>
          ))}
          {!loading && results.length === 0 && hasAnyFilter(filters) && (
            <p className="px-3 py-2.5 text-xs text-slate-400">No results</p>
          )}
        </div>
      ) : hasAnyFilter(filters) && !loading ? (
        <p className="text-xs text-slate-400 pl-1">No results</p>
      ) : null}
    </div>
  );
}

// ── Main dialog ──────────────────────────────────────────────────────────────
interface LogEventDialogProps {
  events: GCalEvent[];
  onClose: () => void;
}

function fmtEventDate(evt: GCalEvent) {
  const start = evt.start?.dateTime ?? evt.start?.date ?? '';
  const isAllDay = !evt.start?.dateTime;
  return isAllDay
    ? new Date(start + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : new Date(start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function LogEventDialog({ events, onClose }: LogEventDialogProps) {
  const currentUser = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const [seTaskType, setSeTaskType] = useState('Solution Creation');
  const [recordTypeId, setRecordTypeId] = useState(SOLUTIONS_EVENT_RT_ID);

  // Per-event related-to selections and duration overrides
  const [whatByEvent, setWhatByEvent] = useState<Record<string, WhatSelection | null>>({});
  const [durationByEvent, setDurationByEvent] = useState<Record<string, string>>({});
  const [expandedEvent, setExpandedEvent] = useState<string | null>(events.length === 1 ? events[0].id : null);

  const [logResults, setLogResults] = useState<{ event: GCalEvent; status: 'pending' | 'ok' | 'error'; message?: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const { data: rtData } = useQuery({ queryKey: ['event-record-types'], queryFn: () => activitiesApi.recordTypes(), staleTime: 300_000 });
  const recordTypes: { Id: string; Name: string }[] = rtData?.data?.values ?? [];

  const { data: taskTypeData } = useQuery({ queryKey: ['picklist-event-seTaskType'], queryFn: () => metaApi.picklist('Event', 'SE_Task_Type__c'), staleTime: 300_000 });
  const taskTypes: string[] = taskTypeData?.data?.values ?? [];

  function setWhat(eventId: string, val: WhatSelection | null) {
    setWhatByEvent(prev => ({ ...prev, [eventId]: val }));
  }

  function applyToAll(source: WhatSelection | null) {
    const next: Record<string, WhatSelection | null> = {};
    events.forEach(e => { next[e.id] = source; });
    setWhatByEvent(next);
  }

  async function handleSubmit() {
    setSubmitted(true);
    const initial = events.map(e => ({ event: e, status: 'pending' as const }));
    setLogResults(initial);
    const updated = [...initial];

    await Promise.all(events.map(async (evt, i) => {
      try {
        const startDT = evt.start?.dateTime ?? (evt.start?.date ? evt.start.date + 'T00:00:00' : undefined);
        const durationMins = parseInt(durationByEvent[evt.id] ?? '', 10);
        let endDT: string | undefined;
        if (startDT && !isNaN(durationMins) && durationMins > 0) {
          endDT = new Date(new Date(startDT).getTime() + durationMins * 60_000).toISOString();
        } else {
          endDT = evt.end?.dateTime ?? (evt.end?.date ? evt.end.date + 'T23:59:59' : undefined);
        }
        const what = whatByEvent[evt.id];
        await activitiesApi.logEvent({
          subject: evt.summary ?? '(No title)',
          startDateTime: startDT,
          endDateTime: endDT,
          description: evt.description ? evt.description.replace(/<[^>]+>/g, '') : undefined,
          whatId: what?.id || undefined,
          ownerId: currentUser?.id,
          recordTypeId,
          seTaskType,
        });
        updated[i] = { event: evt, status: 'ok' };
      } catch (err: any) {
        updated[i] = { event: evt, status: 'error', message: err.response?.data?.error ?? err.message };
      }
      setLogResults([...updated]);
    }));

    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
  }

  const allDone = submitted && logResults.every(r => r.status !== 'pending');
  const anyError = logResults.some(r => r.status === 'error');

  // Find first assigned what for "apply to all"
  const firstWhat = Object.values(whatByEvent).find(v => v != null) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Log as Salesforce Event</h2>
            <p className="text-xs text-slate-400 mt-0.5">{events.length} event{events.length !== 1 ? 's' : ''} selected</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {!submitted ? (
            <>
              {/* Global fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Record Type</label>
                  <select value={recordTypeId} onChange={e => setRecordTypeId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {recordTypes.map(rt => <option key={rt.Id} value={rt.Id}>{rt.Name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">SE Task Type</label>
                  <select value={seTaskType} onChange={e => setSeTaskType(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Per-event related-to */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Related To — per event</p>
                  {firstWhat && (
                    <button
                      onClick={() => applyToAll(firstWhat)}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <CopyPlus size={11} /> Apply {firstWhat.name} to all
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {events.map(evt => {
                    const isExpanded = expandedEvent === evt.id;
                    const what = whatByEvent[evt.id] ?? null;

                    return (
                      <div key={evt.id} className={`rounded-xl border transition-colors ${isExpanded ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'}`}>
                        {/* Event row */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{evt.summary ?? '(No title)'}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{fmtEventDate(evt)}</p>
                          </div>

                          {/* Inline duration override */}
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min="1"
                              max="480"
                              value={durationByEvent[evt.id] ?? ''}
                              onChange={e => setDurationByEvent(prev => ({ ...prev, [evt.id]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder={(() => {
                                const s = evt.start?.dateTime;
                                const en = evt.end?.dateTime;
                                if (s && en) return String(Math.round((new Date(en).getTime() - new Date(s).getTime()) / 60_000));
                                return '—';
                              })()}
                              className="w-14 h-6 px-1.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-white text-center focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 [appearance:textfield] placeholder:text-slate-300"
                            />
                            <span className="text-[11px] text-slate-400">min</span>
                            {durationByEvent[evt.id] && (() => {
                              const s = evt.start?.dateTime;
                              const mins = parseInt(durationByEvent[evt.id], 10);
                              if (s && !isNaN(mins) && mins > 0) {
                                const end = new Date(new Date(s).getTime() + mins * 60_000);
                                return <span className="text-[11px] text-blue-500 ml-0.5">→ {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>;
                              }
                            })()}
                          </div>

                          {/* Related to chip + expand */}
                          <button
                            onClick={() => setExpandedEvent(isExpanded ? null : evt.id)}
                            className="flex items-center gap-1.5 shrink-0"
                          >
                            {what ? (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                {what.type === 'Opportunity' ? <TrendingUp size={10} /> : <Building2 size={10} />}
                                <span className="max-w-[100px] truncate">{what.name}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">No related</span>
                            )}
                            <span className="text-slate-300">
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </span>
                          </button>
                        </div>

                        {/* Expanded related picker */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3 border-t border-slate-100 pt-3">
                            <RelatedPicker
                              value={what}
                              onChange={v => setWhat(evt.id, v)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Results */
            <div className="space-y-2">
              {logResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border
                  ${r.status === 'ok' ? 'bg-emerald-50 border-emerald-200' :
                    r.status === 'error' ? 'bg-red-50 border-red-200' :
                    'bg-slate-50 border-slate-200'}`}>
                  {r.status === 'pending' && <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />}
                  {r.status === 'ok' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                  {r.status === 'error' && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{r.event.summary ?? '(No title)'}</p>
                    {r.status === 'error' && <p className="text-[11px] text-red-500 mt-0.5">{r.message}</p>}
                    {r.status === 'ok' && <p className="text-[11px] text-emerald-600 mt-0.5">Logged successfully</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
          {!submitted ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmit}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                Log {events.length} Event{events.length !== 1 ? 's' : ''} in Salesforce
              </button>
            </>
          ) : allDone ? (
            <button onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              {anyError ? 'Close' : 'Done'}
            </button>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Logging events…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
