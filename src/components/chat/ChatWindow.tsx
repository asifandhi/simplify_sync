import { useChatStore } from "@/store/chatStore";
import { useUserStore } from "@/store/userStore";
import { useSettingsStore } from "@/store/settingStore";
import { thanosSnap } from "@/lib/effects/thanosSnap";
import axios from "axios";
// import { useSocket } from "@/lib/socket/SocketProvider";
import React, { useEffect, useRef, useState } from "react";


interface ChatWindowProps {
  deviceId: string;
  deviceName: string;
  profileImage?: string;
}

function formatMessageTime(timestamp?: string): string {
  if (!timestamp) return "";
  // SQLite returns "YYYY-MM-DD HH:MM:SS" in UTC. Convert to ISO 8601 UTC.
  const isoString = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateMaker(date?: string | Date): string {
  if (!date) return "";

  const timestamp = typeof date === 'string' ? date : date.toISOString();
  const isoString = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
  const inputDate = new Date(isoString);
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

function getMsgKey(msg: { id?: number; sender?: string; timestamp?: string }, fallbackIdx?: number): string {
  if (msg.id !== undefined && msg.id !== null) return `id-${msg.id}`;
  return `msg-${msg.sender || ""}-${msg.timestamp || ""}${fallbackIdx !== undefined ? `-${fallbackIdx}` : ""}`;
}

function isImageMessage(msg: { content_type?: string; content?: string; file_path?: string }): boolean {
  if (msg.content_type === "image") return true;
  if (msg.content_type === "file" && msg.content?.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null) return true;
  if (msg.file_path?.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null) return true;
  if (msg.content?.startsWith("image:") || msg.file_path?.includes("-image_") || msg.file_path?.includes("-image")) return true;
  return false;
}
function ChatWindow({ deviceId, deviceName, profileImage }: ChatWindowProps) {
  const { enableDoubleClickCopy } = useUserStore();

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
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && previewImage) {
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showClearChatModal, setShowClearChatModal] = useState(false);

  // 3-Dot Dropdown Menu State & Lifecycle
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openMenu = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsMenuClosing(false);
    setIsMenuOpen(true);
  };

  const closeMenu = (immediate = false) => {
    if (immediate) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setIsMenuClosing(false);
      setIsMenuOpen(false);
      return;
    }

    if (!isMenuOpen || isMenuClosing) return;

    setIsMenuClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(false);
      setIsMenuClosing(false);
      closeTimeoutRef.current = null;
    }, 120);
  };

  const toggleMenu = () => {
    if (isMenuOpen && !isMenuClosing) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!isMenuOpen || isMenuClosing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !menuButtonRef.current?.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, isMenuClosing]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Track message IDs for entrance animations (only new live messages animate)
  const initialLoadDoneRef = useRef(false);
  const knownMessageKeysRef = useRef<Set<string>>(new Set());
  const liveMessageKeysRef = useRef<Set<string>>(new Set());
  const [clearChatSync, setClearChatSync] = useState(false);

  const { deleteMessages } = useChatStore();
  const { snapEffectEnabled } = useSettingsStore();


  const scrollRef = useRef<HTMLDivElement>(null);

  // Track if scroll-down button is visible and how many messages arrived while scrolled up
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);

  // Ref to track the last message ID to avoid triggering on pagination (prepend)
  const lastMessageIdRef = useRef<string | number | null>(null);

  // Ref to track when an internal chat image/file is being dragged outward
  const isDraggingInternalRef = useRef(false);

  // Maintain scroll position when new messages arrive or when sending
  const isScrolledToBottomRef = useRef(true);

  // Pagination states
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const limit = 50;

  // Helper: check if user is within 150px of the bottom
  const isNearBottom = () => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 150;
  };

  // Helper: smooth scroll to the bottom
  const scrollToBottom = (smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setShowScrollBottom(false);
      setUnreadBelowCount(0);
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const copySelected = () => {
    const selectedMsgs = messages.filter((m) => m.id && selectedIds.has(m.id)).map(m => m.content).filter(Boolean);
    if (selectedMsgs.length > 0) {
      navigator.clipboard.writeText(selectedMsgs.join("\n\n"));
      cancelSelection();
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size > 0) {
      const idsToDelete = Array.from(selectedIds);

      if (snapEffectEnabled) {
        const elementsToSnap: HTMLElement[] = [];
        idsToDelete.forEach((id) => {
          const el = document.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
          if (el) elementsToSnap.push(el);
        });

        if (elementsToSnap.length > 0) {
          await Promise.all(elementsToSnap.map((el) => thanosSnap(el)));
        }
      }

      deleteMessages(idsToDelete, false);
      cancelSelection();
    }
  };

  const clearChat = async () => {
    setShowClearChatModal(false);
    closeMenu(true);

    if (snapEffectEnabled) {
      const allBubbles = Array.from(
        document.querySelectorAll('[data-chat-bubble="true"]')
      ) as HTMLElement[];

      if (allBubbles.length > 0) {
        await Promise.all(allBubbles.map((el) => thanosSnap(el)));
      }
    }

    deleteMessages('all', clearChatSync);
  };

  useEffect(() => {
    if (!deviceId) return;
    initialLoadDoneRef.current = false;
    knownMessageKeysRef.current.clear();
    liveMessageKeysRef.current.clear();
    setMessages([]);
    setOffset(0);
    setHasMore(true);
    axios
      .get(`/api/chat?device_id=${deviceId}&limit=${limit}&offset=0`)
      .then((res) => {
        const newMsgs = res.data.data.messages;
        if (Array.isArray(newMsgs)) {
          newMsgs.forEach((m: any, i: number) => {
            knownMessageKeysRef.current.add(getMsgKey(m, i));
          });
        }
        initialLoadDoneRef.current = true;
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
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // 1. Pagination: Load more when reaching the top
    if (scrollTop === 0 && hasMore && !isLoadingMore) {
      loadMore();
    }

    // 2. If scrolled near the bottom (< 100px), hide arrow and reset counter
    if (distanceFromBottom < 100) {
      setShowScrollBottom(false);
      setUnreadBelowCount(0);
    } else if (distanceFromBottom > 200) {
      // If scrolled further up (> 200px), show the arrow button
      setShowScrollBottom(true);
    }
  };

  useEffect(() => {
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg.id || `${lastMsg.sender}-${lastMsg.timestamp}`;

    // Only trigger if a NEW message was appended to the bottom (ignores prepended older messages)
    if (lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;

      const isMe = lastMsg.sender === "me";

      if (isMe) {
        // Sent message: ALWAYS auto-scroll immediately to bottom
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        // Arriving message:
        if (isNearBottom()) {
          // Near the end: auto-scroll down smoothly
          setTimeout(() => scrollToBottom(true), 50);
        } else {
          // Scrolled above reading history: stay where you are, show arrow & increment count
          setShowScrollBottom(true);
          setUnreadBelowCount((prev) => prev + 1);
        }
      }
    }
  }, [messages]);

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
        if (Array.isArray(olderMsgs)) {
          olderMsgs.forEach((m: any, i: number) => {
            knownMessageKeysRef.current.add(getMsgKey(m, i));
          });
        }
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
        const isImg = file.type.startsWith("image/") || /\.(jpeg|jpg|gif|png|webp)$/i.test(file.name);
        sendMessage({
          device_id: deviceId,
          sender: "me",
          content_type: isImg ? "image" : "file",
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
    if (isDraggingInternalRef.current) return;
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
    if (isDraggingInternalRef.current) return;
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

  const handleImageDragStart = (
    e: React.DragEvent<HTMLImageElement>,
    fileUrl: string,
    fileName: string,
  ) => {
    isDraggingInternalRef.current = true;
    const ext = fileName.split(".").pop()?.toLowerCase() || "jpeg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "gif"
        ? "image/gif"
        : "image/jpeg";
    const fullUrl =
      typeof window !== "undefined"
        ? new URL(fileUrl, window.location.origin).href
        : fileUrl;

    e.dataTransfer.setData("DownloadURL", `${mime}:${fileName}:${fullUrl}`);
    e.dataTransfer.setData("text/uri-list", fullUrl);
    e.dataTransfer.setData("text/plain", fullUrl);
  };

  const handleImageDragEnd = () => {
    isDraggingInternalRef.current = false;
  };

  const handleDownload = async (e: React.MouseEvent, url: string, rawFilename?: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      let filename = (rawFilename || "download").replace(/[\\/:*?"<>|]/g, "_");
      const downloadUrl = url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      if (!filename.includes(".")) {
        const mime = blob.type;
        if (mime === "image/png") filename += ".png";
        else if (mime === "image/jpeg") filename += ".jpg";
        else if (mime === "image/webp") filename += ".webp";
        else if (mime === "image/gif") filename += ".gif";
        else if (mime === "application/pdf") filename += ".pdf";
        else filename += ".jpg";
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed, falling back to direct link", err);
      window.open(url, "_blank");
    }
  };

  const renderBubbleContent = (msg: any, isMe: boolean = false) => {
    const isImage = isImageMessage(msg);
    if (isImage) {
      const fileUrl = msg.file_url || `/api/file?path=${msg.file_path}`;
      return (
        <div
          className="relative group overflow-hidden rounded-xl w-[220px] sm:w-[260px] max-w-full cursor-pointer"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setPreviewImage({ url: fileUrl, name: msg.content || "Image" });
          }}
          title="Double-click to preview"
        >
          <img
            src={fileUrl}
            alt={msg.content || "Image"}
            draggable={true}
            onDragStart={(e) =>
              handleImageDragStart(e, fileUrl, msg.content || "image.png")
            }
            onDragEnd={handleImageDragEnd}
            className={`rounded-xl w-full h-auto max-h-48 sm:max-h-52 object-cover cursor-grab active:cursor-grabbing border ${
              isMe ? "border-white/20" : "border-[var(--color-outline-variant)]"
            }`}
          />
          <button
            type="button"
            onClick={(e) => handleDownload(e, fileUrl, msg.content || "image")}
            className="absolute bottom-1.5 left-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/75 text-white backdrop-blur-xs shadow-md transition-all hover:scale-110 flex items-center justify-center cursor-pointer"
            title="Download Image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              shapeRendering="geometricPrecision"
              textRendering="geometricPrecision"
              imageRendering="optimizeQuality"
              fillRule="evenodd"
              clipRule="evenodd"
              viewBox="0 0 512 512"
              className="w-4 h-4 fill-current"
            >
              <path
                fill="currentColor"
                d="M512 256c0-70.67-28.66-134.68-74.98-181.02C390.69 28.66 326.68 0 256 0S121.31 28.66 74.98 74.98C28.66 121.32 0 185.33 0 256c0 70.68 28.66 134.69 74.98 181.02C121.31 483.34 185.32 512 256 512c70.67 0 134.69-28.66 181.02-74.98C483.34 390.69 512 326.68 512 256zm-160.23-21.5h-43.38v-67.93c0-7.63-6.27-13.9-13.91-13.9H217.5c-7.62 0-13.9 6.25-13.9 13.9v67.92h-43.41c-16.71 0-25.11 19.9-14.05 31.96l96.01 112.05c7.54 9.12 21.31 9.12 29.04.37l94.96-112.8c10.83-12.43 1.66-31.55-14.38-31.57z"
              />
            </svg>
          </button>
          {msg.timestamp && (
            <div className="absolute bottom-1.5 right-2 rounded-md bg-transparent text-white  text-[10px] flex items-center gap-1 select-none shadow-md pointer-events-none">
              <span>{formatMessageTime(msg.timestamp)}</span>
              {isMe && (
                <img 
                  src={msg.status === "DELIVERED" ? "/icons/sent.svg" : "/icons/pending.svg"} 
                  className="w-[10px] h-[10px] opacity-90 brightness-0 invert" 
                  alt={msg.status === "DELIVERED" ? "Delivered" : "Sent (pending delivery)"} 
                  title={msg.status === "DELIVERED" ? "Delivered to device" : "Sent to server (pending delivery)"}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    if (msg.content_type === "file") {
      const fileUrl = msg.file_url || `/api/file?path=${msg.file_path}`;
      return (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">draft</span>
          <button
            type="button"
            onClick={(e) => handleDownload(e, fileUrl, msg.content || "file")}
            className={`underline break-all text-sm font-medium text-left cursor-pointer ${isMe ? "text-white hover:text-white/80" : "hover:opacity-80"}`}
          >
            {msg.content}
          </button>
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

  // Track newly arrived live messages for entrance animation (only new live messages animate)
  if (initialLoadDoneRef.current) {
    for (let i = 0; i < messages.length; i++) {
      const key = getMsgKey(messages[i], i);
      if (!knownMessageKeysRef.current.has(key)) {
        knownMessageKeysRef.current.add(key);
        liveMessageKeysRef.current.add(key);
      }
    }
  }

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
      {isSelectionMode ? (
        <header className="h-15 px-[var(--spacing-margin-container)] flex items-center justify-between border-b border-[var(--color-outline-variant)]/30 bg-[var(--color-surface-container)] z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={cancelSelection}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-on-surface-variant)] hover:bg-black/10 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="font-headline-md text-[var(--text-headline-md)] text-[var(--color-on-surface)]">
              {selectedIds.size} Selected
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copySelected}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-on-surface-variant)] hover:bg-black/10 transition-colors"
              title="Copy Selected"
            >
              <span className="material-symbols-outlined">content_copy</span>
            </button>
            <button
              onClick={deleteSelected}
              className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors"
              title="Delete Selected"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        </header>
      ) : (
        <header className="h-15 px-[var(--spacing-margin-container)] flex items-center justify-between border-b border-[var(--color-outline-variant)]/30 bg-[var(--color-background)]/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 hidden md:block">
              {profileImage ? (
                <img src={profileImage} alt={deviceName} className="w-10 h-10 rounded-full object-cover border border-[var(--color-outline-variant)]" />
              ) : (
                <div className="w-10 h-10 rounded-full border border-[var(--color-outline-variant)] flex items-center justify-center font-headline-md text-[var(--color-on-surface)] bg-[var(--color-surface-variant)]">
                  {deviceName.charAt(0).toUpperCase()}
                </div>
              )}
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

          <div className="flex items-center gap-2 relative">
            <button
              ref={menuButtonRef}
              onClick={toggleMenu}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] transition-colors"
              title="More options"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
            >
              <span className="material-symbols-outlined text-[22px]">
                more_vert
              </span>
            </button>
            
            {isMenuOpen && (
              <div
                ref={menuRef}
                className={`absolute right-0 top-12 w-48 bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]/30 rounded-md shadow-lg overflow-hidden z-50 ${
                  isMenuClosing ? "animate-menu-out" : "animate-menu-in"
                }`}
              >
                <button
                  className="w-full text-left px-4 py-3 text-sm text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-highest)] transition-colors"
                  onClick={() => {
                    setIsSelectionMode(true);
                    closeMenu(true);
                  }}
                >
                  Select Messages
                </button>
                <button
                  className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-[var(--color-surface-container-highest)] transition-colors"
                  onClick={() => {
                    setShowClearChatModal(true);
                    closeMenu(true);
                  }}
                >
                  Clear Chat
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-[var(--spacing-margin-container)] flex flex-col gap-2 z-0 pb-16 custom-scrollbar relative bg-[#000000] bg-[url('/chat-doodle-dark.svg')] [.light_&]:bg-[#ffffff] [.light_&]:bg-[url('/chat-doodle-light.svg')]"
        style={{ backgroundSize: "260px 260px", backgroundRepeat: "repeat" }}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {messages.map((msg, idx) => {
          // 'me' = sent from this web UI
          // anything else ('android-xxx', 'pc', etc.) = received from phone
          const isMe = msg.sender === "me";
          const msgKey = getMsgKey(msg, idx);
          const isLive = liveMessageKeysRef.current.has(msgKey);
          const animationClass = isLive
            ? (isMe ? "animate-message-sent" : "animate-message-received")
            : "";

          const isImg = isImageMessage(msg);

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
                data-msg-id={msg.id}
                data-chat-bubble="true"
                className={`flex flex-col ${isImg ? "max-w-[260px] sm:max-w-[300px]" : "max-w-[85%] md:max-w-[70%]"} gap-1 group relative ${isMe ? "self-end items-end" : "self-start"} ${isSelectionMode ? "cursor-pointer" : ""} ${animationClass}`}
                onClick={() => {
                  if (isSelectionMode && msg.id) {
                    toggleSelection(msg.id);
                  }
                }}
              >
                <div
                  className={`${
                    isImg
                      ? "flex flex-col px-1 pt-1 rounded-lg font-body-md leading-relaxed"
                      : "flex items-end gap-1.5 py-1 rounded-2xl font-body-md leading-relaxed"
                  } ${
                    !isSelectionMode && enableDoubleClickCopy ? "cursor-pointer select-none" : ""
                  } ${
                    isMe
                      ? isImg
                        ? "bg-[#1E9CF1] text-white rounded-tr-sm shadow-sm"
                        : "bg-[#1E9CF1] text-white rounded-tr-sm shadow-sm pl-3.5 pr-2"
                      : isImg
                        ? "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-tl-sm border border-transparent"
                        : "bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] rounded-tl-sm border border-transparent pl-2.5 pr-3.5"
                  } ${msg.id && selectedIds.has(msg.id) ? "opacity-75 ring-2 ring-white/50" : ""}`}
                  onDoubleClick={() => {
                    if (isImg) {
                      const fileUrl = (msg as any).file_url || `/api/file?path=${msg.file_path}`;
                      setPreviewImage({ url: fileUrl, name: msg.content || "Image" });
                      return;
                    }
                    if (!isSelectionMode && enableDoubleClickCopy && msg.content) {
                      navigator.clipboard.writeText(msg.content);
                      const id = msg.id || `fallback-${idx}`;
                      setCopiedMessageId(id);
                      setTimeout(() => setCopiedMessageId(null), 1500);
                    }
                  }}
                  title={
                    isImg
                      ? "Double-click to preview"
                      : !isSelectionMode && enableDoubleClickCopy
                        ? "Double-click to copy"
                        : ""
                  }
                >
                  {renderBubbleContent(msg, isMe)}

                  {!isImg && msg.timestamp && (
                    <div
                      className={`text-[9px] shrink-0 pb-0.5 select-none flex items-center gap-1 ${
                        isMe
                          ? "text-white/80"
                          : "text-[var(--color-on-surface-variant)]"
                      }`}
                    >
                      <span>{formatMessageTime(msg.timestamp)}</span>
                      {isMe && (
                        <img 
                          src={msg.status === "DELIVERED" ? "/icons/sent.svg" : "/icons/pending.svg"} 
                          className={`w-[11px] h-[11px] ${msg.status === "DELIVERED" ? "opacity-80" : "opacity-70"} brightness-0 invert`} 
                          alt={msg.status === "DELIVERED" ? "Delivered" : "Sent (pending delivery)"} 
                          title={msg.status === "DELIVERED" ? "Delivered to device" : "Sent to server (pending delivery)"}
                        />
                      )}
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
                
                <div className="flex items-center gap-1 ml-auto text-white/70">
                  <span className="text-[10px]">
                    {new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {p.status === "failed" ? (
                    <button
                      onClick={() => retryMessage(p.localId)}
                      title="Retry sending"
                      className="flex items-center gap-1 text-[var(--color-error)] hover:opacity-80 transition-opacity shrink-0 ml-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        error
                      </span>
                      <span className="text-[10px] font-medium">Retry</span>
                    </button>
                  ) : (
                    <img 
                      src="/icons/pending.svg" 
                      className="w-3 h-3 shrink-0 animate-pulse opacity-90 brightness-0 invert" 
                      alt="Pending" 
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Floating Scroll to Bottom Arrow */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-6 z-30 w-10 h-10 rounded-full bg-[#1e2024] hover:bg-[#282b30] border border-white/10 shadow-2xl flex items-center justify-center text-white/90 hover:text-white transition-all active:scale-95"
          title="Scroll to bottom"
        >
          <span className="material-symbols-outlined text-[24px]">
            keyboard_arrow_down
          </span>

          {/* Unread badge if 1 or more messages arrived below */}
          {unreadBelowCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-[#1E9CF1] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-md">
              {unreadBelowCount}
            </span>
          )}
        </button>
      )}

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

      {showClearChatModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--color-surface-container)] w-[90%] max-w-sm rounded-2xl p-6 shadow-2xl border border-[var(--color-outline-variant)]/30">
            <h3 className="text-xl font-bold text-[var(--color-on-surface)] mb-2">Clear Chat</h3>
            <p className="text-sm text-[var(--color-on-surface-variant)] mb-4">
              Are you sure you want to clear all messages with this device? This action cannot be undone.
            </p>
            <label className="flex items-center gap-3 mb-6 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={clearChatSync}
                onChange={(e) => setClearChatSync(e.target.checked)}
                className="w-5 h-5 rounded border-[var(--color-outline)] text-[var(--color-primary)] focus:ring-0 focus:ring-offset-0 bg-[var(--color-surface-container-highest)] accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-on-surface)] group-hover:text-[var(--color-primary)] transition-colors">
                Also delete from Android app
              </span>
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowClearChatModal(false)}
                className="px-4 py-2 rounded-full text-sm font-medium text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-variant)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearChat}
                className="px-4 py-2 rounded-full text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors shadow-md"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Fullscreen Image Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 text-white px-2">
              <span className="text-sm font-medium truncate max-w-[80%]">
                {previewImage.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer text-white"
                title="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
