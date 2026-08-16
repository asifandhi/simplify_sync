"use client";

import React, { useRef, useState } from 'react';
import { useUserStore } from '@/store/userStore';

export default function SettingsPanel() {
  const { 
    profileImage, setProfileImage, 
    theme, setTheme, 
    autoSyncClipboard, setAutoSyncClipboard 
  } = useUserStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  };

  const handleToggleAutoSync = () => {
    if (!autoSyncClipboard) {
      setShowSyncModal(true);
    } else {
      setAutoSyncClipboard(false);
    }
  };

  const confirmAutoSync = () => {
    setAutoSyncClipboard(true);
    setShowSyncModal(false);
  };

  return (
    <div className="flex-1 flex flex-col p-8 max-w-2xl mx-auto w-full relative">
      <h2 className="text-[var(--text-headline-lg)] text-[var(--color-primary)] font-headline-lg mb-8 border-b border-[var(--color-outline-variant)]/30 pb-4">
        Settings
      </h2>

      <div className="space-y-6">
        {/* Profile Section */}
        <section className="p-6 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]/30">
          <h3 className="text-[var(--text-headline-md)] text-[var(--color-primary)] font-headline-md mb-4">Profile</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--color-outline-variant)]">
              <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
            </div>
            <div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-[var(--color-surface-variant)] hover:bg-[var(--color-outline-variant)] text-[var(--color-primary)] rounded-lg transition-colors font-medium text-sm"
              >
                Change Avatar
              </button>
              <p className="text-[var(--color-on-surface-variant)] text-xs mt-2">Recommended: Square image, max 2MB.</p>
            </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="p-6 bg-[var(--color-surface-container)] rounded-2xl border border-[var(--color-outline-variant)]/30">
          <h3 className="text-[var(--text-headline-md)] text-[var(--color-primary)] font-headline-md mb-4">Preferences</h3>
          
          <div className="flex items-center justify-between py-4 border-b border-[var(--color-outline-variant)]/20">
            <div>
              <p className="text-[var(--color-primary)]  font-medium text-sm">Theme Appearance</p>
              <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">Toggle between dark and light modes.</p>
            </div>
            <button 
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-variant)] hover:bg-[var(--color-outline-variant)] text-[var(--color-primary)] rounded-lg transition-colors text-sm font-medium border border-[var(--color-outline-variant)]/30"
            >
              <span className="material-symbols-outlined text-[18px]">
                {theme === 'dark' ? 'dark_mode' : 'light_mode'}
              </span>
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-[var(--color-primary)] font-medium text-sm">Auto-Sync Clipboard</p>
              <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">Automatically send copied text to paired devices.</p>
            </div>
            <button 
              onClick={handleToggleAutoSync}
              className={`relative flex items-center justify-center w-12 h-6 rounded-full transition-colors border ${autoSyncClipboard ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'bg-[var(--color-surface-variant)] border-[var(--color-outline-variant)]'}`}
            >
              <div className={`absolute left-1 w-4 h-4 rounded-full transition-transform ${autoSyncClipboard ? 'translate-x-[22px] bg-[var(--color-surface)]' : 'translate-x-0 bg-[var(--color-on-surface-variant)]'}`}></div>
            </button>
          </div>
        </section>
      </div>

      {/* Custom Auto-Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-background)]/80 backdrop-blur-sm">
          <div className="bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/50 p-8 rounded-3xl max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-headline-lg text-[var(--color-primary)] mb-4">Enable Auto-Sync?</h3>
            <p className="text-[var(--color-on-surface-variant)] text-sm mb-8 leading-relaxed">
              This will automatically push any text you copy on this device directly to your paired mobile device using your local network.
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmAutoSync}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-[var(--color-on-primary)] rounded-lg hover:bg-[var(--color-surface-variant)] hover:text-[var(--color-primary)] transition-colors"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
