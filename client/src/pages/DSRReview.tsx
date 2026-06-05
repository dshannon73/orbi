import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, X, Check, ExternalLink, Download, ChevronDown, ChevronUp, Save, FileText, LayoutGrid } from 'lucide-react';
import { dsrApi } from '@/api';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { FilterInput } from '@/components/FilterInput';
import { PicklistFilter } from '@/components/PicklistFilter';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { usePageFilters } from '@/store/pageFilters';
import { useTerminalStore } from '@/store/terminal';

const PAGE = 'dsr';


type DSR = {
  Id: string; Name: string; Status__c: string; Status_Detail__c: string | null;
  Account__c: string | null; Oppty_Account__c: string | null; Opportunity__c: string | null;
  Opportunity__r?: { Name?: string } | null; Oppty_Amount__c: number | null;
  Status_Comments__c: string | null; Next_Steps__c: string | null; Oppty_Close_Date__c: string | null;
};

type Draft = { statusComments: string; nextSteps: string };

function fmt$(n: number | null | undefined) {
  if (!n) return '—';
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'New':        { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  'In Process': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  'Complete':   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, borderRadius: 4, fontSize: 11, fontWeight: 600, padding: '1px 7px' }}>
      {status}
    </span>
  );
}

function extractDraftsFromText(text: string): Record<string, Draft> {
  const result: Record<string, Draft> = {};
  // Match DSR headers in both formats:
  // "## DS-1234567 — Account" or "**DS-1234567** — Account" or bare "DS-1234567"
  const re = /(?:^|\n)(?:#{1,3}\s*)?\[?(DS-\d{4,7})\]?[^\n]*/g;
  const splits: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    splits.push({ name: m[1].toUpperCase(), start: m.index });
  }
  for (let i = 0; i < splits.length; i++) {
    const { name, start } = splits[i];
    const end = i + 1 < splits.length ? splits[i + 1].start : text.length;
    const block = text.slice(start, end);

    // Match Slackbot format: ### Status_Comments__c ... blockquote lines
    const scMatch = block.match(/###\s*Status_Comments__c[^\n]*\n+([\s\S]*?)(?=###\s*SE_Next_Steps__c|$)/i);
    const nsMatch = block.match(/###\s*SE_Next_Steps__c[^\n]*\n+([\s\S]*?)(?=\n---|\n##|Sources:|$)/i);

    // Fallback: prose format "Status Comments (proposed):"
    const scFallback = block.match(/Status Comments.*?(?:proposed)?:?\s*\n([\s\S]*?)(?=SE Next Steps|Next Steps|\n##|\n\*\*|$)/i);
    const nsFallback = block.match(/(?:SE )?Next Steps.*?(?:proposed)?:?\s*\n([\s\S]*?)(?=\n##|\n\*\*|Sources:|$)/i);

    const rawSC = (scMatch?.[1] ?? scFallback?.[1] ?? '').trim();
    const rawNS = (nsMatch?.[1] ?? nsFallback?.[1] ?? '').trim();

    // Strip blockquote markers ("> ") from each line
    const clean = (s: string) => s.split('\n').map(l => l.replace(/^>\s*/, '')).join('\n').trim();

    const statusComments = clean(rawSC);
    const nextSteps = clean(rawNS);

    if (statusComments || nextSteps) result[name] = { statusComments, nextSteps };
  }
  return result;
}

// ── Report View ───────────────────────────────────────────────────────────────

function ReportView({ records, drafts }: { records: DSR[]; drafts: Record<string, Draft> }) {
  const today = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 max-w-4xl font-sans">
      <div className="mb-8 pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900">DSR Status Report</h1>
        <p className="text-sm text-slate-500 mt-1">{today} · {records.length} active DSR{records.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="space-y-8">
        {records.map(r => {
          const draft = drafts[r.Id];
          const sc = draft?.statusComments ?? r.Status_Comments__c;
          const ns = draft?.nextSteps ?? r.Next_Steps__c;
          const account = r.Oppty_Account__c ?? r.Account__c ?? '—';
          const opp = r.Opportunity__r?.Name ?? '—';
          return (
            <div key={r.Id} className="pb-8 border-b border-slate-100 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-3 mb-1">
                <a href={`https://org62.my.salesforce.com/${r.Id}`} target="_blank" rel="noopener noreferrer"
                  className="text-base font-bold text-slate-900 hover:text-blue-600">
                  {r.Name}
                </a>
                <StatusBadge status={r.Status__c} />
                {draft && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#92400e' }}>DRAFT</span>}
              </div>
              <p className="text-xs text-slate-500 mb-4">
                {account} · {opp} · {fmt$(r.Oppty_Amount__c)} · Close {fmtDate(r.Oppty_Close_Date__c)}
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Status Comments</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{sc || <span className="italic text-slate-400">—</span>}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Next Steps</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ns || <span className="italic text-slate-400">—</span>}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DSR Card ──────────────────────────────────────────────────────────────────

function DSRCard({ r, draft, onDraftChange, onSave, saving, saved }: {
  r: DSR; draft: Draft | null;
  onDraftChange: (d: Draft) => void;
  onSave: () => void; saving: boolean; saved: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDraft = !!draft;
  const isOpen = expanded || hasDraft;
  const account = r.Oppty_Account__c ?? r.Account__c ?? '—';
  const opp = r.Opportunity__r?.Name ?? '—';
  const scValue = draft?.statusComments ?? r.Status_Comments__c ?? '';
  const nsValue = draft?.nextSteps ?? r.Next_Steps__c ?? '';

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: hasDraft ? '#fde68a' : '#e2e8f0' }}>
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`https://org62.my.salesforce.com/${r.Id}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[14px] font-semibold text-slate-900 hover:text-blue-600 flex items-center gap-1">
              {r.Name} <ExternalLink size={10} className="text-slate-400" />
            </a>
            <StatusBadge status={r.Status__c} />
            {r.Status_Detail__c && <span className="text-[11px] text-slate-500">{r.Status_Detail__c}</span>}
            {hasDraft && <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>DRAFT READY</span>}
            {saved && <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>✓ SAVED</span>}
          </div>
          <div className="flex items-center gap-4 mt-0.5 flex-wrap text-[11px] text-slate-500">
            <span><span className="font-medium text-slate-600">Account:</span> {account}</span>
            <span><span className="font-medium text-slate-600">Opp:</span> {opp}</span>
            <span><span className="font-medium text-slate-600">Amt:</span> {fmt$(r.Oppty_Amount__c)}</span>
            <span><span className="font-medium text-slate-600">Close:</span> {fmtDate(r.Oppty_Close_Date__c)}</span>
          </div>
        </div>
        <div className="shrink-0 text-slate-400 mt-0.5">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Current in Salesforce</p>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Status Comments</p>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 min-h-[90px]">
                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{r.Status_Comments__c || <span className="italic text-slate-400">Empty</span>}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Next Steps</p>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 min-h-[90px]">
                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{r.Next_Steps__c || <span className="italic text-slate-400">Empty</span>}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                {hasDraft ? 'Proposed — review & edit before saving' : 'Manual edit'}
              </p>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Status Comments</p>
                <textarea rows={5} value={scValue}
                  onChange={e => onDraftChange({ statusComments: e.target.value, nextSteps: nsValue })}
                  placeholder="Status comments…"
                  className="w-full rounded-lg border px-3 py-2 text-[11px] text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
                  style={{ borderColor: hasDraft ? '#fde68a' : '#e2e8f0', background: hasDraft ? '#fffdf5' : '#fff' }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Next Steps</p>
                <textarea rows={5} value={nsValue}
                  onChange={e => onDraftChange({ statusComments: scValue, nextSteps: e.target.value })}
                  placeholder="Next steps…"
                  className="w-full rounded-lg border px-3 py-2 text-[11px] text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
                  style={{ borderColor: hasDraft ? '#fde68a' : '#e2e8f0', background: hasDraft ? '#fffdf5' : '#fff' }} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
                  {saving ? '⟳ Saving…' : <><Check size={11} /> Approve &amp; Save to SF</>}
                </Button>
                {hasDraft && (
                  <Button variant="ghost" size="sm" onClick={() => onDraftChange({ statusComments: r.Status_Comments__c ?? '', nextSteps: r.Next_Steps__c ?? '' })}>
                    <X size={11} /> Discard
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DSRReview() {
  const qc = useQueryClient();
  const { messages, appendMessage, updateLastAssistant } = useTerminalStore();
  const pf = usePageFilters();

  const status    = pf.get(PAGE, 'status', '');
  const datePreset = pf.get(PAGE, 'datePreset', '');
  const dateFrom  = pf.get(PAGE, 'dateFrom', '');
  const dateTo    = pf.get(PAGE, 'dateTo', '');
  const account   = pf.get(PAGE, 'account', '');
  const set = (key: string) => (v: string) => pf.set(PAGE, key, v);

  const { from: resolvedFrom, to: resolvedTo } = resolveDateRange(datePreset, dateFrom, dateTo);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'report'>('cards');
  const [reviewRunning, setReviewRunning] = useState(false);

  const queryParams: Record<string, string> = {};
  if (status)        queryParams.status   = status;
  if (resolvedFrom)  queryParams.dateFrom = resolvedFrom;
  if (resolvedTo)    queryParams.dateTo   = resolvedTo;
  if (account)       queryParams.account  = account;

  const { data, isLoading } = useQuery({
    queryKey: ['dsr-active', queryParams],
    queryFn: () => dsrApi.list(queryParams),
  });

  const records: DSR[] = (data?.data as any)?.records ?? [];
  const recordsRef = useRef<any[]>([]);
  useEffect(() => { recordsRef.current = records; }, [records]);

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  }

  const extractDrafts = useCallback(() => {
    const allText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n');
    const parsed = extractDraftsFromText(allText);
    const found = Object.keys(parsed);
    if (found.length === 0) { showMsg('No DSR drafts found in terminal output. Run the DSR review first.', false); return; }
    const newDrafts: Record<string, Draft> = { ...drafts };
    let matched = 0;
    records.forEach(r => {
      const d = parsed[r.Name.toUpperCase()];
      if (d) { newDrafts[r.Id] = d; matched++; }
    });
    setDrafts(newDrafts);
    showMsg(`Loaded drafts for ${matched} DSR${matched !== 1 ? 's' : ''} (${found.length} found in terminal).`, true);
  }, [messages, records, drafts]);

  async function saveDSR(r: DSR) {
    const draft = drafts[r.Id];
    setSaving(prev => ({ ...prev, [r.Id]: true }));
    try {
      await dsrApi.update(r.Id, {
        statusComments: draft?.statusComments ?? r.Status_Comments__c ?? '',
        nextSteps: draft?.nextSteps ?? r.Next_Steps__c ?? '',
      });
      qc.invalidateQueries({ queryKey: ['dsr-active'] });
      setSaved(prev => ({ ...prev, [r.Id]: true }));
      setDrafts(prev => { const n = { ...prev }; delete n[r.Id]; return n; });
      setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[r.Id]; return n; }), 4000);
    } catch (e: any) {
      showMsg(`Save failed for ${r.Name}: ${e.message}`, false);
    }
    setSaving(prev => ({ ...prev, [r.Id]: false }));
  }

  async function saveAll() {
    for (const r of records.filter(r => drafts[r.Id])) await saveDSR(r);
  }

  const draftCount = Object.keys(drafts).length;
  const activeFilters = [status, resolvedFrom, resolvedTo, account].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="DSR Review"
        subtitle={isLoading ? 'Loading…' : `${records.length} active DSR${records.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${viewMode === 'cards' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <LayoutGrid size={12} /> Cards
              </button>
              <button onClick={() => setViewMode('report')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-slate-200 ${viewMode === 'report' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <FileText size={12} /> Report
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={extractDrafts}>
              <Download size={13} /> Extract Drafts
            </Button>
            {draftCount > 0 && (
              <Button variant="primary" size="sm" onClick={saveAll}>
                <Save size={13} /> Save All {draftCount} to SF
              </Button>
            )}
            <Button variant="primary" size="sm" disabled={reviewRunning} onClick={async () => {
              setReviewRunning(true);
              // Seed a persisted assistant message in the terminal store
              appendMessage({ role: 'assistant', content: '', streaming: true });
              try {
                const res = await dsrApi.runReview();
                const reader = res.body!.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                let fullText = '';
                let gotDone = false;

                const applyDrafts = (text: string) => {
                  const parsed = extractDraftsFromText(text);
                  const newDrafts: Record<string, Draft> = {};
                  let matched = 0;
                  recordsRef.current.forEach((r: any) => {
                    const d = parsed[r.Name.toUpperCase()];
                    if (d) { newDrafts[r.Id] = d; matched++; }
                  });
                  if (matched > 0) {
                    setDrafts(prev => ({ ...prev, ...newDrafts }));
                    showMsg(`Review complete — ${matched} DSR draft${matched !== 1 ? 's' : ''} loaded into cards.`, true);
                  } else {
                    showMsg('Review complete. Use "Extract Drafts" if cards are empty.', true);
                  }
                };

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  const lines = buf.split('\n');
                  buf = lines.pop() ?? '';
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                      const ev = JSON.parse(line.slice(6));
                      if (ev.type === 'delta') {
                        fullText += ev.text;
                        updateLastAssistant(m => ({ ...m, content: m.content + ev.text }));
                      } else if (ev.type === 'error') {
                        updateLastAssistant(m => ({ ...m, streaming: false, content: m.content + `\n[Error: ${ev.message}]` }));
                        showMsg(`Review error: ${ev.message}`, false);
                        setReviewRunning(false);
                      } else if (ev.type === 'done') {
                        gotDone = true;
                        updateLastAssistant(m => ({ ...m, streaming: false }));
                        setReviewRunning(false);
                        applyDrafts(fullText);
                      }
                    } catch { /* ignore */ }
                  }
                }
                // Stream ended without a done event — still try to extract
                if (!gotDone && fullText) {
                  updateLastAssistant(m => ({ ...m, streaming: false }));
                  setReviewRunning(false);
                  applyDrafts(fullText);
                }
              } catch (e: any) {
                updateLastAssistant(m => ({ ...m, streaming: false }));
                showMsg(`Failed: ${e.message}`, false);
                setReviewRunning(false);
              }
            }}>
              <PlayCircle size={13} /> {reviewRunning ? 'Running…' : 'Run DSR Review'}
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <GlobalFilterBar
        statusSlot={
          <PicklistFilter object="Deal_Support_Request__c" field="Status__c" value={status} onChange={set('status')} placeholder="Status" label="Status" />
        }
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeFilter page={PAGE} label="Close Date" />
            <FilterInput value={account} onChange={set('account')} placeholder="Account…" label="Account" className="w-40" />
            {activeFilters > 0 && (
              <button onClick={() => { set('status')(''); set('datePreset')(''); set('dateFrom')(''); set('dateTo')(''); set('account')(''); }}
                className="text-[11px] flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-60 mt-4" style={{ color: '#b5b0a8' }}>
                <X size={10} /> Clear filters
              </button>
            )}
          </div>
        }
      />

      {msg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm border" style={{
          background: msg.ok ? '#f0fdf4' : '#fef2f2',
          color: msg.ok ? '#15803d' : '#b91c1c',
          borderColor: msg.ok ? '#bbf7d0' : '#fecaca',
        }}>{msg.text}</div>
      )}


      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading DSRs…</div>
      ) : records.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No DSRs match the current filters.</div>
      ) : viewMode === 'report' ? (
        <ReportView records={records} drafts={drafts} />
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <DSRCard key={r.Id} r={r}
              draft={drafts[r.Id] ?? null}
              onDraftChange={d => setDrafts(prev => ({ ...prev, [r.Id]: d }))}
              onSave={() => saveDSR(r)}
              saving={!!saving[r.Id]}
              saved={!!saved[r.Id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
