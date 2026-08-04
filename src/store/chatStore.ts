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
  messages: ChatMessage[];
  activeDeviceId: string | null;
  connectSocket: (deviceId: string) => void;
  disconnectSocket: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  sendMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  socket: null,
  messages: [],
  activeDeviceId: null,

  connectSocket: (deviceId: string) => {
    let socket = get().socket;
    
    if (!socket || !socket.connected) {
      socket = io(); // Automatically connects to the current host
      
      socket.on('receive_message', (message: ChatMessage) => {
        const { activeDeviceId, messages } = get();
        // Append only if the message belongs to the currently viewed chat
        if (message.device_id === activeDeviceId) {
          set({ messages: [...messages, message] });
        }
      });
      
      set({ socket });
    }
    
    socket.emit('register', deviceId);
    set({ activeDeviceId: deviceId });
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
      socket.emit('send_message', message);
    }
  },
}));