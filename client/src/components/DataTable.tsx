import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnResizeMode,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps<TData extends { Id?: string }> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  onSelectionChange?: (rows: TData[]) => void;
  selectionActions?: (rows: TData[], clearSelection: () => void) => React.ReactNode;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void;
}

const RESIZE_MODE: ColumnResizeMode = 'onChange';
const CHECKBOX_COL_ID = '__select__';

export function DataTable<TData extends { Id?: string }>({
  data,
  columns,
  isLoading,
  emptyMessage = 'No records found.',
  onRowClick,
  onSelectionChange,
  selectionActions,
  columnVisibility,
  onColumnVisibilityChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const tableRef = useRef<HTMLDivElement>(null);
  const autoSized = useRef(false);

  const checkboxColumn: ColumnDef<TData, any> = {
    id: CHECKBOX_COL_ID,
    size: 40, minSize: 40, maxSize: 40,
    enableSorting: false, enableResizing: false,
    header: ({ table }) => {
      const allSelected = table.getIsAllRowsSelected();
      const someSelected = table.getIsSomeRowsSelected();
      return (
        <button
          className="flex items-center justify-center w-full cursor-pointer"
          style={{ color: allSelected ? '#f59e0b' : '#c4bfb8' }}
          onClick={table.getToggleAllRowsSelectedHandler()}
          title={allSelected ? 'Deselect all' : 'Select all'}
        >
          {allSelected
            ? <CheckSquare size={14} />
            : someSelected
              ? <MinusSquare size={14} style={{ color: '#f59e0b' }} />
              : <Square size={14} />}
        </button>
      );
    },
    cell: ({ row }) => (
      <button
        className="flex items-center justify-center w-full cursor-pointer transition-colors"
        style={{ color: row.getIsSelected() ? '#f59e0b' : '#d4cfc7' }}
        onClick={(e) => { e.stopPropagation(); row.toggleSelected(); }}
        title={row.getIsSelected() ? 'Deselect row' : 'Select row'}
      >
        {row.getIsSelected()
          ? <CheckSquare size={13} />
          : <Square size={13} />}
      </button>
    ),
  };

  const allColumns: ColumnDef<TData, any>[] = [checkboxColumn, ...columns];

  const table = useReactTable({
    data,
    columns: allColumns,
    columnResizeMode: RESIZE_MODE,
    state: {
      sorting, columnFilters, rowSelection,
      ...(columnVisibility !== undefined ? { columnVisibility } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    ...(onColumnVisibilityChange ? { onColumnVisibilityChange } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row, i) => (row.Id ?? String(i)),
    defaultColumn: { minSize: 60, size: 150 },
  });

  useEffect(() => {
    if (!onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map(r => r.original);
    onSelectionChange(selected);
  }, [rowSelection]);

  useEffect(() => {
    if (!tableRef.current || !data.length || autoSized.current) return;
    const id = requestAnimationFrame(() => {
      if (!tableRef.current) return;
      const headers = tableRef.current.querySelectorAll('th[data-col-id]');
      const sizing: Record<string, number> = {};
      headers.forEach((th) => {
        const colId = (th as HTMLElement).dataset.colId!;
        if (colId === CHECKBOX_COL_ID) return;
        const cells = tableRef.current!.querySelectorAll(`td[data-col-id="${colId}"]`);
        let maxW = (th as HTMLElement).scrollWidth;
        cells.forEach((td) => { maxW = Math.max(maxW, (td as HTMLElement).scrollWidth); });
        sizing[colId] = Math.min(maxW + 20, 420);
      });
      table.setColumnSizing(prev => ({ ...prev, ...sizing }));
      autoSized.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [data]);

  useEffect(() => { autoSized.current = false; }, [data]);

  const clearSelection = useCallback(() => setRowSelection({}), []);
  const selectedRows = table.getSelectedRowModel().rows.map(r => r.original);
  const selectedCount = selectedRows.length;
  const totalWidth = table.getTotalSize();

  return (
    <div className="space-y-0">
      {/* Selection toolbar */}
      {selectedCount > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-t-xl text-[12px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#0e0d1a',
          }}
        >
          <span>{selectedCount} row{selectedCount !== 1 ? 's' : ''} selected</span>
          <button
            onClick={() => table.toggleAllRowsSelected(true)}
            className="opacity-70 hover:opacity-100 underline cursor-pointer text-[11px]"
          >
            Select all {data.length}
          </button>
          <button
            onClick={clearSelection}
            className="opacity-70 hover:opacity-100 underline cursor-pointer text-[11px]"
          >
            Deselect all
          </button>
          {selectionActions && (
            <div className="ml-auto flex items-center gap-2">
              {selectionActions(selectedRows, clearSelection)}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div
        ref={tableRef}
        className={cn(
          'w-full overflow-x-auto',
          selectedCount > 0 ? 'rounded-b-xl' : 'rounded-xl'
        )}
        style={{ background: '#fff', border: '1px solid #e8e5de', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <table style={{ width: totalWidth, minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ background: '#f8f6f1', borderBottom: '1px solid #ece9e1' }}>
                {hg.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isCheckbox = header.column.id === CHECKBOX_COL_ID;
                  return (
                    <th
                      key={header.id}
                      data-col-id={header.column.id}
                      style={{ width: header.getSize(), position: 'relative' }}
                      className={cn(
                        'px-3 py-2.5 text-left select-none',
                        isCheckbox && 'px-2',
                        canSort && !isCheckbox && 'cursor-pointer',
                      )}
                    >
                      <div
                        className="flex items-center gap-1"
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#8b8577',
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                        }}
                        onClick={canSort && !isCheckbox ? header.column.getToggleSortingHandler() : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && !isCheckbox && (
                          <span className="ml-auto shrink-0 opacity-40">
                            {sorted === 'asc'
                              ? <ChevronUp size={11} />
                              : sorted === 'desc'
                                ? <ChevronDown size={11} />
                                : <ChevronsUpDown size={11} />}
                          </span>
                        )}
                      </div>
                      {header.column.getCanResize() && !isCheckbox && (
                        <div
                          className={cn('resizer', header.column.getIsResizing() && 'isResizing')}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={allColumns.length} className="px-3 py-10 text-center">
                  <div className="flex items-center justify-center gap-2 text-[13px]" style={{ color: '#b5b0a8' }}>
                    <div
                      className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }}
                    />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="px-3 py-10 text-center text-[13px]" style={{ color: '#b5b0a8' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors',
                    !row.getIsSelected() && onRowClick && 'cursor-pointer',
                  )}
                  style={{
                    borderBottom: '1px solid #f0ede7',
                    background: row.getIsSelected() ? '#fffbeb' : undefined,
                  }}
                  onMouseEnter={e => {
                    if (!row.getIsSelected()) (e.currentTarget as HTMLElement).style.background = '#fafaf7';
                  }}
                  onMouseLeave={e => {
                    if (!row.getIsSelected()) (e.currentTarget as HTMLElement).style.background = '';
                  }}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      data-col-id={cell.column.id}
                      style={{ width: cell.column.getSize() }}
                      className={cn(
                        'py-2.5 text-[13px] text-slate-800 truncate',
                        cell.column.id === CHECKBOX_COL_ID ? 'px-2' : 'px-3'
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { type ColumnDef };
