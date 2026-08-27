import { create } from 'zustand';
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

interface ChatStore {
  socket: Socket | null;
  isConnected: boolean;
  isDeviceOnline: boolean;
  isChatOpen: boolean;
  messages: ChatMessage[];
  activeDeviceId: string | null;
  initSocket: () => void;
  connectSocket: (deviceId: string) => void;
  disconnectSocket: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  socket: null,
  isConnected: false,
  isDeviceOnline: false,
  isChatOpen: false,
  messages: [],
  activeDeviceId: null,

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
        body: JSON.stringify(message)
      });
      const result = await response.json();
      
      if (result.success) {
        // Echo the message back to the UI instantly since it was successfully saved
        const { messages, activeDeviceId } = get();
        if (message.device_id === activeDeviceId) {
          // Prevent duplicates if socket happens to bounce it back
          if (!messages.some((m) => m.id === result.data.id)) {
            set({ messages: [...messages, result.data] });
          }
        }
      } else {
        console.error('[ChatStore] Failed to send message via API:', result.error);
      }
    } catch (err) {
      console.error('[ChatStore] Error sending message via API:', err);
    }
  },
}));