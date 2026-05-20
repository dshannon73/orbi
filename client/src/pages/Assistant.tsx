import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, Circle, AlertTriangle, Send, CalendarDays,
  Building2, Clock, PlusCircle, LogIn, Search, X, LayoutList, Layers,
} from 'lucide-react';
import { assistantApi, activitiesApi, calendarApi, metaApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { usePageFilters } from '@/store/pageFilters';
import {
  useAssistantFilters,
  type CalEvent, type LoggedCalEvent, type RankedOpp, type DCGap,
  type AccountGroup, type UnmatchedEvent, type BriefingResult,
} from '@/store/assistant';
import { useUserPrefs } from '@/store/userPrefs';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { Button } from '@/components/ui/button';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (!n) return '';
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;
}

function fmtDate(s: string) {
  if (!s) return '';
  return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtDateTime(dt: string) {
  if (!dt) return '';
  return new Date(dt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(mins: number) {
  if (!mins) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const FC_COLOR: Record<string, string> = {
  Commit: 'bg-emerald-100 text-emerald-700',
  'Best Case': 'bg-blue-100 text-blue-700',
  Pipeline: 'bg-slate-100 text-slate-600',
};

const PRIORITY_COLOR: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function OppPicker({ opps, selectedOppId, accountId, accountName, parentAccountId, parentAccountName, mostEngagedAccountId, mostEngagedAccountName, onChange }: {
  opps: RankedOpp[];
  selectedOppId: string | null;
  accountId: string;
  accountName: string;
  parentAccountId: string | null;
  parentAccountName: string | null;
  mostEngagedAccountId: string | null;
  mostEngagedAccountName: string | null;
  onChange: (id: string | null) => void;
}) {
  const ACCOUNT_SENTINEL  = `ACCOUNT:${accountId}`;
  const PARENT_SENTINEL   = parentAccountId ? `ACCOUNT:${parentAccountId}` : null;
  const ENGAGED_SENTINEL  = mostEngagedAccountId ? `ACCOUNT:${mostEngagedAccountId}` : null;
  const isAccountOnly  = selectedOppId === ACCOUNT_SENTINEL;
  const isParentOnly   = !!PARENT_SENTINEL && selectedOppId === PARENT_SENTINEL;
  const isEngagedOnly  = !!ENGAGED_SENTINEL && selectedOppId === ENGAGED_SENTINEL;

  function accountRow(id: string, name: string, sentinel: string, selected: boolean, label: string) {
    return (
      <button
        key={sentinel}
        onClick={() => onChange(selected ? null : sentinel)}
        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors text-xs ${
          selected ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          {selected
            ? <CheckCircle2 size={12} className="text-purple-600 shrink-0" />
            : <Circle size={12} className="text-slate-300 shrink-0" />}
          <Building2 size={11} className={selected ? 'text-purple-400 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className={`flex-1 truncate ${selected ? 'font-medium text-purple-800' : 'font-medium text-slate-700'}`}>{name}</span>
          <span className="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded font-medium shrink-0">{label}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Log against</p>

      {accountRow(accountId, accountName, ACCOUNT_SENTINEL, isAccountOnly, 'Account')}
      {PARENT_SENTINEL && parentAccountName && parentAccountName !== accountName &&
        accountRow(parentAccountId!, parentAccountName, PARENT_SENTINEL, isParentOnly, 'Global parent')
      }
      {ENGAGED_SENTINEL && mostEngagedAccountName &&
        mostEngagedAccountId !== accountId &&
        mostEngagedAccountId !== parentAccountId &&
        accountRow(mostEngagedAccountId!, mostEngagedAccountName, ENGAGED_SENTINEL, isEngagedOnly, 'Most engaged')
      }

      {opps.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic px-1">No open opportunities for this account.</p>
      ) : opps.slice(0, 5).map((o, idx) => {
        const isSelected = selectedOppId === o.oppId;
        const isTop = idx === 0;
        return (
          <div key={o.oppId} className="relative group">
            <button
              onClick={() => onChange(isSelected ? null : o.oppId)}
              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors text-xs ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : isTop
                  ? 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 bg-slate-50/50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {isSelected
                  ? <CheckCircle2 size={12} className="text-blue-600 shrink-0" />
                  : <Circle size={12} className="text-slate-300 shrink-0" />}
                <span className="font-medium text-slate-800 flex-1 truncate">{o.oppName}</span>
                {isTop && !isSelected && (
                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-semibold shrink-0">TOP</span>
                )}
                {o.amount != null && <span className="text-slate-600 font-medium shrink-0">{fmt$(o.amount)}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 pl-5 flex-wrap">
                <span className="text-slate-500">{o.stage}</span>
                {o.forecastCategory && (
                  <span className={`text-[10px] px-1 rounded font-medium ${FC_COLOR[o.forecastCategory] ?? 'bg-slate-100 text-slate-600'}`}>
                    {o.forecastCategory}
                  </span>
                )}
                <span className="text-slate-400">Close {fmtDate(o.closeDate)}</span>
                <span className="text-slate-400">AE: {o.aeOwner}</span>
                {o.aeOwnerRole && <span className="text-slate-400 italic">{o.aeOwnerRole}</span>}
                {o.hasMyDC && <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded font-medium">My DC</span>}
                {o.hasTeamDC && !o.hasMyDC && <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded font-medium">Team DC</span>}
                {o.hasMyActivity && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded font-medium">Logged</span>}
                {o.teamDCMembers.length > 0 && (
                  <span className="text-[10px] text-orange-600">{o.teamDCMembers.join(', ')}</span>
                )}
              </div>
              {o.rankReasons.length > 0 && (
                <div className="flex items-center gap-1 mt-1 pl-5 flex-wrap">
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Why:</span>
                  {o.rankReasons.map(r => (
                    <span key={r} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{r}</span>
                  ))}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface ExecResult { type: string; name: string; action: string }

function ExecuteResults({ results }: { results: ExecResult[] }) {
  return (
    <ul className="space-y-1 mt-3">
      {results.map((r, i) => {
        const isErr = r.action.startsWith('error');
        return (
          <li key={i} className={`flex items-center justify-between text-xs rounded-lg px-3 py-1.5 ${isErr ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            <span className="truncate flex-1">{r.name}</span>
            <span className="ml-2 font-medium shrink-0">{isErr ? r.action : `✓ ${r.action}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE = 'assistant';

export default function Assistant() {
  const currentUser = useAuthStore(s => s.user);
  const { defaultRecordTypeId, defaultSeTaskType } = useUserPrefs();
  const [searchParams, setSearchParams] = useSearchParams();

  const [calConnected, setCalConnected] = useState<boolean | null>(null);
  useEffect(() => {
    calendarApi.status().then(r => setCalConnected(r.data.connected)).catch(() => setCalConnected(false));
  }, []);

  useEffect(() => {
    if (searchParams.get('autorun') === '1') setSearchParams({}, { replace: true });
  }, []);

  const pf = usePageFilters();
  const datePreset = pf.get(PAGE, 'datePreset', 'last_30');
  const customFrom = pf.get(PAGE, 'dateFrom');
  const customTo   = pf.get(PAGE, 'dateTo');

  const {
    accountScope, setAccountScope, calExclude, setCalExclude, roleFilter, setRoleFilter,
    briefingStatus, setBriefingStatus,
    briefingResult: result, setBriefingResult: setBriefingResultStore,
    resultTab, setResultTab,
    selectedEvents: selectedEventsArr, setSelectedEvents: setSelectedEventsArr,
    selectedDCs: selectedDCsArr, setSelectedDCs: setSelectedDCsArr,
    unmatchedSelected: unmatchedSelectedArr, setUnmatchedSelected: setUnmatchedSelectedArr,
    loggedEventKeys: loggedEventKeysArr, setLoggedEventKeys: setLoggedEventKeysArr,
    loggedDCKeys: loggedDCKeysArr, setLoggedDCKeys: setLoggedDCKeysArr,
    loggedUnmatchedKeys: loggedUnmatchedKeysArr, setLoggedUnmatchedKeys: setLoggedUnmatchedKeysArr,
    eventOppMap, setEventOppMap,
    eventDurationMap, setEventDurationMap,
    dcSplit, setDcSplit,
    unmatchedWhatIdMap, setUnmatchedWhatIdMap,
    taskTypeOverrides, setTaskTypeOverrides,
    globalTaskType, setGlobalTaskType,
    resetBriefing,
  } = useAssistantFilters();

  // Convert arrays ↔ Sets for component consumption
  const selectedEvents = new Set(selectedEventsArr);
  const selectedDCs = new Set(selectedDCsArr);
  const unmatchedSelected = new Set(unmatchedSelectedArr);
  const loggedEventKeys = new Set(loggedEventKeysArr);
  const loggedDCKeys = new Set(loggedDCKeysArr);
  const loggedUnmatchedKeys = new Set(loggedUnmatchedKeysArr);

  const setSelectedEvents = (fn: (prev: Set<string>) => Set<string>) =>
    setSelectedEventsArr([...fn(new Set(selectedEventsArr))]);
  const setSelectedDCs = (fn: (prev: Set<string>) => Set<string>) =>
    setSelectedDCsArr([...fn(new Set(selectedDCsArr))]);
  const setUnmatchedSelected = (fn: (prev: Set<string>) => Set<string>) =>
    setUnmatchedSelectedArr([...fn(new Set(unmatchedSelectedArr))]);
  const setLoggedEventKeys = (fn: (prev: Set<string>) => Set<string> | string[]) => {
    const r = fn(new Set(loggedEventKeysArr));
    setLoggedEventKeysArr([...(r instanceof Set ? r : r)]);
  };
  const setLoggedDCKeys = (fn: (prev: Set<string>) => Set<string>) =>
    setLoggedDCKeysArr([...fn(new Set(loggedDCKeysArr))]);
  const setLoggedUnmatchedKeys = (fn: (prev: Set<string>) => Set<string>) =>
    setLoggedUnmatchedKeysArr([...fn(new Set(loggedUnmatchedKeysArr))]);

  // Wrap map setters to match functional update signature used in subcomponents
  const wrappedSetEventOppMap = (fn: (prev: Record<string, string | null>) => Record<string, string | null>) =>
    setEventOppMap(fn(eventOppMap));
  const wrappedSetEventDurationMap = (fn: (prev: Record<string, string>) => Record<string, string>) =>
    setEventDurationMap(fn(eventDurationMap));
  const wrappedSetDcSplit = (fn: (prev: Record<string, string>) => Record<string, string>) =>
    setDcSplit(fn(dcSplit));
  const wrappedSetUnmatchedWhatIdMap = (fn: (prev: Record<string, string | null>) => Record<string, string | null>) =>
    setUnmatchedWhatIdMap(fn(unmatchedWhatIdMap));
  const wrappedSetTaskTypeOverrides = (fn: (prev: Record<string, string>) => Record<string, string>) =>
    setTaskTypeOverrides(fn(taskTypeOverrides));

  // status: 'loading' is transient (page reload mid-run = idle), others persist
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    briefingStatus === 'done' || briefingStatus === 'error' ? briefingStatus : 'idle'
  );


  // UI-only state — not persisted
  const [error, setError] = useState('');
  const [progressLog, setProgressLog] = useState<{ step: string; message: string; debug?: boolean }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [llmIO, setLlmIO] = useState<{ pass: string; input: { system: string; user: string }; output: string }[]>([]);
  const [showLlmIO, setShowLlmIO] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execResults, setExecResults] = useState<ExecResult[] | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [unmatchedView, setUnmatchedView] = useState<'grouped' | 'list'>('grouped');
  const [unmatchedSort, setUnmatchedSort] = useState<'date' | 'duration' | 'title'>('date');
  const [dcSearch, setDcSearch] = useState('');
  const [activitiesSearch, setActivitiesSearch] = useState('');
  const [otherSearch, setOtherSearch] = useState('');

  // picklist values fetched once
  const [seTaskTypes, setSeTaskTypes] = useState<string[]>([]);
  useEffect(() => {
    metaApi.picklist('Event', 'SE_Task_Type__c').then(r => setSeTaskTypes(r.data?.values ?? [])).catch(() => {});
  }, []);

  async function handleRun() {
    if (!currentUser?.id) return;
    const { from, to } = resolveDateRange(datePreset, customFrom, customTo);
    if (!from || !to) return;

    setStatus('loading');
    setConfirmRegenerate(false);
    resetBriefing();
    setError('');
    setProgressLog([]);
    setLlmIO([]);
    setShowConsole(true);
    setExecResults(null);

    try {
      await assistantApi.briefing(
        {
          currentUserId: currentUser.id,
          dateFrom: from, dateTo: to,
          accountScope: accountScope.trim() || undefined,
          calExclude: calExclude.trim() || undefined,
          roleFilter: roleFilter.trim() || undefined,
        },
        (event) => {
          if (event.type === 'llm_io') {
            setLlmIO(prev => [...prev, { pass: event.pass, input: event.input, output: event.output }]);
          } else if (event.type === 'debug') {
            setProgressLog(prev => [...prev, { step: 'debug', message: event.message, debug: true }]);
          } else if (event.type === 'progress') {
            setProgressLog(prev => [...prev, { step: event.step, message: event.message }]);
          } else if (event.type === 'result') {
            const data = event as any as BriefingResult & { type: string };
            setBriefingResultStore(data);
            setShowConsole(false);

            // Default: select all unlogged events that matched an account
            const initSelected = new Set<string>();
            const initOppMap: Record<string, string | null> = {};
            const initDuration: Record<string, string> = {};
            const initSplit: Record<string, string> = {};
            const initDCSelected = new Set<string>();

            data.accountGroups.forEach(g => {
              // Default account: most-engaged sibling if present, else the matched account
              const defaultAccountId = g.mostEngagedAccountId ?? g.accountId;
              // Default opp: first opp that has a team DC (most DC activity), else top ranked
              const defaultOpp = g.rankedOpps.find(o => o.hasTeamDC || o.hasMyDC) ?? g.rankedOpps[0];

              g.unloggedEvents.forEach(e => {
                const key = `${g.accountId}:${e.id}`;
                initSelected.add(key);
                initOppMap[key] = defaultOpp ? defaultOpp.oppId : `ACCOUNT:${defaultAccountId}`;
                if (e.durationMins) initDuration[key] = String(e.durationMins);
              });
              g.dcGaps.forEach(d => {
                initDCSelected.add(d.oppId);
                initSplit[d.oppId] = String(d.suggestedSplitPct);
              });
            });

            setSelectedEventsArr([...initSelected]);
            setEventOppMap(initOppMap);
            setEventDurationMap(initDuration);
            setSelectedDCsArr([...initDCSelected]);
            setDcSplit(initSplit);
            setBriefingStatus('done');
            setStatus('done');
          } else if (event.type === 'error') {
            setError(event.error ?? 'Unknown error');
            setBriefingStatus('error');
            setStatus('error');
          }
        }
      );
    } catch (e: any) {
      setError(e.message ?? 'Request failed');
      setBriefingStatus('error');
      setStatus('error');
    }
  }

  async function handleExecute() {
    if (!currentUser?.id || !result) return;
    setExecuting(true);
    setExecResults(null);

    const activities: any[] = [];
    result.accountGroups.forEach(g => {
      if (!visibleActivityGroupIds.has(g.accountId)) return;
      g.unloggedEvents.forEach(e => {
        const key = `${g.accountId}:${e.id}`;
        if (!selectedEvents.has(key) || loggedEventKeys.has(key)) return;
        const oppId = eventOppMap[key] ?? null;
        const durationMins = eventDurationMap[key] ? Number(eventDurationMap[key]) : e.durationMins;
        const seTaskType = taskTypeOverrides[e.id] || e.suggestedTaskType || globalTaskType || defaultSeTaskType || '';
        activities.push({
          summary: e.summary,
          startDateTime: e.startDateTime,
          endDateTime: e.endDateTime,
          durationMins,
          whatId: oppId,
          seTaskType: seTaskType || undefined,
          recordTypeId: defaultRecordTypeId || undefined,
        });
      });
    });

    const dcs = result.accountGroups
      .flatMap(g => g.dcGaps)
      .filter(d => selectedDCs.has(d.oppId) && visibleDCOppIds.has(d.oppId))
      .map(d => ({
        oppId: d.oppId,
        role: d.suggestedRole,
        splitPct: Number(dcSplit[d.oppId] ?? d.suggestedSplitPct),
      }));

    try {
      const resp = await assistantApi.execute({ currentUserId: currentUser.id, activities, dcs });
      setExecResults(resp.data.results);
    } catch (e: any) {
      setExecResults([{ type: 'error', name: 'Execute', action: 'error: ' + (e.response?.data?.error ?? e.message) }]);
    }
    setExecuting(false);
  }

  function buildActivity(g: AccountGroup, e: CalEvent) {
    const key = `${g.accountId}:${e.id}`;
    const rawId = eventOppMap[key] ?? null;
    const whatId = rawId?.startsWith('ACCOUNT:') ? rawId.slice(8) : rawId;
    return {
      summary: e.summary,
      startDateTime: e.startDateTime,
      endDateTime: e.endDateTime,
      durationMins: eventDurationMap[key] ? Number(eventDurationMap[key]) : e.durationMins,
      whatId,
      seTaskType: (taskTypeOverrides[e.id] || e.suggestedTaskType || globalTaskType || defaultSeTaskType) || undefined,
      recordTypeId: defaultRecordTypeId || undefined,
    };
  }

  async function handleLogOne(g: AccountGroup, e: CalEvent) {
    if (!currentUser?.id) return;
    const key = `${g.accountId}:${e.id}`;
    try {
      await assistantApi.execute({ currentUserId: currentUser.id, activities: [buildActivity(g, e)], dcs: [] });
      setLoggedEventKeys(prev => new Set([...prev, key]));
    } catch { /* silent — user can retry */ }
  }

  async function handleLogGroup(g: AccountGroup) {
    if (!currentUser?.id) return;
    const toLog = g.unloggedEvents.filter(e => {
      const key = `${g.accountId}:${e.id}`;
      return selectedEvents.has(key) && !loggedEventKeys.has(key);
    });
    if (toLog.length === 0) return;
    try {
      await assistantApi.execute({ currentUserId: currentUser.id, activities: toLog.map(e => buildActivity(g, e)), dcs: [] });
      setLoggedEventKeys(prev => new Set([...prev, ...toLog.map(e => `${g.accountId}:${e.id}`)]));
    } catch { /* silent */ }
  }

  async function handleLogOneDC(d: DCGap) {
    if (!currentUser?.id) return;
    try {
      await assistantApi.execute({
        currentUserId: currentUser.id, activities: [],
        dcs: [{ oppId: d.oppId, role: d.suggestedRole, splitPct: Number(dcSplit[d.oppId] ?? d.suggestedSplitPct) }],
      });
      setLoggedDCKeys(prev => new Set([...prev, d.oppId]));
    } catch { /* silent */ }
  }

  async function handleLogGroupDCs(gaps: DCGap[]) {
    if (!currentUser?.id) return;
    const toLog = gaps.filter(d => selectedDCs.has(d.oppId) && !loggedDCKeys.has(d.oppId));
    if (toLog.length === 0) return;
    try {
      await assistantApi.execute({
        currentUserId: currentUser.id, activities: [],
        dcs: toLog.map(d => ({ oppId: d.oppId, role: d.suggestedRole, splitPct: Number(dcSplit[d.oppId] ?? d.suggestedSplitPct) })),
      });
      setLoggedDCKeys(prev => new Set([...prev, ...toLog.map(d => d.oppId)]));
    } catch { /* silent */ }
  }

  async function handleLogOneUnmatched(e: UnmatchedEvent) {
    if (!currentUser?.id) return;
    const rawId = unmatchedWhatIdMap[e.id] ?? null;
    const whatId = rawId?.startsWith('ACCOUNT:') ? rawId.slice(8) : rawId;
    const seTaskType = taskTypeOverrides[e.id] || e.suggestedTaskType || defaultSeTaskType || '';
    try {
      await assistantApi.execute({ currentUserId: currentUser.id, activities: [{
        summary: e.summary, startDateTime: e.startDateTime,
        endDateTime: e.startDateTime, durationMins: e.durationMins,
        whatId: whatId || undefined, seTaskType: seTaskType || undefined,
        recordTypeId: defaultRecordTypeId || undefined,
      }], dcs: [] });
      setLoggedUnmatchedKeys(prev => new Set([...prev, e.id]));
    } catch { /* silent */ }
  }

  async function handleLogGroupUnmatched(events: UnmatchedEvent[]) {
    if (!currentUser?.id) return;
    const toLog = events.filter(e => unmatchedSelected.has(e.id) && !loggedUnmatchedKeys.has(e.id));
    if (toLog.length === 0) return;
    try {
      await assistantApi.execute({ currentUserId: currentUser.id, activities: toLog.map(e => {
        const rawId = unmatchedWhatIdMap[e.id] ?? null;
        const whatId = rawId?.startsWith('ACCOUNT:') ? rawId.slice(8) : rawId;
        const seTaskType = taskTypeOverrides[e.id] || e.suggestedTaskType || defaultSeTaskType || '';
        return { summary: e.summary, startDateTime: e.startDateTime,
          endDateTime: e.startDateTime, durationMins: e.durationMins,
          whatId: whatId || undefined, seTaskType: seTaskType || undefined,
          recordTypeId: defaultRecordTypeId || undefined };
      }), dcs: [] });
      setLoggedUnmatchedKeys(prev => new Set([...prev, ...toLog.map(e => e.id)]));
    } catch { /* silent */ }
  }

  const allDCGaps = result?.accountGroups.flatMap(g => g.dcGaps) ?? [];

  // Compute visible sets for each tab so counts + "apply to all" only touch visible records
  const visibleActivityGroupIds = (() => {
    if (!result) return new Set<string>();
    const q = activitiesSearch.trim().toLowerCase();
    if (!q) return new Set(result.accountGroups.filter(g => g.unloggedEvents.length > 0).map(g => g.accountId));
    return new Set(
      result.accountGroups.filter(g => {
        if (g.unloggedEvents.length === 0) return false;
        if ((g.accountName ?? '').toLowerCase().includes(q)) return true;
        if ((g.parentAccountName ?? '').toLowerCase().includes(q)) return true;
        if ((g.accountOwnerName ?? '').toLowerCase().includes(q)) return true;
        if ([...g.unloggedEvents, ...g.loggedEvents].some(e =>
          (e.summary ?? '').toLowerCase().includes(q) ||
          ((e as any).attendeeNames ?? []).some((n: string) => n.toLowerCase().includes(q))
        )) return true;
        if (g.rankedOpps.some(o =>
          (o.oppName ?? '').toLowerCase().includes(q) ||
          (o.aeOwner ?? '').toLowerCase().includes(q) ||
          (o.teamDCMembers ?? []).some((n: string) => n.toLowerCase().includes(q))
        )) return true;
        return false;
      }).map(g => g.accountId)
    );
  })();

  const visibleDCOppIds = (() => {
    if (!result) return new Set<string>();
    const q = dcSearch.trim().toLowerCase();
    if (!q) return new Set(allDCGaps.map(d => d.oppId));
    return new Set(
      allDCGaps.filter(d =>
        (d.oppName ?? '').toLowerCase().includes(q) ||
        (d.accountName ?? '').toLowerCase().includes(q) ||
        (d.parentAccountName ?? '').toLowerCase().includes(q) ||
        (d.aeOwner ?? '').toLowerCase().includes(q) ||
        (d.aeOwnerRole ?? '').toLowerCase().includes(q) ||
        (d.forecastCategory ?? '').toLowerCase().includes(q) ||
        (d.stage ?? '').toLowerCase().includes(q) ||
        (d.teamDCAttendees ?? []).some(n => n.toLowerCase().includes(q)) ||
        (d.dcReasons ?? []).some(r => r.toLowerCase().includes(q))
      ).map(d => d.oppId)
    );
  })();

  const visibleUnmatchedIds = (() => {
    if (!result) return new Set<string>();
    const q = otherSearch.trim().toLowerCase();
    if (!q) return new Set(result.unmatchedEvents.map(e => e.id));
    return new Set(
      result.unmatchedEvents.filter(e =>
        (e.summary ?? '').toLowerCase().includes(q) ||
        (e.suggestedGroup ?? '').toLowerCase().includes(q) ||
        (e.suggestedTaskType ?? '').toLowerCase().includes(q) ||
        (e.attendeeNames ?? []).some(n => n.toLowerCase().includes(q))
      ).map(e => e.id)
    );
  })();

  // Visible activity keys = keys belonging to visible account groups
  const visibleActivityKeys = (() => {
    if (!result) return new Set<string>();
    const keys = new Set<string>();
    result.accountGroups
      .filter(g => visibleActivityGroupIds.has(g.accountId))
      .forEach(g => g.unloggedEvents.forEach(e => keys.add(`${g.accountId}:${e.id}`)));
    return keys;
  })();

  const totalSelectedActs = [...selectedEvents].filter(k => visibleActivityKeys.has(k) && !loggedEventKeys.has(k)).length;
  const totalSelectedDCs  = [...selectedDCs].filter(k => visibleDCOppIds.has(k)).length;
  const totalSelectedOther = [...(result?.unmatchedEvents.map(e => e.id) ?? [])].filter(id => visibleUnmatchedIds.has(id) && unmatchedSelected.has(id) && !loggedUnmatchedKeys.has(id)).length;
  const totalSelected = totalSelectedActs + totalSelectedDCs + totalSelectedOther;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles size={18} className="text-blue-500" />
          Orbi Agent
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Groups your calendar events by account, surfaces DC gaps, and lets you log everything in one pass.
        </p>
      </div>

      {/* Calendar auth banner */}
      {calConnected === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <CalendarDays size={20} className="text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Google Calendar not connected</p>
            <p className="text-xs text-amber-600 mt-0.5">Connect your calendar so Orbi can analyse your meetings.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => calendarApi.connect(`${window.location.origin}/assistant`)}>
            Connect Calendar
          </Button>
        </div>
      )}

      {/* Inputs */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm space-y-3">
        {/* Row 1: timeframe + button */}
        <div className="flex items-end gap-3">
          <DateRangeFilter page={PAGE} defaultPreset="last_30" label="Timeframe" />
          <div className="flex-1" />
          {calConnected === false ? (
            <button
              onClick={() => calendarApi.connect(`${window.location.origin}/assistant`)}
              className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <CalendarDays size={13} /> Connect Calendar
            </button>
          ) : confirmRegenerate ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500">Overwrite current briefing?</span>
              <button
                onClick={() => { setConfirmRegenerate(false); handleRun(); }}
                className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={() => setConfirmRegenerate(false)}
                className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button variant="primary" size="sm"
              onClick={() => status === 'done' || status === 'error' ? setConfirmRegenerate(true) : handleRun()}
              className="shrink-0 h-8"
              disabled={status === 'loading' || !currentUser?.id || calConnected === null || (datePreset === 'custom' && (!customFrom || !customTo))}>
              {status === 'loading'
                ? <><Loader2 size={13} className="animate-spin" /> Analyzing…</>
                : calConnected === null
                ? <><Loader2 size={13} className="animate-spin" /></>
                : <><Sparkles size={13} /> Generate Briefing</>}
            </Button>
          )}
        </div>
        {/* Row 2: text filters */}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Role Filter</span>
            <input type="text" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              placeholder="e.g. PACE, AMER AE"
              className="h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 w-full" />
          </div>
          <div className="flex flex-col gap-0.5 flex-[2] min-w-0">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Account / Opp Scope <span className="normal-case font-normal text-slate-300">· — to exclude</span></span>
            <input type="text" value={accountScope} onChange={e => setAccountScope(e.target.value)}
              placeholder="e.g. Westrock, Emerson, -Internal"
              className="h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 w-full" />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Cal Exclude</span>
            <input type="text" value={calExclude} onChange={e => setCalExclude(e.target.value)}
              placeholder={`e.g. -"Block gen",-standup`}
              className="h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 w-full" />
          </div>
        </div>
      </div>

      {status === 'error' && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">{error}</div>
      )}

      {/* Progress log */}
      {(status === 'loading' || (status === 'done' && showConsole)) && (
        <div className="bg-slate-900 rounded-2xl px-5 py-4 space-y-1 shadow-sm">
          {progressLog.filter(p => showDebug || !p.debug).map((p, i) => {
            const visibleLog = progressLog.filter(x => showDebug || !x.debug);
            const isLast = i === visibleLog.length - 1;
            if (p.debug) return (
              <div key={i} className="flex items-start gap-2 pl-3">
                <span className="text-slate-600 shrink-0 mt-0.5">›</span>
                <span className="text-[10px] text-slate-500 font-mono">{p.message}</span>
              </div>
            );
            return (
              <div key={i} className="flex items-center gap-2.5">
                {status === 'loading' && isLast
                  ? <Loader2 size={11} className="text-blue-400 animate-spin shrink-0" />
                  : <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
                <span className={`text-xs ${isLast && status === 'loading' ? 'text-slate-200' : 'text-slate-400'}`}>{p.message}</span>
              </div>
            );
          })}
          {status === 'loading' && progressLog.filter(p => !p.debug).length === 0 && (
            <div className="flex items-center gap-2.5">
              <Loader2 size={11} className="text-blue-400 animate-spin shrink-0" />
              <span className="text-xs text-slate-200">Starting…</span>
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => setShowDebug(v => !v)} className="text-[10px] text-slate-600 hover:text-slate-400">
              {showDebug ? 'Hide debug' : 'Show debug'}
            </button>
            <button onClick={() => setShowConsole(false)} className="text-[10px] text-slate-600 hover:text-slate-400 ml-auto">
              Hide ✕
            </button>
          </div>
        </div>
      )}

      {/* LLM I/O panel */}
      {llmIO.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-900 transition-colors"
            onClick={() => setShowLlmIO(v => !v)}
          >
            <span className="text-[11px] font-mono text-slate-400">LLM I/O ({llmIO.length} call{llmIO.length !== 1 ? 's' : ''})</span>
            <span className="text-[10px] text-slate-600">{showLlmIO ? 'hide ▲' : 'show ▼'}</span>
          </div>
          {showLlmIO && (
            <div className="divide-y divide-slate-800">
              {llmIO.map((entry, i) => (
                <div key={i} className="px-4 py-3 space-y-2">
                  <div className="text-[10px] font-mono text-blue-400 font-semibold">Pass {entry.pass}</div>
                  <details className="group">
                    <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300 select-none">▶ system prompt</summary>
                    <pre className="mt-1 text-[9px] font-mono text-slate-400 whitespace-pre-wrap break-all bg-slate-900 rounded p-2 max-h-48 overflow-y-auto">{entry.input.system}</pre>
                  </details>
                  <details className="group">
                    <summary className="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-slate-300 select-none">▶ user input</summary>
                    <pre className="mt-1 text-[9px] font-mono text-slate-400 whitespace-pre-wrap break-all bg-slate-900 rounded p-2 max-h-48 overflow-y-auto">{entry.input.user}</pre>
                  </details>
                  <details open className="group">
                    <summary className="text-[10px] font-mono text-emerald-500 cursor-pointer hover:text-emerald-300 select-none">▶ output</summary>
                    <pre className="mt-1 text-[9px] font-mono text-emerald-300 whitespace-pre-wrap break-all bg-slate-900 rounded p-2 max-h-48 overflow-y-auto">{entry.output}</pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <div className="space-y-4">
          {/* Meta bar */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
            {!showConsole && progressLog.length > 0 && (
              <button onClick={() => setShowConsole(true)} className="text-[10px] text-slate-400 hover:text-slate-600 underline underline-offset-2">
                Show log
              </button>
            )}
            <span className="bg-slate-100 rounded-lg px-3 py-1.5">
              <span className="font-semibold text-slate-700">{result.meta.totalCalEvents}</span> cal events
            </span>
            <span className="bg-emerald-50 text-emerald-700 rounded-lg px-3 py-1.5">
              <span className="font-semibold">{result.meta.alreadyLoggedCount}</span> already logged
            </span>
            <span className="bg-red-50 text-red-700 rounded-lg px-3 py-1.5">
              <span className="font-semibold">{result.meta.unloggedCount}</span> to log
            </span>
            <span className="bg-amber-50 text-amber-700 rounded-lg px-3 py-1.5">
              <span className="font-semibold">{result.meta.dcGapCount}</span> DC to review
            </span>
            {result.meta.unmatchedCount > 0 && (
              <span className="bg-slate-100 text-slate-500 rounded-lg px-3 py-1.5">
                <span className="font-semibold">{result.meta.unmatchedCount}</span> other activities
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-slate-200">
            {([
              { key: 'activities', label: 'Activities to Log',        count: result.meta.unloggedCount,   color: 'blue' },
              { key: 'dcs',        label: 'DC to Review',           count: result.meta.dcGapCount,      color: 'amber' },
              { key: 'unmatched',  label: 'Other Activities to Review', count: result.meta.unmatchedCount, color: 'slate' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setResultTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  resultTab === tab.key
                    ? tab.color === 'blue'  ? 'border-blue-500 text-blue-600'
                    : tab.color === 'amber' ? 'border-amber-500 text-amber-600'
                    :                        'border-slate-500 text-slate-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    resultTab === tab.key
                      ? tab.color === 'blue'  ? 'bg-blue-100 text-blue-600'
                      : tab.color === 'amber' ? 'bg-amber-100 text-amber-700'
                      :                        'bg-slate-200 text-slate-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Activities tab — account-grouped */}
          {resultTab === 'activities' && (() => {
            const visibleActivityGroups = result.accountGroups.filter(g => visibleActivityGroupIds.has(g.accountId));

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={activitiesSearch}
                    onChange={e => setActivitiesSearch(e.target.value)}
                    placeholder="Filter by account, event, attendee, opp…"
                    className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  {activitiesSearch && (
                    <button onClick={() => setActivitiesSearch('')} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                  )}
                </div>
                {visibleActivityGroups.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl px-5 py-8 text-center text-sm text-slate-400">
                    {activitiesSearch.trim() ? `No results match "${activitiesSearch}"` : 'No unlogged calendar events matched to accounts.'}
                  </div>
                ) : visibleActivityGroups.map(g => (
                  <AccountCard
                    key={g.accountId}
                    group={g}
                    selectedEvents={selectedEvents}
                    setSelectedEvents={setSelectedEvents}
                    eventOppMap={eventOppMap}
                    setEventOppMap={wrappedSetEventOppMap}
                    eventDurationMap={eventDurationMap}
                    setEventDurationMap={wrappedSetEventDurationMap}
                    taskTypeOverrides={taskTypeOverrides}
                    setTaskTypeOverrides={wrappedSetTaskTypeOverrides}
                    seTaskTypes={seTaskTypes}
                    loggedEventKeys={loggedEventKeys}
                    onLogOne={(e) => handleLogOne(g, e)}
                    onLogGroup={() => handleLogGroup(g)}
                    globalTaskType={globalTaskType}
                  />
                ))}
              </div>
            );
          })()}

          {/* DC Gaps tab — grouped by global parent account */}
          {resultTab === 'dcs' && (() => {
            if (allDCGaps.length === 0) return (
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-8 text-center text-sm text-slate-400">
                No DC gaps found in scoped opportunities.
              </div>
            );

            // Build a lookup: accountId → AccountGroup so we can check for prior engagement
            const groupByAccountId = new Map((result.accountGroups ?? []).map(g => [g.accountId, g]));

            // Collect all AccountGroups in the same hierarchy as the given accountId:
            // self + direct parent + siblings (same parent) + direct children
            function getHierarchyGroups(accountId: string): typeof result.accountGroups {
              const grp = groupByAccountId.get(accountId);
              const parentId = grp?.parentAccountId ?? null;
              return (result.accountGroups ?? []).filter(g =>
                g.accountId === accountId ||                                          // self
                (parentId && g.accountId === parentId) ||                            // direct parent
                (parentId && g.parentAccountId === parentId) ||                      // siblings
                g.parentAccountId === accountId                                      // direct children
              );
            }

            // "Already engaged" = across the entire account hierarchy,
            // I have a DC on at least one opp OR at least one logged activity
            function isEngaged(d: DCGap): boolean {
              const allOpps = getHierarchyGroups(d.accountId).flatMap(g => g.rankedOpps);
              return allOpps.some(o => o.hasMyDC) || allOpps.some(o => o.hasMyActivity);
            }

            // Group by global parent name (fallback to accountName), then split engaged / other
            const buildSections = (gaps: DCGap[]) => {
              const byAccount = new Map<string, { displayName: string; accountName: string; gaps: DCGap[] }>();
              gaps.forEach(d => {
                const key = d.parentAccountName ?? d.accountName;
                if (!byAccount.has(key)) byAccount.set(key, { displayName: key, accountName: d.accountName, gaps: [] });
                byAccount.get(key)!.gaps.push(d);
              });
              return byAccount;
            };

            const visibleGaps = allDCGaps.filter(d => visibleDCOppIds.has(d.oppId));

            const engagedGaps = visibleGaps.filter(isEngaged);
            const otherGaps   = visibleGaps.filter(d => !isEngaged(d));

            const renderSection = (gaps: DCGap[]) => {
              const byAccount = buildSections(gaps);
              return [...byAccount.entries()].map(([groupKey, { displayName, accountName, gaps: sectionGaps }]) => (
                <DCAccountCard
                  key={groupKey}
                  displayName={displayName}
                  accountName={accountName !== displayName ? accountName : null}
                  gaps={sectionGaps}
                  selectedDCs={selectedDCs}
                  setSelectedDCs={setSelectedDCs}
                  dcSplit={dcSplit}
                  setDcSplit={wrappedSetDcSplit}
                  loggedDCKeys={loggedDCKeys}
                  onLogOne={handleLogOneDC}
                  onLogGroup={handleLogGroupDCs}
                />
              ));
            };

            return (
              <div className="space-y-4">
                {/* Filter */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dcSearch}
                    onChange={e => setDcSearch(e.target.value)}
                    placeholder="Filter by account, opp, AE, stage…"
                    className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  {dcSearch && (
                    <button onClick={() => setDcSearch('')} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                  )}
                </div>

                {/* Section 1: already engaged */}
                {engagedGaps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Already Engaged</span>
                      <span className="text-[10px] text-slate-400">— you have a DC + activities on this account</span>
                    </div>
                    <div className="space-y-2">{renderSection(engagedGaps)}</div>
                  </div>
                )}

                {/* Section 2: everything else */}
                {otherGaps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">New Opportunities</span>
                      <span className="text-[10px] text-slate-400">— no prior DC or activity on this account</span>
                    </div>
                    <div className="space-y-2">{renderSection(otherGaps)}</div>
                  </div>
                )}

                {visibleGaps.length === 0 && (
                  <div className="text-center text-sm text-slate-400 py-6">No results match "{dcSearch}"</div>
                )}
              </div>
            );
          })()}

          {/* Other Activities tab */}
          {resultTab === 'unmatched' && (() => {
            if (result.unmatchedEvents.length === 0) return (
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-8 text-center text-sm text-slate-400">
                All events matched to an account.
              </div>
            );

            const visibleUnmatched = result.unmatchedEvents.filter(e => visibleUnmatchedIds.has(e.id));

            // ── shared card props ──
            const cardProps = {
              taskTypeOverrides, setTaskTypeOverrides: wrappedSetTaskTypeOverrides,
              seTaskTypes, unmatchedWhatIdMap, setUnmatchedWhatIdMap: wrappedSetUnmatchedWhatIdMap,
              unmatchedSelected, setUnmatchedSelected, loggedUnmatchedKeys,
              onLogOne: handleLogOneUnmatched, onLogGroup: handleLogGroupUnmatched,
              currentUserId: currentUser?.id,
            };

            // ── toolbar ──
            const toolbar = (
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setUnmatchedView('grouped')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${unmatchedView === 'grouped' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Layers size={12} /> Grouped
                  </button>
                  <button
                    onClick={() => setUnmatchedView('list')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-slate-200 ${unmatchedView === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    <LayoutList size={12} /> List
                  </button>
                </div>
                {unmatchedView === 'list' && (
                  <select
                    value={unmatchedSort}
                    onChange={e => setUnmatchedSort(e.target.value as any)}
                    className="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="date">Sort: Date</option>
                    <option value="duration">Sort: Duration</option>
                    <option value="title">Sort: Title</option>
                  </select>
                )}
              </div>
            );

            const filterBar = (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={otherSearch}
                  onChange={e => setOtherSearch(e.target.value)}
                  placeholder="Filter by title, group, task type, attendee…"
                  className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                {otherSearch && (
                  <button onClick={() => setOtherSearch('')} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                )}
              </div>
            );

            // ── grouped view ──
            if (unmatchedView === 'grouped') {
              const byGroup = new Map<string, UnmatchedEvent[]>();
              visibleUnmatched.forEach(e => {
                const g = e.suggestedGroup || 'Other';
                if (!byGroup.has(g)) byGroup.set(g, []);
                byGroup.get(g)!.push(e);
              });
              if (byGroup.size > 6) {
                const sorted = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length);
                const keep = new Map(sorted.slice(0, 5));
                const overflow = sorted.slice(5);
                const otherEvents = overflow.flatMap(([, evs]) => evs);
                keep.set('Other', [...(keep.get('Other') ?? []), ...otherEvents]);
                byGroup.clear();
                keep.forEach((v, k) => byGroup.set(k, v));
              }
              return (
                <div className="space-y-3">
                  {filterBar}
                  <div className="flex justify-end">{toolbar}</div>
                  {byGroup.size === 0
                    ? <div className="text-center text-sm text-slate-400 py-6">No results match "{otherSearch}"</div>
                    : [...byGroup.entries()].map(([groupName, events]) => (
                        <UnmatchedGroupCard key={groupName} groupName={groupName} events={events} {...cardProps} />
                      ))
                  }
                </div>
              );
            }

            // ── list view ──
            const sorted = [...visibleUnmatched].sort((a, b) => {
              if (unmatchedSort === 'duration') return (b.durationMins ?? 0) - (a.durationMins ?? 0);
              if (unmatchedSort === 'title') return a.summary.localeCompare(b.summary);
              return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
            });
            return (
              <div className="space-y-3">
                {filterBar}
                <div className="flex justify-end">{toolbar}</div>
                {sorted.length === 0
                  ? <div className="text-center text-sm text-slate-400 py-6">No results match "{otherSearch}"</div>
                  : <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-50">
                  {sorted.map(e => {
                    const isLogged = loggedUnmatchedKeys.has(e.id);
                    const isSelected = unmatchedSelected.has(e.id);
                    const taskType = taskTypeOverrides[e.id] ?? e.suggestedTaskType ?? '';
                    if (isLogged) return (
                      <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 bg-emerald-50/50 opacity-60">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-xs text-slate-500 flex-1 truncate">{e.summary}</span>
                        <span className="text-[10px] text-emerald-600 font-medium">Logged</span>
                      </div>
                    );
                    return (
                      <div key={e.id} className={`px-4 py-3 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}>
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => setUnmatchedSelected(prev => { const n = new Set(prev); isSelected ? n.delete(e.id) : n.add(e.id); return n; })}
                            className="mt-0.5 shrink-0"
                          >
                            {isSelected ? <CheckCircle2 size={15} className="text-blue-600" /> : <Circle size={15} className="text-slate-300" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-slate-800">{e.summary}</span>
                              <span className="text-[10px] text-slate-400">{fmtDateTime(e.startDateTime)}</span>
                              {e.durationMins > 0 && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{fmtDuration(e.durationMins)}</span>}
                              {e.suggestedGroup && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{e.suggestedGroup}</span>}
                            </div>
                            {e.attendeeNames.length > 0 && (
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.attendeeNames.join(', ')}</p>
                            )}
                            <div className="mt-2 flex items-center gap-3 flex-wrap">
                              {seTaskTypes.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <select
                                    value={taskType}
                                    onChange={ev => wrappedSetTaskTypeOverrides(p => ({ ...p, [e.id]: ev.target.value }))}
                                    className="h-6 px-1.5 rounded border border-slate-200 text-[10px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="">— task type —</option>
                                    {seTaskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  {e.suggestedTaskType && !taskTypeOverrides[e.id] && (
                                    <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium">AI</span>
                                  )}
                                </div>
                              )}
                              <button
                                onClick={() => handleLogOneUnmatched(e)}
                                className="ml-auto flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                <LogIn size={10} /> Log
                              </button>
                            </div>
                            <RelatedToSearch
                              value={unmatchedWhatIdMap[e.id] ?? null}
                              onChange={(id) => wrappedSetUnmatchedWhatIdMap(prev => ({ ...prev, [e.id]: id }))}
                              currentUserId={currentUser?.id}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })()}


          {execResults && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-2">Results</p>
              <ExecuteResults results={execResults} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DC Account Card ───────────────────────────────────────────────────────────

function DCAccountCard({ displayName, accountName, gaps, selectedDCs, setSelectedDCs, dcSplit, setDcSplit, loggedDCKeys, onLogOne, onLogGroup }: {
  displayName: string;
  accountName: string | null;
  gaps: DCGap[];
  selectedDCs: Set<string>;
  setSelectedDCs: (fn: (prev: Set<string>) => Set<string>) => void;
  dcSplit: Record<string, string>;
  setDcSplit: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  loggedDCKeys: Set<string>;
  onLogOne: (d: DCGap) => Promise<void>;
  onLogGroup: (gaps: DCGap[]) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loggingOne, setLoggingOne] = useState<string | null>(null);
  const [loggingGroup, setLoggingGroup] = useState(false);
  const [groupSplit, setGroupSplit] = useState('');

  const pendingGaps = gaps.filter(d => !loggedDCKeys.has(d.oppId));
  const allSelected = pendingGaps.length > 0 && pendingGaps.every(d => selectedDCs.has(d.oppId));
  const someSelected = pendingGaps.some(d => selectedDCs.has(d.oppId));
  const selectedPendingCount = pendingGaps.filter(d => selectedDCs.has(d.oppId)).length;
  const hasHighPri = gaps.some(d => d.priority === 'High');
  const totalAmt = gaps.reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-colors ${expanded ? 'border-amber-200' : 'border-slate-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors" onClick={() => setExpanded(v => !v)}>
        <input type="checkbox" checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={e => { e.stopPropagation(); setSelectedDCs(prev => { const n = new Set(prev); gaps.forEach(d => e.target.checked ? n.add(d.oppId) : n.delete(d.oppId)); return n; }); }}
          onClick={e => e.stopPropagation()} className="rounded shrink-0" />
        <Building2 size={15} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{displayName}</span>
            {accountName && <span className="text-[10px] text-slate-400">{accountName}</span>}
            {hasHighPri && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">High priority</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500 flex-wrap">
            <span className="text-amber-600 font-medium">{gaps.length} DC to review</span>
            {totalAmt > 0 && <span>{fmt$(totalAmt)} total</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </div>

      {/* Expanded rows */}
      {expanded && (
        <div className="border-t border-slate-100">
          {/* Section toolbar */}
          <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
              DC to Review ({pendingGaps.length})
            </span>
            <div className="flex items-center gap-1.5 ml-3">
              <label className="text-[10px] text-slate-400 shrink-0">Split %</label>
              <input
                type="number" min="1" max="100" placeholder="—"
                value={groupSplit}
                onChange={e => {
                  const v = e.target.value;
                  setGroupSplit(v);
                  if (v && Number(v) >= 1 && Number(v) <= 100) {
                    setDcSplit(prev => {
                      const n = { ...prev };
                      pendingGaps.forEach(d => { n[d.oppId] = v; });
                      return n;
                    });
                  }
                }}
                onClick={e => e.stopPropagation()}
                className="w-14 h-6 px-1.5 rounded border border-slate-200 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div className="flex-1" />
            {selectedPendingCount > 0 && (
              <button
                onClick={async e => { e.stopPropagation(); setLoggingGroup(true); await onLogGroup(gaps); setLoggingGroup(false); }}
                disabled={loggingGroup}
                className="flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
              >
                {loggingGroup ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                Log {selectedPendingCount} selected
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {gaps.map(d => {
              const isLogged = loggedDCKeys.has(d.oppId);
              const sel = selectedDCs.has(d.oppId) && !isLogged;

              if (isLogged) {
                return (
                  <div key={d.oppId} className="px-4 py-2.5 flex items-center gap-3 bg-emerald-50/50 opacity-60">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-slate-500 flex-1 truncate">{d.oppName}</span>
                    <span className="text-[10px] text-emerald-600 font-medium">Logged</span>
                  </div>
                );
              }

              return (
                <div key={d.oppId} className={`px-4 py-3 transition-colors ${sel ? 'bg-amber-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => setSelectedDCs(prev => { const n = new Set(prev); sel ? n.delete(d.oppId) : n.add(d.oppId); return n; })} className="mt-0.5 shrink-0">
                      {sel ? <CheckCircle2 size={15} className="text-amber-600" /> : <Circle size={15} className="text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-800">{d.oppName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLOR[d.priority]}`}>{d.priority}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FC_COLOR[d.forecastCategory] ?? 'bg-slate-100 text-slate-600'}`}>{d.forecastCategory}</span>
                        {d.amount != null && <span className="text-[10px] text-slate-600 font-medium">{fmt$(d.amount)}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[10px] text-slate-500">
                        <span>{d.stage}</span>
                        <span>Close {fmtDate(d.closeDate)}</span>
                        <span>AE: {d.aeOwner}</span>
                        {d.aeOwnerRole && <span className="italic">{d.aeOwnerRole}</span>}
                        {d.totalActivities > 0 && <span>{d.totalActivities} activit{d.totalActivities !== 1 ? 'ies' : 'y'} · {d.totalHours}h</span>}
                      </div>
                      {d.teamDCAttendees.length > 0 && (
                        <p className="text-[10px] text-orange-600 mt-0.5">Team DC: {d.teamDCAttendees.join(', ')} was in your meeting</p>
                      )}
                      {d.dcReasons.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Why:</span>
                          {d.dcReasons.map(r => (
                            <span key={r} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{r}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] text-slate-400">Role: <span className="text-slate-600 font-medium">{d.suggestedRole}</span></span>
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] text-slate-400">Split %</label>
                          <input type="number" min="1" max="100"
                            value={dcSplit[d.oppId] ?? d.suggestedSplitPct}
                            onChange={e => setDcSplit(p => ({ ...p, [d.oppId]: e.target.value }))}
                            className="w-14 h-6 px-1.5 rounded border border-slate-200 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400" />
                        </div>
                        <button
                          onClick={async () => { setLoggingOne(d.oppId); await onLogOne(d); setLoggingOne(null); }}
                          disabled={loggingOne === d.oppId}
                          className="ml-auto flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          {loggingOne === d.oppId ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                          Log
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── RelatedToSearch ────────────────────────────────────────────────────────────

function RelatedToSearch({ value, onChange, currentUserId }: {
  value: string | null;
  onChange: (id: string | null, label: string | null) => void;
  currentUserId?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    activitiesApi.searchRelated({ q, ...(currentUserId ? { currentUserId } : {}) })
      .then(r => { setResults(r.data.results ?? []); setOpen(true); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Position dropdown using fixed coords to escape overflow-hidden parents
  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(id: string, label: string, sentinel?: string) {
    onChange(sentinel ?? id, label);
    setSelectedLabel(label);
    setQuery('');
    setOpen(false);
  }

  function clear() { onChange(null, null); setSelectedLabel(null); setQuery(''); }

  if (selectedLabel) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[10px] text-slate-500">Related to:</span>
        <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded truncate max-w-[220px]">{selectedLabel}</span>
        <button onClick={clear} className="text-slate-400 hover:text-slate-600"><X size={10} /></button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mt-1.5">
      <div ref={inputRef} className="flex items-center gap-1 h-6 px-2 rounded border border-slate-200 bg-white focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
        <Search size={9} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Related to (account or opp)…"
          className="flex-1 text-[10px] text-slate-700 bg-transparent outline-none placeholder-slate-400 min-w-0"
        />
        {loading && <Loader2 size={9} className="animate-spin text-slate-400 shrink-0" />}
      </div>
      {open && results.length > 0 && (
        <div style={dropdownStyle} className="bg-white border border-slate-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {results.map((r: any) => (
            <button
              key={r.id}
              onMouseDown={e => { e.preventDefault(); select(r.id, r.name, r.type === 'Account' ? `ACCOUNT:${r.id}` : r.id); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-2">
                <Building2 size={10} className={r.type === 'Account' ? 'text-purple-400 shrink-0' : 'text-blue-400 shrink-0'} />
                <span className="text-[10px] font-medium text-slate-800 flex-1 truncate">{r.name}</span>
                {r.hasMyDC && <span className="text-[9px] bg-purple-100 text-purple-600 px-1 rounded font-medium shrink-0">My DC</span>}
                {r.activityCount > 0 && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded font-medium shrink-0">{r.activityCount} act</span>}
                <span className={`text-[9px] px-1 rounded font-medium shrink-0 ${r.type === 'Account' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>{r.type === 'Account' ? 'Acct' : r.forecastCategory ?? 'Opp'}</span>
                {r.amount != null && <span className="text-[10px] text-slate-500 shrink-0">{fmt$(r.amount)}</span>}
              </div>
              {(r.stage || r.accountName || r.ownerName) && (
                <div className="text-[9px] text-slate-400 pl-5 mt-0.5 truncate">
                  {[r.accountName, r.stage, r.ownerName].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unmatched Group Card ───────────────────────────────────────────────────────

function UnmatchedGroupCard({
  groupName, events, taskTypeOverrides, setTaskTypeOverrides, seTaskTypes,
  unmatchedWhatIdMap, setUnmatchedWhatIdMap,
  unmatchedSelected, setUnmatchedSelected,
  loggedUnmatchedKeys, onLogOne, onLogGroup, currentUserId,
}: {
  groupName: string;
  events: UnmatchedEvent[];
  currentUserId?: string;
  taskTypeOverrides: Record<string, string>;
  setTaskTypeOverrides: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  seTaskTypes: string[];
  unmatchedWhatIdMap: Record<string, string | null>;
  setUnmatchedWhatIdMap: (fn: (prev: Record<string, string | null>) => Record<string, string | null>) => void;
  unmatchedSelected: Set<string>;
  setUnmatchedSelected: (fn: (prev: Set<string>) => Set<string>) => void;
  loggedUnmatchedKeys: Set<string>;
  onLogOne: (e: UnmatchedEvent) => void;
  onLogGroup: (events: UnmatchedEvent[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const totalMins = events.reduce((s, e) => s + (e.durationMins ?? 0), 0);

  const groupSuggestedType = (() => {
    const counts = new Map<string, number>();
    events.forEach(e => { const t = e.suggestedTaskType; if (t) counts.set(t, (counts.get(t) ?? 0) + 1); });
    let best = ''; let bestN = 0;
    counts.forEach((n, t) => { if (n > bestN) { best = t; bestN = n; } });
    return best;
  })();

  const groupTaskType = (() => {
    const vals = new Set(events.map(e => taskTypeOverrides[e.id] ?? e.suggestedTaskType ?? ''));
    return vals.size === 1 ? [...vals][0] : '';
  })();

  function applyTaskTypeToAll(val: string) {
    setTaskTypeOverrides(prev => { const next = { ...prev }; events.forEach(e => { next[e.id] = val; }); return next; });
  }

  const pendingEvents = events.filter(e => unmatchedSelected.has(e.id) && !loggedUnmatchedKeys.has(e.id));
  const allSelected = events.every(e => unmatchedSelected.has(e.id) || loggedUnmatchedKeys.has(e.id));

  function toggleAll() {
    setUnmatchedSelected(prev => {
      const next = new Set(prev);
      if (allSelected) { events.forEach(e => next.delete(e.id)); }
      else { events.forEach(e => { if (!loggedUnmatchedKeys.has(e.id)) next.add(e.id); }); }
      return next;
    });
  }

  async function logGroup() {
    setLogging('group');
    await onLogGroup(events);
    setLogging(null);
  }

  async function logOne(e: UnmatchedEvent) {
    setLogging(e.id);
    await onLogOne(e);
    setLogging(null);
  }

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-colors ${expanded ? 'border-blue-200' : 'border-slate-200'}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={e => { e.stopPropagation(); toggleAll(); }}
          onClick={e => e.stopPropagation()}
          className="rounded shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{groupName}</span>
            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">No account match</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
            <span>{events.length} event{events.length !== 1 ? 's' : ''}</span>
            {totalMins > 0 && <span>{fmtDuration(totalMins)}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Section toolbar */}
          <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
              Events ({events.length})
            </span>
            <div className="flex-1" />
            {seTaskTypes.length > 0 && (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <span className="text-[10px] text-slate-400">Apply to group:</span>
                <select
                  value={groupTaskType}
                  onChange={ev => applyTaskTypeToAll(ev.target.value)}
                  className="h-6 px-1.5 rounded border border-slate-200 text-[10px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— task type —</option>
                  {seTaskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {groupSuggestedType && !groupTaskType && (
                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium">AI: {groupSuggestedType}</span>
                )}
              </div>
            )}
            {pendingEvents.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); logGroup(); }}
                disabled={logging === 'group'}
                className="flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
              >
                {logging === 'group' ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                Log {pendingEvents.length} selected
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-50">
            {events.map(e => {
              const isLogged = loggedUnmatchedKeys.has(e.id);
              const isSelected = unmatchedSelected.has(e.id);
              const taskType = taskTypeOverrides[e.id] ?? e.suggestedTaskType ?? '';

              if (isLogged) {
                return (
                  <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 bg-emerald-50/50 opacity-60">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-slate-500 flex-1 truncate">{e.summary}</span>
                    <span className="text-[10px] text-emerald-600 font-medium">Logged</span>
                  </div>
                );
              }

              return (
                <div key={e.id} className={`px-4 py-3 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setUnmatchedSelected(prev => { const n = new Set(prev); isSelected ? n.delete(e.id) : n.add(e.id); return n; })}
                      className="mt-0.5 shrink-0"
                    >
                      {isSelected
                        ? <CheckCircle2 size={15} className="text-blue-600" />
                        : <Circle size={15} className="text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-800">{e.summary}</span>
                        <span className="text-[10px] text-slate-400">{fmtDateTime(e.startDateTime)}</span>
                        {e.durationMins > 0 && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{fmtDuration(e.durationMins)}</span>}
                      </div>
                      {e.attendeeNames.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.attendeeNames.join(', ')}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        {seTaskTypes.length > 0 && (
                          <div className="flex items-center gap-1">
                            <select
                              value={taskType}
                              onChange={ev => setTaskTypeOverrides(p => ({ ...p, [e.id]: ev.target.value }))}
                              className="h-6 px-1.5 rounded border border-slate-200 text-[10px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">— task type —</option>
                              {seTaskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            {e.suggestedTaskType && !taskTypeOverrides[e.id] && (
                              <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium">AI</span>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => logOne(e)}
                          disabled={logging === e.id}
                          className="ml-auto flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          {logging === e.id ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                          Log
                        </button>
                      </div>
                      <RelatedToSearch
                        value={unmatchedWhatIdMap[e.id] ?? null}
                        onChange={(id, _label) => setUnmatchedWhatIdMap(prev => ({ ...prev, [e.id]: id }))}
                        currentUserId={currentUserId}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────────────────────

function AccountCard({
  group, selectedEvents, setSelectedEvents,
  eventOppMap, setEventOppMap,
  eventDurationMap, setEventDurationMap,
  taskTypeOverrides, setTaskTypeOverrides, seTaskTypes,
  loggedEventKeys, onLogOne, onLogGroup, globalTaskType,
}: {
  group: AccountGroup;
  selectedEvents: Set<string>;
  setSelectedEvents: (fn: (prev: Set<string>) => Set<string>) => void;
  eventOppMap: Record<string, string | null>;
  setEventOppMap: (fn: (prev: Record<string, string | null>) => Record<string, string | null>) => void;
  eventDurationMap: Record<string, string>;
  setEventDurationMap: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  taskTypeOverrides: Record<string, string>;
  setTaskTypeOverrides: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  seTaskTypes: string[];
  loggedEventKeys: Set<string>;
  onLogOne: (e: CalEvent) => Promise<void>;
  onLogGroup: () => Promise<void>;
  globalTaskType: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLogged, setShowLogged] = useState(false);
  const [loggingOne, setLoggingOne] = useState<string | null>(null);
  const [loggingGroup, setLoggingGroup] = useState(false);
  // per-group task type (applies to all unlogged events in this group unless individually overridden)
  const [groupTaskType, setGroupTaskType] = useState('');

  const totalHours = Math.round(group.totalCalMins / 60 * 10) / 10;
  const allKeys = group.unloggedEvents.map(e => `${group.accountId}:${e.id}`);
  const pendingKeys = allKeys.filter(k => !loggedEventKeys.has(k));
  const allSelected = pendingKeys.length > 0 && pendingKeys.every(k => selectedEvents.has(k));
  const someSelected = pendingKeys.some(k => selectedEvents.has(k));
  const selectedPendingCount = pendingKeys.filter(k => selectedEvents.has(k)).length;

  const topOpp = group.rankedOpps[0];
  const hasDCGap = group.dcGaps.length > 0;
  const hasHighPriDC = group.dcGaps.some(d => d.priority === 'High');

  function resolveTaskType(e: CalEvent) {
    return taskTypeOverrides[e.id] || e.suggestedTaskType || groupTaskType || globalTaskType || '';
  }

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-colors ${
      expanded ? 'border-blue-200' : 'border-slate-200'
    }`}>
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={e => {
            e.stopPropagation();
            setSelectedEvents(prev => {
              const n = new Set(prev);
              pendingKeys.forEach(k => e.target.checked ? n.add(k) : n.delete(k));
              return n;
            });
          }}
          onClick={e => e.stopPropagation()}
          className="rounded shrink-0"
        />

        <Building2 size={15} className="text-slate-400 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">
              {group.parentAccountName ?? group.accountName}
            </span>
            {group.parentAccountName && group.parentAccountName !== group.accountName && (
              <span className="text-[10px] text-slate-400 font-normal">{group.accountName}</span>
            )}
            {group.matchSignals.map(s => (
              <span key={s} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{s}</span>
            ))}
            {hasHighPriDC && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">DC gap</span>}
            {hasDCGap && !hasHighPriDC && <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">DC gap</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[10px] text-slate-500">
            <span className="flex items-center gap-0.5"><Clock size={9} className="mr-0.5" />{totalHours}h total</span>
            {pendingKeys.length > 0 && <span className="text-red-600 font-medium">{pendingKeys.length} to log</span>}
            {loggedEventKeys.size > 0 && allKeys.some(k => loggedEventKeys.has(k)) && (
              <span className="text-emerald-600">{allKeys.filter(k => loggedEventKeys.has(k)).length} logged this session</span>
            )}
            {group.loggedCalCount > 0 && <span className="text-emerald-600">{group.loggedCalCount} in SF</span>}
            {group.accountOwnerName && <span>Acct owner: {group.accountOwnerName}</span>}
            {topOpp && (
              <span>
                Top opp: <span className="font-medium text-slate-700">{topOpp.oppName}</span>
                {topOpp.amount != null && <span className="ml-1">{fmt$(topOpp.amount)}</span>}
                <span className={`ml-1 px-1 rounded text-[9px] font-medium ${FC_COLOR[topOpp.forecastCategory] ?? 'bg-slate-100 text-slate-600'}`}>{topOpp.forecastCategory}</span>
                <span className="ml-1 text-slate-400">AE: {topOpp.aeOwner}</span>
              </span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <>
          {/* Unlogged events */}
          {group.unloggedEvents.length > 0 && (
            <div className="border-t border-slate-100">
              {/* Section toolbar */}
              <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">
                  Events to Log ({pendingKeys.length})
                </span>
                <div className="flex-1" />
                {seTaskTypes.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Apply to group:</span>
                    <select
                      value={groupTaskType}
                      onChange={e => {
                        const val = e.target.value;
                        setGroupTaskType(val);
                        setTaskTypeOverrides(prev => {
                          const next = { ...prev };
                          group.unloggedEvents.forEach(ev => { next[ev.id] = val; });
                          return next;
                        });
                      }}
                      className="h-6 px-1.5 rounded border border-slate-200 text-[10px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— task type —</option>
                      {seTaskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {selectedPendingCount > 0 && (
                  <button
                    onClick={async e => { e.stopPropagation(); setLoggingGroup(true); await onLogGroup(); setLoggingGroup(false); }}
                    disabled={loggingGroup}
                    className="flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {loggingGroup ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                    Log {selectedPendingCount} selected
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-50">
                {group.unloggedEvents.map(e => {
                  const key = `${group.accountId}:${e.id}`;
                  const isLogged = loggedEventKeys.has(key);
                  const sel = selectedEvents.has(key) && !isLogged;
                  const selectedOppId = eventOppMap[key] ?? null;
                  const taskType = resolveTaskType(e);

                  if (isLogged) {
                    return (
                      <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 bg-emerald-50/50 opacity-60">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-xs text-slate-500 flex-1 truncate">{e.summary}</span>
                        <span className="text-[10px] text-emerald-600 font-medium">Logged</span>
                      </div>
                    );
                  }

                  return (
                    <div key={e.id} className={`px-4 py-3 transition-colors ${sel ? 'bg-blue-50/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => setSelectedEvents(prev => {
                          const n = new Set(prev);
                          sel ? n.delete(key) : n.add(key);
                          return n;
                        })} className="mt-0.5 shrink-0">
                          {sel ? <CheckCircle2 size={15} className="text-blue-600" /> : <Circle size={15} className="text-slate-300" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-slate-800">{e.summary}</span>
                            <span className="text-[10px] text-slate-400">{fmtDateTime(e.startDateTime)}</span>
                            {e.durationMins > 0 && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{fmtDuration(e.durationMins)}</span>
                            )}
                            {e.matchSignals.length > 0 && e.matchSignals.map(s => (
                              <span key={s} className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                                {s}
                              </span>
                            ))}
                          </div>
                          {e.attendeeNames.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{e.attendeeNames.join(', ')}</p>
                          )}

                          <OppPicker
                            opps={group.rankedOpps}
                            selectedOppId={selectedOppId}
                            accountId={group.accountId}
                            accountName={group.accountName}
                            parentAccountId={group.parentAccountId}
                            parentAccountName={group.parentAccountName}
                            mostEngagedAccountId={group.mostEngagedAccountId}
                            mostEngagedAccountName={group.mostEngagedAccountName}
                            onChange={id => setEventOppMap(prev => ({ ...prev, [key]: id }))}
                          />

                          {/* Controls row */}
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-slate-400">Duration</label>
                              <input type="number" min="1" step="15"
                                value={eventDurationMap[key] ?? (e.durationMins || '')}
                                onChange={ev => setEventDurationMap(prev => ({ ...prev, [key]: ev.target.value }))}
                                className="w-16 h-6 px-1.5 rounded border border-slate-200 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <span className="text-[10px] text-slate-400">min</span>
                            </div>
                            {seTaskTypes.length > 0 && (
                              <div className="flex items-center gap-1">
                                <select
                                  value={taskType}
                                  onChange={ev => setTaskTypeOverrides(prev => ({ ...prev, [e.id]: ev.target.value }))}
                                  className="h-6 px-1.5 rounded border border-slate-200 text-[10px] text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">— task type —</option>
                                  {seTaskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                {e.suggestedTaskType && !taskTypeOverrides[e.id] && (
                                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium">AI</span>
                                )}
                              </div>
                            )}
                            <button
                              onClick={async () => { setLoggingOne(e.id); await onLogOne(e); setLoggingOne(null); }}
                              disabled={loggingOne === e.id}
                              className="ml-auto flex items-center gap-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              {loggingOne === e.id ? <Loader2 size={10} className="animate-spin" /> : <LogIn size={10} />}
                              Log
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Already-logged events (collapsed by default) */}
          {group.loggedEvents && group.loggedEvents.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                onClick={() => setShowLogged(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-1.5 bg-emerald-50/60 hover:bg-emerald-50 transition-colors border-b border-slate-100"
              >
                <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide flex-1 text-left">
                  Already in Salesforce ({group.loggedEvents.length})
                </span>
                {showLogged ? <ChevronUp size={11} className="text-emerald-400" /> : <ChevronDown size={11} className="text-emerald-400" />}
              </button>
              {showLogged && (
                <div className="divide-y divide-slate-50">
                  {group.loggedEvents.map(e => (
                    <div key={e.id} className="px-4 py-2 flex items-center gap-2 opacity-60">
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                      <span className="text-xs text-slate-600 flex-1 truncate">{e.summary}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(e.date)}</span>
                      {e.durationMins > 0 && <span className="text-[10px] text-slate-400 shrink-0">{fmtDuration(e.durationMins)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DC gaps inline summary */}
          {group.dcGaps.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-4 py-1.5 bg-amber-50/60 border-b border-slate-100">
                <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                  DC to Review ({group.dcGaps.length}) — see DC to Review tab
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {group.dcGaps.map(d => (
                  <div key={d.oppId} className="px-4 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlusCircle size={11} className="text-amber-500 shrink-0" />
                      <span className="text-xs font-medium text-slate-700">{d.oppName}</span>
                      {d.amount != null && <span className="text-[10px] text-slate-500">{fmt$(d.amount)}</span>}
                      <span className={`text-[10px] px-1 rounded font-medium ${FC_COLOR[d.forecastCategory] ?? 'bg-slate-100 text-slate-600'}`}>{d.forecastCategory}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLOR[d.priority]}`}>{d.priority}</span>
                      <span className="text-[10px] text-slate-400">Split: {d.suggestedSplitPct}%</span>
                    </div>
                    {d.dcReasons.length > 0 && (
                      <p className="text-[10px] text-slate-400 italic mt-0.5 pl-4">
                        Why: {d.dcReasons.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
