export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

export function isLoopbackAddress(ip: string | undefined): boolean {
  const clean = normalizeIp(ip);
  return clean === '127.0.0.1' || clean === '::1' || clean === '[::1]' || clean.startsWith('127.');
}

export function isValidLocalOrigin(originHeader: string, hostHeader: string | null): boolean {
  try {
    const originUrl = new URL(originHeader);
    const host = hostHeader || '';
    if (originUrl.host !== host) {
      return false;
    }
    const hostname = originUrl.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}
