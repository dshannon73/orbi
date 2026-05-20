import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface CalEvent {
  id: string;
  summary: string;
  date: string;
  startDateTime: string;
  endDateTime: string;
  durationMins: number;
  attendeeNames: string[];
  matchScore: number;
  matchSignals: string[];
  suggestedTaskType?: string;
}

export interface LoggedCalEvent {
  id: string;
  summary: string;
  date: string;
  startDateTime: string;
  durationMins: number;
}

export interface RankedOpp {
  oppId: string;
  oppName: string;
  stage: string;
  forecastCategory: string;
  closeDate: string;
  amount: number | null;
  aeOwner: string;
  aeOwnerRole: string;
  lastModified: string;
  hasMyDC: boolean;
  hasTeamDC: boolean;
  hasMyActivity: boolean;
  teamDCMembers: string[];
  rankReasons: string[];
  rankScore: number;
}

export interface DCGap {
  oppId: string;
  oppName: string;
  accountId: string;
  accountName: string;
  parentAccountName: string | null;
  stage: string;
  forecastCategory: string;
  closeDate: string;
  amount: number | null;
  aeOwner: string;
  aeOwnerRole: string;
  priority: 'High' | 'Medium' | 'Low';
  suggestedSplitPct: number;
  suggestedRole: string;
  teamDCAttendees: string[];
  totalActivities: number;
  totalHours: number;
  dcReasons: string[];
  splitReason: string;
}

export interface AccountGroup {
  accountId: string;
  accountName: string;
  accountOwnerName: string;
  parentAccountId: string | null;
  parentAccountName: string | null;
  mostEngagedAccountId: string | null;
  mostEngagedAccountName: string | null;
  totalCalEvents: number;
  totalCalMins: number;
  loggedCalCount: number;
  groupScore: number;
  unloggedEvents: CalEvent[];
  loggedEvents: LoggedCalEvent[];
  rankedOpps: RankedOpp[];
  dcGaps: DCGap[];
  matchSignals: string[];
}

export interface UnmatchedEvent {
  id: string;
  summary: string;
  date: string;
  startDateTime: string;
  durationMins: number;
  attendeeNames: string[];
  suggestedTaskType?: string;
  suggestedGroup?: string;
}

