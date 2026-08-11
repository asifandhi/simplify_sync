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
  const [uploading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  console.log("Scroll Ref : ",scrollRef)
  console.log("File Input : ",fileInputRef)
  useEffect(() => {
    if (!deviceId) return;
    axios.get(`/api/chat?device_id=${deviceId}`)
      .then(res => setMessages(res.data.data.messages))
      .catch(console.error);
    connectSocket(deviceId);
  }, [deviceId, connectSocket, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return <div></div>;
}

export default ChatWindow;
