import { assistantApi } from '@/api';
import { useAssistantFilters, type BriefingResult } from '@/store/assistant';

let running = false;

export function isBriefingRunning() { return running; }

export async function startBriefing(params: {
  currentUserId: string;
  dateFrom: string;
  dateTo: string;
  accountScope?: string;
  calExclude?: string;
  roleFilter?: string;
  lookbackMonths?: number;
}) {
  if (running) return;
  running = true;

  const store = useAssistantFilters.getState();
  store.resetBriefing();
  store.setBriefingStatus('loading');
  store.clearProgressLog();
  store.setBriefingError('');

  try {
    await assistantApi.briefing(params, (event) => {
      const s = useAssistantFilters.getState();

      if (event.type === 'debug') {
        s.appendProgressLog({ step: 'debug', message: event.message, debug: true });
      } else if (event.type === 'progress') {
        s.appendProgressLog({ step: event.step, message: event.message });
      } else if (event.type === 'result') {
        const data = event as unknown as BriefingResult & { type: string };
        s.setBriefingResult(data);

        const initSelected: string[] = [];
        const initOppMap: Record<string, string | null> = {};
        const initDuration: Record<string, string> = {};
        const initSplit: Record<string, string> = {};
        const initDCSelected: string[] = [];

        data.accountGroups.forEach(g => {
          const defaultAccountId = g.mostEngagedAccountId ?? g.accountId;
          const defaultOpp = g.rankedOpps.find(o => o.hasTeamDC || o.hasMyDC) ?? g.rankedOpps[0];
          g.unloggedEvents.forEach(e => {
            const key = `${g.accountId}:${e.id}`;
            initSelected.push(key);
            initOppMap[key] = defaultOpp ? defaultOpp.oppId : `ACCOUNT:${defaultAccountId}`;
            if (e.durationMins) initDuration[key] = String(e.durationMins);
          });
          g.dcGaps.forEach(d => {
            initDCSelected.push(d.oppId);
            initSplit[d.oppId] = String(d.suggestedSplitPct);
          });
        });

        s.setSelectedEvents(initSelected);
        s.setEventOppMap(initOppMap);
        s.setEventDurationMap(initDuration);
        s.setSelectedDCs(initDCSelected);
        s.setDcSplit(initSplit);
        s.setBriefingStatus('done');
        running = false;
      } else if (event.type === 'error') {
        s.setBriefingError((event as any).error ?? 'Unknown error');
        s.setBriefingStatus('error');
        running = false;
      }
    });
  } catch (e: any) {
    const s = useAssistantFilters.getState();
    s.setBriefingError(e.message ?? 'Request failed');
    s.setBriefingStatus('error');
    running = false;
  }
}
