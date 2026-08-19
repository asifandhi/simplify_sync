import { insertChatMessage, getDeviceBySessionToken } from "@/db/sqlite";
import { Server as HTTPServer } from "http";

import { Server, Socket } from "socket.io";

let io: Server;

// Track active mobile connections to provide presence status
const activeMobileSockets = new Map<string, number>();
const deviceChatState = new Map<string, boolean>();

export function initSocket(server: HTTPServer) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const sessionToken = socket.handshake.auth.session_token;

    // The Web UI connects without a token. We must restrict this to localhost 
    // to prevent remote attackers on the local network from connecting.
    if (!sessionToken) {
      const ip = socket.handshake.address;
      if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
        socket.data.is_web_ui = true;
        return next();
      }
      return next(new Error("Unauthorized: missing session token"));
    }

    // Mobile client (remote) — must have a valid session token
    const device = getDeviceBySessionToken(sessionToken);
    if (!device) {
      return next(new Error("Unauthorized: invalid session token"));
    }

    socket.data.device_id = device.device_id;
    socket.data.authenticated = true;
    next();
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    
    // Mobile clients authenticate via middleware and have socket.data.device_id
    if (socket.data.device_id) {
      const devId = socket.data.device_id;
      socket.join(devId);
      
      const count = activeMobileSockets.get(devId) || 0;
      activeMobileSockets.set(devId, count + 1);
      if (count === 0) {
        const isChatOpen = deviceChatState.get(devId) || false;
        console.log(`[Presence] Broadcasting online:true to room ${devId}`);
        io.to(devId).emit("device_presence", { online: true, is_chat_open: isChatOpen });
      }
      console.log(`[Socket.io] ${socket.id} auto-joined room: ${devId} | Active connections: ${count + 1}`);
    }
    
    socket.on("chat_state", (data: { is_open: boolean }) => {
      if (socket.data.device_id) {
        const devId = socket.data.device_id;
        deviceChatState.set(devId, data.is_open);
        console.log(`[Presence] Device ${devId} chat is_open:${data.is_open}`);
        io.to(devId).emit("device_presence", { online: true, is_chat_open: data.is_open });
      }
    });

    socket.on("register", (device_id: string) => {
      if (!socket.data.is_web_ui) {
        console.error(`[Socket.io] Rejecting register event from non-Web-UI socket ${socket.id}`);
        return;
      }
      
      // Web UI clients use this to subscribe to a specific device's events
      socket.join(device_id);
      const rooms = Array.from(socket.rooms);
      console.log(`[Socket.io] ${socket.id} registered for device: ${device_id} | All rooms: ${JSON.stringify(rooms)}`);
      
      // Instantly reply with current presence status
      const isOnline = (activeMobileSockets.get(device_id) || 0) > 0;
      const isChatOpen = deviceChatState.get(device_id) || false;
      console.log(`[Presence] Register request for ${device_id}. Responding with online:${isOnline}, is_chat_open:${isChatOpen}`);
      socket.emit("device_presence", { online: isOnline, is_chat_open: isChatOpen });
    });

    socket.on("send_message", async (data) => {
      // If the socket has a device_id (mobile client), force it. 
      // If it's the Web UI, allow it to specify the target device_id.
      // Otherwise, reject.
      if (!socket.data.device_id && !socket.data.is_web_ui) {
        console.error("[Socket.io] Rejecting send_message: Unauthenticated socket attempted spoofing.");
        return;
      }

      const actualDeviceId = socket.data.device_id || data.device_id;

      if (!actualDeviceId) {
        console.error("[Socket.io] Rejecting send_message: no device_id available");
        return;
      }

      // Determine sender identity securely
      const sender = socket.data.device_id
        ? socket.data.device_id  // Mobile client — strictly enforce their identity
        : (data.sender || "me"); // Web UI — trust payload sender field

      console.log(`[Socket.io] Message for device_id: ${actualDeviceId}, sender: ${sender}`);

      // Persist message to SQLite
      const savedMessage = insertChatMessage({
        device_id: actualDeviceId,
        sender,
        content_type: data.content_type || data.contentType || "text",
        content: data.content,
        file_path: data.file_path || data.filePath,
        preview_data: data.preview_data || data.previewData,
        is_view_once: data.is_view_once || data.isViewOnce,
      });

      // Broadcast to the target device's room (excluding sender)
      const roomSockets = await io.in(actualDeviceId).fetchSockets();
      console.log(`[Socket.io] Broadcasting to room '${actualDeviceId}' — ${roomSockets.length} socket(s) in room: ${roomSockets.map(s => s.id).join(', ')}`);
      socket.to(actualDeviceId).emit("receive_message", savedMessage);
      
      // Web UI sends messages without local persistence, so it needs an echo to render.
      // Mobile clients save locally before sending, so we don't echo to prevent duplicates.
      if (!socket.data.device_id) {
        socket.emit("receive_message", savedMessage);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      
      if (socket.data.device_id) {
        const devId = socket.data.device_id;
        const count = activeMobileSockets.get(devId) || 1;
        if (count <= 1) {
          activeMobileSockets.delete(devId);
          deviceChatState.set(devId, false); // Reset chat state on disconnect
          console.log(`[Presence] Broadcasting online:false to room ${devId}`);
          io.to(devId).emit("device_presence", { online: false, is_chat_open: false });
          console.log(`[Socket.io] Device ${devId} is now offline.`);
        } else {
          activeMobileSockets.set(devId, count - 1);
        }
      }
    });

    socket.on("clipboard:sync", (payload) => {
      if (!socket.data.device_id && !socket.data.is_web_ui) {
        console.error("[Socket.io] Rejecting clipboard:sync from untrusted socket.");
        return;
      }
      
      const targetDevice = socket.data.device_id ? socket.data.device_id : payload.targetDeviceId;
      console.log(`[Socket] Clipboard sync from ${socket.id} to ${targetDevice}`);
      if (payload.targetDeviceId) {
        socket.to(payload.targetDeviceId).emit("clipboard:receive", payload);
      }
    });
  });
  console.log("> Socket.io server initialized");

  return io;
}
export function getIO() {
  if (!io) {
    throw new Error("Socket.io is not initialized.");
  }
  return io;
}