export interface BriefingResult {
  accountGroups: AccountGroup[];
  unmatchedEvents: UnmatchedEvent[];
  meta: {
    totalCalEvents: number;
    alreadyLoggedCount: number;
    unloggedCount: number;
    matchedCount: number;
    unmatchedCount: number;
    dcGapCount: number;
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AssistantState {
  // Filters (persisted)
  accountScope: string;
  calExclude: string;
  roleFilter: string;
  setAccountScope: (v: string) => void;
  setCalExclude: (v: string) => void;
  setRoleFilter: (v: string) => void;

  // Briefing result (persisted)
  briefingStatus: 'idle' | 'done' | 'error';
  briefingResult: BriefingResult | null;
  resultTab: 'activities' | 'dcs' | 'unmatched';

  // Selections stored as arrays for JSON serializability
  selectedEvents: string[];
  selectedDCs: string[];
  unmatchedSelected: string[];
  loggedEventKeys: string[];
  loggedDCKeys: string[];
  loggedUnmatchedKeys: string[];

  // Maps
  eventOppMap: Record<string, string | null>;
  eventDurationMap: Record<string, string>;
  dcSplit: Record<string, string>;
  unmatchedWhatIdMap: Record<string, string | null>;
  taskTypeOverrides: Record<string, string>;
  globalTaskType: string;

  // Actions
  setBriefingStatus: (s: 'idle' | 'done' | 'error') => void;
  setBriefingResult: (r: BriefingResult | null) => void;
  setResultTab: (t: 'activities' | 'dcs' | 'unmatched') => void;
  setSelectedEvents: (arr: string[]) => void;
  setSelectedDCs: (arr: string[]) => void;
  setUnmatchedSelected: (arr: string[]) => void;
  setLoggedEventKeys: (arr: string[]) => void;
  setLoggedDCKeys: (arr: string[]) => void;
  setLoggedUnmatchedKeys: (arr: string[]) => void;
  setEventOppMap: (m: Record<string, string | null>) => void;
  setEventDurationMap: (m: Record<string, string>) => void;
  setDcSplit: (m: Record<string, string>) => void;
  setUnmatchedWhatIdMap: (m: Record<string, string | null>) => void;
  setTaskTypeOverrides: (m: Record<string, string>) => void;
  setGlobalTaskType: (v: string) => void;
  resetBriefing: () => void;
}

const BLANK_BRIEFING = {
  briefingStatus: 'idle' as const,
  briefingResult: null,
  resultTab: 'activities' as const,
  selectedEvents: [],
  selectedDCs: [],
  unmatchedSelected: [],
  loggedEventKeys: [],
  loggedDCKeys: [],
  loggedUnmatchedKeys: [],
  eventOppMap: {},
  eventDurationMap: {},
  dcSplit: {},
  unmatchedWhatIdMap: {},
  taskTypeOverrides: {},
  globalTaskType: '',
};

export const useAssistantFilters = create<AssistantState>()(
  persist(
    (set) => ({
      // Filters
      accountScope: '',
      calExclude: '',
      roleFilter: '',
      setAccountScope: (accountScope) => set({ accountScope }),
      setCalExclude: (calExclude) => set({ calExclude }),
      setRoleFilter: (roleFilter) => set({ roleFilter }),

      // Briefing
      ...BLANK_BRIEFING,
      setBriefingStatus: (briefingStatus) => set({ briefingStatus }),
      setBriefingResult: (briefingResult) => set({ briefingResult }),
      setResultTab: (resultTab) => set({ resultTab }),
      setSelectedEvents: (selectedEvents) => set({ selectedEvents }),
      setSelectedDCs: (selectedDCs) => set({ selectedDCs }),
      setUnmatchedSelected: (unmatchedSelected) => set({ unmatchedSelected }),
      setLoggedEventKeys: (loggedEventKeys) => set({ loggedEventKeys }),
      setLoggedDCKeys: (loggedDCKeys) => set({ loggedDCKeys }),
      setLoggedUnmatchedKeys: (loggedUnmatchedKeys) => set({ loggedUnmatchedKeys }),
      setEventOppMap: (eventOppMap) => set({ eventOppMap }),
      setEventDurationMap: (eventDurationMap) => set({ eventDurationMap }),
      setDcSplit: (dcSplit) => set({ dcSplit }),
      setUnmatchedWhatIdMap: (unmatchedWhatIdMap) => set({ unmatchedWhatIdMap }),
      setTaskTypeOverrides: (taskTypeOverrides) => set({ taskTypeOverrides }),
      setGlobalTaskType: (globalTaskType) => set({ globalTaskType }),
      resetBriefing: () => set(BLANK_BRIEFING),
    }),
    {
      name: 'orbi-assistant-v3',
      partialize: (s) => ({
        accountScope: s.accountScope,
        calExclude: s.calExclude,
        roleFilter: s.roleFilter,
        briefingStatus: s.briefingStatus,
        briefingResult: s.briefingResult,
        resultTab: s.resultTab,
        selectedEvents: s.selectedEvents,
        selectedDCs: s.selectedDCs,
        unmatchedSelected: s.unmatchedSelected,
        loggedEventKeys: s.loggedEventKeys,
        loggedDCKeys: s.loggedDCKeys,
        loggedUnmatchedKeys: s.loggedUnmatchedKeys,
        eventOppMap: s.eventOppMap,
        eventDurationMap: s.eventDurationMap,
        dcSplit: s.dcSplit,
        unmatchedWhatIdMap: s.unmatchedWhatIdMap,
        taskTypeOverrides: s.taskTypeOverrides,
        globalTaskType: s.globalTaskType,
      }),
    }
  )
);
