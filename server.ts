import { connectDB } from "@/db/sqlite";
import { initUDP } from "@/lib/discovery/udp";
import { initSocket } from "@/lib/socket";
import { createServer } from "http";
import next from "next";
import { parse } from "url";

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
  initSocket(server);

  server.listen(port, (err?: any) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
