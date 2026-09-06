import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  profileImage: string;
  theme: 'dark' | 'light';
  enableDoubleClickCopy: boolean;
  setProfileImage: (url: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setEnableDoubleClickCopy: (enabled: boolean) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profileImage: "/default-profile.jpg",
      theme: 'dark',
      enableDoubleClickCopy: true,
      setProfileImage: (url) => set({ profileImage: url }),
      setTheme: (theme) => set({ theme }),
      setEnableDoubleClickCopy: (enabled) => set({ enableDoubleClickCopy: enabled }),
    }),
    {
      name: 'simplify-sync-user-settings',
    }
  )
);
