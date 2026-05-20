import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageFilters } from '@/store/pageFilters';
import { accountsApi, useGlobalParams } from '@/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge, statusVariant } from '@/components/ui/badge';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { fmt$, fmtDate } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import type { VisibilityState } from '@tanstack/react-table';

const TABLE_KEY = 'accounts';

const COLUMN_LABELS: Record<string, string> = {
  Name: 'Account',
  Type: 'Type',
  Industry: 'Industry',
  NumberOfEmployees: 'Employees',
  AnnualRevenue: 'Annual Revenue',
  Owner: 'Owner',
  Location: 'Location',
  LastActivityDate: 'Last Activity',
};

type Acct = Record<string, any>;

export default function Accounts() {
  const pf = usePageFilters();
  const search = pf.get('accounts', 'search');
  const setSearch = (v: string) => pf.set('accounts', 'search', v);
  const [selected, setSelected] = useState<Acct | null>(null);
  const globalParams = useGlobalParams();

  const { getVisibility, setVisibility } = useColumnVisibility();
  const columnVisibility = getVisibility(TABLE_KEY);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', search, globalParams],
    queryFn: () => accountsApi.list({ search: search || undefined, limit: 100, ...globalParams }),
  });

  const { data: detail } = useQuery({
    queryKey: ['account-detail', selected?.Id],
    queryFn: () => accountsApi.get(selected!.Id),
    enabled: !!selected?.Id,
  });

  const records: Acct[] = data?.data?.records ?? [];

  const columns = useMemo<ColumnDef<Acct>[]>(() => [
    {
      accessorKey: 'Name',
      header: 'Account',
      cell: ({ row }) => <RecordLink label={row.original.Name} onClick={() => setSelected(row.original)} />,
    },
    { accessorKey: 'Type', header: 'Type' },
    { accessorKey: 'Industry', header: 'Industry' },
    {
      accessorKey: 'NumberOfEmployees',
      header: 'Employees',
      cell: ({ getValue }) => getValue()?.toLocaleString() ?? <span className="text-slate-400">—</span>,
    },
    {
      accessorKey: 'AnnualRevenue',
      header: 'Annual Revenue',
      cell: ({ getValue }) => fmt$(getValue()),
    },
    {
      id: 'Owner',
      header: 'Owner',
      accessorFn: (r) => r.Owner?.Name,
    },
    {
      id: 'Location',
      header: 'Location',
      accessorFn: (r) => [r.BillingCity, r.BillingState, r.BillingCountry].filter(Boolean).join(', ') || '—',
    },
    {
      accessorKey: 'LastActivityDate',
      header: 'Last Activity',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
  ], []);

  const d = detail?.data;

  return (
    <div>
      <PageHeader title="Accounts" subtitle={`${records.length} records`} />

      <GlobalFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search accounts…"
        extra={
          <ColumnPicker
            columns={Object.entries(COLUMN_LABELS).map(([id, label]) => ({ id, label }))}
            visibility={columnVisibility}
            onChange={(id, visible) => setVisibility(TABLE_KEY, { ...columnVisibility, [id]: visible })}
          />
        }
      />

      <DataTable
          data={records}
          columns={columns}
          isLoading={isLoading}
          onRowClick={setSelected}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={(updater) => {
            const next = typeof updater === 'function' ? updater(columnVisibility as VisibilityState) : updater;
            setVisibility(TABLE_KEY, next);
          }}
          selectionActions={(_rows, clear) => (
            <button onClick={clear} className="text-blue-200 hover:text-white underline text-xs cursor-pointer">Clear</button>
          )}
        />

      <RecordDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.Name ?? ''} sfId={selected?.Id}>
        {d?.account ? (
          <>
            <DetailSection title="Account Details">
              <DetailGrid>
                <DetailField label="Type" value={d.account.Type} />
                <DetailField label="Industry" value={d.account.Industry} />
                <DetailField label="Employees" value={d.account.NumberOfEmployees?.toLocaleString()} />
                <DetailField label="Annual Revenue" value={fmt$(d.account.AnnualRevenue)} />
                <DetailField label="Owner" value={d.account.Owner?.Name} />
                <DetailField label="Location" value={[d.account.BillingCity, d.account.BillingState, d.account.BillingCountry].filter(Boolean).join(', ')} />
                <DetailField label="Description" value={d.account.Description} wide />
              </DetailGrid>
            </DetailSection>

            {d.opportunities?.length > 0 && (
              <DetailSection title={`Opportunities (${d.opportunities.length})`}>
                <div className="space-y-1.5">
                  {d.opportunities.map((o: any) => (
                    <div key={o.Id} className="flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-lg text-sm">
                      <Badge variant={statusVariant(o.StageName)}>{o.StageName}</Badge>
                      <span className="flex-1 font-medium text-slate-800 truncate">{o.Name}</span>
                      <span className="text-slate-500 shrink-0">{fmt$(o.Amount)}</span>
                      <span className="text-slate-400 text-xs shrink-0">{fmtDate(o.CloseDate)}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {d.activities?.length > 0 && (
              <DetailSection title={`Recent Tasks (${d.activities.length})`}>
                <div className="space-y-1.5">
                  {d.activities.map((a: any) => (
                    <div key={a.Id} className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 rounded-lg text-sm">
                      <Badge variant={statusVariant(a.Status)}>{a.Status}</Badge>
                      <span className="flex-1 text-slate-800 truncate">{a.Subject}</span>
                      <span className="text-slate-400 text-xs shrink-0">{fmtDate(a.ActivityDate)}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
        )}
      </RecordDrawer>
    </div>
  );
}
