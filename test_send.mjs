import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";
const DEVICE_ID = "android-628e0094";

const webSocket = io(SERVER_URL, {
  extraHeaders: {
    origin: "http://localhost:3000",
    host: "localhost:3000",
  },
  transports: ["websocket"],
});

webSocket.on("connect", () => {
  console.log(`[INIT] Web Socket Connected (id: ${webSocket.id})`);
  
  // Register for the device room
  webSocket.emit("register", DEVICE_ID);
  
  setTimeout(() => {
    const testMsgText = `Live Test Message from Web at ${new Date().toLocaleTimeString()}`;
    console.log(`Sending message: ${testMsgText}`);
    
    webSocket.emit(
      "send_message",
      {
        device_id: DEVICE_ID,
        sender: "me",
        content_type: "text",
        content: testMsgText,
      },
      (ack) => {
        console.log("Ack received:", ack);
        setTimeout(() => process.exit(0), 1000);
      }
    );
  }, 1000);
});
