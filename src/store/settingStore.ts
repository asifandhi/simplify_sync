import { create } from 'zustand';
import axios from 'axios';

interface SettingsState {
  folderMirrorEnabled: boolean; // Pre-emptively added for Phase 7
  fetchSettings: () => Promise<void>;
  updateSetting: (key: string, value: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  folderMirrorEnabled: false,

  fetchSettings: async () => {
    try {
      const res = await axios.get('/api/setting');
      if (res.data.success) {
          // SQLite stores booleans as 1/0 or strings depending on implementation, handle coercions
        const ResponseFolderMirrorState = res.data.data.folderMirrorEnabled;
        
        set({
          folderMirrorEnabled: ResponseFolderMirrorState === 'true' || ResponseFolderMirrorState === 1 || ResponseFolderMirrorState === true,
        });
      }
    } catch (error) {
      console.error('[SettingsStore] Failed to fetch settings:', error);
    }
  },

  updateSetting: async (key: string, value: boolean) => {
    // Optimistic UI update for instant feedback
    set({ [key]: value });
    
    try {
      await axios.post('/api/setting', { key, value: value.toString() });
    } catch (error) {
      console.error('[SettingsStore] Failed to update setting:', error);
      // Revert state if the network request fails
      set({ [key]: !value });
    }
  },
}));