import axios from "axios";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDeviceStore } from "@/store/deviceStore";

interface Props {
  device: {
    device_id: string;
    device_name: string;
    last_active: string;
    profile_image?: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
}

/** Returns a deterministic bg colour from the first character */
function avatarColor(name: string): string {
  const palette = [
    "bg-blue-600",
    "bg-purple-600",
    "bg-green-600",
    "bg-rose-600",
    "bg-amber-600",
    "bg-teal-600",
    "bg-indigo-600",
  ];
  return palette[name.charCodeAt(0) % palette.length];
}

/** Relative time helper */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function DeviceCard({ device, isActive, onClick }: Props) {
  const removeDevice = useDeviceStore((state) => state.removeDevice);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRevoke = async () => {
    setContextMenu(null);
    try {
      await axios.delete(`/api/devices/${device.device_id}`);
      removeDevice(device.device_id);
    } catch (err) {
      console.error("Failed to revoke device", err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, closeMenu]);

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors relative ${
          isActive
            ? "bg-[var(--color-surface-container-high)]"
            : "hover:bg-[var(--color-surface-container-low)]"
        }`}
      >
        {/* Avatar */}
        {device.profile_image ? (
          <img src={device.profile_image} alt={device.device_name} className="w-12 h-12 rounded-full flex-shrink-0 object-cover" />
        ) : (
          <div
            className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-[18px] ${avatarColor(device.device_name)}`}
          >
            {device.device_name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-semibold text-[15px] truncate ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-on-surface)]"}`}
            >
              {device.device_name}
            </span>
            <span className="text-[11px] text-[var(--color-on-surface-variant)] shrink-0">
              {relativeTime(device.last_active)}
            </span>
          </div>
          <p className="text-[13px] text-[var(--color-on-surface-variant)] truncate mt-0.5">
            Last active {relativeTime(device.last_active)} ago
          </p>
        </div>
      </div>

      {/* Thin divider below each row */}
      <div className="mx-4 h-px bg-[var(--color-outline-variant)]/20" />

      {/* Right-click Context Menu */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: Math.max(10, Math.min(contextMenu.y, window.innerHeight - 80)),
              left: Math.max(10, Math.min(contextMenu.x, window.innerWidth - 230)),
            }}
            className="fixed z-[99999] w-[220px] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1e1e1e] py-1.5">
              {/* Delete — red highlight row */}
              <button
                onClick={handleRevoke}
                className="w-full flex items-center gap-3 mx-1.5 px-3 py-2.5 text-[14px] text-red-400 rounded-xl transition-colors hover:bg-[#3a1a1a]"
                style={{ width: "calc(100% - 12px)" }}
              >
                <span className="material-symbols-outlined text-[18px] text-red-400">
                  delete
                </span>
                Delete conversation
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
