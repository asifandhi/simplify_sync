import dgram from "dgram";

export function initUDP() {
  const port = parseInt(process.env.UDP_PORT || "41234", 10);
  const server = dgram.createSocket("udp4");

  server.on("message", (msg, rinfo) => {
    const messageString = msg.toString().trim();

    if (messageString === "Simplify_SYNC_DISCOVER") {
      console.log(
        `> UDP Discovery ping received from ${rinfo.address}:${rinfo.port}`,
      );
      // In Phase 3, we will emit a Socket.io event here to notify the PC dashboard
    }
  });
  server.on("listening", () => {
    const address = server.address();
    console.log(`> UDP Discovery Server listening on port ${address.port}`);
  });
  server.on("error", (err) => {
    console.error(`UDP Server error:\n${err.stack}`);
    server.close();
  });
  server.bind(port);
}
