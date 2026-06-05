import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activitiesApi, useGlobalParams, apiUrl } from '@/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { PicklistFilter } from '@/components/PicklistFilter';
import { FilterInput } from '@/components/FilterInput';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import { usePageFilters } from '@/store/pageFilters';
import { DateRangeFilter, resolveDateRange, DATE_PRESETS } from '@/components/DateRangeFilter';
import { useState } from 'react';
import type { VisibilityState } from '@tanstack/react-table';

type Activity = Record<string, any>;

const PAGE = 'activities';
const TASK_KEY = 'activities-tasks';
const EVENT_KEY = 'activities-events';

const TASK_LABELS: Record<string, string> = {
  Subject: 'Subject', Status: 'Status', Priority: 'Priority',
  SE_Task_Type__c: 'SE Task Type', ActivityDate: 'Due Date', What: 'Related To',
};
const EVENT_LABELS: Record<string, string> = {
  Subject: 'Subject', StartDateTime: 'Start', EndDateTime: 'End',
  SE_Task_Type__c: 'SE Task Type', Meeting_Type__c: 'Meeting Type',
  RecordTypeName: 'Record Type', Remote__c: 'Remote', Location: 'Location', What: 'Related To',
};

export default function Activities() {
  const pf = usePageFilters();
  const type         = pf.get(PAGE, 'type');
  const taskStatus   = pf.get(PAGE, 'taskStatus');
  const taskPriority = pf.get(PAGE, 'taskPriority');
  const taskType     = pf.get(PAGE, 'taskType');
  const meetingType  = pf.get(PAGE, 'meetingType');
  const recordTypeId = pf.get(PAGE, 'recordTypeId');
  const subject      = pf.get(PAGE, 'subject');
  const datePreset   = pf.get(PAGE, 'datePreset', '');
  const dateFrom     = pf.get(PAGE, 'dateFrom');
  const dateTo       = pf.get(PAGE, 'dateTo');
  const set = (key: string) => (v: string) => pf.set(PAGE, key, v);

  const { from: resolvedFrom, to: resolvedTo } = datePreset
    ? resolveDateRange(datePreset, dateFrom, dateTo)
    : { from: dateFrom, to: dateTo };

  const [selected, setSelected] = useState<Activity | null>(null);
  const globalParams = useGlobalParams();

  const { getVisibility, setVisibility } = useColumnVisibility();
  const taskVisibility  = getVisibility(TASK_KEY);
  const eventVisibility = getVisibility(EVENT_KEY);

  const { data: rtResult } = useQuery({
    queryKey: ['event-record-types'],
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/activities/record-types'), { credentials: 'include' });
      return r.json() as Promise<{ values: { Id: string; Name: string }[] }>;
    },
    staleTime: Infinity,
  });
  const rtMap = useMemo(() => {
    const m: Record<string, string> = {};
    (rtResult?.values ?? []).forEach(rt => { m[rt.Id] = rt.Name; });
    return m;
  }, [rtResult]);

  const { data, isLoading } = useQuery({
    queryKey: ['activities', type, taskStatus, taskPriority, taskType, meetingType, recordTypeId, subject, datePreset, resolvedFrom, resolvedTo, globalParams],
    queryFn: () => activitiesApi.list({
      type: type || undefined,
      status: taskStatus || undefined,
      priority: taskPriority || undefined,
      taskType: taskType || undefined,
      meetingType: meetingType || undefined,
      recordTypeId: recordTypeId || undefined,
      subject: subject || undefined,
      dateFrom: resolvedFrom || undefined,
      dateTo: resolvedTo || undefined,
      limit: 100,
      ...globalParams,
    }),
  });

  const tasks: Activity[] = type === 'Event' ? [] : (data?.data?.tasks ?? (type === 'Task' ? data?.data?.records : []) ?? []);
  const rawEvents: Activity[] = type === 'Task' ? [] : (data?.data?.events ?? (type === 'Event' ? data?.data?.records : []) ?? []);
  const events: Activity[] = useMemo(() =>
    rawEvents.map(e => ({ ...e, _recordTypeName: e.RecordTypeId ? rtMap[e.RecordTypeId] : undefined })),
    [rawEvents, rtMap]
  );

  const { data: detailData } = useQuery({
    queryKey: ['activity-detail', selected?.Id],
    queryFn: () => activitiesApi.get(selected!.Id),
    enabled: !!selected?.Id,
  });

  const taskColumns = useMemo<ColumnDef<Activity>[]>(() => [
    {
      accessorKey: 'Subject',
      header: 'Subject',
      cell: ({ row }) => <RecordLink label={row.original.Subject} onClick={() => setSelected({ ...row.original, _type: 'Task' })} />,
    },
    {
      accessorKey: 'Status',
      header: 'Status',
      cell: ({ getValue }) => { const v = getValue() as string; return <Badge variant={statusVariant(v)}>{v}</Badge>; },
    },
    { accessorKey: 'Priority', header: 'Priority' },
    { accessorKey: 'SE_Task_Type__c', header: 'SE Task Type' },
    {
      accessorKey: 'ActivityDate',
      header: 'Due Date',
      cell: ({ getValue }) => fmtDate(getValue()),
    },
    {
      id: 'What',
      header: 'Related To',
      accessorFn: (r) => r.What?.Name,
      cell: ({ row }) => <RecordLink label={row.original.What?.Name} onClick={row.original.WhatId ? () => setSelected({ ...row.original, _type: 'Task' }) : undefined} />,
    },
  ], []);

  const eventColumns = useMemo<ColumnDef<Activity>[]>(() => [
    {
      accessorKey: 'Subject',
      header: 'Subject',
      cell: ({ row }) => <RecordLink label={row.original.Subject} onClick={() => setSelected({ ...row.original, _type: 'Event' })} />,
    },
    {
      accessorKey: 'StartDateTime',
      header: 'Start',
      cell: ({ getValue }) => fmtDateTime(getValue()),
    },
    {
      accessorKey: 'EndDateTime',
      header: 'End',
      cell: ({ getValue }) => fmtDateTime(getValue()),
    },
    { accessorKey: 'SE_Task_Type__c', header: 'SE Task Type' },
    { accessorKey: 'Meeting_Type__c', header: 'Meeting Type' },
    {
      id: 'RecordTypeName',
      header: 'Record Type',
      accessorFn: (r) => r._recordTypeName,
    },
    {
      accessorKey: 'Remote__c',
      header: 'Remote',
      cell: ({ getValue }) => getValue() ? <Badge variant="info">Remote</Badge> : <span className="text-slate-400 text-xs">—</span>,
    },
    { accessorKey: 'Location', header: 'Location' },
    {
      id: 'What',
      header: 'Related To',
      accessorFn: (r) => r.What?.Name,
    },
  ], []);

  const d = detailData?.data;

  return (
    <div>
      <PageHeader title="Activities" subtitle={`${tasks.length + events.length} records`} />

      <GlobalFilterBar
        statusSlot={
          <Select value={type} onChange={e => set('type')(e.target.value)} className="w-32 h-8 text-sm">
            <option value="">All</option>
            <option value="Task">Tasks</option>
            <option value="Event">Events</option>
          </Select>
        }
        extra={
          <div className="flex items-end gap-2 flex-wrap">
            <FilterInput value={subject} onChange={set('subject')} placeholder="Subject…" className="w-36" label="Subject" />
            <DateRangeFilter page={PAGE} />
            <PicklistFilter object="Task" field="SE_Task_Type__c" value={taskType} onChange={set('taskType')} placeholder="SE Task Type" label="SE Task Type" />
            {(type === '' || type === 'Task') && (
              <>
                <PicklistFilter object="Task" field="Status"   value={taskStatus}   onChange={set('taskStatus')}   placeholder="Status"   label="Status" />
                <PicklistFilter object="Task" field="Priority" value={taskPriority} onChange={set('taskPriority')} placeholder="Priority" label="Priority" />
                <ColumnPicker
                  columns={Object.entries(TASK_LABELS).map(([id, label]) => ({ id, label }))}
                  visibility={taskVisibility}
                  onChange={(id, visible) => setVisibility(TASK_KEY, { ...taskVisibility, [id]: visible })}
                  label="Task Cols"
                />
              </>
            )}
            {(type === '' || type === 'Event') && (
              <>
                <PicklistFilter object="Event" field="Meeting_Type__c" value={meetingType} onChange={set('meetingType')} placeholder="Meeting Type" label="Meeting Type" />
                <EventRecordTypeFilter value={recordTypeId} onChange={set('recordTypeId')} rtMap={rtMap} options={rtResult?.values ?? []} />
                <ColumnPicker
                  columns={Object.entries(EVENT_LABELS).map(([id, label]) => ({ id, label }))}
                  visibility={eventVisibility}
                  onChange={(id, visible) => setVisibility(EVENT_KEY, { ...eventVisibility, [id]: visible })}
                  label="Event Cols"
                />
              </>
            )}
          </div>
        }
      />

      {(type === '' || type === 'Task') && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
            Tasks <span className="text-xs font-normal text-slate-400">({tasks.length})</span>
          </h2>
          <DataTable
            data={tasks}
            columns={taskColumns}
            isLoading={isLoading && (type === 'Task' || type === '')}
            onRowClick={r => setSelected({ ...r, _type: 'Task' })}
            columnVisibility={taskVisibility}
            onColumnVisibilityChange={(updater) => {
              const next = typeof updater === 'function' ? updater(taskVisibility as VisibilityState) : updater;
              setVisibility(TASK_KEY, next);
            }}
          />
        </div>
      )}

      {(type === '' || type === 'Event') && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
            Events <span className="text-xs font-normal text-slate-400">({events.length})</span>
          </h2>
          <DataTable
            data={events}
            columns={eventColumns}
            isLoading={isLoading && (type === 'Event' || type === '')}
            onRowClick={r => setSelected({ ...r, _type: 'Event' })}
            columnVisibility={eventVisibility}
            onColumnVisibilityChange={(updater) => {
              const next = typeof updater === 'function' ? updater(eventVisibility as VisibilityState) : updater;
              setVisibility(EVENT_KEY, next);
            }}
          />
        </div>
      )}

      <RecordDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.Subject ?? ''} sfId={selected?.Id}>
        {d ? (
          <DetailSection title={`${selected?._type ?? 'Activity'} Details`}>
            <DetailGrid>
              <DetailField label="Subject" value={d.Subject} wide />
              {d.Status && <DetailField label="Status" value={<Badge variant={statusVariant(d.Status)}>{d.Status}</Badge>} />}
              {d.Priority && <DetailField label="Priority" value={d.Priority} />}
              {d.SE_Task_Type__c && <DetailField label="SE Task Type" value={d.SE_Task_Type__c} />}
              {d.ActivityDate && <DetailField label="Due Date" value={fmtDate(d.ActivityDate)} />}
              {d.StartDateTime && <DetailField label="Start" value={fmtDateTime(d.StartDateTime)} />}
              {d.EndDateTime && <DetailField label="End" value={fmtDateTime(d.EndDateTime)} />}
              {d.Meeting_Type__c && <DetailField label="Meeting Type" value={d.Meeting_Type__c} />}
              {d.RecordType?.Name && <DetailField label="Record Type" value={d.RecordType.Name} />}
              {d.Remote__c !== undefined && <DetailField label="Remote" value={d.Remote__c ? 'Yes' : 'No'} />}
              {d.Location && <DetailField label="Location" value={d.Location} />}
              <DetailField label="Related To" value={d.What?.Name} />
              <DetailField label="Owner" value={d.Owner?.Name} />
              {d.Description && <DetailField label="Description" value={d.Description} wide />}
            </DetailGrid>
          </DetailSection>
        ) : (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
        )}
      </RecordDrawer>
    </div>
  );
}

