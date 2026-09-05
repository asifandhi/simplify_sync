import { insertChatMessage, getDeviceBySessionToken, updateDeviceProfileImage, deleteMultipleChatMessages, deleteAllChatMessages, updateDeviceLastActive } from "@/db/sqlite";
import { Server as HTTPServer } from "http";
import fs from "fs";
import path from "path";

import { Server, Socket } from "socket.io";
import { SocketEvents } from "./events";
import { fetchOpenGraph } from "@/lib/utils/openGraph";

let io: Server;

// Track active mobile connections to provide presence status
const activeMobileSockets = new Map<string, number>();
const deviceChatState = new Map<string, boolean>();

export function isDeviceOnline(deviceId: string): boolean {
  return (activeMobileSockets.get(deviceId) || 0) > 0;
}

export function initSocket(server: HTTPServer) {
  // Idempotency guard — prevents double-init on hot-reload or accidental re-call
  if (io) {
    console.warn("[Socket.io] initSocket called again — reusing existing instance.");
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  
  // Attach to global so API routes in dev mode (which run in isolated contexts) can access it
  (global as any).io = io;

  io.use((socket, next) => {
    const sessionToken = socket.handshake.auth?.session_token;

    if (!sessionToken) {
      // No token — only allow if the request originates from the same host (Web UI).
      // In production the Origin header must match the server's own address.
      const origin = socket.handshake.headers.origin || '';
      const host = socket.handshake.headers.host || '';
      const referer = socket.handshake.headers.referer || '';

      // Same-origin check: allow if origin or referer matches host, or if origin header is omitted on same-origin requests
      const isSameOrigin = (origin && host && origin.includes(host)) ||
                           (referer && host && referer.includes(host)) ||
                           !origin;

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
    console.log(`[Socket.io] Client connected: ${socket.id} (role: ${socket.data.role})`);
    
    // Mobile clients authenticate via middleware and have socket.data.device_id
    if (socket.data.device_id) {
      const devId = socket.data.device_id;
      socket.join(devId);
      
      const now = new Date().toISOString();
      updateDeviceLastActive(devId, now);

      const count = activeMobileSockets.get(devId) || 0;
      activeMobileSockets.set(devId, count + 1);
      if (count === 0) {
        const isChatOpen = deviceChatState.get(devId) || false;
        console.log(`[Presence] Broadcasting online:true for device ${devId}`);
        io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: true, is_chat_open: isChatOpen, last_active: now });
      }
      console.log(`[Socket.io] ${socket.id} auto-joined room: ${devId} | Active connections: ${count + 1}`);
    }
    
    socket.on(SocketEvents.CHAT_STATE, (data: { is_open: boolean }) => {
      if (socket.data.device_id) {
        const devId = socket.data.device_id;
        const now = new Date().toISOString();
        updateDeviceLastActive(devId, now);
        deviceChatState.set(devId, data.is_open);
        console.log(`[Presence] Device ${devId} chat is_open:${data.is_open}`);
        io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: true, is_chat_open: data.is_open, last_active: now });
      }
    });

    socket.on(SocketEvents.REGISTER, (device_id: string) => {
      if (socket.data.role === 'mobile') {
        console.log(`[Socket.io] Ignoring REGISTER from mobile client ${socket.id} (already bound to ${socket.data.device_id})`);
        return;
      }

      // Leave previous device rooms to avoid receiving cross-device events
      for (const room of socket.rooms) {
        if (room !== socket.id && room !== device_id) {
          socket.leave(room);
        }
      }
      // Web UI clients use this to subscribe to a specific device's events
      socket.join(device_id);
      const rooms = Array.from(socket.rooms);
      console.log(`[Socket.io] ${socket.id} registered for device: ${device_id} | All rooms: ${JSON.stringify(rooms)}`);
      
      // Instantly reply with current presence status
      const isOnline = (activeMobileSockets.get(device_id) || 0) > 0;
      const isChatOpen = deviceChatState.get(device_id) || false;
      console.log(`[Presence] Register request for ${device_id}. Responding with online:${isOnline}, is_chat_open:${isChatOpen}`);
      socket.emit(SocketEvents.DEVICE_PRESENCE, { device_id, online: isOnline, is_chat_open: isChatOpen });
    });

    // ── SINGLE EMIT PATH for messages ────────────────────────────────────
    // Both mobile and web clients send messages through this handler.
    // Mobile: authenticated via socket.data.device_id
    // Web: identified by device_id in payload (must be in room)
    socket.on(SocketEvents.SEND_MESSAGE, async (data, callback) => {
      const actualDeviceId = socket.data.device_id || data.device_id;

      if (!actualDeviceId) {
        console.error("[Socket.io] Rejecting send_message: no device_id");
        if (typeof callback === "function") callback({ error: "No device_id" });
        return;
      }

      // For web clients, verify they're actually in the device's room
      if (!socket.data.device_id && !socket.rooms.has(actualDeviceId)) {
        console.error(`[Socket.io] Rejecting send_message: web socket not in room '${actualDeviceId}'`);
        if (typeof callback === "function") callback({ error: "Not registered for this device" });
        return;
      }

      // Update last active timestamp on every sent message
      const now = new Date().toISOString();
      updateDeviceLastActive(actualDeviceId, now);
      io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: actualDeviceId, online: true, last_active: now });

      // Determine sender identity
      const sender = socket.data.device_id
        ? actualDeviceId      // mobile: device_id as sender
        : data.sender || "me"; // web: use payload or default to "me"

      console.log(`[TRACE: SERVER RECEIVE] send_message from ${socket.data.role} (socket ${socket.id}) for device: ${actualDeviceId} | content: ${data.content?.substring(0, 20)}...`);

      // Fetch OpenGraph preview for text messages (moved from HTTP route)
      let finalPreviewData = data.preview_data || data.previewData;
      const contentType = data.content_type || data.contentType || "text";
      if (contentType === "text" && data.content && !finalPreviewData) {
        try {
          const ogPreview = await fetchOpenGraph(data.content);
          if (ogPreview) finalPreviewData = ogPreview;
        } catch (err) {
          // Non-fatal — message still sends without preview
          console.warn("[Socket.io] OG preview fetch failed:", err);
        }
      }

      // Persist message to SQLite
      const savedMessage = insertChatMessage({
        device_id: actualDeviceId,
        sender,
        content_type: contentType,
        content: data.content,
        file_path: data.file_path || data.filePath,
        preview_data: finalPreviewData,
        is_view_once: data.is_view_once || data.isViewOnce,
      });

      // Send saved message back to sender via acknowledgment
      if (typeof callback === "function") callback(savedMessage);

      // Broadcast to everyone else in the room (excludes sender)
      console.log(`[TRACE: SERVER BROADCAST] Emitting receive_message to room: ${actualDeviceId} (excludes sender socket: ${socket.id})`);
      socket.to(actualDeviceId).emit(SocketEvents.RECEIVE_MESSAGE, savedMessage);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      
      if (socket.data.device_id) {
        const devId = socket.data.device_id;
        const count = activeMobileSockets.get(devId) || 1;
        const now = new Date().toISOString();
        updateDeviceLastActive(devId, now);

        if (count <= 1) {
          activeMobileSockets.delete(devId);
          deviceChatState.set(devId, false); // Reset chat state on disconnect
          console.log(`[Presence] Broadcasting online:false for device ${devId}`);
          io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: false, is_chat_open: false, last_active: now });
          console.log(`[Socket.io] Device ${devId} is now offline.`);
        } else {
          activeMobileSockets.set(devId, count - 1);
        }
      }
    });

    socket.on(SocketEvents.REQUEST_CHAT_SYNC, (data) => {
      const actualDeviceId = socket.data.device_id;
      if (!actualDeviceId || actualDeviceId !== data.device_id) return;
      console.log(`[Socket] Chat sync requested by mobile: ${actualDeviceId}`);
      socket.to(actualDeviceId).emit(SocketEvents.CHAT_SYNC_READY, { device_id: actualDeviceId });
    });

    socket.on(SocketEvents.SYNC_PROFILE, (data: { device_id: string, base64_image: string }) => {
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
        socket.to(actualDeviceId).emit(SocketEvents.PROFILE_SYNCED, { device_id: actualDeviceId, profile_image: fileUrl });
      } catch (err) {
        console.error("[Socket] Failed to save synced profile photo:", err);
      }
    });

    // ── SINGLE EMIT PATH for deletes ─────────────────────────────────────
    // Both mobile and web clients send deletes through this handler.
    socket.on(SocketEvents.DELETE_MESSAGES, (payload: { device_id: string, message_ids: number[] | 'all' }) => {
      const actualDeviceId = socket.data.device_id || payload.device_id;
      if (!actualDeviceId) return;

      // For mobile: verify device_id matches authenticated identity
      if (socket.data.device_id && socket.data.device_id !== payload.device_id) return;
      // For web: verify socket is in the device's room
      if (!socket.data.device_id && !socket.rooms.has(actualDeviceId)) return;
      
      console.log(`[Socket] Delete messages requested by ${socket.data.role} for ${actualDeviceId}:`, payload.message_ids);
      
      if (payload.message_ids === 'all') {
        deleteAllChatMessages(actualDeviceId);
      } else if (Array.isArray(payload.message_ids)) {
        deleteMultipleChatMessages(payload.message_ids, actualDeviceId);
      }
      
      // Broadcast to everyone else in the room — always include device_id in payload
      socket.to(actualDeviceId).emit(SocketEvents.DELETE_MESSAGES, {
        device_id: actualDeviceId,
        message_ids: payload.message_ids,
      });
    });

  });
  console.log("> Socket.io server initialized");

  return io;
}
export function getIO(): Server | null {
  return (global as any).io || io || null;
}
