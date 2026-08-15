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
      socket.emit('clipboard:sync', { targetDeviceId, data: text });
      setError(null);
      console.log('[Clipboard] Sent to peer');
    } catch (err) {
      console.error('[Clipboard] Failed to read:', err);
      setError('Clipboard access denied. Click document and try again.');
    }
  };

  return { syncLocalClipboard, error };
};