function EventRecordTypeFilter({
  value, onChange, options, rtMap,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { Id: string; Name: string }[];
  rtMap: Record<string, string>;
}) {
  if (!options.length) return null;
  const isNegated = value.startsWith('!');
  const bare = isNegated ? value.slice(1) : value;

  function toggle(id: string) {
    if (bare === id) {
      onChange('');
    } else {
      onChange(isNegated ? '!' + id : id);
    }
  }

  const label = bare ? (rtMap[bare] ?? bare) : 'Record Type';

  return (
    <div className="flex items-center gap-1">
      {bare && (
        <button
          onClick={() => onChange(isNegated ? bare : '!' + bare)}
          className={`h-8 px-1.5 rounded-md border text-xs font-bold transition-colors ${isNegated ? 'bg-red-100 text-red-600 border-red-300' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}
          title={isNegated ? 'Exclude mode — click to include' : 'Click to exclude (≠)'}
        >≠</button>
      )}
      <select
        value={bare}
        onChange={e => onChange(isNegated ? (e.target.value ? '!' + e.target.value : '') : e.target.value)}
        className={`h-8 px-2 rounded-md border text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${bare && !isNegated ? 'border-blue-400 bg-blue-50 text-blue-700' : bare && isNegated ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-200'}`}
      >
        <option value="">Record Type</option>
        {options.map(o => <option key={o.Id} value={o.Id}>{o.Name}</option>)}
      </select>
    </div>
  );
}
