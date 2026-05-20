import { create } from 'zustand';

type FilterMap = Record<string, string>;

// Read and write directly to localStorage synchronously — no async hydration issues.
const STORAGE_KEY = 'org62-page-filters';

function load(): Record<string, FilterMap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(filters: Record<string, FilterMap>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

interface PageFilterState {
  filters: Record<string, FilterMap>;
  get: (page: string, key: string, defaultVal?: string) => string;
  set: (page: string, key: string, value: string) => void;
  setMany: (page: string, values: FilterMap) => void;
  clear: (page: string) => void;
}

export const usePageFilters = create<PageFilterState>()((zustandSet, zustandGet) => ({
  filters: load(),
  get: (page, key, defaultVal = '') =>
    zustandGet().filters[page]?.[key] ?? defaultVal,
  set: (page, key, value) =>
    zustandSet(s => {
      const next = {
        ...s.filters,
        [page]: { ...(s.filters[page] ?? {}), [key]: value },
      };
      save(next);
      return { filters: next };
    }),
  setMany: (page, values) =>
    zustandSet(s => {
      const next = {
        ...s.filters,
        [page]: { ...(s.filters[page] ?? {}), ...values },
      };
      save(next);
      return { filters: next };
    }),
  clear: (page) =>
    zustandSet(s => {
      const next = { ...s.filters, [page]: {} };
      save(next);
      return { filters: next };
    }),
}));
