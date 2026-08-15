"use client";

import React, { useEffect } from "react";
import { Clipboard, FolderSync } from "lucide-react";
import { useSettingsStore } from "@/store/settingStore";

export default function SettingsPage() {
  const {
    clipboardSyncEnabled,
    folderMirrorEnabled,
    fetchSettings,
    updateSetting,
  } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white/40 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 h-full flex flex-col">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Clipboard Sync Toggle */}
        <div className="flex items-center justify-between p-6 bg-white/60 rounded-xl shadow-sm border border-white/40">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#007aff]/10 text-[#007aff] rounded-lg">
              <Clipboard size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Clipboard Sync</h2>
              <p className="text-sm text-gray-500">
                Automatically share your copied text with paired devices.
              </p>
            </div>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={clipboardSyncEnabled}
              onChange={(e) => updateSetting("clipboardSyncEnabled", e.target.checked)}
            />
            <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#007aff]"></div>
          </label>
        </div>

        {/* Folder Mirror Toggle (For Phase 7 Prep) */}
        <div className="flex items-center justify-between p-6 bg-white/60 rounded-xl shadow-sm border border-white/40">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 text-purple-600 rounded-lg">
              <FolderSync size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Folder Mirroring (Advanced)</h2>
              <p className="text-sm text-gray-500">
                Automatically sync a specific folder across devices.
              </p>
            </div>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={folderMirrorEnabled}
              onChange={(e) => updateSetting("folderMirrorEnabled", e.target.checked)}
            />
            <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
}