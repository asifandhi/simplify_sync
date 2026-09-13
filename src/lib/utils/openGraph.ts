import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 3]] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");

export function isPublicPreviewAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export async function readPreviewHtml(target: string, signal: AbortSignal): Promise<string> {
  let url = new URL(target);
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid preview URL");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => !isPublicPreviewAddress(address))) throw new Error("Private preview destination");
    const peer = addresses[0];
    // Pin the validated DNS result while retaining the original Host and TLS server name.
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        signal,
        agent: false,
        headers: { "User-Agent": "SimplifySync-LinkPreview", "Accept-Encoding": "identity" },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [peer] as any);
          else callback(null, peer.address, peer.family);
        },
      }, resolve);
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      response.destroy();
      if (!response.headers.location || hop === 3) throw new Error("Invalid preview redirect");
      url = new URL(response.headers.location, url);
      continue;
    }
    if (response.statusCode !== 200 || !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers["content-type"] ?? "") || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
      response.destroy();
      throw new Error("Unsupported preview response");
    }
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error("Preview exceeds 1MB");
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf8");
    } finally { response.destroy(); }
  }
  throw new Error("Too many redirects");
}

export interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

export async function fetchOpenGraph(text: string): Promise<string | null> {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = urlRegex.exec(text);
  if (!match) return null;
  const targetUrl = match[1];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const html = await Promise.race([
      readPreviewHtml(targetUrl, controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Preview deadline exceeded")), { once: true })),
    ]);
    
    const og: OpenGraphData = { url: targetUrl };
    
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) og.title = titleMatch[1];
    
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    if (descMatch) og.description = descMatch[1];
    
    const imgMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (imgMatch) og.image = imgMatch[1];
    
    if (!og.title && !og.description && !og.image) return null;
    
    return JSON.stringify(og);
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}
