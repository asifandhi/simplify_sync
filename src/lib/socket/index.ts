import { insertChatMessage, getDeviceBySessionToken, updateDeviceProfileImage, updateDeviceProfile, deleteMultipleChatMessages, deleteAllChatMessages, updateDeviceLastActive, getPendingChatMessages, markMessagesDelivered, insertPendingAction, getPendingActions, markActionApplied, isDeviceRegistered } from "@/db/sqlite";
import { Server as HTTPServer } from "http";
import fs from "fs";
import path from "path";

import { Server, Socket } from "socket.io";
import { SocketEvents } from "./events";
import { fetchOpenGraph } from "@/lib/utils/openGraph";
import { isValidLocalOrigin, isLoopbackAddress } from "@/lib/localAccess";
import { isValidUploadFilename } from "@/lib/pathSafety";
import { saveProfileImage } from "./profileImage";

let io: Server;

// Track active mobile connections to provide presence status
const activeMobileSockets = new Map<string, Set<string>>();
const deviceChatState = new Map<string, boolean>();

function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isValidSocketDeviceId(val: unknown): val is string {
  return (
    typeof val === "string" &&
    val.trim().length >= 1 &&
    val.trim().length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(val.trim())
  );
}

function isPositiveSafeInteger(val: unknown): val is number {
  return typeof val === "number" && Number.isSafeInteger(val) && val > 0;
}

export function isDeviceOnline(deviceId: string): boolean {
  const sockets = activeMobileSockets.get(deviceId);
  if (!sockets || sockets.size === 0) return false;
  if (io) {
    for (const sid of sockets) {
      if (io.sockets.sockets.get(sid)?.connected) {
        return true;
      }
    }
    return false;
  }
  return sockets.size > 0;
}

export function disconnectDeviceSockets(deviceId: string): void {
  if (!deviceId || typeof deviceId !== "string") return;

  const socketIds = activeMobileSockets.get(deviceId);
  activeMobileSockets.delete(deviceId);
  deviceChatState.delete(deviceId);

  if (io) {
    if (socketIds) {
      for (const sid of socketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.data.authenticated = false;
          s.data.device_id = undefined;
          s.data.role = undefined;
          s.leave(deviceId);
          s.disconnect(true);
        }
      }
    }
    for (const [, s] of io.sockets.sockets) {
      if (s.data.role === "mobile" && s.data.device_id === deviceId) {
        s.data.authenticated = false;
        s.data.device_id = undefined;
        s.data.role = undefined;
        s.leave(deviceId);
        s.disconnect(true);
      }
    }
    io.emit(SocketEvents.DEVICE_PRESENCE, {
      device_id: deviceId,
      online: false,
      is_chat_open: false,
      last_active: new Date().toISOString(),
    });
  }
}

export function isSocketAuthorizedForDevice(
  socket: { data: { role?: string; device_id?: string; authenticated?: boolean }; rooms: Set<string> },
  targetDeviceId: string | undefined
): boolean {
  if (!targetDeviceId || typeof targetDeviceId !== "string") {
    return false;
  }

  // Mobile client: strictly locked to its authenticated device_id
  if (socket.data.role === "mobile") {
    return socket.data.authenticated === true && socket.data.device_id === targetDeviceId;
  }

  // Web client: must have web role and must have joined the device room
  if (socket.data.role === "web") {
    return socket.rooms.has(targetDeviceId);
  }

  return false;
}

