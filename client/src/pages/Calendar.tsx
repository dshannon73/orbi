import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Link2, Link2Off, RefreshCw, Video, LayoutGrid, List, Users, ChevronDown, ChevronUp, CheckCircle2, CloudUpload } from 'lucide-react';
import { LogEventDialog } from '@/components/LogEventDialog';
import { calendarApi } from '@/api';
import { PageHeader } from '@/components/PageHeader';
import { FilterInput } from '@/components/FilterInput';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { usePageFilters } from '@/store/pageFilters';
import { useAuthStore } from '@/store/auth';
import { fmtDateTime } from '@/lib/utils';

const PAGE = 'calendar';

type GCalEvent = Record<string, any>;
type ViewMode = 'grid' | 'list';

export default function Calendar() {
  const pf = usePageFilters();
  const datePreset  = pf.get(PAGE, 'datePreset', 'current_fq');
  const dateFrom    = pf.get(PAGE, 'dateFrom');
  const dateTo      = pf.get(PAGE, 'dateTo');
  const subject     = pf.get(PAGE, 'subject');
  const attendee    = pf.get(PAGE, 'attendee');
  const description = pf.get(PAGE, 'description');
  const set = (key: string) => (v: string) => pf.set(PAGE, key, v);

  const currentUserId = useAuthStore(s => s.user?.id);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showLogged, setShowLogged] = useState(true);
  const [logDialogEvents, setLogDialogEvents] = useState<GCalEvent[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['calendar-status'],
    queryFn: () => calendarApi.status(),
    staleTime: 30_000,
  });
  const connected: boolean = statusData?.data?.connected ?? false;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['calendar-events', datePreset, dateFrom, dateTo, subject, attendee, description],
    queryFn: () => calendarApi.events({
      datePreset,
      dateFrom: datePreset === 'custom' ? dateFrom || undefined : undefined,
      dateTo:   datePreset === 'custom' ? dateTo   || undefined : undefined,
      subject:  subject    || undefined,
      attendee: attendee   || undefined,
      description: description || undefined,
      currentUserId: currentUserId || undefined,
    }),
    enabled: connected,
    staleTime: 2 * 60 * 1000,
  });

  const allEvents: GCalEvent[] = data?.data?.events ?? [];
  const events: GCalEvent[] = showLogged ? allEvents : allEvents.filter(e => !e._loggedInSF);
  const timeMin: string = data?.data?.timeMin ?? '';
  const timeMax: string = data?.data?.timeMax ?? '';

  async function handleDisconnect() {
    await calendarApi.disconnect();
    queryClient.invalidateQueries({ queryKey: ['calendar-status'] });
    queryClient.removeQueries({ queryKey: ['calendar-events'] });
  }

  const allSelected = events.length > 0 && events.every(e => selected.has(e.id));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(events.map(e => e.id)));
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const presetLabel = datePreset.replace(/_/g, ' ');

  function formatTime(start: string, end: string | undefined, isAllDay: boolean) {
    if (isAllDay) return new Date(start + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return fmtDateTime(start) + (end ? ` – ${new Date(end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={connected
          ? `${events.length}${!showLogged ? ` of ${allEvents.length}` : ''} events${timeMin ? ` · ${new Date(timeMin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(timeMax).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
          : 'Google Calendar'}
      />

      {/* Connect banner */}
      {!statusLoading && !connected && (
        <div className="mb-6 flex flex-col items-center justify-center py-16 gap-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <CalendarIcon size={40} className="text-slate-300" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Connect your Google Calendar</p>
            <p className="text-xs text-slate-400 mt-1">Read-only access to your primary calendar</p>
          </div>
          <button
            onClick={() => calendarApi.connect()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Link2 size={15} />
            Connect Google Calendar
          </button>
        </div>
      )}

      {connected && (
        <>
          {/* Filter bar */}
          <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <div className="flex flex-wrap items-end gap-2">
              <DateRangeFilter page={PAGE} defaultPreset="current_fq" />

              <FilterInput value={subject}     onChange={set('subject')}     placeholder="QBR, standup…" label="Subject"     className="w-44" />
              <FilterInput value={attendee}    onChange={set('attendee')}    placeholder="name, email…"  label="Attendee"    className="w-44" />
              <FilterInput value={description} onChange={set('description')} placeholder="keyword…"      label="Description" className="w-44" />

              <div className="ml-auto flex items-center gap-2">
                {/* Show logged toggle */}
                <button
                  onClick={() => setShowLogged(v => !v)}
                  className={`flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md border transition-colors font-medium
                    ${showLogged
                      ? 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                      : 'bg-emerald-500 border-emerald-500 text-white'}`}
                  title={showLogged ? 'Hide events already logged in SF' : 'Show all events'}
                >
                  <CheckCircle2 size={12} />
                  {showLogged ? 'Hide Logged' : 'Show All'}
                </button>

                {/* View toggle */}
                <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`h-8 px-2.5 flex items-center transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title="List view"
                  >
                    <List size={13} />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`h-8 px-2.5 flex items-center border-l border-slate-200 transition-colors ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title="Grid view"
                  >
                    <LayoutGrid size={13} />
                  </button>
                </div>

                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['calendar-events'] })}
                  className="h-8 px-2 text-slate-400 hover:text-slate-700 rounded-md border border-slate-200 hover:bg-slate-50"
                  title="Refresh"
                >
                  <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 h-8 px-2.5 text-xs text-slate-400 hover:text-red-600 rounded-md border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-colors"
                >
                  <Link2Off size={12} /> Disconnect
                </button>
              </div>
            </div>
          </div>

          {/* Selection action bar */}
          {events.length > 0 && !isLoading && (
            <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
              />
              <span className="cursor-pointer hover:text-slate-900" onClick={toggleSelectAll}>
                {allSelected ? 'Deselect all' : 'Select all'} ({events.length})
              </span>
              {someSelected && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-blue-600 font-medium">{selected.size} selected</span>
                  <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-slate-700 hover:underline">Clear</button>
                  <button
                    onClick={() => setLogDialogEvents(events.filter(e => selected.has(e.id)))}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors"
                  >
                    <CloudUpload size={12} /> Log in Salesforce
                  </button>
                </>
              )}
            </div>
          )}

          {logDialogEvents && (
            <LogEventDialog
              events={logDialogEvents}
              onClose={() => { setLogDialogEvents(null); setSelected(new Set()); }}
            />
          )}

          {/* Event content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading events…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-500">{(error as any).response?.data?.error ?? 'Failed to load events'}</div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <CalendarIcon size={32} className="opacity-30" />
              <p className="text-sm">No events found for {presetLabel}</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* ── GRID VIEW ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {events.map((evt) => {
                const isChecked = selected.has(evt.id);
                const start = evt.start?.dateTime ?? evt.start?.date;
                const end   = evt.end?.dateTime   ?? evt.end?.date;
                const attendees: any[] = evt.attendees ?? [];
                const isAllDay = !evt.start?.dateTime;

                return (
                  <div
                    key={evt.id}
                    className={`relative rounded-xl border shadow-sm flex flex-col gap-2 p-4 transition-colors
                      ${evt._loggedInSF ? 'bg-slate-100/80 border-slate-300 opacity-35 hover:opacity-100' : 'bg-white border-slate-200 hover:border-slate-300'}
                      ${isChecked ? '!border-blue-400 !bg-blue-50/30 !opacity-100' : ''}`}
                  >
                    <div className="absolute top-3 right-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(evt.id)}
                        className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-start gap-2 pr-5">
                      <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: '#4285F4' }} />
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{evt.summary ?? '(No title)'}</p>
                    </div>

                    {evt._loggedInSF && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 px-2 py-0.5 rounded-full shadow-sm w-fit">
                        <CheckCircle2 size={11} /> Logged in SF
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">{formatTime(start, end, isAllDay)}</p>
                    </div>

                    {evt.location && <p className="text-xs text-slate-400 truncate">{evt.location}</p>}

                    {attendees.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {attendees.slice(0, 5).map((a: any, i: number) => (
                          <span key={i} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium
                            ${a.self ? 'bg-blue-100 text-blue-700' :
                              a.responseStatus === 'accepted' ? 'bg-emerald-50 text-emerald-700' :
                              a.responseStatus === 'declined' ? 'bg-red-50 text-red-400 line-through' :
                              'bg-slate-100 text-slate-500'}`}>
                            {a.displayName ?? a.email?.split('@')[0]}
                          </span>
                        ))}
                        {attendees.length > 5 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-400">
                            +{attendees.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {evt.description && (
                      <p className="text-xs text-slate-500 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: evt.description.replace(/<[^>]+>/g, '') }} />
                    )}

                    <div className="flex items-center gap-3 mt-auto pt-1">
                      {evt._sfEventUrl && (
                        <a href={evt._sfEventUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800">
                          <CheckCircle2 size={11} /> View in SF
                        </a>
                      )}
                      {evt.htmlLink && (
                        <a href={evt.htmlLink} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 underline">Calendar</a>
                      )}
                      {evt.hangoutLink && (
                        <a href={evt.hangoutLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
                          <Video size={11} /> Meet
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── LIST VIEW ── */
            <div className="space-y-1.5">
              {events.map((evt) => {
                const isExpanded = expanded === evt.id;
                const isChecked = selected.has(evt.id);
                const start = evt.start?.dateTime ?? evt.start?.date;
                const end   = evt.end?.dateTime   ?? evt.end?.date;
                const attendees: any[] = evt.attendees ?? [];
                const isAllDay = !evt.start?.dateTime;

                return (
                  <div key={evt.id} className={`rounded-xl border shadow-sm overflow-hidden transition-colors
                    ${evt._loggedInSF ? 'bg-slate-100/80 border-slate-300 opacity-35 hover:opacity-100' : 'bg-white border-slate-200'}
                    ${isChecked ? '!border-blue-400 !bg-blue-50/20 !opacity-100' : ''}`}>
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(evt.id)}
                        className="mt-1 w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer shrink-0"
                      />

                      {/* Color dot */}
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#4285F4' }} />

                      {/* Content */}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : evt.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{evt.summary ?? '(No title)'}</span>
                          {evt._loggedInSF && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 px-2 py-0.5 rounded-full shadow-sm">
                              <CheckCircle2 size={11} /> Logged in SF
                            </span>
                          )}
                          {evt.location && <span className="text-xs text-slate-400 truncate">{evt.location}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500">{formatTime(start, end, isAllDay)}</span>
                          {attendees.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Users size={11} /> {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {evt.hangoutLink && (
                            <a href={evt.hangoutLink} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-blue-500 hover:text-blue-700">Meet</a>
                          )}
                        </div>
                      </button>

                      <button onClick={() => setExpanded(isExpanded ? null : evt.id)} className="text-slate-300 hover:text-slate-500 shrink-0 mt-1">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-10 pb-4 pt-0 border-t border-slate-100 space-y-3 bg-slate-50/50">
                        {attendees.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5 mt-3">Attendees</p>
                            <div className="flex flex-wrap gap-1.5">
                              {attendees.map((a: any, i: number) => (
                                <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                  ${a.self ? 'bg-blue-100 text-blue-700' :
                                    a.responseStatus === 'accepted' ? 'bg-emerald-50 text-emerald-700' :
                                    a.responseStatus === 'declined' ? 'bg-red-50 text-red-500 line-through' :
                                    'bg-slate-100 text-slate-600'}`}>
                                  {a.displayName ?? a.email}
                                  {a.organizer && <span className="opacity-60 ml-0.5">(org)</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {evt.description && (
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Description</p>
                            <p className="text-xs text-slate-600 whitespace-pre-wrap"
                              dangerouslySetInnerHTML={{ __html: evt.description.replace(/<[^>]+>/g, '') }} />
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          {evt._sfEventUrl && (
                            <a href={evt._sfEventUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 underline">
                              <CheckCircle2 size={11} /> View in Salesforce
                            </a>
                          )}
                          {evt.htmlLink && (
                            <a href={evt.htmlLink} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 underline">Open in Google Calendar</a>
                          )}
                          {evt.hangoutLink && (
                            <a href={evt.hangoutLink} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 underline">Join Google Meet</a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
