import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';

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
}

export interface PendingMessage {
  localId: string;
  payload: Omit<ChatMessage, 'id' | 'timestamp'>;
  retries: number;
  status: 'pending' | 'failed';
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
  setMessages: (messages: ChatMessage[]) => void;
  sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  flushQueue: () => void;
  retryMessage: (localId: string) => void;
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

          socket.on('connect', () => {
            set({ isConnected: true });
            const currentActive = get().activeDeviceId;
            if (currentActive) {
              socket?.emit('register', currentActive);
            }
            // Flush any queued messages on reconnect
            get().flushQueue();
          });

          socket.on('disconnect', () => {
            set({ isConnected: false, isDeviceOnline: false, isChatOpen: false });
          });

          socket.on('device_presence', (data: { online: boolean; is_chat_open?: boolean }) => {
            console.log(`[ChatStore] Received device_presence:`, data);
            set({ isDeviceOnline: data.online, isChatOpen: !!data.is_chat_open });
          });

          socket.on('receive_message', (message: ChatMessage) => {
            if (!message) return;
            const { activeDeviceId, messages } = get();
            if (message.device_id !== activeDeviceId) return;
            if (message.id && messages.some((m) => m.id === message.id)) return;
            set({ messages: [...messages, message] });
          });

          set({ socket });
        }
      },

      connectSocket: (deviceId: string) => {
        get().initSocket();
        const socket = get().socket;

        const prevDeviceId = get().activeDeviceId;
        if (prevDeviceId !== deviceId) {
          set({ activeDeviceId: deviceId, messages: [], isDeviceOnline: false, isChatOpen: false });
        } else {
          set({ activeDeviceId: deviceId });
        }

        if (socket?.connected) {
          socket.emit('register', deviceId);
        }
      },

      disconnectSocket: () => {
        const socket = get().socket;
        if (socket) {
          socket.disconnect();
        }
        set({ socket: null, activeDeviceId: null, messages: [], isDeviceOnline: false, isChatOpen: false });
      },

      setMessages: (messages) => set({ messages }),

      sendMessage: async (message) => {
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
          });
          const result = await response.json();

          if (result.success) {
            const { messages, activeDeviceId } = get();
            if (message.device_id === activeDeviceId) {
              if (!messages.some((m) => m.id === result.data.id)) {
                set({ messages: [...messages, result.data] });
              }
            }
          } else {
            console.error('[ChatStore] Failed to send message via API — queuing:', result.error);
            const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            set((state) => ({
              pendingQueue: [...state.pendingQueue, { localId, payload: message, retries: 0, status: 'pending' }],
            }));
          }
        } catch (err) {
          console.error('[ChatStore] Network error — queuing message:', err);
          const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          set((state) => ({
            pendingQueue: [...state.pendingQueue, { localId, payload: message, retries: 0, status: 'pending' }],
          }));
        }
      },

      flushQueue: async () => {
        const { pendingQueue, activeDeviceId } = get();
        if (pendingQueue.length === 0) return;

        const toFlush = pendingQueue.filter(
          (p) => p.payload.device_id === activeDeviceId && p.status !== 'failed'
        );
        if (toFlush.length === 0) return;

        console.log(`[ChatStore] Flushing ${toFlush.length} queued message(s)...`);

        for (const pending of toFlush) {
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(pending.payload),
            });
            const result = await response.json();

            if (result.success) {
              set((state) => ({
                pendingQueue: state.pendingQueue.filter((p) => p.localId !== pending.localId),
                messages: state.messages.some((m) => m.id === result.data.id)
                  ? state.messages
                  : [...state.messages, result.data],
              }));
            } else {
              throw new Error(result.error);
            }
          } catch {
            const newRetries = pending.retries + 1;
            set((state) => ({
              pendingQueue: state.pendingQueue.map((p) =>
                p.localId === pending.localId
                  ? { ...p, retries: newRetries, status: newRetries >= MAX_RETRIES ? 'failed' : 'pending' }
                  : p
              ),
            }));
          }
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
    }),
    {
      name: 'simplify-sync-pending-queue',
      storage: createJSONStorage(() => localStorage),
      // Only persist the queue — not the socket instance or ephemeral runtime state
      partialize: (state) => ({ pendingQueue: state.pendingQueue }),
    }
  )
);