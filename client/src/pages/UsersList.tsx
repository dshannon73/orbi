import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageFilters } from '@/store/pageFilters';
import { usersApi } from '@/api';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { GlobalFilterBar } from '@/components/GlobalFilterBar';
import { ColumnPicker } from '@/components/ColumnPicker';
import { PageHeader } from '@/components/PageHeader';
import { RecordLink } from '@/components/RecordLink';
import { Badge } from '@/components/ui/badge';
import { RecordDrawer, DetailGrid, DetailField, DetailSection } from '@/components/RecordDrawer';
import { fmtDate } from '@/lib/utils';
import { useColumnVisibility } from '@/store/columnVisibility';
import { useFilters } from '@/store/filters';
import type { VisibilityState } from '@tanstack/react-table';

const TABLE_KEY = 'users';

const COLUMN_LABELS: Record<string, string> = {
  Name: 'Name',
  Email: 'Email',
  Title: 'Title',
  Department: 'Department',
  Role: 'Role',
  Profile: 'Profile',
  IsActive: 'Active',
  LastLoginDate: 'Last Login',
};

type User = Record<string, any>;

export default function UsersList() {
  const pf = usePageFilters();
  const search = pf.get('users', 'search');
  const setSearch = (v: string) => pf.set('users', 'search', v);
  const [selected, setSelected] = useState<User | null>(null);

  const { getVisibility, setVisibility } = useColumnVisibility();
  const columnVisibility = getVisibility(TABLE_KEY);

  const { ownerRolePattern } = useFilters();

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, ownerRolePattern],
    queryFn: () => usersApi.list({ search: search || undefined, rolePattern: ownerRolePattern || undefined }),
    enabled: search.length !== 1,
  });

  const records: User[] = data?.data?.records ?? [];

  const columns = useMemo<ColumnDef<User>[]>(() => [
    {
      accessorKey: 'Name',
      header: 'Name',
      cell: ({ row }) => <RecordLink label={row.original.Name} onClick={() => setSelected(row.original)} />,
    },
    { accessorKey: 'Email', header: 'Email' },
    { accessorKey: 'Title', header: 'Title' },
    { accessorKey: 'Department', header: 'Department' },
    {
      id: 'Role',
      header: 'Role',
      accessorFn: (r) => r.UserRole?.Name,
    },
    {
      id: 'Profile',
      header: 'Profile',
      accessorFn: (r) => r.Profile?.Name,
    },
    {
      accessorKey: 'IsActive',
      header: 'Active',
      cell: ({ getValue }) => getValue() ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>,
    },
    {
      accessorKey: 'LastLoginDate',
      header: 'Last Login',
      cell: ({ getValue }) => getValue() ? fmtDate(getValue()) : <span className="text-slate-400 text-xs">Never</span>,
    },
  ], []);

  return (
    <div>
      <PageHeader title="Users" subtitle={`${records.length} active users`} />

      <GlobalFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Name or email, comma-separated…"
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
        <DetailSection title="User Details">
          <DetailGrid>
            <DetailField label="Email" value={selected?.Email} />
            <DetailField label="Title" value={selected?.Title} />
            <DetailField label="Department" value={selected?.Department} />
            <DetailField label="Role" value={selected?.UserRole?.Name} />
            <DetailField label="Profile" value={selected?.Profile?.Name} />
            <DetailField label="Last Login" value={fmtDate(selected?.LastLoginDate)} />
            <DetailField label="Active" value={selected?.IsActive ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>} />
          </DetailGrid>
        </DetailSection>
      </RecordDrawer>
    </div>
  );
}
