import { create } from 'zustand';
import axios from 'axios';

interface SettingsState {
  clipboardSyncEnabled: boolean;
  folderMirrorEnabled: boolean; // Pre-emptively added for Phase 7
  fetchSettings: () => Promise<void>;
  updateSetting: (key: string, value: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  clipboardSyncEnabled: false,
  folderMirrorEnabled: false,

  fetchSettings: async () => {
    try {
      const res = await axios.get('/api/settings');
      if (res.data.success) {
          // SQLite stores booleans as 1/0 or strings depending on implementation, handle coercions
        const ResponseClipboardState = res.data.data.clipboardSyncEnabled;
        const ResponseFolderMirrorState = res.data.data.folderMirrorEnabled;
        
        set({
          clipboardSyncEnabled: ResponseClipboardState === 'true' || ResponseClipboardState === 1 || ResponseClipboardState === true,
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
      await axios.post('/api/settings', { key, value: value.toString() });
    } catch (error) {
      console.error('[SettingsStore] Failed to update setting:', error);
      // Revert state if the network request fails
      set({ [key]: !value });
    }
  },
}));