"use client";

import React, { useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import DeviceManager from "@/components/devices/DeviceManager";
import ChatWindow from "@/components/chat/ChatWindow";
import QRGenerator from "@/components/pairing/QRgenerator";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { useChatStore } from "@/store/chatStore";

function DashboardContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "chat";
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; profileImage?: string } | null>(null);
  const [search, setSearch] = useState("");
  const { isConnected } = useChatStore();

  const handleDeviceSelect = useCallback((id: string, name: string, profileImage?: string) => {
    setSelectedDevice({ id, name, profileImage });
    if (view !== "chat") {
      window.history.pushState(null, "", "/?view=chat");
    }
  }, [view]);

  return (
    <>
      {/* Column 2: Chat Sidebar */}
      <aside className="w-[340px] h-full bg-[var(--color-surface)] border-r border-[var(--color-outline-variant)] flex flex-col shrink-0 z-10">

        {/* Header — "Chat" + All filter + new-chat icon */}
        <header className="px-4 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-on-surface)]">Chat</h1>
              {/* connection dot */}
              <span
                title={isConnected ? "Connected" : "Disconnected — messages will queue"}
                className={`inline-block w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500 ${
                  isConnected ? "bg-green-500" : "bg-amber-400 animate-pulse"
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              {/* "All ▾" pill */}
              <button className="flex items-center gap-1 px-3 py-1 rounded-full border border-[var(--color-outline-variant)] text-[13px] font-medium text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)] transition-colors">
                All
                <span className="material-symbols-outlined text-[14px]">expand_more</span>
              </button>
              {/* New chat icon */}
              <button
                onClick={() => window.history.pushState(null, "", "/?view=pairing")}
                title="New chat / pair device"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-low)] transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--color-on-surface-variant)]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] placeholder-[var(--color-on-surface-variant)] rounded-full pl-9 pr-4 py-2 text-[14px] outline-none border border-transparent focus:border-[var(--color-outline-variant)] transition-colors"
            />
          </div>
        </header>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <DeviceManager
            selectedDeviceId={selectedDevice?.id}
            searchQuery={search}
            onSelectDevice={handleDeviceSelect}
          />
        </div>
      </aside>

      {/* Column 3: Active Stage */}
      <main className="flex-1 h-full flex flex-col bg-[var(--color-background)] relative">
        <div className="absolute inset-0 pointer-events-none bg-texture" />

        <div className="relative z-10 w-full h-full flex flex-col overflow-y-auto custom-scrollbar">
          {view === "pairing" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <h2 className="text-2xl text-[var(--color-primary)] font-headline-lg mb-4">Pair New Device</h2>
              <QRGenerator />
              <p className="mt-8 text-[var(--color-on-surface-variant)] text-center max-w-sm">
                Scan this code with a mobile device to establish a local connection.
              </p>
            </div>
          )}

          {view === "settings" && <SettingsPanel />}

          {view === "chat" && (
            selectedDevice ? (
              <ChatWindow deviceId={selectedDevice.id} deviceName={selectedDevice.name} profileImage={selectedDevice.profileImage} />
            ) : (
              /* Empty state — matches the screenshot */
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
                {/* Chat bubble icon */}
                <div className="w-20 h-20 rounded-full bg-[var(--color-surface-container-high)] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[40px] text-[var(--color-on-surface-variant)]">
                    chat_bubble
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-[18px] font-semibold text-[var(--color-on-surface)]">Start Conversation</p>
                  <p className="text-[13px] text-[var(--color-on-surface-variant)] max-w-[260px]">
                    Choose from your existing conversations, or start a new one.
                  </p>
                </div>
                <button
                  onClick={() => window.history.pushState(null, "", "/?view=pairing")}
                  className="px-5 py-2 rounded-full border border-[var(--color-outline-variant)] text-[var(--color-on-surface)] text-[14px] font-medium hover:bg-[var(--color-surface-container-low)] transition-colors"
                >
                  New chat
                </button>
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
    <Suspense fallback={<div className="flex-1 bg-[var(--color-background)]" />}>
      <DashboardContent />
    </Suspense>
  );
}