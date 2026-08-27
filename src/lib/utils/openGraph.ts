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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(targetUrl, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    const html = await res.text();
    
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
  }
}
