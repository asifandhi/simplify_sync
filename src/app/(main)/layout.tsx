import React from "react";
import NavigationRail from "@/components/layout/NavigationRail";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div id="app-root" className="flex w-full h-full bg-[var(--color-background)] text-[var(--color-on-background)] font-body-md antialiased selection:bg-[var(--color-surface-variant)] selection:text-[var(--color-primary)]">
      <NavigationRail />
      {/* Main Content Area (Sidebar + Stage) */}
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>
    </div>
  );
}