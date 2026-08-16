"use client";

import { useChatStore } from "@/store/chatStore";
import { Socket } from "socket.io-client";

/**
 * Returns the Socket.io client instance managed by the chat store.
 * Ensures all components share a single socket connection.
 *
 * Usage:
 *   const socket = useSocket();
 *   socket?.on("event", handler);
 */
export function useSocket(): Socket | null {
  return useChatStore((state) => state.socket);
}
