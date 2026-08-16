import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
// @RTU
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
  messages: ChatMessage[];
  activeDeviceId: string | null;
  connectSocket: (deviceId: string) => void;
  disconnectSocket: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  socket: null,
  isConnected: false,
  messages: [],
  activeDeviceId: null,

  connectSocket: (deviceId: string) => {
    let socket = get().socket;
    
    if (!socket) {
      socket = io(); // Connects to host

      socket.on('connect', () => {
        set({ isConnected: true });
        const currentActive = get().activeDeviceId;
        if (currentActive) {
          socket?.emit('register', currentActive);
        }
      });

      socket.on('disconnect', () => {
        set({ isConnected: false });
      });

      socket.on('receive_message', (message: ChatMessage) => {
        if (!message) return;
        const { activeDeviceId, messages } = get();
        // Append if message matches current active chat (or if sender is target device)
        if (message.device_id === activeDeviceId || message.sender === activeDeviceId) {
          set({ messages: [...messages, message] });
        }
      });

      set({ socket });
    }

    set({ activeDeviceId: deviceId });

    if (socket.connected) {
      socket.emit('register', deviceId);
    }
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, activeDeviceId: null, messages: [] });
  },

  setMessages: (messages) => set({ messages }),

  sendMessage: (message) => {
    const { socket } = get();
    if (socket) {
      console.log("[ChatStore] Emitting send_message:", message);
      socket.emit('send_message', message);
    } else {
      console.error("[ChatStore] Cannot send message: Socket is completely uninitialized.");
    }
  },
}));