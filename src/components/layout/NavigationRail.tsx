"use client";

import React from "react";
import Link from "next/link";
import { useUserStore } from "@/store/userStore";
import { useChatStore } from "@/store/chatStore";

export default function NavigationRail() {
  const { profileImage, theme, setTheme } = useUserStore();
  const isConnected = useChatStore((s) => s.isConnected);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  React.useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  }, [theme]);

  return (
    <nav className="w-[var(--spacing-nav-rail-width)] h-full bg-[var(--color-surface-container-lowest)] border-r border-[var(--color-outline-variant)] flex flex-col items-center py-[var(--spacing-stack-lg)] justify-between shrink-0 z-20">
      {/* Top Actions */}
      <div className="flex flex-col items-center gap-[var(--spacing-stack-md)]">
        <Link
          href="/?view=chat"
          aria-label="Home"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)] transition-all duration-200 group"
        >
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">
            home
          </span>
        </Link>
        
        {/* Global persistent connection dot indicator */}
        <div
          className="flex items-center justify-center py-1 cursor-help"
          title={isConnected ? "Server Connected" : "Server Disconnected — Reconnecting..."}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors duration-500 ${
              isConnected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-amber-400 animate-pulse"
            }`}
          />
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-[var(--spacing-stack-md)]">
        <button
          onClick={toggleTheme}
          aria-label="Toggle Theme"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)] transition-all duration-200 group"
        >
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">
            {theme === "dark" ? "dark_mode" : "light_mode"}
          </span>
        </button>
        
        <Link
          href="/?view=settings"
          aria-label="User Profile"
          className="w-8 h-8 rounded-full overflow-hidden border border-[var(--color-outline-variant)] hover:border-[var(--color-outline)] transition-colors cursor-pointer ring-2 ring-transparent focus:ring-[var(--color-surface-variant)]"
        >
          <img
            className="w-full h-full object-cover"
            src={profileImage}
            alt="Profile"
          />
        </Link>
      </div>
    </nav>
  );
}
