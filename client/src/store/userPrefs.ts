import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserPrefsState {
  defaultRecordTypeId: string;
  defaultRecordTypeName: string;
  defaultSeTaskType: string;
  defaultRoleFilter: string;
  setDefaultRecordType: (id: string, name: string) => void;
  setDefaultSeTaskType: (v: string) => void;
  setDefaultRoleFilter: (v: string) => void;
}

export const useUserPrefs = create<UserPrefsState>()(
  persist(
    (set) => ({
      defaultRecordTypeId: '',
      defaultRecordTypeName: '',
      defaultSeTaskType: '',
      defaultRoleFilter: '',
      setDefaultRecordType: (id, name) => set({ defaultRecordTypeId: id, defaultRecordTypeName: name }),
      setDefaultSeTaskType: (v) => set({ defaultSeTaskType: v }),
      setDefaultRoleFilter: (v) => set({ defaultRoleFilter: v }),
    }),
    { name: 'orbi-user-prefs' }
  )
);
