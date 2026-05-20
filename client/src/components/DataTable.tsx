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
  /** Called with selected rows whenever selection changes */
  onSelectionChange?: (rows: TData[]) => void;
  /** Renders inside the selection toolbar when rows are selected */
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
    size: 40,
    minSize: 40,
    maxSize: 40,
    enableSorting: false,
    enableResizing: false,
    header: ({ table }) => {
      const allSelected = table.getIsAllRowsSelected();
      const someSelected = table.getIsSomeRowsSelected();
      return (
        <button
          className="flex items-center justify-center w-full cursor-pointer text-slate-400 hover:text-slate-700"
          onClick={table.getToggleAllRowsSelectedHandler()}
          title={allSelected ? 'Deselect all' : 'Select all'}
        >
          {allSelected
            ? <CheckSquare size={15} className="text-blue-600" />
            : someSelected
              ? <MinusSquare size={15} className="text-blue-400" />
              : <Square size={15} />}
        </button>
      );
    },
    cell: ({ row }) => (
      <button
        className="flex items-center justify-center w-full cursor-pointer text-slate-300 hover:text-slate-600"
        onClick={(e) => { e.stopPropagation(); row.toggleSelected(); }}
        title={row.getIsSelected() ? 'Deselect row' : 'Select row'}
      >
        {row.getIsSelected()
          ? <CheckSquare size={14} className="text-blue-600" />
          : <Square size={14} />}
      </button>
    ),
  };

  const allColumns: ColumnDef<TData, any>[] = [checkboxColumn, ...columns];

  const table = useReactTable({
    data,
    columns: allColumns,
    columnResizeMode: RESIZE_MODE,
    state: {
      sorting,
      columnFilters,
      rowSelection,
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

  // Notify parent of selection changes
  useEffect(() => {
    if (!onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map(r => r.original);
    onSelectionChange(selected);
  }, [rowSelection]);

  // Auto-size columns once after first data load
  useEffect(() => {
    if (!tableRef.current || !data.length || autoSized.current) return;
    // defer one frame so cells are rendered
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

  // Reset autoSize flag when data identity changes (new query)
  useEffect(() => { autoSized.current = false; }, [data]);

  const clearSelection = useCallback(() => setRowSelection({}), []);
  const selectedRows = table.getSelectedRowModel().rows.map(r => r.original);
  const selectedCount = selectedRows.length;
  const totalWidth = table.getTotalSize();

  return (
    <div className="space-y-0">
      {/* Selection toolbar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-600 text-white rounded-t-xl text-sm font-medium">
          <span>{selectedCount} row{selectedCount !== 1 ? 's' : ''} selected</span>
          <button
            onClick={() => table.toggleAllRowsSelected(true)}
            className="text-blue-200 hover:text-white underline text-xs cursor-pointer"
          >
            Select all {data.length}
          </button>
          <button
            onClick={clearSelection}
            className="text-blue-200 hover:text-white underline text-xs cursor-pointer"
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
          'w-full overflow-x-auto bg-white border border-slate-200 shadow-sm',
          selectedCount > 0 ? 'rounded-b-xl' : 'rounded-xl'
        )}
      >
        <table style={{ width: totalWidth, minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
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
                        'px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none',
                        isCheckbox && 'px-2',
                        canSort && !isCheckbox && 'cursor-pointer hover:text-slate-700'
                      )}
                      onClick={canSort && !isCheckbox ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && !isCheckbox && (
                          <span className="text-slate-300 ml-auto shrink-0">
                            {sorted === 'asc'
                              ? <ChevronUp size={12} />
                              : sorted === 'desc'
                                ? <ChevronDown size={12} />
                                : <ChevronsUpDown size={12} />}
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
                <td colSpan={allColumns.length} className="px-3 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="px-3 py-12 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-slate-100 last:border-0 transition-colors',
                    row.getIsSelected() && 'bg-blue-50',
                    !row.getIsSelected() && onRowClick && 'cursor-pointer hover:bg-slate-50/80',
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      data-col-id={cell.column.id}
                      style={{ width: cell.column.getSize() }}
                      className={cn(
                        'py-2.5 text-sm text-slate-800 truncate',
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
