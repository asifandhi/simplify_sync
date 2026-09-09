"use client";

import React, { useRef, useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { useSettingsStore } from '@/store/settingStore';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';
import { toast } from 'sonner';

export default function SettingsPanel() {
  const { 
    profileImage, setProfileImage, 
    theme, setTheme, 
    enableDoubleClickCopy,setEnableDoubleClickCopy 
  } = useUserStore();
  const { snapEffectEnabled, updateSetting, fetchSettings } = useSettingsStore();

  const [firewallActive, setFirewallActive] = useState<boolean>(false);
  const [isPublicNetwork, setIsPublicNetwork] = useState<boolean>(false);
  const [networkName, setNetworkName] = useState<string>('');
  const [firewallLoading, setFirewallLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
    // Check Windows Firewall rules status
    axios.get('/api/firewall')
      .then(res => {
        if (res.data?.success && res.data?.data) {
          setFirewallActive(!!res.data.data.rulesActive);
          setIsPublicNetwork(!!res.data.data.isPublic);
          setNetworkName(res.data.data.networkName || '');
        }
      })
      .catch(err => console.error("Failed to check firewall status:", err));
  }, [fetchSettings]);

  const handleToggleFirewall = async (checked: boolean) => {
    setFirewallLoading(true);
    try {
      const res = await axios.post('/api/firewall', { enable: checked });
      if (res.data?.success) {
        setFirewallActive(!!res.data.data?.rulesActive);
        toast.success(checked ? "LAN Access firewall rules created" : "LAN Access firewall rules removed");
      } else {
        toast.error(res.data?.error || "Failed to configure firewall");
      }
    } catch (err: any) {
      console.error("Firewall update error:", err);
      const errMsg = err.response?.data?.error || err.message || "Permission denied or failed to configure firewall";
      toast.error(errMsg);
    } finally {
      setFirewallLoading(false);
    }
  };

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

          <div className="flex items-center justify-between py-4 border-t border-[var(--color-outline-variant)]/20">
            <div>
              <p className="text-[var(--color-primary)] font-medium text-sm">Snap effect on delete/clear</p>
              <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">Disintegrate messages into dust when deleted or cleared.</p>
            </div>
            <Switch
              checked={snapEffectEnabled}
              onCheckedChange={(checked) => updateSetting('snapEffectEnabled', checked)}
              id="snap-effect-mode"
            />
          </div>

          <div className="py-4 border-t border-[var(--color-outline-variant)]/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[var(--color-primary)] font-medium text-sm">Allow LAN Access</p>
                <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">
                  Configure Windows Firewall rules (port 3000 &amp; 41234 on Private profile) for local subnet devices.
                </p>
              </div>
              <Switch
                checked={firewallActive}
                disabled={firewallLoading}
                onCheckedChange={handleToggleFirewall}
                id="firewall-mode"
              />
            </div>

            {isPublicNetwork && (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">warning</span>
                <p className="text-[var(--color-on-surface-variant)] text-xs leading-relaxed">
                  Your current Wi-Fi network {networkName ? `("${networkName}")` : ""} is set to <strong>Public</strong> in Windows. For LAN access to work, set this network profile to <strong>Private</strong> in Windows Settings &gt; Network &amp; internet &gt; Wi-Fi.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
