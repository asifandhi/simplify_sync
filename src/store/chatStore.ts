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

    // FIX: Set activeDeviceId BEFORE creating the socket so the on('connect')
    // handler can read the correct deviceId when it fires during the async handshake.
    const prevDeviceId = get().activeDeviceId;
    if (prevDeviceId !== deviceId) {
      set({ activeDeviceId: deviceId, messages: [] });
    } else {
      set({ activeDeviceId: deviceId });
    }

    if (!socket) {
      socket = io();

      socket.on('connect', () => {
        set({ isConnected: true });
        // activeDeviceId is already committed to the store above,
        // so register fires with the correct room ID even on first connect.
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

        // FIX: Only accept messages whose device_id matches the open chat thread.
        // Do NOT filter on sender — the sender field is the android device id string,
        // not "me", so previously messages from android matched activeDeviceId and
        // appeared on the wrong (left) side.
        if (message.device_id !== activeDeviceId) return;

        // Prevent duplicates (e.g. from HMR or socket reconnect double-delivery)
        if (message.id && messages.some((m) => m.id === message.id)) return;

        set({ messages: [...messages, message] });
      });

      set({ socket });
    }

    // If already connected (e.g. switching between devices), register immediately.
    // If not yet connected, the on('connect') handler above fires once the
    // async handshake completes and will call register at that point.
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
      console.log('[ChatStore] Emitting send_message:', message);
      socket.emit('send_message', message);
    } else {
      console.error('[ChatStore] Cannot send message: Socket is completely uninitialized.');
    }
  },
}));