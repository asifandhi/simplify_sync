import { useChatStore } from "@/store/chatStore";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { useClipboardSync } from "@/hooks/useClipboardSync";

interface ChatWindowProps {
  deviceId: string;
  deviceName: string;
}

function ChatWindow({ deviceId, deviceName }: ChatWindowProps) {
  const { messages, connectSocket, setMessages, sendMessage, socket } = useChatStore();
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const { syncLocalClipboard, error } = useClipboardSync(socket, deviceId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deviceId) return;
    axios
      .get(`/api/chat?device_id=${deviceId}`)
      .then((res) => setMessages(res.data.data.messages))
      .catch(console.error);
    connectSocket(deviceId);
  }, [deviceId, connectSocket, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const renderBubbleContent = (msg: any) => {
    if (msg.content_type === "file") {
      const isImage = msg.content?.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
      const fileUrl = `/api/file?path=${msg.file_path}`;

      if (isImage) {
        return (
          <div className="flex flex-col gap-2">
            <img
              src={fileUrl}
              alt={msg.content}
              className="rounded-lg max-w-full h-auto max-h-48 object-cover border border-[var(--color-outline-variant)]"
            />
            <a
              href={fileUrl}
              download={msg.content}
              className="text-xs underline opacity-80 text-center hover:opacity-100 font-label-sm"
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
            className="underline hover:opacity-80 break-all text-sm font-medium"
          >
            {msg.content}
          </a>
        </div>
      );
    }

    return <span className="wrap-break-word">{msg.content}</span>;
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
      <header className="h-20 px-[var(--spacing-margin-container)] flex items-center justify-between border-b border-[var(--color-outline-variant)]/30 bg-[var(--color-background)]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border border-[var(--color-outline-variant)] flex items-center justify-center font-headline-md text-[var(--color-on-surface)] bg-[var(--color-surface-variant)] hidden md:flex">
            {deviceName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-headline-md text-[var(--text-headline-md)] text-[var(--color-primary)] flex items-center gap-2">
              {deviceName}
              <span className={`px-2 py-0.5 rounded-full text-[var(--color-on-surface)] font-label-sm text-[10px] tracking-wider uppercase border border-[var(--color-outline-variant)] flex items-center gap-1 ${useChatStore(s => s.isConnected) ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${useChatStore(s => s.isConnected) ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {useChatStore(s => s.isConnected) ? 'Connected' : 'Disconnected'}
              </span>
            </h2>
            <p className="font-label-sm text-[var(--color-on-surface-variant)] text-[10px] mt-0.5 font-mono opacity-60">ID: {deviceId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-[var(--color-error)] font-medium mr-2">{error}</span>}
          <button
            onClick={syncLocalClipboard}
            className="h-10 px-4 rounded-full flex items-center justify-center gap-2 text-[var(--color-primary)] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors border border-[var(--color-outline-variant)]/50"
            title="Push local clipboard to this device"
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
            <span className="text-sm font-medium hidden sm:block">Sync Clipboard</span>
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-[var(--spacing-margin-container)] flex flex-col gap-6 z-0 pb-32 custom-scrollbar" ref={scrollRef}>
        {messages.map((msg, idx) => {
          const isMe = msg.sender === "me";
          return (
            <div key={msg.id ? `msg-${msg.id}` : `fallback-${idx}`} className={`flex flex-col max-w-[85%] md:max-w-[70%] gap-1 group ${isMe ? "self-end items-end" : "self-start"}`}>
              <div className={`p-4 rounded-2xl font-body-md leading-relaxed ${isMe ? "border border-[var(--color-outline-variant)]/50 bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] rounded-tr-sm shadow-sm" : "bg-[var(--color-surface-container-high)] text-[var(--color-primary)] rounded-tl-sm border border-transparent"}`}>
                {renderBubbleContent(msg)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-[var(--spacing-margin-container)] pt-4 bg-gradient-to-t from-[var(--color-background)] via-[var(--color-background)] to-transparent z-20">
        <form onSubmit={handleSendText} className="max-w-4xl mx-auto flex items-end gap-2 bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/50 p-2 rounded-2xl focus-within:border-[var(--color-outline-variant)] transition-all">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-variant)] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">attach_file</span>
          </button>
          
          <textarea 
            className="flex-1 max-h-32 min-h-10 bg-transparent border-none focus:ring-0 text-[var(--color-primary)] font-body-md placeholder:text-[var(--color-on-surface-variant)] resize-none py-2 px-2 overflow-y-auto custom-scrollbar outline-none" 
            onInput={(e) => {
               const target = e.target as HTMLTextAreaElement;
               target.style.height = ''; 
               target.style.height = target.scrollHeight + 'px';
            }} 
            value={uploading ? "Uploading file..." : input}
            disabled={uploading}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText(e as any);
              }
            }}
            placeholder="Type a message..." 
            rows={1}
          />

          <button 
            type="submit"
            disabled={uploading}
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[var(--color-primary)] bg-[var(--color-surface-variant)] hover:bg-[var(--color-outline-variant)] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWindow;
