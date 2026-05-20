import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { dealContributionsApi, metaApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { fmt$ } from '@/lib/utils';

export interface DCOpportunity {
  Id: string;
  Name: string;
  amount?: number | null;
}

interface DCDialogProps {
  opportunities: DCOpportunity[];
  onClose: () => void;
}

export function DCDialog({ opportunities, onClose }: DCDialogProps) {
  const currentUser = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const [role, setRole] = useState('Distinguished SE');
  // Per-opp split percentages keyed by opp Id
  const [pcts, setPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(opportunities.map(o => [o.Id, '50']))
  );
  const [comments, setComments] = useState('#orbi');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<{ name: string; action: string }[]>([]);

  const { data: rolesData } = useQuery({
    queryKey: ['picklist', 'Deal_Contribution__c', 'Opportunity_Role__c'],
    queryFn: () => metaApi.picklist('Deal_Contribution__c', 'Opportunity_Role__c'),
    staleTime: Infinity,
  });
  const roles: string[] = rolesData?.data?.values ?? [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    if (!currentUser?.id) return;
    setStatus('saving');
    try {
      const settled = await Promise.all(
        opportunities.map(opp =>
          dealContributionsApi.upsert({
            opportunityId: opp.Id,
            currentUserId: currentUser.id,
            role,
            splitPercentage: pcts[opp.Id] ?? '50',
            comments: comments || undefined,
          })
            .then(r => ({ name: opp.Name, action: r.data.action as string }))
            .catch(e => ({ name: opp.Name, action: 'error: ' + (e.response?.data?.error ?? e.message) }))
        )
      );
      setResults(settled);
      setStatus('done');
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['deal-contributions'] });
    } catch (e: any) {
      setStatus('error');
    }
  }

  const isSaving = status === 'saving';
  const isDone = status === 'done';
  const isMulti = opportunities.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isDone ? 'Done' : 'Add / Update Deal Contribution'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {!isDone ? (
            <>
              {/* Role — shared */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {roles.length === 0 && <option value="Distinguished SE">Distinguished SE</option>}
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Opportunity rows with per-opp % */}
              <div>
                <div className="grid text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1"
                  style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span>Opportunity</span>
                  <span className="text-right pr-4">Amount</span>
                  <span className="text-right">Split %</span>
                </div>
                <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                  {opportunities.map(opp => (
                    <li key={opp.Id} className="grid items-center gap-2 py-1.5 px-2 rounded-lg bg-slate-50"
                      style={{ gridTemplateColumns: '1fr auto auto' }}>
                      <span className="text-xs text-slate-700 truncate" title={opp.Name}>{opp.Name}</span>
                      <span className="text-xs text-slate-500 shrink-0 text-right pr-2">
                        {opp.amount != null ? fmt$(opp.amount) : <span className="text-slate-300">—</span>}
                      </span>
                      <input
                        type="number" min="0" max="100" step="1"
                        value={pcts[opp.Id] ?? '50'}
                        onChange={e => setPcts(p => ({ ...p, [opp.Id]: e.target.value }))}
                        className="w-16 h-7 px-2 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                    </li>
                  ))}
                </ul>
                {isMulti && (
                  <p className="text-[10px] text-slate-400 mt-1">Each opportunity gets its own split %</p>
                )}
              </div>

              {/* Comments — shared */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1">
                  Comments <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </>
          ) : (
            <ul className="space-y-1.5">
              {results.map((r, i) => {
                const isErr = r.action.startsWith('error');
                return (
                  <li key={i} className={`text-xs rounded-md px-3 py-2 flex items-center justify-between ${isErr ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <span className="truncate flex-1">{r.name}</span>
                    <span className="shrink-0 ml-2 font-medium">
                      {isErr ? r.action : r.action === 'created' ? '✓ Created' : '✓ Updated'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
          {isDone ? (
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
              Close
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={isSaving}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isSaving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold flex items-center gap-1.5">
                {isSaving && <Loader2 size={12} className="animate-spin" />}
                {isSaving ? 'Saving…' : `Save${opportunities.length > 1 ? ` (${opportunities.length})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
