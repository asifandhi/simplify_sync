"use client";

import { useState } from "react";
import DeviceManager from "@/components/devices/DeviceManager";
import ChatWindow from "@/components/chat/ChatWindow";


export default function Home() {
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      {/* Sidebar: Device Management */}
      <div className="w-1/3 max-w-sm border-r border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-8 text-zinc-900 dark:text-zinc-50">Simplify-Sync</h1>
        <DeviceManager onSelectDevice={(id, name) => setSelectedDevice({ id, name })} />
      </div>

      {/* Main Content: Chat Window */}
      <div className="flex-1 p-6 relative">
        {selectedDevice ? (
          <ChatWindow deviceId={selectedDevice.id} deviceName={selectedDevice.name} />
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
            <p className="text-zinc-500">Select a device from the sidebar to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}