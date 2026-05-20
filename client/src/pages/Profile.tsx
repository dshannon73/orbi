import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi, dealContributionsApi, activitiesApi, metaApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { PageHeader } from '@/components/PageHeader';
import { fmt$, fmtDate } from '@/lib/utils';
import { useUserPrefs } from '@/store/userPrefs';

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
    setDefaultRecordType, setDefaultSeTaskType, setDefaultRoleFilter,
  } = useUserPrefs();

  const { data: rtData } = useQuery({
    queryKey: ['event-record-types'],
    queryFn: () => activitiesApi.recordTypes(),
    staleTime: Infinity,
  });
  const recordTypes: { Id: string; Name: string }[] = rtData?.data?.values ?? [];

  // Auto-default to "Solutions Event" on first load if not set
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
        subtitle="Your Salesforce account details"
        actions={
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Sign out
          </button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xl font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900 truncate">
                {sfUser?.Name || user?.name}
              </h2>
              <p className="text-sm text-slate-500 truncate">
                {sfUser?.Email || user?.email}
              </p>
              {(sfUser?.Title || user?.title) && (
                <p className="text-sm text-slate-600 mt-0.5">
                  {sfUser?.Title || user?.title}
                </p>
              )}
            </div>
          </div>

          {/* Detail Fields */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <DetailSection title="Account Details">
              <DetailGrid>
                <DetailField label="Name" value={sfUser?.Name || user?.name} />
                <DetailField label="Email" value={sfUser?.Email || user?.email} />
                <DetailField label="Title" value={sfUser?.Title || user?.title} />
                <DetailField label="Department" value={sfUser?.Department || user?.department} />
                <DetailField label="Role" value={sfUser?.UserRole?.Name || user?.role} />
                <DetailField label="Profile" value={sfUser?.Profile?.Name || user?.profile} />
                <DetailField
                  label="Last Login"
                  value={sfUser?.LastLoginDate ? fmtDate(sfUser.LastLoginDate) : undefined}
                />
              </DetailGrid>
            </DetailSection>
          </div>

          {/* Logging Defaults */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <DetailSection title="Logging Defaults">
              <p className="text-xs text-slate-400 mb-4">Applied automatically when logging activities from Orbi Agent.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                    Default Event Record Type
                  </label>
                  <select
                    value={defaultRecordTypeId}
                    onChange={e => {
                      const rt = recordTypes.find(r => r.Id === e.target.value);
                      setDefaultRecordType(e.target.value, rt?.Name ?? '');
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— none —</option>
                    {recordTypes.map(rt => (
                      <option key={rt.Id} value={rt.Id}>{rt.Name}</option>
                    ))}
                  </select>
                  {defaultRecordTypeName && (
                    <p className="text-[10px] text-slate-400 mt-1">Currently: <span className="text-slate-600 font-medium">{defaultRecordTypeName}</span></p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                    Default SE Task Type
                  </label>
                  <select
                    value={defaultSeTaskType}
                    onChange={e => setDefaultSeTaskType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— none —</option>
                    {seTaskTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1.5">
                    Default Role Filter
                  </label>
                  <input
                    type="text"
                    value={defaultRoleFilter}
                    onChange={e => setDefaultRoleFilter(e.target.value)}
                    placeholder="e.g. MAE, PACE"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Pre-fills the Role Filter in Orbi Agent</p>
                </div>
              </div>
            </DetailSection>
          </div>

          {/* Recent Deal Contributions */}
          {contributions.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <DetailSection title={`Recent Deal Contributions (${contributions.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                        <th className="pb-2 pr-4 font-medium">Opportunity</th>
                        <th className="pb-2 pr-4 font-medium">Role</th>
                        <th className="pb-2 pr-4 font-medium">Split %</th>
                        <th className="pb-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {contributions.map((c: any) => (
                        <tr key={c.Id}>
                          <td className="py-2 pr-4 text-slate-800 truncate max-w-xs">{c.Opportunity__r?.Name || c.Opportunity__c}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.Opportunity_Role__c || '—'}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.Split_Percentage__c != null ? `${c.Split_Percentage__c}%` : '—'}</td>
                          <td className="py-2 text-slate-700">{fmt$(c.Split_Amount__c)}</td>
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
