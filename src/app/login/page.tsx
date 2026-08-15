"use client";

import React, { useState } from "react";
import { ShieldCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [scanning, setScanning] = useState(false);

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-[var(--primary)]/20 blur-3xl rounded-full"></div>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-purple-500/20 blur-3xl rounded-full"></div>
        
        <div className="p-4 bg-[var(--primary)]/10 text-[var(--primary)] rounded-2xl mb-6 relative z-10">
          <ShieldCheck size={48} />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2 relative z-10">Simplify-Sync</h1>
        <p className="text-gray-500 mb-8 relative z-10">
          Scan the QR code on your PC dashboard to establish a secure connection.
        </p>

        {scanning ? (
          <div className="w-full aspect-square bg-black/10 dark:bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-400 relative z-10 mb-6">
            <p className="text-gray-500 animate-pulse">Camera feed placeholder...</p>
            {/* Note: A real HTML5 QR scanner component (like react-qr-reader) would go here */}
          </div>
        ) : (
          <Button 
            className="w-full py-4 text-lg mb-4 relative z-10" 
            onClick={() => setScanning(true)}
          >
            <Camera size={24} />
            Scan QR Code
          </Button>
        )}

        {scanning && (
          <Button 
            variant="secondary" 
            className="w-full relative z-10"
            onClick={() => setScanning(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