export function initSocket(server: HTTPServer) {
  // Idempotency guard — prevents double-init on hot-reload or accidental re-call
  if (io) {
    if (process.env.NODE_ENV === "development") console.warn("[Socket.io] initSocket called again — reusing existing instance.");
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    pingInterval: 3000,
    pingTimeout: 4000,
  });
  
  // Attach to global so API routes in dev mode (which run in isolated contexts) can access it
  (global as any).io = io;

  io.use((socket, next) => {
    const sessionToken = socket.handshake.auth?.session_token;

    if (!sessionToken) {
      // W02: Tokenless sockets must be from a verified loopback peer PLUS exact allowed-origin validation
      const remoteAddress = socket.conn.remoteAddress || socket.handshake.address || (socket.request as any)?.socket?.remoteAddress;
      const isLocal = isLoopbackAddress(remoteAddress);

      if (!isLocal) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[Socket.io] Rejected tokenless connection from non-loopback address: ${remoteAddress}`);
        }
        return next(new Error("Unauthorized: tokenless access restricted to local loopback"));
      }

      const rawHost = socket.handshake.headers.host;
      const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost) || '';
      const rawOrigin = socket.handshake.headers.origin;
      const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
      const rawReferer = socket.handshake.headers.referer || socket.handshake.headers.referrer;
      const referer = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;

      let isValidOrigin = false;
      if (origin) {
        isValidOrigin = isValidLocalOrigin(origin, host);
      } else if (referer) {
        try {
          const refererOrigin = new URL(referer).origin;
          isValidOrigin = isValidLocalOrigin(refererOrigin, host);
        } catch {
          isValidOrigin = false;
        }
      }

      if (!isValidOrigin) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[Socket.io] Rejected unauthenticated connection from invalid origin: ${origin} (referer: ${referer}, host: ${host})`);
        }
        return next(new Error("Unauthorized: valid local origin required"));
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
    if (process.env.NODE_ENV === "development") console.log(`[Socket.io] Client connected: ${socket.id} (role: ${socket.data.role})`);
    
    // Mobile clients authenticate via middleware and have socket.data.device_id
    if (socket.data.device_id) {
      const devId = socket.data.device_id;
      socket.join(devId);
      
      const now = new Date().toISOString();
      updateDeviceLastActive(devId, now);

      let sockets = activeMobileSockets.get(devId);
      if (!sockets) {
        sockets = new Set<string>();
        activeMobileSockets.set(devId, sockets);
      }
      const wasOnline = sockets.size > 0;
      sockets.add(socket.id);

      if (!wasOnline) {
        const isChatOpen = deviceChatState.get(devId) || false;
        if (process.env.NODE_ENV === "development") console.log(`[Presence] Broadcasting online:true for device ${devId}`);
        io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: true, is_chat_open: isChatOpen, last_active: now });
      }
      if (process.env.NODE_ENV === "development") console.log(`[Socket.io] ${socket.id} auto-joined room: ${devId} | Active connections: ${sockets.size}`);
    }
    
    socket.on(SocketEvents.CHAT_STATE, (data: unknown) => {
      try {
        if (!isPlainObject(data) || typeof data.is_open !== "boolean") {
          return;
        }
        if (socket.data.role === "mobile" && socket.data.authenticated && socket.data.device_id) {
          const devId = socket.data.device_id;
          const now = new Date().toISOString();
          updateDeviceLastActive(devId, now);
          deviceChatState.set(devId, data.is_open);
          if (process.env.NODE_ENV === "development") console.log(`[Presence] Device ${devId} chat is_open:${data.is_open}`);
          io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: true, is_chat_open: data.is_open, last_active: now });
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in chat_state handler:", err);
      }
    });

    socket.on(SocketEvents.REGISTER, (device_id: unknown) => {
      try {
        // W02: Only web clients can register for device rooms
        if (socket.data.role !== 'web') {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Ignoring REGISTER from non-web client ${socket.id} (role: ${socket.data.role})`);
          }
          return;
        }

        if (!isValidSocketDeviceId(device_id)) {
          return;
        }

        const validDeviceId = device_id.trim();

        // Leave previous device rooms to avoid receiving cross-device events
        for (const room of socket.rooms) {
          if (room !== socket.id && room !== validDeviceId) {
            socket.leave(room);
          }
        }
        // Web UI clients use this to subscribe to a specific device's events
        socket.join(validDeviceId);
        const rooms = Array.from(socket.rooms);
        if (process.env.NODE_ENV === "development") console.log(`[Socket.io] ${socket.id} registered for device: ${validDeviceId} | All rooms: ${JSON.stringify(rooms)}`);
        
        // Instantly reply with current presence status
        const isOnline = isDeviceOnline(validDeviceId);
        const isChatOpen = isOnline ? (deviceChatState.get(validDeviceId) || false) : false;
        if (process.env.NODE_ENV === "development") console.log(`[Presence] Register request for ${validDeviceId}. Responding with online:${isOnline}, is_chat_open:${isChatOpen}`);
        socket.emit(SocketEvents.DEVICE_PRESENCE, { device_id: validDeviceId, online: isOnline, is_chat_open: isChatOpen });
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in register handler:", err);
      }
    });

    // ── SINGLE EMIT PATH for messages ────────────────────────────────────
    // Both mobile and web clients send messages through this handler.
    // Mobile: authenticated via socket.data.device_id
    // Web: identified by device_id in payload (must be in room)
    socket.on(SocketEvents.SEND_MESSAGE, async (data: unknown, callback?: unknown) => {
      const sendError = (errMsg: string) => {
        if (typeof callback === "function") {
          try { callback({ success: false, error: errMsg }); } catch {}
        }
      };

      try {
        if (!isPlainObject(data)) {
          sendError("Invalid payload: object expected");
          return;
        }

        const targetDeviceId = typeof data.device_id === "string" ? data.device_id.trim() : undefined;
        const actualDeviceId = socket.data.device_id || targetDeviceId;

        if (!actualDeviceId || !isValidSocketDeviceId(actualDeviceId) || !isSocketAuthorizedForDevice(socket, actualDeviceId)) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[Socket.io] Rejecting send_message: unauthorized for device '${actualDeviceId}'`);
          }
          sendError("Unauthorized for this device");
          return;
        }

        const rawFilePath = typeof data.file_path === "string" ? data.file_path : (typeof data.filePath === "string" ? data.filePath : undefined);
        if (rawFilePath && !isValidUploadFilename(rawFilePath)) {
          sendError("Invalid file_path: must be an opaque upload identifier");
          return;
        }

        if (data.content !== undefined && typeof data.content !== "string") {
          sendError("Invalid content: string expected");
          return;
        }
        if (typeof data.content === "string" && data.content.length > 65536) {
          sendError("Payload too large: content exceeds 64KB");
          return;
        }

        const allowedContentTypes = ["text", "file", "image"];
        const rawContentType = data.content_type || data.contentType || "text";
        if (typeof rawContentType !== "string" || !allowedContentTypes.includes(rawContentType)) {
          sendError("Invalid content_type");
          return;
        }
        const contentType = rawContentType;

        // Update last active timestamp on every sent message
        const now = new Date().toISOString();
        updateDeviceLastActive(actualDeviceId, now);
        io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: actualDeviceId, online: true, last_active: now });

        // Determine sender identity
        const sender = socket.data.device_id
          ? actualDeviceId      // mobile: device_id as sender
          : (typeof data.sender === "string" && data.sender.trim() ? data.sender.trim() : "me"); // web: use payload or default to "me"

        console.log(`[TRACE: SERVER RECEIVE] send_message from ${socket.data.role} (socket ${socket.id}) for device: ${actualDeviceId} | content: ${data.content?.substring(0, 20)}...`);

        // Fetch OpenGraph preview for text messages (moved from HTTP route)
        let finalPreviewData = typeof data.preview_data === "string" ? data.preview_data : (typeof data.previewData === "string" ? data.previewData : undefined);
        if (contentType === "text" && data.content && !finalPreviewData) {
          try {
            const ogPreview = await fetchOpenGraph(data.content);
            if (ogPreview) finalPreviewData = ogPreview;
          } catch (err) {
            // Non-fatal — message still sends without preview
            if (process.env.NODE_ENV === "development") console.warn("[Socket.io] OG preview fetch failed:", err);
          }
        }

        // W11 Async Guard: verify session hasn't been revoked mid-await before saving to DB
        if (!socket.connected) return;
        if (socket.data.role === "mobile" && (!socket.data.authenticated || socket.data.device_id !== actualDeviceId || !isDeviceRegistered(actualDeviceId))) {
          if (process.env.NODE_ENV === "development") console.warn(`[Socket.io] Aborting send_message: session for ${actualDeviceId} revoked mid-operation`);
          sendError("Session revoked");
          return;
        }

        // Persist message to SQLite
        const isViewOnce = Boolean(data.is_view_once || data.isViewOnce);
        const savedMessage = insertChatMessage({
          device_id: actualDeviceId,
          sender,
          content_type: contentType,
          content: data.content,
          file_path: rawFilePath,
          preview_data: finalPreviewData,
          is_view_once: isViewOnce,
        });

        // Send saved message back to sender via acknowledgment
        if (typeof callback === "function") {
          try { callback(savedMessage); } catch {}
        }

        // Broadcast to everyone else in the room (excludes sender)
        console.log(`[TRACE: SERVER BROADCAST] Emitting receive_message to room: ${actualDeviceId} (excludes sender socket: ${socket.id})`);
        socket.to(actualDeviceId).emit(SocketEvents.RECEIVE_MESSAGE, savedMessage);
      } catch (err: any) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in send_message handler:", err);
        sendError("Internal socket error processing message");
      }
    });

    socket.on("disconnect", (reason) => {
      if (process.env.NODE_ENV === "development") console.log(`[Socket.io] Client disconnected: ${socket.id} (reason: ${reason})`);
      
      if (socket.data.device_id) {
        const devId = socket.data.device_id;
        const sockets = activeMobileSockets.get(devId);
        if (sockets) {
          sockets.delete(socket.id);
        }
        const now = new Date().toISOString();
        updateDeviceLastActive(devId, now);

        let hasActiveSocket = false;
        if (sockets && sockets.size > 0) {
          for (const sid of Array.from(sockets)) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.connected) {
              hasActiveSocket = true;
              break;
            } else {
              sockets.delete(sid);
            }
          }
        }

        if (!hasActiveSocket) {
          activeMobileSockets.delete(devId);
          deviceChatState.set(devId, false); // Reset chat state on disconnect
          if (process.env.NODE_ENV === "development") console.log(`[Presence] Broadcasting online:false for device ${devId}`);
          io.emit(SocketEvents.DEVICE_PRESENCE, { device_id: devId, online: false, is_chat_open: false, last_active: now });
          if (process.env.NODE_ENV === "development") console.log(`[Socket.io] Device ${devId} is now offline.`);
        }
      }
    });

    socket.on(SocketEvents.REQUEST_CHAT_SYNC, (data?: unknown) => {
      try {
        const reqDeviceId = isPlainObject(data) && typeof data.device_id === "string" ? data.device_id.trim() : undefined;
        const actualDeviceId = socket.data.device_id || reqDeviceId;
        if (!actualDeviceId || !isValidSocketDeviceId(actualDeviceId) || !isSocketAuthorizedForDevice(socket, actualDeviceId)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting chat sync: unauthorized for device '${actualDeviceId}'`);
          }
          return;
        }
        if (process.env.NODE_ENV === "development") console.log(`[Socket] Chat sync requested for device: ${actualDeviceId}`);
        
        // Deliver any pending clear-chat actions FIRST (so older messages are cleared before new ones arrive)
        const pendingActions = getPendingActions(actualDeviceId);
        if (pendingActions && pendingActions.length > 0) {
          if (process.env.NODE_ENV === "development") console.log(`[Socket] Sending ${pendingActions.length} pending actions to ${actualDeviceId}`);
          socket.emit(SocketEvents.PENDING_ACTIONS, {
            device_id: actualDeviceId,
            actions: pendingActions,
          });
        }

        // Deliver any pending missed messages to this device (in chronological order)
        const pendingMessages = getPendingChatMessages(actualDeviceId);
        if (pendingMessages && pendingMessages.length > 0) {
          if (process.env.NODE_ENV === "development") console.log(`[Socket] Sending ${pendingMessages.length} pending messages to ${actualDeviceId}`);
          socket.emit(SocketEvents.PENDING_MESSAGES, {
            device_id: actualDeviceId,
            messages: pendingMessages,
          });
        }
        socket.to(actualDeviceId).emit(SocketEvents.CHAT_SYNC_READY, { device_id: actualDeviceId });
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in request_chat_sync handler:", err);
      }
    });

    socket.on(SocketEvents.MARK_DELIVERED, (data: unknown) => {
      try {
        if (!isPlainObject(data) || !Array.isArray(data.message_ids) || data.message_ids.length === 0 || data.message_ids.length > 500) {
          return;
        }
        if (!data.message_ids.every((id: unknown) => isPositiveSafeInteger(id))) {
          return;
        }

        const targetDeviceId = typeof data.device_id === "string" ? data.device_id.trim() : undefined;
        const actualDeviceId = socket.data.device_id || targetDeviceId;
        if (!actualDeviceId || !isValidSocketDeviceId(actualDeviceId) || !isSocketAuthorizedForDevice(socket, actualDeviceId)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting mark_delivered: unauthorized for device '${actualDeviceId}'`);
          }
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`[Socket] Marking messages delivered for ${actualDeviceId}:`, data.message_ids);
        }
        markMessagesDelivered(data.message_ids, actualDeviceId);

        // Broadcast to room so web UI updates indicator from pending to delivered
        io.to(actualDeviceId).emit(SocketEvents.MESSAGES_DELIVERED, {
          device_id: actualDeviceId,
          message_ids: data.message_ids,
        });
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in mark_delivered handler:", err);
      }
    });

    socket.on(SocketEvents.CLEAR_CHAT_ACK, (data: unknown) => {
      try {
        // W12: Clear-chat ack MUST come from authenticated mobile role
        if (socket.data.role !== "mobile" || !socket.data.authenticated || !socket.data.device_id) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting clear_chat_ack: non-mobile or unauthenticated socket`);
          }
          return;
        }

        if (!isPlainObject(data) || !isPositiveSafeInteger(data.action_id)) {
          return;
        }

        const authenticatedDeviceId = socket.data.device_id;

        // If payload supplies a device_id, it must match the authenticated device_id
        if (data.device_id && data.device_id !== authenticatedDeviceId) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting clear_chat_ack: payload device_id mismatch with session`);
          }
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`[Socket] CLEAR_CHAT_ACK from ${authenticatedDeviceId} for action_id: ${data.action_id}`);
        }
        // W12: pass authenticatedDeviceId into markActionApplied
        markActionApplied(data.action_id, authenticatedDeviceId);
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in clear_chat_ack handler:", err);
      }
    });

    socket.on(SocketEvents.SYNC_PROFILE, async (data: unknown) => {
      try {
        if (!isPlainObject(data)) {
          return;
        }

        const targetDeviceId = typeof data.device_id === "string" ? data.device_id.trim() : undefined;
        const actualDeviceId = socket.data.device_id || targetDeviceId;
        if (!actualDeviceId || !isValidSocketDeviceId(actualDeviceId) || !isSocketAuthorizedForDevice(socket, actualDeviceId)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting sync_profile: unauthorized for device '${actualDeviceId}'`);
          }
          return;
        }

        let fileUrl: string | undefined = undefined;
        let updatedName: string | undefined = undefined;

        if (typeof data.device_name === "string" && data.device_name.trim()) {
          const trimmed = data.device_name.trim();
          if (trimmed.length <= 64) {
            updatedName = trimmed;
          }
        }

        if (typeof data.base64_image === "string" && data.base64_image) {
          fileUrl = await saveProfileImage(data.base64_image);
        }

        // W11 Async Guard: verify session still active after image processing await
        if (!socket.connected) return;
        if (socket.data.role === "mobile" && (!socket.data.authenticated || socket.data.device_id !== actualDeviceId || !isDeviceRegistered(actualDeviceId))) {
          if (process.env.NODE_ENV === "development") console.warn(`[Socket.io] Aborting sync_profile: session for ${actualDeviceId} revoked mid-operation`);
          return;
        }

        if (updatedName || fileUrl) {
          updateDeviceProfile(actualDeviceId, {
            device_name: updatedName,
            profile_image: fileUrl,
          });

          if (process.env.NODE_ENV === "development") {
            console.log(`[Socket] Profile synced for ${actualDeviceId} — name: "${updatedName}", image: "${fileUrl}"`);
          }

          // Broadcast to all connected web clients so sidebar & active chat header update live
          io.emit(SocketEvents.PROFILE_SYNCED, {
            device_id: actualDeviceId,
            profile_image: fileUrl,
            device_name: updatedName,
          });
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket] Failed to save synced profile photo:", err);
      }
    });

    // ── SINGLE EMIT PATH for deletes ─────────────────────────────────────
    // Both mobile and web clients send deletes through this handler.
    socket.on(SocketEvents.DELETE_MESSAGES, (payload: unknown) => {
      try {
        if (!isPlainObject(payload)) {
          return;
        }

        const targetDeviceId = typeof payload.device_id === "string" ? payload.device_id.trim() : undefined;
        const actualDeviceId = socket.data.device_id || targetDeviceId;
        if (!actualDeviceId || !isValidSocketDeviceId(actualDeviceId) || !isSocketAuthorizedForDevice(socket, actualDeviceId)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Socket.io] Rejecting delete_messages: unauthorized for device '${actualDeviceId}'`);
          }
          return;
        }

        const isValidIds =
          payload.message_ids === "all" ||
          (Array.isArray(payload.message_ids) &&
            payload.message_ids.length > 0 &&
            payload.message_ids.length <= 500 &&
            payload.message_ids.every((id: unknown) => isPositiveSafeInteger(id)));

        if (!isValidIds) {
          return;
        }

        if (process.env.NODE_ENV === "development") console.log(`[Socket] Delete messages requested by ${socket.data.role} for ${actualDeviceId}:`, payload.message_ids);

        if (payload.message_ids === "all") {
          deleteAllChatMessages(actualDeviceId);
        } else if (Array.isArray(payload.message_ids)) {
          deleteMultipleChatMessages(payload.message_ids, actualDeviceId);
        }

        // If the target device is currently offline or not on chat screen, queue the action so it applies on reconnect/open
        const targetIsOnline = isDeviceOnline(actualDeviceId);
        const isChatOpen = deviceChatState.get(actualDeviceId) === true;
        if ((!targetIsOnline || !isChatOpen) && socket.data.role === "web") {
          const payloadStr = payload.message_ids === "all" ? "all" : JSON.stringify(payload.message_ids);
          insertPendingAction(actualDeviceId, "clear_chat", payloadStr);
          if (process.env.NODE_ENV === "development") console.log(`[Socket] Device ${actualDeviceId} offline or chat closed — queued clear_chat pending action`);
        }

        // Broadcast to everyone else in the room — always include device_id in payload
        socket.to(actualDeviceId).emit(SocketEvents.DELETE_MESSAGES, {
          device_id: actualDeviceId,
          message_ids: payload.message_ids,
        });
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[Socket.io] Error in delete_messages handler:", err);
      }
    });

  });
  if (process.env.NODE_ENV === "development") console.log("> Socket.io server initialized");

  return io;
}
export function getIO(): Server | null {
  return (global as any).io || io || null;
}

export function resetIOForTesting(): void {
  if (io) {
    try { io.close(); } catch {}
    (io as any) = null;
    (global as any).io = null;
  }
}
