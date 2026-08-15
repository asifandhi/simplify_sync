"use client";

import React from "react";
import QRGenerator from "@/components/pairing/QRgenerator";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Smartphone, ShieldCheck, Activity } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Overview</h1>
        <Button onClick={() => router.push("/devices")} variant="primary">
          Manage Devices <ArrowRight size={18} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Pairing Card */}
        <div className="lg:col-span-2 glass rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-[var(--primary)]/20 blur-3xl rounded-full"></div>
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-purple-500/20 blur-3xl rounded-full"></div>
          
          <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-gray-100 relative z-10">Connect New Device</h2>
          <p className="text-gray-500 mb-8 relative z-10 max-w-md">
            Scan the QR code below with your mobile device to establish a secure, local peer-to-peer connection.
          </p>
          
          <div className="p-4 bg-white rounded-2xl shadow-sm relative z-10">
            <QRGenerator />
          </div>
        </div>

        {/* Stats Column */}
        <div className="flex flex-col gap-6">
          <div className="glass rounded-2xl p-6 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-green-500/10 text-green-600 rounded-xl">
              <ShieldCheck size={28} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Security</p>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">E2E Ready</h3>
            </div>
          </div>
          
          <div className="glass rounded-2xl p-6 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-[var(--primary)]/10 text-[var(--primary)] rounded-xl">
              <Activity size={28} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Network Protocol</p>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Socket.io + UDP</h3>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 shadow-sm flex items-start gap-4 flex-1">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
              <Smartphone size={28} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Active Sessions</p>
              <h3 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">1</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}