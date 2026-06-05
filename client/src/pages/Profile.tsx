import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi, dealContributionsApi, activitiesApi, metaApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { PageHeader } from '@/components/PageHeader';
import { fmt$, fmtDate } from '@/lib/utils';
import { useUserPrefs } from '@/store/userPrefs';
import { LogOut } from 'lucide-react';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e8e5de',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const inputClass = "w-full h-9 px-3 rounded-lg border text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 transition-shadow";
const inputStyle: React.CSSProperties = { borderColor: '#e0ddd6' };

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  const { data: meData, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => authApi.me(),
  });

  const sfUser = meData?.data?.user;

  const {
    defaultRecordTypeId, defaultRecordTypeName,
    defaultSeTaskType, defaultRoleFilter,
    dcLookbackMonths,
    setDefaultRecordType, setDefaultSeTaskType, setDefaultRoleFilter,
    setDcLookbackMonths,
  } = useUserPrefs();

  const { data: rtData } = useQuery({
    queryKey: ['event-record-types'],
    queryFn: () => activitiesApi.recordTypes(),
    staleTime: Infinity,
  });
  const recordTypes: { Id: string; Name: string }[] = rtData?.data?.values ?? [];

  useEffect(() => {
    if (!defaultRecordTypeId && recordTypes.length > 0) {
      const solutions = recordTypes.find(rt => rt.Name === 'Solutions Event');
      if (solutions) setDefaultRecordType(solutions.Id, solutions.Name);
    }
  }, [recordTypes, defaultRecordTypeId]);

  const { data: taskTypeData } = useQuery({
    queryKey: ['se-task-types'],
    queryFn: () => metaApi.picklist('Event', 'SE_Task_Type__c'),
    staleTime: Infinity,
  });
  const seTaskTypes: string[] = taskTypeData?.data?.values ?? [];

  const { data: dcData } = useQuery({
    queryKey: ['deal-contributions-profile', user?.id],
    queryFn: () => dealContributionsApi.list({ seId: user!.id, limit: 10 }),
    enabled: !!user?.id,
  });

  const contributions = dcData?.data?.records ?? [];

  async function handleSignOut() {
    await authApi.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My Profile"
        subtitle="Your Salesforce account details and preferences"
        actions={
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-80 cursor-pointer"
            style={{
              background: '#fef2f2',
              color: '#ef4444',
              border: '1px solid #fecaca',
            }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[100, 200, 150].map((h, i) => (
            <div key={i} className="rounded-2xl shimmer" style={{ height: h }} />
          ))}
        </div>
      ) : (
        <>
          {/* Hero card */}
          <div className="p-6 mb-5 flex items-center gap-5" style={cardStyle}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-xl font-bold overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#0e0d1a', fontFamily: 'var(--font-display)' }}
            >
              {user?.photoUrl
                ? <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                : initials
              }
            </div>
            <div className="min-w-0">
              <h2
                className="text-[18px] font-bold text-slate-900 truncate"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
              >
                {sfUser?.Name || user?.name}
              </h2>
              <p className="text-[13px] text-slate-500 truncate">{sfUser?.Email || user?.email}</p>
              {(sfUser?.Title || (user as any)?.title) && (
                <p className="text-[12px] mt-0.5 font-medium" style={{ color: '#d97706' }}>
                  {sfUser?.Title || (user as any)?.title}
                </p>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="p-6 mb-4" style={cardStyle}>
            <DetailSection title="Account Details">
              <DetailGrid>
                <DetailField label="Name"       value={sfUser?.Name || user?.name} />
                <DetailField label="Email"      value={sfUser?.Email || user?.email} />
                <DetailField label="Title"      value={sfUser?.Title || (user as any)?.title} />
                <DetailField label="Department" value={sfUser?.Department || (user as any)?.department} />
                <DetailField label="Role"       value={sfUser?.UserRole?.Name || (user as any)?.role} />
                <DetailField label="Profile"    value={sfUser?.Profile?.Name || (user as any)?.profile} />
                <DetailField label="Last Login" value={sfUser?.LastLoginDate ? fmtDate(sfUser.LastLoginDate) : undefined} />
              </DetailGrid>
            </DetailSection>
          </div>

          {/* Logging Defaults */}
          <div className="p-6 mb-4" style={cardStyle}>
            <DetailSection title="Logging Defaults">
              <p className="text-[12px] text-slate-400 mb-5">Applied automatically when logging activities from Orbi Agent.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Default Event Record Type
                  </label>
                  <select
                    value={defaultRecordTypeId}
                    onChange={e => {
                      const rt = recordTypes.find(r => r.Id === e.target.value);
                      setDefaultRecordType(e.target.value, rt?.Name ?? '');
                    }}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">— none —</option>
                    {recordTypes.map(rt => (
                      <option key={rt.Id} value={rt.Id}>{rt.Name}</option>
                    ))}
                  </select>
                  {defaultRecordTypeName && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Currently: <span className="text-slate-600 font-medium">{defaultRecordTypeName}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Default SE Task Type
                  </label>
                  <select
                    value={defaultSeTaskType}
                    onChange={e => setDefaultSeTaskType(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">— none —</option>
                    {seTaskTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
                    DC Lookback Window
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={dcLookbackMonths}
                      onChange={e => setDcLookbackMonths(Math.max(1, Math.min(60, parseInt(e.target.value) || 24)))}
                      className={inputClass}
                      style={{ ...inputStyle, width: 80 }}
                    />
                    <span className="text-[12px] text-slate-500">months</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Accounts with DC or Activity in this window count as "Already Engaged"</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Default Role Filter
                  </label>
                  <input
                    type="text"
                    value={defaultRoleFilter}
                    onChange={e => setDefaultRoleFilter(e.target.value)}
                    placeholder="e.g. MAE, PACE"
                    className={inputClass}
                    style={inputStyle}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Pre-fills the Role Filter in Orbi Agent</p>
                </div>
              </div>
            </DetailSection>
          </div>

          {/* Recent Deal Contributions */}
          {contributions.length > 0 && (
            <div className="p-6" style={cardStyle}>
              <DetailSection title={`Recent Deal Contributions (${contributions.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0ede7' }}>
                        {['Opportunity', 'Role', 'Split %', 'Amount'].map(h => (
                          <th
                            key={h}
                            className="pb-2 pr-4 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-widest"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map((c: any) => (
                        <tr
                          key={c.Id}
                          className="hover:bg-[#fafaf7] transition-colors"
                          style={{ borderBottom: '1px solid #f8f6f1' }}
                        >
                          <td className="py-2.5 pr-4 text-[13px] text-slate-800 truncate max-w-xs">
                            {c.Opportunity__r?.Name || c.Opportunity__c}
                          </td>
                          <td className="py-2.5 pr-4 text-[13px] text-slate-500">{c.Opportunity_Role__c || '—'}</td>
                          <td className="py-2.5 pr-4 text-[13px] tabular text-slate-600">
                            {c.Split_Percentage__c != null ? `${c.Split_Percentage__c}%` : '—'}
                          </td>
                          <td className="py-2.5 text-[13px] tabular font-medium" style={{ color: '#d97706' }}>
                            {fmt$(c.Split_Amount__c)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            </div>
          )}
        </>
      )}
    </div>
  );
}
