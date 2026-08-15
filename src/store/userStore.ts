import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  profileImage: string;
  theme: 'dark' | 'light';
  autoSyncClipboard: boolean;
  setProfileImage: (url: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAutoSyncClipboard: (enabled: boolean) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profileImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuCEgTgXG3HkAIC4cdDIV81Zw3gs65DhF6oQG6GWNTuY0elZtWxl_DDi7nfvm2EUop2b_e7t4P4abBQwj82FWyPR6mAUarUnkA2iddFgLDaJ96iVXmcjQ-cDZACY5wRglypBZ9NpWaxmrTfcY_iYzjJ77undNBcfIxr13Mrcbt_WxpE3qVWeFsSylnaDxKvTUIS7-ZdCEFl5TbtFtXn29Lwj1RhK5kPBg1Xrz3wCOUhdk7-dwIK350Mc",
      theme: 'dark',
      autoSyncClipboard: false,
      setProfileImage: (url) => set({ profileImage: url }),
      setTheme: (theme) => set({ theme }),
      setAutoSyncClipboard: (enabled) => set({ autoSyncClipboard: enabled }),
    }),
    {
      name: 'simplify-sync-user-settings',
    }
  )
);
