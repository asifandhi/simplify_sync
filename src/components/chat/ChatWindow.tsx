import { useChatStore } from "@/store/chatStore";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { Paperclip, File as FileIcon } from "lucide-react";

interface ChatWindowProps {
  deviceId: string;
  deviceName: string;
}
function ChatWindow({ deviceId, deviceName }: ChatWindowProps) {
  const { messages, connectSocket, setMessages, sendMessage } = useChatStore();
  console.log("this is the use chat store : ", useChatStore);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  console.log("Scroll Ref : ", scrollRef);
  console.log("File Input : ", fileInputRef);
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
      console.log("Response from the chat window :", res);

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
    console.log(e.target.files);
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Mandatory to allow dropping
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

  // 5. Clipboard Paste Handler
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault(); // Stop file name from pasting as text
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
              className="rounded-lg max-w-full h-auto max-h-48 object-cover"
            />
            <a
              href={fileUrl}
              download={msg.content}
              className="text-xs underline opacity-80 text-center hover:opacity-100"
            >
              Download Image
            </a>
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2">
          <FileIcon size={18} />
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
      className={`relative flex flex-col h-full bg-white/30 backdrop-blur-[20px] rounded-xl border transition-colors overflow-hidden shadow-lg
        ${isDragging ? "border-[#007aff] bg-[#007aff]/5" : "border-white/20"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay UI */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <p className="text-[#007aff] font-bold text-xl pointer-events-none">
            Drop file to send...
          </p>
        </div>
      )}
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/20 bg-white/40 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-lg">{deviceName}</h2>
      </div>
      {/* Messages Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4" ref={scrollRef}>
        {messages.map((msg, idx) => {
          const isMe = msg.sender === "me";
          return (
            <div
              key={msg.id || idx}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] px-4 py-2 text-sm shadow-sm ${
                  isMe
                    ? "bg-[#007aff] text-white rounded-2xl rounded-br-sm"
                    : "bg-gray-200/80 text-gray-800 rounded-2xl rounded-bl-sm"
                }`}
              >
                {renderBubbleContent(msg)}
              </div>
            </div>
          );
        })}
      </div>
      {/* Input Area */}
      <div className="p-4 bg-white/40 border-t border-white/20 relative z-40">
        <form
          onSubmit={handleSendText}
          className="flex gap-2 relative items-center"
        >
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-[#007aff] transition-colors disabled:opacity-50"
          >
            <Paperclip size={22} />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            type="text"
            value={uploading ? "Uploading file..." : input}
            disabled={uploading}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste} // Attach Paste Listener Here
            placeholder="iMessage... (or paste/drop a file)"
            className="flex-1 bg-white/60 border border-white/30 rounded-full pl-4 pr-12 py-2 outline-none focus:ring-2 focus:ring-[#007aff]/50 transition-all text-sm placeholder-gray-500 text-gray-800 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={uploading}
            className="absolute right-1 top-1 bottom-1 bg-[#007aff] text-white p-1.5 rounded-full hover:bg-blue-600 transition-colors flex items-center justify-center aspect-square disabled:opacity-50"
          >
            <svg
              className="w-4 h-4 rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatWindow;
