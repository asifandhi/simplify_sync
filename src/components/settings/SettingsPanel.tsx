"use client";

import React, { useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';

export default function SettingsPanel() {
  const { 
    profileImage, setProfileImage, 
    theme, setTheme, 
    enableDoubleClickCopy,setEnableDoubleClickCopy 
  } = useUserStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setProfileImage(base64);
        axios.post('/api/setting', { key: 'web_profile_image', value: base64 })
          .catch(err => console.error("Failed to sync profile image to server", err));
      };
      reader.readAsDataURL(file);
    }
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
          
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-[var(--color-primary)] font-medium text-sm">Double-Click to Copy</p>
              <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">Double-click a message bubble in chat to instantly copy it.</p>
            </div>
            <Switch
              checked={enableDoubleClickCopy}
              onCheckedChange={(checked) => setEnableDoubleClickCopy(checked)}
              id="double-click-mode"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
