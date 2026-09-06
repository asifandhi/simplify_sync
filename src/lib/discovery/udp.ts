import dgram from "dgram";
import { getIO } from "@/lib/socket";

let udpServer: dgram.Socket | null = null;

export function initUDP() {
  const port = parseInt(process.env.UDP_PORT || "41234", 10);

  // Prevent duplicate binds on HMR / dev restart
  if (udpServer) {
    console.log("> UDP server already running, skipping re-init.");
    return;
  }

  const server = dgram.createSocket({ type: "udp4", reuseAddr: true });

  server.on("message", (msg, rinfo) => {
    const messageString = msg.toString().trim();

    if (messageString === "Simplify_SYNC_DISCOVER") {
      console.log(
        `> UDP Discovery ping received from ${rinfo.address}:${rinfo.port}`,
      );
      try {
        const io = getIO();
        io?.emit("device_discovered", { ip: rinfo.address, port: rinfo.port });
      } catch (err) {
        console.error("> Error emitting device_discovered:", err);
      }
    }
  });
  server.on("listening", () => {
    const address = server.address();
    console.log(`> UDP Discovery Server listening on port ${address.port}`);
  });
  server.on("error", (err) => {
    console.error(`UDP Server error:\n${err.stack}`);
    server.close();
    udpServer = null;
  });
  server.bind(port);
  udpServer = server;
}

/** Graceful shutdown — called on SIGTERM / SIGINT / process exit */
export function closeUDP() {
  if (udpServer) {
    udpServer.close();
    udpServer = null;
    console.log("> UDP server closed.");
  }
}

// Register shutdown hooks to release the UDP port on dev restart
process.on("SIGTERM", closeUDP);
process.on("SIGINT", closeUDP);
