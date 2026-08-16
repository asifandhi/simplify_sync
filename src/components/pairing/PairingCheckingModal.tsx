"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSocket } from '@/hooks/useSocket';

interface PairingRequest {
  device_id: string;
  device_name: string;
}

export default function PairingCheckingModal() {
  const [request, setRequest] = useState<PairingRequest | null>(null);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handlePairingRequest = (data: PairingRequest) => {
      setRequest(data);
      // Auto-dismiss after 30 seconds
      setTimeout(() => setRequest(null), 30000);
    };

    socket.on('pairing_request', handlePairingRequest);

    return () => {
      socket.off('pairing_request', handlePairingRequest);
    };
  }, [socket]);

  const handlePair = async () => {
    // In Phase 2, the DB already saved the device during the API handshake.
    // So "Pair" just means we accept it in the UI and maybe refresh the device list.
    console.log('Paired with:', request?.device_name);
    setRequest(null);
    // Force a reload of the devices list or emit an event
  };

  const handleDecline = async () => {
    if (!request) return;
    
    // If declined, we need to delete the device from the database
    try {
      await axios.delete(`/api/devices/${request.device_id}`);
      console.log('Declined connection from:', request.device_name);
    } catch (err) {
      console.error('Failed to decline device', err);
    }
    
    setRequest(null);
  };

  if (!request) return null; // Don't render anything if there is no request

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 mb-4 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-2xl">
            📱
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {request.device_name}
          </h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Wants to connect to this PC
          </p>
        </div>

        <div className="flex gap-3 mt-8">
          <button 
            onClick={handleDecline}
            className="flex-1 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Decline
          </button>
          <button 
            onClick={handlePair}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Pair
          </button>
        </div>
      </div>
    </div>
  );
}