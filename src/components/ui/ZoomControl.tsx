"use client";

import React, { useEffect } from "react";
import { useUserStore } from "@/store/userStore";

export default function ZoomControl() {
  const { zoomLevel, zoomIn, zoomOut, resetZoom } = useUserStore();

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-zoom",
      (zoomLevel / 100).toString()
    );
  }, [zoomLevel]);

  return (
    <div className="flex items-center rounded-full border border-[var(--color-outline-variant)]/60 bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] text-[12px] font-medium select-none shadow-sm">
      <button
        onClick={zoomOut}
        disabled={zoomLevel <= 67}
        aria-label="Zoom out"
        title="Zoom out"
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-container-high)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[14px]"
      >
        −
      </button>

      <button
        onClick={resetZoom}
        title="Click to reset to 100%"
        className="px-1 text-[11px] font-mono tracking-tight hover:text-[var(--color-primary)] transition-colors cursor-pointer"
      >
        {zoomLevel}%
      </button>

      <button
        onClick={zoomIn}
        disabled={zoomLevel >= 150}
        aria-label="Zoom in"
        title="Zoom in"
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-container-high)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[14px]"
      >
        +
      </button>
    </div>
  );
}
