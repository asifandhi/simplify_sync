import { insertChatMessage } from "@/db/sqlite";
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

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    // Join a room based on device_id for targeted messaging
    
    socket.on("register", (device_id: string) => {
      socket.join(device_id);
      console.log(
        `[Socket.io] ${socket.id} registered for device: ${device_id}`,
      );
    });

    socket.on("send_message", (data) => {
      // Persist message to SQLite
      const savedMessage = insertChatMessage({
        device_id: data.device_id,
        sender: data.sender,
        content_type: data.content_type,
        content: data.content,
        file_path: data.file_path,
        preview_data: data.preview_data,
        is_view_once: data.is_view_once,
      });

      // Broadcast to the target device's room
      io.to(data.device_id).emit("receive_message", savedMessage);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });

    socket.on("clipboard:sync", (payload) => {
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
