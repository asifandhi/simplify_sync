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
      console.log("Response from the chat window :",res);


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

  return <div></div>;
}

export default ChatWindow;
