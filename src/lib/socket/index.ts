import { insertChatMessage, getDeviceBySessionToken } from "@/db/sqlite";
import { Server as HTTPServer } from "http";

import { Server, Socket } from "socket.io";

let io: Server;

export function initSocket(server: HTTPServer) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use((socket, next) => {
    const sessionToken = socket.handshake.auth.session_token;

    // Allow the PC web client to connect without a session token
    // (it connects from the same origin — no device_id needed for web UI)
    if (!sessionToken) {
      // Web UI client — no device_id, but allowed to connect
      return next();
    }

    // Mobile client — must have a valid session token
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
    
    // Join a room based on device_id for targeted messaging
    // Mobile clients authenticate via middleware and have socket.data.device_id
    if (socket.data.device_id) {
      socket.join(socket.data.device_id);
      console.log(`[Socket.io] ${socket.id} auto-joined room: ${socket.data.device_id}`);
    }
    
    socket.on("register", (device_id: string) => {
      // Web UI clients use this to subscribe to a specific device's events
      socket.join(device_id);
      const rooms = Array.from(socket.rooms);
      console.log(`[Socket.io] ${socket.id} registered for device: ${device_id} | All rooms: ${JSON.stringify(rooms)}`);
    });

    socket.on("send_message", async (data) => {
      // Determine the device_id:
      // - Authenticated mobile clients: use socket.data.device_id (trusted, from DB)
      // - Web UI clients: use data.device_id from payload (web UI is on the same host)
      const actualDeviceId = socket.data.device_id || data.device_id;

      if (!actualDeviceId) {
        console.error("[Socket.io] Rejecting send_message: no device_id available");
        return;
      }

      // Determine sender identity
      const sender = socket.data.device_id
        ? socket.data.device_id  // Mobile client — already prefixed 'android-...'
        : (data.sender || "unknown");          // Web UI — trust payload sender field

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
    });

    socket.on("clipboard:sync", (payload) => {
      // Only allow clipboard sync from identified sockets (web UI registered or authenticated mobile)
      if (!socket.data.device_id && !payload.senderDeviceId) {
        console.warn("[Socket] Clipboard sync rejected: unidentified sender");
        return;
      }
      console.log(`[Socket] Clipboard sync from ${socket.id} to ${payload.targetDeviceId}`);
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
