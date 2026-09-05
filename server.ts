import { connectDB } from "@/db/sqlite";
import { initUDP } from "@/lib/discovery/udp";
import { initSocket } from "@/lib/socket";
import { createServer } from "http";
import next from "next";
import { parse } from "url";

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  connectDB();
  initUDP();
  console.log(`Connected to SQLite database`);

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      
      // Bypass Next.js for Socket.io routes so it doesn't return 404
      if (parsedUrl.pathname?.startsWith('/socket.io')) {
        return;
      }
      
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error("Error occurred handling", req.url, error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Initialize Socket.io BEFORE listen() so io is non-null when the first
  // request arrives and any API route calls getIO().
  initSocket(server);

  server.listen(port, "0.0.0.0", (err?: any) => {
    if (err) throw err;
    console.log(`> Ready on http://0.0.0.0:${port}`);
  });
});
