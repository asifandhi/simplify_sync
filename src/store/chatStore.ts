import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import { useDeviceStore } from './deviceStore';

export interface ChatMessage {
  id?: number;
  device_id: string;
  sender: string;
  content_type: string;
  content?: string;
  file_path?: string;
  preview_data?: string;
  is_view_once?: boolean;
  timestamp?: string;
  status?: string;
}

export interface PendingMessage {
  localId: string;
  payload: Omit<ChatMessage, 'id' | 'timestamp'> & { client_id?: string };
  retries: number;
  status: 'pending' | 'sending' | 'failed';
}

const MAX_RETRIES = 3;

interface ChatStore {
  socket: Socket | null;
  isConnected: boolean;
  isDeviceOnline: boolean;
  isChatOpen: boolean;
  messages: ChatMessage[];
  activeDeviceId: string | null;
  pendingQueue: PendingMessage[];
  initSocket: () => void;
  connectSocket: (deviceId: string) => void;
  disconnectSocket: () => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  flushQueue: (targetDeviceId?: string) => void;
  retryMessage: (localId: string) => void;
  deleteMessages: (messageIds: number[] | 'all', syncToDevice: boolean, targetDeviceId?: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      socket: null,
      isConnected: false,
      isDeviceOnline: false,
      isChatOpen: false,
      messages: [],
      activeDeviceId: null,
      pendingQueue: [],

      initSocket: () => {
        let socket = get().socket;
        if (!socket) {
          socket = io();

          socket.on('connect', async () => {
            set({ isConnected: true });
            const currentActive = get().activeDeviceId;
            if (currentActive) {
              socket?.emit('register', currentActive);
              // Fetch missed inbound messages while disconnected/asleep
              try {
                const res = await fetch(`/api/chat?device_id=${currentActive}&limit=50&offset=0`);
                const json = await res.json();
                if (json.success && Array.isArray(json.data?.messages)) {
                  const fetchedMsgs: ChatMessage[] = json.data.messages;
                  set((state) => {
                    if (state.activeDeviceId !== currentActive) return state;
                    const existingIds = new Set(state.messages.map((m) => m.id).filter(Boolean));
                    const newMessages = fetchedMsgs.filter((m) => !existingIds.has(m.id));
                    if (newMessages.length === 0) return state;
                    const merged = [...state.messages, ...newMessages].sort((a, b) => {
                      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.id || 0);
                      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.id || 0);
                      return timeA - timeB;
                    });
                    return { messages: merged };
                  });
                }
              } catch (err) {
                console.error('[ChatStore] Failed to fetch missed messages on reconnect:', err);
              }
            }
            // Flush any queued messages on reconnect
            get().flushQueue();
          });

          socket.on('disconnect', () => {
            set({ isConnected: false, isDeviceOnline: false, isChatOpen: false });
            useDeviceStore.getState().setDevices(
              useDeviceStore.getState().devices.map((d) => ({ ...d, is_online: false }))
            );
          });

          socket.on('device_presence', (data: { device_id?: string; online: boolean; is_chat_open?: boolean; last_active?: string }) => {
            console.log(`[ChatStore] Received device_presence:`, data);
            const devId = data.device_id || get().activeDeviceId;
            if (devId) {
              useDeviceStore.getState().updateDevice(devId, {
                is_online: data.online,
                last_active: data.last_active || new Date().toISOString(),
              });
            }
            if (!data.device_id || data.device_id === get().activeDeviceId) {
              const wasOnline = get().isDeviceOnline;
              if (data.online && !wasOnline) {
                import('sonner').then(({ toast }) => {
                  toast.success("Device connected");
                });
              }
              set((state) => ({
                isDeviceOnline: data.online,
                isChatOpen: data.is_chat_open !== undefined ? Boolean(data.is_chat_open) : (data.online ? state.isChatOpen : false),
              }));
            }
          });

          socket.on('device_discovered', (data: { ip: string; port: number }) => {
            console.log(`[ChatStore] Discovered device at ${data.ip}:${data.port}`);
            import('sonner').then(({ toast }) => {
              toast.info(`Device discovered at ${data.ip}:${data.port}`);
            });
          });

          socket.on('receive_message', (message: ChatMessage) => {
            console.log(`[TRACE: WEB RECEIVE] receive_message for device: ${message.device_id} | content: ${message.content?.substring(0, 20)}...`);
            if (!message) return;
            if (message.device_id) {
              useDeviceStore.getState().updateDevice(message.device_id, {
                last_active: new Date().toISOString(),
                is_online: true,
              });
            }
            const { activeDeviceId } = get();
            console.log('[ChatStore] activeDeviceId is:', activeDeviceId, 'message.device_id is:', message.device_id);
            if (activeDeviceId && message.device_id && String(message.device_id) !== String(activeDeviceId)) {
              console.warn('[ChatStore] Ignored message for different device:', message.device_id);
              return;
            }
            set((state) => {
              if (message.id && state.messages.some((m) => String(m.id) === String(message.id))) {
                return state;
              }
              return { messages: [...state.messages, message] };
            });
          });

          socket.on('profile_synced', (data: { device_id: string; profile_image?: string; device_name?: string }) => {
            const { devices, setDevices } = useDeviceStore.getState();
            const newDevices = devices.map(d => 
              d.device_id === data.device_id
                ? {
                    ...d,
                    ...(data.profile_image ? { profile_image: data.profile_image } : {}),
                    ...(data.device_name ? { device_name: data.device_name } : {}),
                  }
                : d
            );
            setDevices(newDevices);
          });

          socket.on('chat_sync_ready', async (data: { device_id: string }) => {
            console.log('[ChatStore] chat_sync_ready event received:', data);
            const targetId = data?.device_id;
            if (!targetId) return;
            try {
              const res = await fetch(`/api/chat?device_id=${targetId}&limit=50&offset=0`);
              const json = await res.json();
              if (json.success && Array.isArray(json.data?.messages)) {
                const fetchedMsgs: ChatMessage[] = json.data.messages;
                set((state) => {
                  // W16: Only apply if the target device is STILL the active device
                  if (state.activeDeviceId !== targetId) return state;
                  const existingIds = new Set(state.messages.map((m) => m.id).filter(Boolean));
                  const newMessages = fetchedMsgs.filter((m) => !existingIds.has(m.id));
                  if (newMessages.length === 0) return state;
                  const merged = [...state.messages, ...newMessages].sort((a, b) => {
                    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.id || 0);
                    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.id || 0);
                    return timeA - timeB;
                  });
                  return { messages: merged };
                });
              }
            } catch (err) {
              console.error("[ChatStore] Failed to sync chat", err);
            }
          });

          socket.on('messages_delivered', (data: { device_id?: string; message_ids: number[] }) => {
            console.log('[ChatStore] messages_delivered received:', data);
            if (!data || !Array.isArray(data.message_ids)) return;
            const deliveredSet = new Set(data.message_ids.map(Number));
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id && deliveredSet.has(Number(m.id))
                  ? { ...m, status: 'DELIVERED' }
                  : m
              ),
            }));
          });

          socket.on('delete_messages', (data: { device_id?: string; message_ids: number[] | 'all' }) => {
            const ids = data.message_ids;
            if (ids === 'all') {
              set({ messages: [] });
            } else if (Array.isArray(ids)) {
              set(state => ({
                messages: state.messages.filter(m => m.id === undefined || !ids.includes(m.id))
              }));
            }
          });

          set({ socket });
        }
      },

      connectSocket: (deviceId: string) => {
        get().initSocket();
        const socket = get().socket;

        const currentDev = useDeviceStore.getState().devices.find((d) => d.device_id === deviceId);
        set({
          activeDeviceId: deviceId,
          isDeviceOnline: currentDev?.is_online ?? false,
        });
        console.log('[ChatStore] connectSocket called for device:', deviceId, 'socket connected:', socket?.connected);

        // Socket.IO buffers emits if not yet connected, so emit register directly
        socket?.emit('register', deviceId, (ack?: { success: boolean }) => {
          if (ack?.success) {
            get().flushQueue(deviceId);
          }
        });
        if (socket?.connected) {
          get().flushQueue(deviceId);
        }
      },

      disconnectSocket: () => {
        const socket = get().socket;
        if (socket) {
          socket.disconnect();
        }
        set({ socket: null, activeDeviceId: null, messages: [], isDeviceOnline: false, isChatOpen: false });
      },

      setMessages: (messages) => set((state) => ({
        messages: typeof messages === 'function' ? messages(state.messages) : messages,
      })),

      sendMessage: (message) => {
        const socket = get().socket;
        const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const payloadWithClient = { ...message, client_id: localId };

        if (!socket?.connected) {
          console.warn('[ChatStore] Socket not connected — queuing message');
          set((state) => ({
            pendingQueue: [...state.pendingQueue, { localId, payload: payloadWithClient, retries: 0, status: 'pending' }],
          }));
          return;
        }

        // Single emit path: send via socket, server persists + broadcasts to others.
        // The ack callback returns the saved message (with DB id + timestamp).
        console.log(`[TRACE: WEB EMIT] send_message to server for device: ${message.device_id} | content: ${message.content?.substring(0, 20)}...`);
        socket.emit('send_message', payloadWithClient, (savedMessage: any) => {
          if (!savedMessage || typeof savedMessage !== 'object' || 'error' in savedMessage || !savedMessage.id) {
            const errStr = savedMessage?.error || 'Server error';
            console.error('[ChatStore] send_message rejected by server:', errStr);
            set((state) => ({
              pendingQueue: [...state.pendingQueue, { localId, payload: payloadWithClient, retries: 0, status: 'pending' }],
            }));
            return;
          }
          // Add the persisted message to local state (server already broadcast to others)
          const { messages, activeDeviceId } = get();
          if (message.device_id === activeDeviceId) {
            if (!messages.some((m) => m.id === savedMessage.id)) {
              set({ messages: [...messages, savedMessage] });
            }
          }
        });
      },

      flushQueue: (targetDeviceId?: string) => {
        const { pendingQueue, activeDeviceId, socket } = get();
        if (pendingQueue.length === 0 || !socket?.connected) return;

        const devId = targetDeviceId || activeDeviceId;
        if (!devId) return;

        // W18: Filter only pending (not in-flight/sending or failed) messages for this device
        const toFlush = pendingQueue.filter(
          (p) => p.payload.device_id === devId && p.status === 'pending'
        );
        if (toFlush.length === 0) return;

        console.log(`[ChatStore] Flushing ${toFlush.length} queued message(s) for device: ${devId}...`);

        // Mark in-flight immediately to prevent concurrent duplicate sends
        set((state) => ({
          pendingQueue: state.pendingQueue.map((p) =>
            toFlush.some((tf) => tf.localId === p.localId)
              ? { ...p, status: 'sending' as const }
              : p
          ),
        }));

        for (const pending of toFlush) {
          socket.emit('send_message', pending.payload, (savedMessage: any) => {
            if (!savedMessage || typeof savedMessage !== 'object' || 'error' in savedMessage || !savedMessage.id) {
              const newRetries = pending.retries + 1;
              set((state) => ({
                pendingQueue: state.pendingQueue.map((p) =>
                  p.localId === pending.localId
                    ? { ...p, retries: newRetries, status: newRetries >= MAX_RETRIES ? 'failed' as const : 'pending' as const }
                    : p
                ),
              }));
              return;
            }
            set((state) => {
              const remainingQueue = state.pendingQueue.filter((p) => p.localId !== pending.localId);
              if (state.activeDeviceId === devId) {
                const exists = state.messages.some((m) => m.id === savedMessage.id);
                return {
                  pendingQueue: remainingQueue,
                  messages: exists ? state.messages : [...state.messages, savedMessage],
                };
              }
              return { pendingQueue: remainingQueue };
            });
          });
        }
      },

      retryMessage: (localId: string) => {
        set((state) => ({
          pendingQueue: state.pendingQueue.map((p) =>
            p.localId === localId ? { ...p, retries: 0, status: 'pending' } : p
          ),
        }));
        get().flushQueue();
      },

      deleteMessages: async (messageIds: number[] | 'all', syncToDevice: boolean, targetDeviceId?: string) => {
        const targetId = targetDeviceId || get().activeDeviceId;
        if (!targetId) return;
        const socket = get().socket;
        
        // Single emit path: socket handler does DB deletion + broadcasts to other clients
        if (socket?.connected && get().activeDeviceId === targetId) {
          socket.emit('delete_messages', {
            device_id: targetId,
            message_ids: messageIds,
            sync_to_device: syncToDevice,
          });
        } else {
          // Fallback: if socket is down, delete via HTTP so data stays consistent
          try {
            const endpoint = typeof window !== 'undefined'
              ? '/api/chat'
              : `${process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`}/api/chat`;
            await fetch(endpoint, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                device_id: targetId,
                message_ids: messageIds,
                sync_to_device: syncToDevice,
              }),
            });
          } catch (err) {
            console.error('[ChatStore] Failed to delete messages (fallback HTTP)', err);
          }
        }

        // W15: Optimistically update local state ONLY if targetId is still active
        if (get().activeDeviceId === targetId) {
          if (messageIds === 'all') {
            set({ messages: [] });
          } else if (Array.isArray(messageIds)) {
            set((state) => ({
              messages: state.messages.filter((m) => m.id === undefined || !messageIds.includes(m.id)),
            }));
          }
        }
      },
    }),
    {
      name: 'simplify-sync-pending-queue',
      storage: createJSONStorage(() => localStorage),
      // Only persist the queue — not the socket instance or ephemeral runtime state
      partialize: (state) => ({ pendingQueue: state.pendingQueue }),
    }
  )
);