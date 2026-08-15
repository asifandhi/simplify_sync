"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DeviceManager from "@/components/devices/DeviceManager";
import ChatWindow from "@/components/chat/ChatWindow";
import QRGenerator from "@/components/pairing/QRgenerator";

import SettingsPanel from "@/components/settings/SettingsPanel";

function DashboardContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "chat"; // 'chat' | 'settings' | 'pairing'
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      {/* Column 2: Sidebar (Conversation List) */}
      <aside className="w-[var(--spacing-sidebar-width)] h-full bg-[var(--color-surface)] border-r border-[var(--color-outline-variant)] flex flex-col shrink-0 z-10">
        <header className="h-20 px-[var(--spacing-margin-container)] flex items-end pb-4 shrink-0 border-b border-[var(--color-outline-variant)]/30">
          <h1 className="font-headline-lg text-[var(--text-headline-lg)] font-bold tracking-tight text-[var(--color-on-surface)]">Inbox</h1>
        </header>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          <DeviceManager selectedDeviceId={selectedDevice?.id} onSelectDevice={(id, name) => {
             setSelectedDevice({ id, name });
             if (view !== 'chat') {
                window.history.pushState(null, '', '/?view=chat');
             }
          }} />
        </div>
      </aside>

      {/* Column 3: Active Stage */}
      <main className="flex-1 h-full flex flex-col bg-[var(--color-background)] relative">
        <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"}}></div>

        <div className="relative z-10 w-full h-full flex flex-col overflow-y-auto custom-scrollbar">
          {view === "pairing" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
               <h2 className="text-2xl text-[var(--color-primary)] font-headline-lg mb-4">Pair New Device</h2>
               <QRGenerator />
               <p className="mt-8 text-[var(--color-on-surface-variant)] text-center max-w-sm">Scan this code with a mobile device to establish a local connection.</p>
            </div>
          )}

          {view === "settings" && <SettingsPanel />}

          {view === "chat" && (
            selectedDevice ? (
              <ChatWindow deviceId={selectedDevice.id} deviceName={selectedDevice.name} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                 <p className="text-[var(--color-on-surface-variant)] border border-[var(--color-outline-variant)]/30 bg-[var(--color-surface-container-low)] px-6 py-3 rounded-full text-sm font-medium tracking-wide">Select a conversation to start</p>
              </div>
            )
          )}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex-1 bg-[var(--color-background)]"></div>}>
      <DashboardContent />
    </Suspense>
  );
}