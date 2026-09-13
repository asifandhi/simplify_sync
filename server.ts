import { connectDB } from "@/db/sqlite";
import { initUDP } from "@/lib/discovery/udp";
import { initSocket } from "@/lib/socket";
import { createServer } from "http";
import next from "next";
import { parse } from "url";

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

function isLoopbackAddress(ip: string | undefined): boolean {
  const clean = normalizeIp(ip);
  return clean === '127.0.0.1' || clean === '::1' || clean === '[::1]' || clean.startsWith('127.');
}

app.prepare().then(() => {
  connectDB();
  initUDP();
  console.log(`Connected to SQLite database`);

  const server = createServer(async (req, res) => {
    try {
      // W01: Strip/ignore client-supplied proxy and identity headers
      delete req.headers['x-forwarded-for'];
      delete req.headers['x-real-ip'];
      delete req.headers['x-is-local-client'];

      // Derive local-client identity strictly from the TCP peer address
      const remoteAddress = req.socket.remoteAddress;
      const cleanIp = normalizeIp(remoteAddress);
      const isLocal = isLoopbackAddress(remoteAddress);

      if (cleanIp) {
        req.headers['x-forwarded-for'] = cleanIp;
      }
      if (isLocal) {
        req.headers['x-is-local-client'] = 'true';
      }

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
