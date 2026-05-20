import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FilterState {
  justMyData: boolean;
  ownerRolePattern: string;  // glob, e.g. "*AMER*PACE*"
  ownerName: string;         // glob, e.g. "*Shannon*"
  setJustMyData: (v: boolean) => void;
  setOwnerRolePattern: (v: string) => void;
  setOwnerName: (v: string) => void;
}

export const useFilters = create<FilterState>()(
  persist(
    (set) => ({
      justMyData: false,
      ownerRolePattern: '',
      ownerName: '',
      setJustMyData: (justMyData) => set({ justMyData }),
      setOwnerRolePattern: (ownerRolePattern) => set({ ownerRolePattern }),
      setOwnerName: (ownerName) => set({ ownerName }),
    }),
    { name: 'org62-filters', partialize: (s) => ({ justMyData: s.justMyData, ownerRolePattern: s.ownerRolePattern, ownerName: s.ownerName }) }
  )
);
