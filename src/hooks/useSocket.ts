"use client";

import { useChatStore } from "@/store/chatStore";
import { Socket } from "socket.io-client";

import { useEffect } from "react";

/**
 * Returns the Socket.io client instance managed by the chat store.
 * Ensures all components share a single socket connection.
 *
 * Usage:
 *   const socket = useSocket();
 *   socket?.on("event", handler);
 */
export function useSocket(): Socket | null {
  const socket = useChatStore((state) => state.socket);
  const initSocket = useChatStore((state) => state.initSocket);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  return socket;
}
