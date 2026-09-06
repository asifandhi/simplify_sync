"use client";

import React, { useState } from "react";
import DeviceManager from "@/components/devices/DeviceManager";
import ChatWindow from "@/components/chat/ChatWindow";
import { useDeviceStore } from "@/store/deviceStore";

export default function DevicesPage() {
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; profileImage?: string } | null>(null);
  const { devices } = useDeviceStore();

  const liveDevice = selectedDevice ? devices.find((d) => d.device_id === selectedDevice.id) : null;
  const currentDeviceName = liveDevice?.device_name || selectedDevice?.name || "";
  const currentProfileImage = liveDevice?.profile_image !== undefined ? liveDevice.profile_image : selectedDevice?.profileImage;

  return (
    <div className="h-full flex gap-4">
      {/* Sidebar: Device List */}
      <div className="w-1/3 max-w-sm glass rounded-2xl flex flex-col overflow-hidden shadow-sm border border-white/20">
        <div className="p-6 border-b border-white/10 bg-white/40">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Paired Devices</h2>
          <p className="text-sm text-gray-500">Select a device to interact.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <DeviceManager onSelectDevice={(id, name, profileImage) => setSelectedDevice({ id, name, profileImage })} />
        </div>
      </div>

      {/* Main Content: Chat Window */}
      <div className="flex-1 rounded-2xl overflow-hidden relative">
        {selectedDevice ? (
          <ChatWindow deviceId={selectedDevice.id} deviceName={currentDeviceName} profileImage={currentProfileImage} />
        ) : (
          <div className="h-full w-full glass rounded-2xl flex flex-col items-center justify-center border border-dashed border-[var(--primary)]/30">
            <div className="p-4 bg-[var(--primary)]/10 text-[var(--primary)] rounded-full mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">No Device Selected</h3>
            <p className="text-gray-500 max-w-xs text-center mt-2">
              Select a device from the sidebar to send messages, transfer files, and sync your clipboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
