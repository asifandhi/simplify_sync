import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Home, Smartphone, Settings, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Simplify-Sync",
  description: "Seamless local network device pairing and file transfer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased flex h-screen overflow-hidden bg-gradient-to-br from-[#f5f5f7] to-[#e4e4e9] dark:from-[#000000] dark:to-[#1a1a1c]"
      >
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-white/20 glass flex flex-col justify-between m-4 rounded-2xl shadow-lg relative z-50">
          <div>
            {/* Logo / Header */}
            <div className="p-6 border-b border-white/10">
              <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--primary)] to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                <ShieldCheck className="text-[var(--primary)]" />
                Simplify-Sync
              </h1>
            </div>

            {/* Nav Links */}
            <nav className="p-4 space-y-2">
              <Link
                href="/"
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200 font-medium"
              >
                <Home size={20} />
                Dashboard
              </Link>
              <Link
                href="/devices"
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200 font-medium"
              >
                <Smartphone size={20} />
                Devices
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200 font-medium"
              >
                <Settings size={20} />
                Settings
              </Link>
            </nav>
          </div>
          
          {/* Status Bar / Footer */}
          <div className="p-6 border-t border-white/10">
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Network Active
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 pl-0">
          {children}
        </main>
      </body>
    </html>
  );
}