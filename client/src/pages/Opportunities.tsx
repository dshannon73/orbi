import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, CheckCircle2, PlusCircle } from 'lucide-react';
import { opportunitiesApi, slackApi, useGlobalParams } from '@/api';
import { DCDialog, type DCOpportunity } from '@/components/DCDialog';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { PicklistFilter } from '@/components/PicklistFilter';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { DateRangeFilter, resolveDateRange } from '@/components/DateRangeFilter';
import { fmt$, fmtDate, fmtPct } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import { usePageFilters } from '@/store/pageFilters';
import type { VisibilityState } from '@tanstack/react-table';

const PAGE = 'opportunities';
const TABLE_KEY = 'opportunities';

type Opp = Record<string, any>;

const COLUMN_LABELS: Record<string, string> = {
  Name: 'Opportunity', Account: 'Account', StageName: 'Stage',
  Amount: 'Amount', CloseDate: 'Close Date', Probability: 'Prob %',
  Owner: 'Owner', myDC: 'DC?',
};

export default function Opportunities() {
  const pf = usePageFilters();
  const search           = pf.get(PAGE, 'search');
  const closed           = pf.get(PAGE, 'closed', 'false');
  const stage            = pf.get(PAGE, 'stage');
  const category         = pf.get(PAGE, 'category');
  const forecastCategory = pf.get(PAGE, 'forecastCategory');
  const datePreset       = pf.get(PAGE, 'datePreset', '');
  const customFrom       = pf.get(PAGE, 'dateFrom');
  const customTo         = pf.get(PAGE, 'dateTo');
  const amountMin        = pf.get(PAGE, 'amountMin');
  const amountMax        = pf.get(PAGE, 'amountMax');
  const set = (key: string) => (v: string) => pf.set(PAGE, key, v);

  const { from: closeDateFrom, to: closeDateTo } = (datePreset && datePreset !== 'custom')
    ? resolveDateRange(datePreset, customFrom, customTo)
    : { from: customFrom, to: customTo };

  const [selected, setSelected] = useState<Opp | null>(null);
  const [toast, setToast] = useState('');
  const [dcOpps, setDcOpps] = useState<DCOpportunity[] | null>(null);
  const globalParams = useGlobalParams();

  const { getVisibility, setVisibility } = useColumnVisibility();
  const columnVisibility = getVisibility(TABLE_KEY);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', search, closed, stage, category, forecastCategory, datePreset, closeDateFrom, closeDateTo, amountMin, amountMax, globalParams],
    queryFn: () => opportunitiesApi.list({
      search: search || undefined,
      closed,
      stage: stage || undefined,
      category: category || undefined,
      forecastCategory: forecastCategory || undefined,
      closeDateFrom: closeDateFrom || undefined,
      closeDateTo: closeDateTo || undefined,
      amountMin: amountMin || undefined,
      amountMax: amountMax || undefined,
      limit: 100,
      ...globalParams,
    }),
  });

  const { data: detail } = useQuery({
    queryKey: ['opportunity-detail', selected?.Id],
    queryFn: () => opportunitiesApi.get(selected!.Id),
    enabled: !!selected?.Id,
  });

  const records: Opp[] = data?.data?.records ?? [];

  const columns = useMemo<ColumnDef<Opp>[]>(() => [
    {
      accessorKey: 'Name',
      header: 'Opportunity',
      cell: ({ row }) => (
        <RecordLink label={row.original.Name} onClick={() => setSelected(row.original)} />
      ),
    },
    {
      id: 'Account',
      header: 'Account',
      accessorFn: (r) => r.Account?.Name,
      cell: ({ getValue }) => getValue() || <span className="text-slate-400">—</span>,
    },
    {
      accessorKey: 'StageName',
      header: 'Stage',
      cell: ({ getValue }) => { const v = getValue() as string; return <Badge variant={statusVariant(v)}>{v}</Badge>; },
    },
    {
      accessorKey: 'Amount',
      header: 'Amount',
      cell: ({ getValue }) => fmt$(getValue()),
    },
    {
      accessorKey: 'CloseDate',
      header: 'Close Date',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
    {
      accessorKey: 'Probability',
      header: 'Prob %',
      cell: ({ getValue }) => fmtPct(getValue()),
    },
    {
      id: 'Owner',
      header: 'Owner',
      accessorFn: (r) => r.Owner?.Name,
    },
    {
      id: 'myDC',
      header: 'DC?',
      enableSorting: true,
      size: 65,
      accessorFn: (r) => r._dcPct ?? -1,
      cell: ({ row }) => row.original._hasDC
        ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-xs"><CheckCircle2 size={13} /> {fmtPct(row.original._dcPct)}</span>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableResizing: false,
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="action" onClick={(e) => { e.stopPropagation(); setDcOpps([{ Id: row.original.Id, Name: row.original.Name, amount: row.original.Amount }]); }}>
            <PlusCircle size={11} /> DC
          </Button>
          <Button size="sm" variant="slack" onClick={(e) => { e.stopPropagation(); sendToSlack(row.original); }}>
            <Send size={11} /> Slack
          </Button>
        </div>
      ),
    },
  ], []);

  const pickerColumns = useMemo(() =>
    Object.entries(COLUMN_LABELS).map(([id, label]) => ({ id, label })), []);

  function handleVisibilityChange(id: string, visible: boolean) {
    setVisibility(TABLE_KEY, { ...columnVisibility, [id]: visible });
  }

  async function sendToSlack(opp: Opp) {
    const text = `*Opportunity: ${opp.Name}*\nAccount: ${opp.Account?.Name ?? '—'}\nStage: ${opp.StageName} | Amount: ${fmt$(opp.Amount)}\nClose Date: ${fmtDate(opp.CloseDate)}`;
    await slackApi.send('#general', text);
    setToast(`Sent "${opp.Name}" to Slack`);
    setTimeout(() => setToast(''), 3000);
  }

  const d = detail?.data;

  return (
    <div>
      <PageHeader title="Opportunities" subtitle={`${records.length} records`} />

      {toast && <div className="mb-3 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">{toast}</div>}

      <GlobalFilterBar
        search={search}
        onSearchChange={set('search')}
        searchPlaceholder="Search opportunities…"
        statusSlot={
          <Select value={closed} onChange={e => set('closed')(e.target.value)} className="w-32 h-8 text-sm">
            <option value="false">Open</option>
            <option value="true">Closed</option>
            <option value="">All</option>
          </Select>
        }
        extra={
          <div className="flex items-end gap-2 flex-wrap">
            <PicklistFilter object="Opportunity" field="StageName"            value={stage}           onChange={set('stage')}           placeholder="Stage"    label="Stage" />
            <PicklistFilter object="Opportunity" field="Type"                 value={category}        onChange={set('category')}        placeholder="Category" label="Category" />
            <PicklistFilter object="Opportunity" field="ForecastCategoryName" value={forecastCategory} onChange={set('forecastCategory')} placeholder="Forecast" label="Forecast" />
            <DateRangeFilter page={PAGE} defaultPreset="" label="Close Date" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide px-0.5">Amount ($)</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" value={amountMin} onChange={e => set('amountMin')(e.target.value)} placeholder="Min"
                  className={`h-8 w-24 px-2 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${amountMin ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} />
                <span className="text-xs text-slate-400">–</span>
                <input type="number" min="0" value={amountMax} onChange={e => set('amountMax')(e.target.value)} placeholder="Max"
                  className={`h-8 w-24 px-2 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${amountMax ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} />
              </div>
            </div>
            <ColumnPicker columns={pickerColumns} visibility={columnVisibility} onChange={handleVisibilityChange} />
          </div>
        }
      />

      <DataTable
        data={records}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(r) => setSelected(r)}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={(updater) => {
          const next = typeof updater === 'function' ? updater(columnVisibility as VisibilityState) : updater;
          setVisibility(TABLE_KEY, next);
        }}
        selectionActions={(rows, clear) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="action" onClick={() => { setDcOpps(rows.map(r => ({ Id: r.Id, Name: r.Name, amount: r.Amount }))); clear(); }}>
              <PlusCircle size={11} /> Add/Update DC ({rows.length})
            </Button>
            <Button size="sm" variant="slack" onClick={async () => {
              const text = rows.map(o => `• *${o.Name}* (${o.Account?.Name ?? '—'}) — ${o.StageName} | ${fmt$(o.Amount)} | ${fmtDate(o.CloseDate)}`).join('\n');
              await slackApi.send('#general', `*${rows.length} Opportunities*\n${text}`);
              setToast(`Sent ${rows.length} records to Slack`); clear();
              setTimeout(() => setToast(''), 3000);
            }}>
              <Send size={11} /> Send {rows.length} to Slack
            </Button>
          </div>
        )}
      />

      {dcOpps && <DCDialog opportunities={dcOpps} onClose={() => setDcOpps(null)} />}

      <RecordDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.Name ?? ''} sfId={selected?.Id}>
        {d?.opportunity ? (
          <>
            <div className="flex items-center gap-2 mb-5">
              <Badge variant={statusVariant(d.opportunity.StageName)} className="text-sm px-3 py-1">{d.opportunity.StageName}</Badge>
              {d.opportunity.IsWon && <Badge variant="success">Won</Badge>}
              {d.opportunity.IsClosed && !d.opportunity.IsWon && <Badge variant="danger">Closed Lost</Badge>}
            </div>
            <DetailSection title="Opportunity Details">
              <DetailGrid>
                <DetailField label="Account" value={d.opportunity.Account?.Name} />
                <DetailField label="Amount" value={fmt$(d.opportunity.Amount)} />
                <DetailField label="Close Date" value={fmtDate(d.opportunity.CloseDate)} />
                <DetailField label="Probability" value={fmtPct(d.opportunity.Probability)} />
                <DetailField label="Type" value={d.opportunity.Type} />
                <DetailField label="Lead Source" value={d.opportunity.LeadSource} />
                <DetailField label="Forecast Category" value={d.opportunity.ForecastCategoryName} />
                <DetailField label="Segment" value={d.opportunity.Segment__c} />
                <DetailField label="Owner" value={d.opportunity.Owner?.Name} />
                <DetailField label="Next Step" value={d.opportunity.NextStep} />
                <DetailField label="Description" value={d.opportunity.Description} wide />
              </DetailGrid>
            </DetailSection>

            {d.contributions?.length > 0 && (
              <DetailSection title={`Deal Contributions (${d.contributions.length})`}>
                <div className="space-y-2">
                  {d.contributions.map((c: any) => (
                    <div key={c.Id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm">
                      <span className="font-medium text-slate-800">{c.SE_Full_Name__c}</span>
                      <span className="text-slate-500">{c.Opportunity_Role__c}</span>
                      <span className="text-slate-700">{fmtPct(c.Split_Percentage__c)} · {fmt$(c.Split_Amount__c)}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {d.activities?.length > 0 && (
              <DetailSection title={`Recent Activities (${d.activities.length})`}>
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
