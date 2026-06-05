import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Briefcase, Building2, ChevronDown, ChevronUp, Activity, ArrowRight, FileSearch } from 'lucide-react';
import { dashboardApi } from '@/api';
import { Badge, statusVariant } from '@/components/ui/badge';
import { fmt$, fmtCompact$, fmtDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { usePageFilters } from '@/store/pageFilters';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { useAuthStore } from '@/store/auth';

const PAGE = 'dashboard';

const FC_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Commit:      { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  'Best Case': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  Pipeline:    { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  Omitted:     { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
};

function StatCard({
  label, value, sub, accent, loading
}: {
  label: string; value: string | number; sub?: string;
  accent: 'amber' | 'blue' | 'green' | 'violet' | 'rose' | 'slate';
  loading?: boolean;
}) {
  const accentColors: Record<string, string> = {
    amber: '#f59e0b', blue: '#3b82f6', green: '#10b981',
    violet: '#8b5cf6', rose: '#f43f5e', slate: '#64748b',
  };
  const color = accentColors[accent];

  return (
    <div
      className={`stat-card stat-card-${accent} bg-white rounded-2xl px-5 py-4 relative`}
      style={{
        border: '1px solid #e8e5de',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {loading ? (
        <div className="space-y-2 pt-1">
          <div className="h-7 w-20 rounded shimmer" />
          <div className="h-3 w-28 rounded shimmer" />
        </div>
      ) : (
        <>
          <div
            className="text-[28px] font-medium leading-none tabular"
            style={{ color: '#0f0e1a', letterSpacing: '-0.02em' }}
          >
            {value}
          </div>
          <div className="text-[12px] text-slate-500 mt-1.5 font-medium">{label}</div>
          {sub && (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: color, opacity: 0.8 }}>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountOppRow({ account }: { account: any }) {
  const [expanded, setExpanded] = useState(false);
  const totalAmt = account.opps.reduce((s: number, o: any) => s + (o.amount ?? 0), 0);
  const totalDCSplit = account.opps.reduce((s: number, o: any) => s + (o.dcSplitAmount ?? 0), 0);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-150"
      style={{
        border: expanded ? '1px solid #fde68a' : '1px solid #e8e5de',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[#fafaf7]"
        onClick={() => setExpanded(v => !v)}
      >
        <Building2 size={14} className="text-slate-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-slate-800 truncate">{account.accountName}</div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
            <span>{account.opps.length} opp{account.opps.length !== 1 ? 's' : ''}</span>
            {totalAmt > 0 && (
              <span className="tabular font-medium text-slate-600">{fmt$(totalAmt)}</span>
            )}
            {totalDCSplit > 0 && (
              <span className="tabular font-medium" style={{ color: '#d97706' }}>{fmt$(totalDCSplit)} my split</span>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp size={13} className="text-slate-300 shrink-0" />
          : <ChevronDown size={13} className="text-slate-300 shrink-0" />
        }
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #f4f1ea' }}>
          {account.opps.map((o: any) => {
            const fc = FC_COLOR[o.forecastCategory] ?? FC_COLOR.Pipeline;
            return (
              <div key={o.oppId} className="px-4 py-3" style={{ borderTop: '1px solid #f8f6f0' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-slate-800 flex-1 min-w-0 truncate">{o.oppName}</span>
                  {o.amount > 0 && (
                    <span className="tabular text-[12px] text-slate-600 font-medium shrink-0">{fmt$(o.amount)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {o.forecastCategory && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: fc.bg, color: fc.text, border: `1px solid ${fc.border}` }}
                    >
                      {o.forecastCategory}
                    </span>
                  )}
                  {o.stage && <span className="text-[11px] text-slate-400">{o.stage}</span>}
                  <span className="text-[11px] text-slate-400 tabular">Close {fmtDate(o.closeDate)}</span>
                  {o.dcSplitPct != null && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}
                    >
                      {o.dcSplitPct}% split
                    </span>
                  )}
                  {o.dcSplitAmount != null && o.dcSplitAmount > 0 && (
                    <span className="tabular text-[11px] font-medium" style={{ color: '#d97706' }}>
                      {fmt$(o.dcSplitAmount)}
                    </span>
                  )}
                  {o.activityCount > 0 && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                      <Activity size={9} className="shrink-0" />
                      {o.activityCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e8e5de', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid #f0ede7' }}
      >
        <h2
          className="text-[13px] font-semibold text-slate-700"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const currentUser = useAuthStore(s => s.user);
  const navigate = useNavigate();

  const pf = usePageFilters();
  const datePreset = pf.get(PAGE, 'datePreset', 'current_fq');
  const customFrom = pf.get(PAGE, 'dateFrom');
  const customTo   = pf.get(PAGE, 'dateTo');
  const ownerName  = pf.get(PAGE, 'ownerName');
  const ownerRole  = pf.get(PAGE, 'ownerRole');
  const justMyData = pf.get(PAGE, 'justMyData');

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
  const activeDSRs: any[] = d?.activeDSRs ?? [];
  const accountOpps: any[] = d?.accountOpps ?? [];

  const inputClass = "h-8 px-3 rounded-lg border text-[12px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-slate-300 transition-shadow"
  const inputStyle = { borderColor: '#e0ddd6' };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1
          className="text-[22px] font-bold text-slate-900 mb-1"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
        >
          Dashboard
        </h1>
        <p className="text-[13px] text-slate-400">Your SE performance at a glance</p>
      </div>

      {/* Filter bar */}
      <div
        className="rounded-2xl px-5 py-4 flex flex-wrap items-end gap-4"
        style={{ background: '#fff', border: '1px solid #e8e5de', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <DateRangeFilter page={PAGE} defaultPreset="current_fq" label="Period" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Owner Name</span>
          <input
            type="text"
            value={ownerName}
            onChange={e => pf.set(PAGE, 'ownerName', e.target.value)}
            placeholder="e.g. Shannon"
            className={inputClass}
            style={{ ...inputStyle, width: 140 }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Role Filter</span>
          <input
            type="text"
            value={ownerRole}
            onChange={e => pf.set(PAGE, 'ownerRole', e.target.value)}
            placeholder="e.g. PACE, AMER AE"
            className={inputClass}
            style={{ ...inputStyle, width: 172 }}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer pb-0.5">
          <input
            type="checkbox"
            checked={justMyData === 'true'}
            onChange={e => pf.set(PAGE, 'justMyData', e.target.checked ? 'true' : '')}
            className="rounded accent-amber-500 w-3.5 h-3.5"
          />
          <span className="text-[12px] text-slate-600 font-medium">Just my data</span>
        </label>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Customer Hours"
          value={isLoading ? '—' : `${stats.customerHours ?? '—'}h`}
          sub="logged to accounts"
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          label="Open DC Opps"
          value={isLoading ? '—' : (stats.dcCount ?? '—')}
          sub={stats.totalSplitAmount > 0 ? `${fmtCompact$(stats.totalSplitAmount)} my split` : undefined}
          accent="amber"
          loading={isLoading}
        />
        <StatCard
          label="Total Opp Amount"
          value={isLoading ? '—' : fmtCompact$(stats.totalOppAmount)}
          sub="open opps w/ my DC"
          accent="slate"
          loading={isLoading}
        />
        <StatCard
          label="DC Split Amount"
          value={isLoading ? '—' : fmtCompact$(stats.totalSplitAmount)}
          sub="my split across opps"
          accent="green"
          loading={isLoading}
        />
        <StatCard
          label="Active DSRs"
          value={isLoading ? '—' : (stats.dsrCount ?? '—')}
          accent="violet"
          loading={isLoading}
        />
      </div>

      {/* Bottom two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Active DSRs */}
        <SectionCard
          title="Active DSRs"
          action={
            <button
              onClick={() => navigate('/dsr')}
              className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-70"
              style={{ color: '#d97706' }}
            >
              View all <ArrowRight size={11} />
            </button>
          }
        >
          <div>
            {isLoading && (
              <div className="px-5 py-8 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 rounded shimmer" />)}
              </div>
            )}
            {!isLoading && activeDSRs.length === 0 && (
              <p className="px-5 py-8 text-[13px] text-slate-400 text-center">No active DSRs</p>
            )}
            {activeDSRs.map((d: any) => (
              <div
                key={d.Id}
                className="px-5 py-3 flex items-center gap-3 transition-colors hover:bg-[#fafaf7] cursor-pointer"
                style={{ borderBottom: '1px solid #f5f2ec' }}
                onClick={() => navigate('/dsr')}
              >
                <FileSearch size={13} className="text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{d.Name}</span>
                    <Badge variant={statusVariant(d.Status__c)}>{d.Status__c}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{d.Oppty_Account__c ?? '—'} · {d.Opportunity__r?.Name ?? '—'}</p>
                </div>
                {d.Oppty_Amount__c != null && (
                  <span className="text-[12px] tabular text-slate-600 font-medium shrink-0">{fmtCompact$(d.Oppty_Amount__c)}</span>
                )}
                {d.Oppty_Close_Date__c && (
                  <span className="text-[11px] text-slate-400 tabular shrink-0">{fmtDate(d.Oppty_Close_Date__c)}</span>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* DC Opportunities */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2
              className="text-[13px] font-semibold text-slate-700"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Accounts & Opportunities with My DC
            </h2>
            <button
              onClick={() => navigate('/deal-contributions')}
              className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-70"
              style={{ color: '#d97706' }}
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}
            </div>
          )}
          {!isLoading && accountOpps.length === 0 && (
            <div
              className="rounded-2xl px-5 py-8 text-[13px] text-slate-400 text-center"
              style={{ background: '#fff', border: '1px solid #e8e5de' }}
            >
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
