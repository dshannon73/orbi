import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, CheckCircle2, ExternalLink, PlusCircle } from 'lucide-react';
import { dealContributionsApi, opportunitiesApi, slackApi, useGlobalParams } from '@/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { FilterInput } from '@/components/FilterInput';
import { PicklistFilter } from '@/components/PicklistFilter';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { fmt$, fmtDate, fmtPct } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import { usePageFilters } from '@/store/pageFilters';
import { DCDialog, type DCOpportunity } from '@/components/DCDialog';
import type { VisibilityState } from '@tanstack/react-table';

const PAGE = 'deal-contributions';
const TABLE_KEY = 'deal-contributions';

const COLUMN_LABELS: Record<string, string> = {
  SE_Full_Name__c: 'SE Name',
  Opportunity: 'Opportunity',
  Opportunity_Role__c: 'Role',
  Split_Percentage__c: 'Split %',
  Split_Amount__c: 'Split $',
  Opportunity_Amount__c: 'Opp Amount',
  Opportunity_Close_Date__c: 'Close Date',
  Opportunity_Closed__c: 'Status',
  SE_Region__c: 'Region',
  myDC: 'My DC?',
};

type DC = Record<string, any>;

export default function DealContributions() {
  const pf = usePageFilters();
  const closed           = pf.get(PAGE, 'closed');
  const oppName          = pf.get(PAGE, 'oppName');
  const amountMin        = pf.get(PAGE, 'amountMin');
  const amountMax        = pf.get(PAGE, 'amountMax');
  const forecastCategory = pf.get(PAGE, 'forecastCategory');
  const set = (key: string) => (v: string) => pf.set(PAGE, key, v);
  const setClosed = set('closed');
  const [selected, setSelected] = useState<DC | null>(null);
  const [oppDetail, setOppDetail] = useState<any>(null);
  const [toast, setToast] = useState('');
  const [dcOpps, setDcOpps] = useState<DCOpportunity[] | null>(null);
  const globalParams = useGlobalParams();

  const { getVisibility, setVisibility } = useColumnVisibility();
  const columnVisibility = getVisibility(TABLE_KEY);

  const { data, isLoading } = useQuery({
    queryKey: ['deal-contributions', closed, oppName, amountMin, amountMax, forecastCategory, globalParams],
    queryFn: () => dealContributionsApi.list({
      closed: closed || undefined,
      oppName: oppName || undefined,
      amountMin: amountMin || undefined,
      amountMax: amountMax || undefined,
      forecastCategory: forecastCategory || undefined,
      limit: 100,
      ...globalParams,
    }),
  });

  const { data: detailData } = useQuery({
    queryKey: ['dc-detail', selected?.Id],
    queryFn: () => dealContributionsApi.get(selected!.Id),
    enabled: !!selected?.Id,
  });

  const { data: oppData } = useQuery({
    queryKey: ['opp-for-dc', oppDetail],
    queryFn: () => opportunitiesApi.get(oppDetail),
    enabled: !!oppDetail,
  });

  const records: DC[] = data?.data?.records ?? [];

  const columns = useMemo<ColumnDef<DC>[]>(() => [
    {
      accessorKey: 'SE_Full_Name__c',
      header: 'SE Name',
      cell: ({ row }) => (
        <RecordLink label={row.original.SE_Full_Name__c || row.original.Name} onClick={() => setSelected(row.original)} />
      ),
    },
    {
      id: 'Opportunity',
      header: 'Opportunity',
      accessorFn: (r) => r.Opportunity__r?.Name,
      cell: ({ row }) => (
        <RecordLink
          label={row.original.Opportunity__r?.Name}
          onClick={() => { setSelected(row.original); setOppDetail(row.original.Opportunity__c); }}
        />
      ),
    },
    { accessorKey: 'Opportunity_Role__c', header: 'Role' },
    {
      accessorKey: 'Split_Percentage__c',
      header: 'Split %',
      cell: ({ getValue }) => fmtPct(getValue()),
    },
    {
      accessorKey: 'Split_Amount__c',
      header: 'Split $',
      cell: ({ getValue }) => fmt$(getValue()),
    },
    {
      accessorKey: 'Opportunity_Amount__c',
      header: 'Opp Amount',
      cell: ({ getValue }) => fmt$(getValue()),
    },
    {
      accessorKey: 'Opportunity_Close_Date__c',
      header: 'Close Date',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
    {
      accessorKey: 'Opportunity_Closed__c',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={getValue() === 'true' ? 'success' : 'info'}>{getValue() === 'true' ? 'Closed' : 'Open'}</Badge>
      ),
    },
    { accessorKey: 'SE_Region__c', header: 'Region' },
    {
      id: 'myDC',
      header: 'My DC?',
      enableSorting: true,
      size: 80,
      accessorFn: (r) => r._myDC != null ? r._myDC : -1,
      cell: ({ row }) => row.original._myDC != null
        ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-xs"><CheckCircle2 size={13} /> {fmtPct(row.original._myDC)}</span>
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
          <Button size="sm" variant="action" onClick={(e) => {
            e.stopPropagation();
            const opp = row.original.Opportunity__c ? { Id: row.original.Opportunity__c, Name: row.original.Opportunity__r?.Name ?? row.original.Opportunity__c, amount: row.original.Opportunity_Amount__c } : null;
            if (opp) setDcOpps([opp]);
          }}>
            <PlusCircle size={11} /> DC
          </Button>
          <Button size="sm" variant="slack" onClick={(e) => { e.stopPropagation(); sendToSlack(row.original); }}>
            <Send size={11} /> Slack
          </Button>
        </div>
      ),
    },
  ], []);

  async function sendToSlack(d: DC) {
    const text = `*Deal Contribution*\nSE: ${d.SE_Full_Name__c}\nOpp: ${d.Opportunity__r?.Name ?? '—'}\nRole: ${d.Opportunity_Role__c ?? '—'}\nSplit: ${fmtPct(d.Split_Percentage__c)} · ${fmt$(d.Split_Amount__c)}\nClose: ${fmtDate(d.Opportunity_Close_Date__c)}`;
    await slackApi.send('#general', text);
    setToast('Sent to Slack');
    setTimeout(() => setToast(''), 3000);
  }

  const d = detailData?.data;

  return (
    <div>
      <PageHeader title="Deal Contributions" subtitle={`${records.length} records`} />
      {toast && <div className="mb-3 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">{toast}</div>}

      <GlobalFilterBar
        statusSlot={
          <Select value={closed} onChange={e => setClosed(e.target.value)} className="w-40 h-8 text-sm">
            <option value="">All</option>
            <option value="false">Open Opps</option>
            <option value="true">Closed Opps</option>
          </Select>
        }
        extra={
          <div className="flex items-end gap-2 flex-wrap">
            <FilterInput value={oppName} onChange={set('oppName')} placeholder="Opportunity name…" className="w-44" label="Opportunity" />
            <PicklistFilter object="Opportunity" field="ForecastCategoryName" value={forecastCategory} onChange={set('forecastCategory')} placeholder="Forecast" label="Forecast" />
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
            <ColumnPicker
              columns={Object.entries(COLUMN_LABELS).map(([id, label]) => ({ id, label }))}
              visibility={columnVisibility}
              onChange={(id, visible) => setVisibility(TABLE_KEY, { ...columnVisibility, [id]: visible })}
            />
          </div>
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
        selectionActions={(rows, clear) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="action" onClick={() => {
              // Deduplicate by opportunity ID
              const seen = new Set<string>();
              const opps = rows
                .filter(r => r.Opportunity__c && !seen.has(r.Opportunity__c) && seen.add(r.Opportunity__c))
                .map(r => ({ Id: r.Opportunity__c, Name: r.Opportunity__r?.Name ?? r.Opportunity__c, amount: r.Opportunity_Amount__c }));
              if (opps.length) { setDcOpps(opps); clear(); }
            }}>
              <PlusCircle size={11} /> Add/Update DC ({[...new Set(rows.map(r => r.Opportunity__c).filter(Boolean))].length} opps)
            </Button>
            <Button size="sm" variant="slack" onClick={async () => {
              const text = rows.map(r => `• *${r.SE_Full_Name__c}* — ${r.Opportunity__r?.Name ?? '—'} | ${fmtPct(r.Split_Percentage__c)} · ${fmt$(r.Split_Amount__c)}`).join('\n');
              await slackApi.send('#general', `*${rows.length} Deal Contributions*\n${text}`);
              setToast(`Sent ${rows.length} records to Slack`); clear();
              setTimeout(() => setToast(''), 3000);
            }}>
              <Send size={11} /> Send {rows.length} to Slack
            </Button>
          </div>
        )}
      />

      {dcOpps && <DCDialog opportunities={dcOpps} onClose={() => setDcOpps(null)} />}

      <RecordDrawer open={!!selected} onClose={() => { setSelected(null); setOppDetail(null); }} title={`${d?.SE_Full_Name__c ?? selected?.SE_Full_Name__c ?? ''}`} sfId={selected?.Id}>
        {d ? (
          <>
            <DetailSection title="Contribution Details">
              <DetailGrid>
                <DetailField label="SE Name" value={d.SE_Full_Name__c} />
                <DetailField label="SE Role" value={d.SE_Role__c} />
                <DetailField label="SE Region" value={d.SE_Region__c} />
                <DetailField label="SE Classification" value={d.SE_Classification__c} />
                <DetailField label="Role on Opp" value={d.Opportunity_Role__c} />
                <DetailField label="Expert Count" value={d.Expert_Count__c} />
              </DetailGrid>
            </DetailSection>
            <DetailSection title="Split & Amounts">
              <DetailGrid>
                <DetailField label="Split %" value={fmtPct(d.Split_Percentage__c)} />
                <DetailField label="Split Amount" value={fmt$(d.Split_Amount__c)} />
                <DetailField label="Split Won Amount" value={fmt$(d.Split_Won_Amount__c)} />
                <DetailField label="Opp Amount" value={fmt$(d.Opportunity_Amount__c)} />
                <DetailField label="Cap Override" value={d.Cap_Override__c ? 'Yes' : 'No'} />
              </DetailGrid>
            </DetailSection>
            <DetailSection title="Opportunity">
              <DetailGrid>
                <DetailField label="Opportunity" value={
                  <div className="flex items-center gap-2">
                    <RecordLink label={d.Opportunity__r?.Name} onClick={() => setOppDetail(d.Opportunity__c)} />
                    {d.Opportunity__c && (
                      <a
                        href={`https://org62.my.salesforce.com/${d.Opportunity__c}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Open in Salesforce"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                } />
                <DetailField label="Close Date" value={fmtDate(d.Opportunity_Close_Date__c)} />
                <DetailField label="Status" value={<Badge variant={d.Opportunity_Closed__c === 'true' ? 'success' : 'info'}>{d.Opportunity_Closed__c === 'true' ? 'Closed' : 'Open'}</Badge>} />
              </DetailGrid>
            </DetailSection>
            {d.Comments__c && <DetailSection title="Comments"><p className="text-sm text-slate-700">{d.Comments__c}</p></DetailSection>}

            {oppData?.data?.opportunity && (
              <DetailSection title="Opportunity Detail">
                <DetailGrid>
                  <DetailField label="Stage" value={<Badge variant={statusVariant(oppData.data.opportunity.StageName)}>{oppData.data.opportunity.StageName}</Badge>} />
                  <DetailField label="Account" value={oppData.data.opportunity.Account?.Name} />
                  <DetailField label="Amount" value={fmt$(oppData.data.opportunity.Amount)} />
                  <DetailField label="Owner" value={oppData.data.opportunity.Owner?.Name} />
                </DetailGrid>
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
