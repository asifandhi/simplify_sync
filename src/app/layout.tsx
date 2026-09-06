import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Simplify-Sync",
  description: "Seamless local network device pairing and file transfer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=JetBrains+Mono:wght@100..900&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let theme = 'dark';
                const stored = localStorage.getItem('simplify-sync-user-settings');
                if (stored) {
                  const parsed = JSON.parse(stored);
                  if (parsed.state && parsed.state.theme === 'light') {
                    theme = 'light';
                  }
                  if (parsed.state && typeof parsed.state.zoomLevel === 'number') {
                    document.documentElement.style.setProperty('--app-zoom', (parsed.state.zoomLevel / 100).toString());
                  }
                }
                document.documentElement.classList.add(theme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased h-screen overflow-hidden bg-gradient-to-br from-[#f5f5f7] to-[#e4e4e9] dark:from-[#000000] dark:to-[#1a1a1c]">
        {children}
        <Toaster position="bottom-left" />
      </body>
    </html>
  );
}
