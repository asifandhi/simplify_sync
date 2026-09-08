/**
 * Socket.io event name constants — single source of truth for the web server + client.
 * Must stay in sync with Android's SocketEvents.kt.
 *
 * Import from BOTH server-side handlers and client-side listeners
 * to prevent typo/collision bugs.
 */
export const SocketEvents = {
  // ── Messaging ──────────────────────────────────────────────
  SEND_MESSAGE: "send_message",
  RECEIVE_MESSAGE: "receive_message",
  DELETE_MESSAGES: "delete_messages",
  MARK_DELIVERED: "mark_delivered",
  MESSAGES_DELIVERED: "messages_delivered",
  PENDING_MESSAGES: "pending_messages",
  PENDING_ACTIONS: "pending_actions",
  CLEAR_CHAT_ACK: "clear_chat_ack",

  // ── Chat sync ──────────────────────────────────────────────
  REQUEST_CHAT_SYNC: "request_chat_sync",
  CHAT_SYNC_READY: "chat_sync_ready",
  CHAT_STATE: "chat_state",

  // ── Presence / lifecycle ───────────────────────────────────
  DEVICE_PRESENCE: "device_presence",
  REGISTER: "register",

  // ── Device management ──────────────────────────────────────
  PAIRING_REQUEST: "pairing_request",
  SESSION_REVOKE: "session_revoke",

  // ── Profile ────────────────────────────────────────────────
  SYNC_PROFILE: "sync_profile",
  PROFILE_SYNCED: "profile_synced",

  // ── Transfer ───────────────────────────────────────────────
  TRANSFER_PROGRESS: "transfer_progress",
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
