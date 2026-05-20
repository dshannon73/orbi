import { useState, useMemo } from 'react';
import { usePageFilters } from '@/store/pageFilters';
import { useQuery } from '@tanstack/react-query';
import { Send, AlertTriangle } from 'lucide-react';
import { travelApprovalsApi, slackApi, useGlobalParams } from '@/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { PicklistFilter } from '@/components/PicklistFilter';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { fmt$, fmtDate } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import type { VisibilityState } from '@tanstack/react-table';

const TABLE_KEY = 'travel-approvals';

const COLUMN_LABELS: Record<string, string> = {
  Name: 'Approval #',
  Approval_Status__c: 'Status',
  Reason_for_Travel__c: 'Reason',
  Travel_Start_Date__c: 'Start',
  Travel_End_Date__c: 'End',
  Total_Cost__c: 'Total Cost',
  Travelers_Manager__c: 'Manager',
  CFO_Approval_Required__c: 'CFO Req',
  Owner: 'Owner',
};

type Travel = Record<string, any>;

export default function TravelApprovals() {
  const pf = usePageFilters();
  const status = pf.get('travel-approvals', 'status');
  const setStatus = (v: string) => pf.set('travel-approvals', 'status', v);
  const [selected, setSelected] = useState<Travel | null>(null);
  const [toast, setToast] = useState('');
  const globalParams = useGlobalParams();

  const { getVisibility, setVisibility } = useColumnVisibility();
  const columnVisibility = getVisibility(TABLE_KEY);

  const { data, isLoading } = useQuery({
    queryKey: ['travel-approvals', status, globalParams],
    queryFn: () => travelApprovalsApi.list({ status: status || undefined, limit: 100, ...globalParams }),
  });

  const { data: detail } = useQuery({
    queryKey: ['travel-detail', selected?.Id],
    queryFn: () => travelApprovalsApi.get(selected!.Id),
    enabled: !!selected?.Id,
  });

  const records: Travel[] = data?.data?.records ?? [];

  const columns = useMemo<ColumnDef<Travel>[]>(() => [
    {
      accessorKey: 'Name',
      header: 'Approval #',
      cell: ({ row }) => (
        <RecordLink label={row.original.Name} onClick={() => setSelected(row.original)} />
      ),
    },
    {
      accessorKey: 'Approval_Status__c',
      header: 'Status',
      cell: ({ getValue }) => { const v = getValue() as string; return <Badge variant={statusVariant(v)}>{v ?? '—'}</Badge>; },
    },
    { accessorKey: 'Reason_for_Travel__c', header: 'Reason' },
    {
      accessorKey: 'Travel_Start_Date__c',
      header: 'Start',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
    {
      accessorKey: 'Travel_End_Date__c',
      header: 'End',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
    {
      accessorKey: 'Total_Cost__c',
      header: 'Total Cost',
      cell: ({ getValue }) => fmt$(getValue()),
    },
    { accessorKey: 'Travelers_Manager__c', header: 'Manager' },
    {
      accessorKey: 'CFO_Approval_Required__c',
      header: 'CFO Req',
      cell: ({ getValue }) => getValue() ? <Badge variant="danger"><AlertTriangle size={10} className="mr-1" />Yes</Badge> : <span className="text-slate-400 text-xs">—</span>,
    },
    {
      id: 'Owner',
      header: 'Owner',
      accessorFn: (r) => r.Owner?.Name,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableResizing: false,
      size: 70,
      cell: ({ row }) => (
        <Button size="sm" variant="slack" onClick={(e) => { e.stopPropagation(); sendToSlack(row.original); }}>
          <Send size={11} /> Slack
        </Button>
      ),
    },
  ], []);

  async function sendToSlack(t: Travel) {
    const text = `*Travel Approval: ${t.Name}*\nStatus: ${t.Approval_Status__c}\nDates: ${fmtDate(t.Travel_Start_Date__c)} → ${fmtDate(t.Travel_End_Date__c)}\nReason: ${t.Reason_for_Travel__c ?? '—'}\nTotal Cost: ${fmt$(t.Total_Cost__c)}\nManager: ${t.Travelers_Manager__c ?? '—'}${t.CFO_Approval_Required__c ? '\n⚠️ CFO Approval Required' : ''}`;
    await slackApi.send('#general', text);
    setToast(`Sent "${t.Name}" to Slack`);
    setTimeout(() => setToast(''), 3000);
  }

  const d = detail?.data;

  return (
    <div>
      <PageHeader title="Travel Approvals" subtitle={`${records.length} records`} />
      {toast && <div className="mb-3 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">{toast}</div>}

      <GlobalFilterBar
        statusSlot={
          <PicklistFilter
            object="Travel_Approval__c"
            field="Approval_Status__c"
            value={status}
            onChange={setStatus}
            placeholder="Status"
          />
        }
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
        selectionActions={(rows, clear) => (
          <Button size="sm" variant="slack" onClick={async () => {
            const text = rows.map(t => `• *${t.Name}* — ${t.Approval_Status__c} | ${fmtDate(t.Travel_Start_Date__c)}→${fmtDate(t.Travel_End_Date__c)} | ${fmt$(t.Total_Cost__c)}`).join('\n');
            await slackApi.send('#general', `*${rows.length} Travel Approvals*\n${text}`);
            setToast(`Sent ${rows.length} records to Slack`); clear();
            setTimeout(() => setToast(''), 3000);
          }}>
            <Send size={11} /> Send {rows.length} to Slack
          </Button>
        )}
      />

      <RecordDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.Name ?? ''} sfId={selected?.Id}>
        {d ? (
          <>
            <div className="flex items-center gap-2 mb-5">
              <Badge variant={statusVariant(d.Approval_Status__c)} className="text-sm px-3 py-1">{d.Approval_Status__c ?? '—'}</Badge>
              {d.CFO_Approval_Required__c && <Badge variant="danger"><AlertTriangle size={12} className="mr-1" />CFO Approval Required</Badge>}
            </div>
            <DetailSection title="Trip Details">
              <DetailGrid>
                <DetailField label="Reason for Travel" value={d.Reason_for_Travel__c} />
                <DetailField label="Owner" value={d.Owner?.Name} />
                <DetailField label="Start Date" value={fmtDate(d.Travel_Start_Date__c)} />
                <DetailField label="End Date" value={fmtDate(d.Travel_End_Date__c)} />
                <DetailField label="Manager" value={d.Travelers_Manager__c} />
                <DetailField label="Total Opp Value" value={fmt$(d.Total_Opportunity_Value__c)} />
                <DetailField label="Description" value={d.Description_of_Trip__c} wide />
              </DetailGrid>
            </DetailSection>
            <DetailSection title="Costs">
              <DetailGrid>
                <DetailField label="Hotel / Night" value={fmt$(d.Hotel_Cost_Night__c)} />
                <DetailField label="Hotel Total" value={fmt$(d.Hotel__c)} />
                <DetailField label="Other" value={fmt$(d.Other__c)} />
                <DetailField label="Total Cost" value={<span className="font-semibold text-slate-900">{fmt$(d.Total_Cost__c)}</span>} />
              </DetailGrid>
            </DetailSection>
            <DetailSection title="Approval Chain">
              <DetailGrid>
                {[1,2,3,4,5,6,7].map(n => d[`Level_${n}__c`] && (
                  <DetailField key={n} label={`Level ${n}`} value={d[`Level_${n}__c`]} />
                ))}
                <DetailField label="In My Queue" value={d.Approval_in_My_Queue__c} />
              </DetailGrid>
            </DetailSection>
          </>
        ) : (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
        )}
      </RecordDrawer>
    </div>
  );
}
