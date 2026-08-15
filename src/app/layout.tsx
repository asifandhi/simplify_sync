import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=JetBrains+Mono:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased h-screen overflow-hidden bg-gradient-to-br from-[#f5f5f7] to-[#e4e4e9] dark:from-[#000000] dark:to-[#1a1a1c]">
        {children}
      </body>
    </html>
  );
}
