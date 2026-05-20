import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Plane, Briefcase, Building2, ChevronDown, ChevronUp, Activity, Clock } from 'lucide-react';
import { dashboardApi } from '@/api';
import { Badge, statusVariant } from '@/components/ui/badge';
import { fmt$, fmtDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { usePageFilters } from '@/store/pageFilters';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { useAuthStore } from '@/store/auth';

const PAGE = 'dashboard';

const FC_COLOR: Record<string, string> = {
  Commit:       'bg-emerald-100 text-emerald-700',
  'Best Case':  'bg-blue-100 text-blue-700',
  Pipeline:     'bg-slate-100 text-slate-600',
  Omitted:      'bg-red-100 text-red-500',
};

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 truncate">{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function AccountOppRow({ account }: { account: any }) {
  const [expanded, setExpanded] = useState(false);
  const totalAmt = account.opps.reduce((s: number, o: any) => s + (o.amount ?? 0), 0);
  const totalDCSplit = account.opps.reduce((s: number, o: any) => s + (o.dcSplitAmount ?? 0), 0);

  return (
    <div className={`border rounded-2xl bg-white shadow-sm overflow-hidden transition-colors ${expanded ? 'border-blue-200' : 'border-slate-200'}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <Building2 size={15} className="text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{account.accountName}</div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500 flex-wrap">
            <span>{account.opps.length} opp{account.opps.length !== 1 ? 's' : ''}</span>
            {totalAmt > 0 && <span className="font-medium text-slate-600">{fmt$(totalAmt)} open</span>}
            {totalDCSplit > 0 && <span className="text-amber-600 font-medium">{fmt$(totalDCSplit)} my DC split</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {account.opps.map((o: any) => (
            <div key={o.oppId} className="px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-800 flex-1 min-w-0 truncate">{o.oppName}</span>
                {o.amount > 0 && <span className="text-xs text-slate-600 font-medium shrink-0">{fmt$(o.amount)}</span>}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {o.forecastCategory && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FC_COLOR[o.forecastCategory] ?? 'bg-slate-100 text-slate-600'}`}>
                    {o.forecastCategory}
                  </span>
                )}
                {o.stage && <span className="text-[10px] text-slate-500">{o.stage}</span>}
                <span className="text-[10px] text-slate-400">Close {fmtDate(o.closeDate)}</span>
                {o.dcSplitPct != null && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium border border-amber-100">
                    {o.dcSplitPct}% DC split
                  </span>
                )}
                {o.dcSplitAmount != null && o.dcSplitAmount > 0 && (
                  <span className="text-[10px] text-amber-600 font-medium">{fmt$(o.dcSplitAmount)}</span>
                )}
                {o.activityCount > 0 && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Activity size={9} className="shrink-0" />
                    {o.activityCount} logged
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const currentUser = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const pf = usePageFilters();
  const datePreset    = pf.get(PAGE, 'datePreset', 'current_fq');
  const customFrom    = pf.get(PAGE, 'dateFrom');
  const customTo      = pf.get(PAGE, 'dateTo');
  const ownerName     = pf.get(PAGE, 'ownerName');
  const ownerRole     = pf.get(PAGE, 'ownerRole');
  const justMyData    = pf.get(PAGE, 'justMyData');

  const { from, to } = resolveDateRange(datePreset, customFrom, customTo);

  const params: Record<string, string> = {
    ...(currentUser?.id ? { currentUserId: currentUser.id } : {}),
    ...(from ? { dateFrom: from } : {}),
    ...(to   ? { dateTo: to }   : {}),
    ...(justMyData === 'true' && currentUser?.id ? { justMyData: 'true' } : {}),
    ...(ownerName.trim() && justMyData !== 'true' ? { ownerName: ownerName.trim() } : {}),
    ...(ownerRole.trim() && justMyData !== 'true' && !ownerName.trim() ? { ownerRolePattern: ownerRole.trim() } : {}),
    limit: '10',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => dashboardApi.summary(params),
    enabled: !!currentUser?.id,
  });

  const d = data?.data;
  const stats = d?.stats ?? {};
  const travelApprovals: any[] = d?.travelApprovals ?? [];
  const accountOpps: any[] = d?.accountOpps ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 mb-4">Dashboard</h1>

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-end gap-4">
          <DateRangeFilter page={PAGE} defaultPreset="current_fq" label="Period" />

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Owner Name</span>
            <input
              type="text"
              value={ownerName}
              onChange={e => pf.set(PAGE, 'ownerName', e.target.value)}
              placeholder="e.g. Shannon"
              className="h-8 px-2 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 w-36"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Role Filter</span>
            <input
              type="text"
              value={ownerRole}
              onChange={e => pf.set(PAGE, 'ownerRole', e.target.value)}
              placeholder="e.g. PACE, AMER AE"
              className="h-8 px-2 rounded-md border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 w-44"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pb-1">
            <input
              type="checkbox"
              checked={justMyData === 'true'}
              onChange={e => pf.set(PAGE, 'justMyData', e.target.checked ? 'true' : '')}
              className="rounded"
            />
            <span className="text-xs text-slate-600 font-medium">Just my data</span>
          </label>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Clock}
          label="Customer Hours"
          value={isLoading ? '—' : `${stats.customerHours ?? '—'}h`}
          sub="events logged to accounts/opps"
          color="bg-blue-500"
        />
        <StatCard
          icon={Briefcase}
          label="Open DC Opps"
          value={isLoading ? '—' : (stats.dcCount ?? '—')}
          sub={stats.totalSplitAmount > 0 ? `${fmt$(stats.totalSplitAmount)} my split` : undefined}
          color="bg-amber-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Opp Amount"
          value={isLoading ? '—' : fmt$(stats.totalOppAmount)}
          sub="open opps w/ my DC"
          color="bg-slate-500"
        />
        <StatCard
          icon={Briefcase}
          label="DC Split Amount"
          value={isLoading ? '—' : fmt$(stats.totalSplitAmount)}
          sub="my split across open opps"
          color="bg-emerald-500"
        />
        <StatCard
          icon={Plane}
          label="Travel Approvals"
          value={isLoading ? '—' : (stats.travelCount ?? '—')}
          color="bg-violet-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Travel Approvals */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Travel Approvals</h2>
            <button onClick={() => navigate('/travel-approvals')} className="text-xs text-blue-600 hover:underline">View all →</button>
          </div>
          <div className="divide-y divide-slate-100">
            {isLoading && <p className="px-5 py-8 text-sm text-slate-400 text-center">Loading…</p>}
            {!isLoading && travelApprovals.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No travel approvals</p>
            )}
            {travelApprovals.map((t: any) => (
              <div key={t.Id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <Badge variant={statusVariant(t.Approval_Status__c)}>{t.Approval_Status__c ?? '—'}</Badge>
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{t.Name}</span>
                <span className="text-xs text-slate-400 shrink-0">{fmtDate(t.Travel_Start_Date__c)}</span>
                {t.Total_Cost__c != null && (
                  <span className="text-sm text-slate-500 shrink-0">{fmt$(t.Total_Cost__c)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* DC Opportunities summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Accounts & Opportunities with My DC</h2>
            <button onClick={() => navigate('/deal-contributions')} className="text-xs text-blue-600 hover:underline">View all →</button>
          </div>
          {isLoading && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-8 text-sm text-slate-400 text-center">Loading…</div>
          )}
          {!isLoading && accountOpps.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-8 text-sm text-slate-400 text-center">
              No open opportunities with your DC
            </div>
          )}
          {accountOpps.map((a: any) => (
            <AccountOppRow key={a.accountId} account={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
