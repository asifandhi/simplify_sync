import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

interface ClipboardPayload {
  targetDeviceId: string;
  data: string;
}

export const useClipboardSync = (socket: Socket | null, targetDeviceId: string | null) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleReceive = async (payload: ClipboardPayload) => {
      try {
        // Browsers require the document to be focused to write to the clipboard natively
        if(!payload) return;
        if (document.hasFocus()) {
          await navigator.clipboard.writeText(payload.data);
          console.log('[Clipboard] Synced from peer');
        } else {
          console.warn('[Clipboard] Document not focused, cannot write to clipboard automatically.');
        }
      } catch (err) {
        console.error('[Clipboard] Failed to write:', err);
      }
    };

    socket.on('clipboard:receive', handleReceive);

    return () => {
      socket.off('clipboard:receive', handleReceive);
    };
  }, [socket]);

  const syncLocalClipboard = async () => {
    if (!socket || !targetDeviceId) return;

    try {
      const text = await navigator.clipboard.readText();
      
      const response = await fetch('/api/clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeviceId, data: text }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync clipboard via API');
      }

      setError(null);
      console.log('[Clipboard] Sent to peer via API');
    } catch (err) {
      console.error('[Clipboard] Failed to read/send:', err);
      setError('Clipboard sync failed. Ensure document is focused or try again.');
    }
  };

  return { syncLocalClipboard, error };
};