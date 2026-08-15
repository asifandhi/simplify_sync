"use client";

import React from "react";
import Link from "next/link";
import { useUserStore } from "@/store/userStore";

export default function NavigationRail() {
  const { profileImage } = useUserStore();

  return (
    <nav className="w-[var(--spacing-nav-rail-width)] h-full bg-[var(--color-surface-container-lowest)] border-r border-[var(--color-outline-variant)] flex flex-col items-center py-[var(--spacing-stack-lg)] justify-between shrink-0 z-20">
      
      {/* Top Actions */}
      <div className="flex flex-col items-center gap-[var(--spacing-stack-md)]">
        <Link href="/?view=chat" aria-label="Home" className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)] transition-all duration-200 group">
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">home</span>
        </Link>
        <Link href="/?view=settings" aria-label="Settings" className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-container-low)] transition-all duration-200 group">
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform text-[20px]">settings</span>
        </Link>
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-[var(--spacing-stack-md)]">
        <Link href="/?view=pairing" aria-label="New Conversation" className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-[var(--color-on-primary)] hover:bg-[var(--color-primary-container)] transition-colors shadow-[0_0_10px_rgba(255,255,255,0.1)] hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          <span className="material-symbols-outlined text-[18px]">add</span>
        </Link>
        <button aria-label="User Profile" className="w-8 h-8 rounded-full overflow-hidden border border-[var(--color-outline-variant)] hover:border-[var(--color-outline)] transition-colors cursor-pointer ring-2 ring-transparent focus:ring-[var(--color-surface-variant)]">
          <img className="w-full h-full object-cover" src={profileImage} alt="Profile" />
        </button>
      </div>
    </nav>
  );
}
