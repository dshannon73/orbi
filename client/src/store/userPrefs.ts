import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserPrefsState {
  defaultRecordTypeId: string;
  defaultRecordTypeName: string;
  defaultSeTaskType: string;
  defaultRoleFilter: string;
  dcLookbackMonths: number;
  setDefaultRecordType: (id: string, name: string) => void;
  setDefaultSeTaskType: (v: string) => void;
  setDefaultRoleFilter: (v: string) => void;
  setDcLookbackMonths: (v: number) => void;
}

export const useUserPrefs = create<UserPrefsState>()(
  persist(
    (set) => ({
      defaultRecordTypeId: '',
      defaultRecordTypeName: '',
      defaultSeTaskType: '',
      defaultRoleFilter: '',
      dcLookbackMonths: 24,
      setDefaultRecordType: (id, name) => set({ defaultRecordTypeId: id, defaultRecordTypeName: name }),
      setDefaultSeTaskType: (v) => set({ defaultSeTaskType: v }),
      setDefaultRoleFilter: (v) => set({ defaultRoleFilter: v }),
      setDcLookbackMonths: (v) => set({ dcLookbackMonths: v }),
    }),
    { name: 'orbi-user-prefs' }
  )
);
