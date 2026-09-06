import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ZOOM_STEPS = [67, 75, 85, 90, 100, 110, 125, 150];

interface UserState {
  profileImage: string;
  theme: 'dark' | 'light';
  enableDoubleClickCopy: boolean;
  zoomLevel: number;
  setProfileImage: (url: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setEnableDoubleClickCopy: (enabled: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profileImage: "/default-profile.jpg",
      theme: 'dark',
      enableDoubleClickCopy: true,
      zoomLevel: 100,
      setProfileImage: (url) => set({ profileImage: url }),
      setTheme: (theme) => set({ theme }),
      setEnableDoubleClickCopy: (enabled) => set({ enableDoubleClickCopy: enabled }),
      setZoomLevel: (zoom) => set({ zoomLevel: Math.max(67, Math.min(150, zoom)) }),
      zoomIn: () =>
        set((state) => {
          const next = ZOOM_STEPS.find((z) => z > state.zoomLevel);
          return { zoomLevel: next ?? 150 };
        }),
      zoomOut: () =>
        set((state) => {
          const prev = [...ZOOM_STEPS].reverse().find((z) => z < state.zoomLevel);
          return { zoomLevel: prev ?? 67 };
        }),
      resetZoom: () => set({ zoomLevel: 100 }),
    }),
    {
      name: 'simplify-sync-user-settings',
    }
  )
);
