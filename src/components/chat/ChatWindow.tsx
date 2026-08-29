import { useChatStore } from "@/store/chatStore";
import { useUserStore } from "@/store/userStore";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { useClipboardSync } from "@/hooks/useClipboardSync";
import { isContext } from "vm";
import { Divide } from "lucide-react";

interface ChatWindowProps {
  deviceId: string;
  deviceName: string;
}

function formatMessageTime(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateMaker(date?: string | Date): string {
  if (!date) return "";

  const inputDate = new Date(date);
  if (isNaN(inputDate.getTime())) return ""; // Handle invalid date strings

  const now = new Date();
  const diffMs = now.getTime() - inputDate.getTime();

  const oneDayMs = 24 * 60 * 60 * 1000; // 86,400,000 ms

  if (diffMs < oneDayMs && inputDate.getDate() === now.getDate()) {
    return "Today";
  }

  // Older -> return date (e.g., "Aug 29, 2026" or "29/08/2026")
  return inputDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function ChatWindow({ deviceId, deviceName }: ChatWindowProps) {
  const enableDoubleClickCopy = useUserStore((s) => s.enableDoubleClickCopy);
  const isDeviceOnline = useChatStore((s) => s.isDeviceOnline);
  const isChatOpen = useChatStore((s) => s.isChatOpen);
  const pendingQueue = useChatStore((s) => s.pendingQueue);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const { messages, connectSocket, setMessages, sendMessage, socket } =
    useChatStore();
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<
    string | number | null
  >(null);

  const { syncLocalClipboard, error } = useClipboardSync(socket, deviceId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination states
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const limit = 50;

  useEffect(() => {
    if (!deviceId) return;
    setOffset(0);
    setHasMore(true);
    axios
      .get(`/api/chat?device_id=${deviceId}&limit=${limit}&offset=0`)
      .then((res) => {
        const newMsgs = res.data.data.messages;
        setMessages(newMsgs);
        if (newMsgs.length < limit) setHasMore(false);
        // Scroll to bottom immediately on first load
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 50);
      })
      .catch(console.error);
    connectSocket(deviceId);
  }, [deviceId, connectSocket, setMessages]);

  const handleScroll = () => {
    if (
      scrollRef.current &&
      scrollRef.current.scrollTop === 0 &&
      hasMore &&
      !isLoadingMore
    ) {
      loadMore();
    }
  };

  const loadMore = async () => {
    setIsLoadingMore(true);
    const nextOffset = offset + limit;

    // Remember current scroll height to maintain scroll position after inserting messages at the top
    const previousScrollHeight = scrollRef.current?.scrollHeight || 0;

    try {
      const res = await axios.get(
        `/api/chat?device_id=${deviceId}&limit=${limit}&offset=${nextOffset}`,
      );
      const olderMsgs = res.data.data.messages;

      if (olderMsgs.length < limit) {
        setHasMore(false);
      }

      if (olderMsgs.length > 0) {
        setOffset(nextOffset);
        // Prepend older messages
        setMessages([...olderMsgs, ...messages]);

        // Restore scroll position
        setTimeout(() => {
          if (scrollRef.current) {
            const newScrollHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTop =
              newScrollHeight - previousScrollHeight;
          }
        }, 0);
      }
    } catch (err) {
      console.error("Failed to load more messages", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // We remove the automatic scroll-to-bottom on *every* message change because it breaks scroll-to-top pagination.
  // We only want to scroll to bottom if the user is already near the bottom, but for now we rely on initial scroll.

  const processFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post("/api/upload", formData);
      if (res.data.success) {
        sendMessage({
          device_id: deviceId,
          sender: "me",
          content_type: "file",
          content: res.data.data.file_name,
          file_path: res.data.data.file_path,
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || uploading) return;
    sendMessage({
      device_id: deviceId,
      sender: "me",
      content_type: "text",
      content: input,
    });
    setInput("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      processFile(file);
    }
  };

  const renderBubbleContent = (msg: any, isMe: boolean = false) => {
    if (msg.content_type === "file") {
      const isImage = msg.content?.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
      const fileUrl = `/api/file?path=${msg.file_path}`;

      if (isImage) {
        return (
          <div className="flex flex-col gap-2">
            <img
              src={fileUrl}
              alt={msg.content}
              className={`rounded-lg max-w-full h-auto max-h-48 object-cover border ${isMe ? "border-white/20" : "border-[var(--color-outline-variant)]"}`}
            />
            <a
              href={fileUrl}
              download={msg.content}
              className={`text-xs underline text-center font-label-sm ${isMe ? "text-white/90 hover:text-white" : "opacity-80 hover:opacity-100"}`}
            >
              Download Image
            </a>
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">draft</span>
          <a
            href={fileUrl}
            download={msg.content}
            className={`underline break-all text-sm font-medium ${isMe ? "text-white hover:text-white/80" : "hover:opacity-80"}`}
          >
            {msg.content}
          </a>
        </div>
      );
    }

    let previewNode = null;
    if (msg.preview_data) {
      try {
        const preview =
          typeof msg.preview_data === "string"
            ? JSON.parse(msg.preview_data)
            : msg.preview_data;
        if (preview.title || preview.description) {
          previewNode = (
            <div
              className={`mt-2 text-sm rounded-lg p-2 overflow-hidden ${isMe ? "border border-white/20 bg-black/20 text-white" : "border border-[var(--color-outline-variant)] bg-[var(--color-surface-container)] opacity-90"}`}
            >
              {preview.title && (
                <div className="font-semibold text-xs truncate mb-1">
                  {preview.title}
                </div>
              )}
              {preview.description && (
                <div
                  className={`text-[10px] line-clamp-2 ${isMe ? "text-white/80" : "text-[var(--color-on-surface-variant)]"}`}
                >
                  {preview.description}
                </div>
              )}
            </div>
          );
        }
      } catch (err) {
        // ignore JSON parse errors
      }
    }

    return (
      <div className="flex flex-col gap-1 relative">
        <span className="wrap-break-word whitespace-pre-wrap">
          {msg.content}
        </span>
        {previewNode}
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col h-full bg-[var(--color-background)] transition-colors overflow-hidden ${isDragging ? "bg-[var(--color-surface-container)]" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay UI */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-background)]/80 backdrop-blur-sm border-2 border-dashed border-[var(--color-primary)]">
          <p className="text-[var(--color-primary)] font-headline-lg pointer-events-none">
            Drop file to send...
          </p>
        </div>
      )}

      {/* Header */}
      <header className="h-15 px-[var(--spacing-margin-container)] flex items-center justify-between border-b border-[var(--color-outline-variant)]/30 bg-[var(--color-background)]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full border border-[var(--color-outline-variant)] flex items-center justify-center font-headline-md text-[var(--color-on-surface)] bg-[var(--color-surface-variant)] hidden md:flex">
              {deviceName.charAt(0).toUpperCase()}
            </div>
            {isDeviceOnline && (
              <div
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--color-background)] ${isChatOpen ? "bg-green-500" : "bg-blue-500"}`}
              ></div>
            )}
          </div>
          <div>
            <h2 className="font-headline-md text-[var(--text-headline-md)] text-[var(--color-primary)] flex items-center gap-2">
              {deviceName}
            </h2>

            <p className="font-label-sm text-[var(--color-on-surface-variant)] text-[10px] mt-0.5 font-mono opacity-60">
              ID: {deviceId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-[var(--color-error)] font-medium mr-2">
              {error}
            </span>
          )}
          <button
            onClick={syncLocalClipboard}
            className="h-10 px-4 rounded-full flex items-center justify-center gap-2 text-[var(--color-primary)] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors border border-[var(--color-outline-variant)]/50"
            title="Push local clipboard to this device"
          >
            <span className="material-symbols-outlined text-[18px]">
              content_copy
            </span>
            <span className="text-sm font-medium hidden sm:block">
              Sync Clipboard
            </span>
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-[var(--spacing-margin-container)] flex flex-col gap-2 z-0 pb-16 custom-scrollbar relative bg-[url('/chat-bg-dark.png')] [.light_&]:bg-[url('/chat-bg.png')]"
        style={{ backgroundSize: "400px", backgroundRepeat: "repeat" }}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {messages.map((msg, idx) => {
          // 'me' = sent from this web UI
          // anything else ('android-xxx', 'pc', etc.) = received from phone
          const isMe = msg.sender === "me";
          // Shows badge on the first message (when conversation began)
          // and whenever the day changes from the previous message
          const showDateHeader =
            idx === 0 ||
            dateMaker(msg.timestamp) !==
              dateMaker(messages[idx - 1]?.timestamp);
          return (
            <React.Fragment key={msg.id ? `msg-${msg.id}` : `fallback-${idx}`}>
              {/* Centered Date Badge */}
              {showDateHeader && msg.timestamp && (
                <div className="self-center my-3 select-none">
                  <span className="px-3 py-1 rounded-md text-[12px] text-white  font-medium bg-[#1e2024]/90 text-[var(--color-on-surface-variant)] border border-white/5 shadow-sm">
                    {dateMaker(msg.timestamp)}
                  </span>
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`flex flex-col max-w-[85%] md:max-w-[70%] gap-1 group relative ${isMe ? "self-end items-end" : "self-start"}`}
              >
                <div
                  className={`flex items-end gap-1.5 py-1 rounded-2xl font-body-md leading-relaxed cursor-pointer ${
                    enableDoubleClickCopy ? "select-none" : ""
                  } ${
                    isMe
                      ? "bg-[#1E9CF1] text-white rounded-tr-sm shadow-sm pl-3.5 pr-2"
                      : "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-tl-sm border border-transparent pl-2.5 pr-3.5"
                  }`}
                  onDoubleClick={() => {
                    if (enableDoubleClickCopy && msg.content) {
                      navigator.clipboard.writeText(msg.content);
                      const id = msg.id || `fallback-${idx}`;
                      setCopiedMessageId(id);
                      setTimeout(() => setCopiedMessageId(null), 1500);
                    }
                  }}
                  title={enableDoubleClickCopy ? "Double-click to copy" : ""}
                >
                  {renderBubbleContent(msg, isMe)}

                  {msg.timestamp && (
                    <div
                      className={`text-[9px] shrink-0 pb-0.5 select-none ${
                        isMe
                          ? "text-white/80"
                          : "text-[var(--color-on-surface-variant)]"
                      }`}
                    >
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  )}
                </div>

                {copiedMessageId === (msg.id || `fallback-${idx}`) && (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 ${isMe ? "right-full mr-2" : "left-full ml-2"} bg-[var(--color-surface-variant)] text-[var(--color-primary)] text-[11px] px-2 py-0.25  rounded-sm shadow-sm border border-[var(--color-outline-variant)]/50 animate-in fade-in zoom-in duration-300 z-10 pointer-events-none flex items-center gap-1 whitespace-nowrap`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      check
                    </span>
                    copied!
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Pending / Failed queue bubbles */}
        {pendingQueue
          .filter((p) => p.payload.device_id === deviceId)
          .map((p) => (
            <div
              key={p.localId}
              className="flex flex-col max-w-[85%] md:max-w-[70%] gap-1 self-end items-end"
            >
              <div
                className={`px-4 py-1.5 rounded-2xl rounded-tr-sm font-body-md leading-relaxed flex items-center gap-2 ${
                  p.status === "failed"
                    ? "border border-[var(--color-error)]/60 bg-[var(--color-error-container)]/20 text-[var(--color-on-surface)]"
                    : "bg-[#1E9CF1]/80 text-white rounded-tr-sm opacity-80"
                }`}
              >
                <span className="flex-1 wrap-break-word whitespace-pre-wrap text-sm">
                  {p.payload.content}
                </span>
                <span className="text-[10px] text-white/70 ml-auto">
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {p.status === "failed" ? (
                  <button
                    onClick={() => retryMessage(p.localId)}
                    title="Retry sending"
                    className="flex items-center gap-1 text-[var(--color-error)] hover:opacity-80 transition-opacity shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      error
                    </span>
                    <span className="text-[10px] font-medium">Retry</span>
                  </button>
                ) : (
                  <span className="material-symbols-outlined text-[14px] shrink-0 animate-pulse text-white/90">
                    schedule
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-3 pt-1">
        <form
          onSubmit={handleSendText}
          className="flex items-center gap-2 px-2 py-1.5 bg-[#1e2024] rounded-full border border-white/5 focus-within:border-white/15 transition-all shadow-lg"
        >
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Attach button */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 ml-1 shrink-0 rounded-full flex items-center justify-center text-[var(--color-on-surface-variant)] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Attach file"
          >
            <span className="material-symbols-outlined text-[20px]">
              attach_file
            </span>
          </button>

          {/* Text input — grows with content */}
          <textarea
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-white text-[15px] placeholder:text-[#666] resize-none py-2 px-2 overflow-y-auto custom-scrollbar leading-relaxed"
            style={{ minHeight: "26px", maxHeight: "120px" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
            value={uploading ? "Uploading file…" : input}
            disabled={uploading}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendText(e as any);
              }
            }}
            placeholder="Type a message..."
            rows={1}
          />

          {/* Blue circular send button with upward arrow */}
          <button
            type="submit"
            disabled={uploading || !input.trim()}
            className="w-9 h-9 mr-0.5 shrink-0 rounded-full flex items-center justify-center bg-[#1E9CF1] hover:bg-[#1985ce] active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-[#1E9CF1] disabled:active:scale-100 shadow-md"
            title="Send"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-white"
            >
              <path d="M12 19V5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWindow;
