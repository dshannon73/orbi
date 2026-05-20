import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type VisibilityMap = Record<string, boolean>;

interface ColumnVisibilityState {
  visibility: Record<string, VisibilityMap>;
  getVisibility: (tableKey: string) => VisibilityMap;
  setVisibility: (tableKey: string, map: VisibilityMap) => void;
}

export const useColumnVisibility = create<ColumnVisibilityState>()(
  persist(
    (set, get) => ({
      visibility: {},
      getVisibility: (tableKey) => get().visibility[tableKey] ?? {},
      setVisibility: (tableKey, map) =>
        set(s => ({ visibility: { ...s.visibility, [tableKey]: map } })),
    }),
    { name: 'org62-column-visibility', partialize: (s) => ({ visibility: s.visibility }) }
  )
);
