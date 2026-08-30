import { insertChatMessage, getDeviceBySessionToken, updateDeviceProfileImage } from "@/db/sqlite";
import { Server as HTTPServer } from "http";
import fs from "fs";
import path from "path";

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
  
  // Attach to global so API routes in dev mode (which run in isolated contexts) can access it
  (global as any).io = io;

  io.use((socket, next) => {
    const sessionToken = socket.handshake.auth.session_token;

    if (!sessionToken) {
      // No token — only allow if the request originates from the same host (Web UI).
      // In production the Origin header must match the server's own address.
      const origin = socket.handshake.headers.origin || '';
      const host = socket.handshake.headers.host || '';

      // Same-origin check: origin must end with the host value (covers http://host and https://host)
      const isSameOrigin = origin && host && origin.includes(host);

      if (!isSameOrigin) {
        console.warn(`[Socket.io] Rejected unauthenticated connection from origin: ${origin}`);
        return next(new Error("Unauthorized: no session token and non-local origin"));
      }

      // Tag as web UI client — cannot use mobile-only events
      socket.data.role = 'web';
      socket.data.authenticated = false;
      return next();
    }

    // Mobile client — must have a valid session token
    const device = getDeviceBySessionToken(sessionToken);
    if (!device) {
      return next(new Error("Unauthorized: invalid session token"));
    }

    socket.data.device_id = device.device_id;
    socket.data.role = 'mobile';
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
      // Secure actualDeviceId to strictly use authenticated socket.data.device_id
      const actualDeviceId = socket.data.device_id;

      if (!actualDeviceId) {
        console.error("[Socket.io] Rejecting send_message: unauthorized unauthenticated socket");
        return;
      }

      // Sender is always the authenticated device
      const sender = actualDeviceId;

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
      // Only allow authenticated sockets to emit clipboard:sync
      const actualDeviceId = socket.data.device_id;
      if (!actualDeviceId) {
        console.warn("[Socket] Clipboard sync rejected: unauthorized unauthenticated socket");
        return;
      }
      
      // Verify pairing: Mobile device can only sync to its own room
      if (actualDeviceId !== payload.targetDeviceId) {
        console.warn(`[Socket] Clipboard sync rejected: sender ${actualDeviceId} is not paired with target ${payload.targetDeviceId}`);
        return;
      }

      console.log(`[Socket] Clipboard sync from ${socket.id} to ${payload.targetDeviceId}`);
      socket.to(payload.targetDeviceId).emit("clipboard:receive", payload);
    });

    socket.on("request_chat_sync", (data) => {
      const actualDeviceId = socket.data.device_id;
      if (!actualDeviceId || actualDeviceId !== data.device_id) return;
      console.log(`[Socket] Chat sync requested by mobile: ${actualDeviceId}`);
      socket.to(actualDeviceId).emit("chat_sync_ready", { device_id: actualDeviceId });
    });

    socket.on("sync_profile", (data: { device_id: string, base64_image: string }) => {
      const actualDeviceId = socket.data.device_id;
      if (!actualDeviceId || actualDeviceId !== data.device_id) return;
      
      try {
        const matches = data.base64_image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let base64Data = data.base64_image;
        let ext = 'jpg';
        
        if (matches && matches.length === 3) {
          ext = matches[1].split('/')[1] || 'jpg';
          base64Data = matches[2];
        }

        const fileName = `android-${actualDeviceId}-${Date.now()}.${ext}`;
        const dirPath = path.join(process.cwd(), "public", "uploads", "profiles");
        
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const filePath = path.join(dirPath, fileName);
        fs.writeFileSync(filePath, base64Data, 'base64');
        
        const fileUrl = `/uploads/profiles/${fileName}`;
        updateDeviceProfileImage(actualDeviceId, fileUrl);
        
        console.log(`[Socket] Profile synced for ${actualDeviceId}: ${fileUrl}`);
        // Notify web UI to refresh
        socket.to(actualDeviceId).emit("profile_synced", { device_id: actualDeviceId, profile_image: fileUrl });
      } catch (err) {
        console.error("[Socket] Failed to save synced profile photo:", err);
      }
    });

  });
  console.log("> Socket.io server initialized");

  return io;
}
export function getIO(): Server | null {
  return (global as any).io || io || null;
}
